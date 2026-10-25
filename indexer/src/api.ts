import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  API_PORT,
  BOARD_ADDRESS,
  CHAIN_ID,
  CRON_SECRET,
  FACTORY_ADDRESS,
  RPC_URL,
  SYNC_STALE_SEC,
} from './config.js'
import { ensureSchema, getMeta, queryAll, queryOne, type LaunchRow, type TradeRow } from './db.js'
import { buildOhlcv } from './ohlcv.js'
import { getHolders, getSnipers } from './analytics.js'
import { getPortfolio, getWalletTrades } from './portfolio.js'
import { syncOnce } from './sync.js'

function launchJson(row: LaunchRow) {
  return {
    id: Number(row.id),
    token: row.token,
    curve: row.curve,
    splitter: row.splitter,
    creator: row.creator,
    name: row.name,
    symbol: row.symbol,
    imageURI: row.image_uri,
    description: row.description,
    createdAt: Number(row.created_at) * 1000,
    progressBps: Number(row.progress_bps),
    raisedBot: Number(row.raised_bot),
    graduated: Boolean(Number(row.graduated)),
    migrated: Boolean(Number(row.migrated)),
    externalPair: row.external_pair,
    buyTaxBps: Number(row.buy_tax_bps),
    sellTaxBps: Number(row.sell_tax_bps),
    tradeCount: Number(row.trade_count),
    volumeBot: Number(row.volume_bot),
    updatedAt: Number(row.updated_at),
  }
}

let syncInFlight: Promise<void> | null = null

/** Best-effort sync when data is stale (works on Vercel Hobby without per-minute cron). */
async function maybeSync(force = false) {
  if (!FACTORY_ADDRESS) return
  await ensureSchema()
  if (syncInFlight) {
    await syncInFlight
    return
  }
  if (!force) {
    const last = await getMeta('last_sync_at')
    const now = Math.floor(Date.now() / 1000)
    if (last && now - Number(last) < SYNC_STALE_SEC) return
  }
  syncInFlight = (async () => {
    try {
      await syncOnce()
    } catch (e) {
      console.error('[indexer] maybeSync error', e)
    } finally {
      syncInFlight = null
    }
  })()
  await syncInFlight
}

export function createApp(opts: { basePath?: string } = {}) {
  const app = opts.basePath ? new Hono().basePath(opts.basePath) : new Hono()
  app.use('*', cors())

  app.get('/', (c) => c.redirect('/api/health'))

  app.get('/health', async (c) => {
    // Fast path — do not block on chain sync (Hobby timeouts are short).
    let lastBlock: string | null = null
    let lastSyncAt: string | null = null
    let dbOk = false
    try {
      await ensureSchema()
      lastBlock = await getMeta('last_block')
      lastSyncAt = await getMeta('last_sync_at')
      dbOk = true
    } catch (e) {
      console.error('[indexer] health db', e)
    }
    return c.json({
      ok: true,
      dbOk,
      chainId: CHAIN_ID,
      factory: FACTORY_ADDRESS ?? null,
      board: BOARD_ADDRESS ?? null,
      rpc: RPC_URL,
      lastBlock,
      lastSyncAt,
      ready: Boolean(FACTORY_ADDRESS) && dbOk,
    })
  })

  app.use('/v1/*', async (c, next) => {
    await ensureSchema()
    void maybeSync(false)
    await next()
  })

  app.get('/cron/sync', async (c) => {
    const auth = c.req.header('authorization') || ''
    if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
      return c.text('Unauthorized', 401)
    }
    if (!FACTORY_ADDRESS) {
      return c.json({ ok: false, error: 'factory_unset' }, 503)
    }
    try {
      await ensureSchema()
      const r = await syncOnce()
      return c.json({ ok: true, ...r, from: r.from.toString(), to: r.to.toString() })
    } catch (e) {
      console.error('[indexer] cron sync', e)
      return c.json({ ok: false, error: String(e) }, 500)
    }
  })

  app.get('/v1/stats', async (c) => {
    await maybeSync(false)
    const row = await queryOne<Record<string, number>>(
      `SELECT
        COUNT(*) AS launches,
        SUM(CASE WHEN graduated = 0 AND migrated = 0 THEN 1 ELSE 0 END) AS on_curve,
        SUM(CASE WHEN graduated = 1 OR migrated = 1 THEN 1 ELSE 0 END) AS graduated,
        COALESCE(SUM(raised_bot), 0) AS raised_bot,
        COALESCE(SUM(volume_bot), 0) AS volume_bot,
        COALESCE(SUM(trade_count), 0) AS trades
       FROM launches`,
    )
    return c.json({
      launches: Number(row?.launches || 0),
      onCurve: Number(row?.on_curve || 0),
      graduated: Number(row?.graduated || 0),
      raisedBot: Number(row?.raised_bot || 0),
      volumeBot: Number(row?.volume_bot || 0),
      trades: Number(row?.trades || 0),
      lastBlock: await getMeta('last_block'),
    })
  })

  app.get('/v1/launches', async (c) => {
    await maybeSync(false)
    const sort = c.req.query('sort') || 'trending'
    const limit = Math.min(Number(c.req.query('limit') || 100), 500)
    const orderBy: Record<string, string> = {
      trending: 'progress_bps DESC, id DESC',
      new: 'created_at DESC',
      volume: 'volume_bot DESC',
      graduated: 'migrated DESC, graduated DESC, id DESC',
    }
    const order = orderBy[sort] || orderBy.trending
    const rows = await queryAll<LaunchRow>(
      `SELECT * FROM launches WHERE id < 9000 ORDER BY ${order} LIMIT ?`,
      [limit],
    )
    return c.json({ launches: rows.map(launchJson) })
  })

  app.get('/v1/launches/:id', async (c) => {
    await maybeSync(false)
    const id = Number(c.req.param('id'))
    const row = await queryOne<LaunchRow>('SELECT * FROM launches WHERE id = ?', [id])
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ launch: launchJson(row) })
  })

  app.get('/v1/launches/:id/trades', async (c) => {
    await maybeSync(false)
    const id = Number(c.req.param('id'))
    const limit = Math.min(Number(c.req.query('limit') || 1000), 5000)
    const rows = await queryAll<TradeRow>(
      `SELECT * FROM trades WHERE launch_id = ? ORDER BY timestamp ASC, id ASC LIMIT ?`,
      [id, limit],
    )
    const trades = []
    let last = 0
    for (const r of rows) {
      let time = Number(r.timestamp)
      if (time <= last) time = last + 1
      trades.push({
        time,
        price: Number(r.price),
        mcap: Number(r.mcap),
        amountBot: Number(r.bot_amount),
        amountToken: Number(r.token_amount),
        side: r.side,
        trader: r.trader,
        txHash: r.tx_hash,
        fee: Number(r.fee),
        blockNumber: Number(r.block_number),
      })
      last = time
    }
    return c.json({ trades })
  })

  app.get('/v1/launches/:id/ohlcv', async (c) => {
    await maybeSync(false)
    const id = Number(c.req.param('id'))
    const interval = Number(c.req.query('interval') || 300)
    const allowed = new Set([60, 300, 900, 3600, 86400])
    const sec = allowed.has(interval) ? interval : 300
    const limit = Math.min(Number(c.req.query('limit') || 500), 2000)
    return c.json({ interval: sec, candles: await buildOhlcv(id, sec, limit) })
  })

  app.get('/v1/wallets/:address/portfolio', async (c) => {
    await maybeSync(false)
    const address = c.req.param('address')
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'invalid_address' }, 400)
    }
    const data = await getPortfolio(address)
    return c.json({
      ...data,
      source: 'curve_trades',
      note: 'PnL uses average cost basis; mark price is last curve trade. Transfers ignored.',
    })
  })

  app.get('/v1/wallets/:address/trades', async (c) => {
    await maybeSync(false)
    const address = c.req.param('address')
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'invalid_address' }, 400)
    }
    const limit = Math.min(Number(c.req.query('limit') || 200), 2000)
    return c.json(await getWalletTrades(address, limit))
  })

  app.get('/v1/launches/:id/holders', async (c) => {
    await maybeSync(false)
    const id = Number(c.req.param('id'))
    const launch = await queryOne<{ id: number }>('SELECT id FROM launches WHERE id = ?', [id])
    if (!launch) return c.json({ error: 'not_found' }, 404)
    const limit = Math.min(Number(c.req.query('limit') || 100), 500)
    const { holders, summary } = await getHolders(id, limit)
    return c.json({
      launchId: id,
      source: 'curve_trades',
      note: 'Balances are net Buy/Sell on the bonding curve (wallet transfers ignored).',
      holders,
      summary,
    })
  })

  app.get('/v1/launches/:id/snipers', async (c) => {
    await maybeSync(false)
    const id = Number(c.req.param('id'))
    const launch = await queryOne<{ id: number }>('SELECT id FROM launches WHERE id = ?', [id])
    if (!launch) return c.json({ error: 'not_found' }, 404)
    const limit = Math.min(Number(c.req.query('limit') || 20), 100)
    const earlySeconds = Number(c.req.query('earlySeconds') || 0)
    const { snipers, summary, window } = await getSnipers(id, { limit, earlySeconds })
    return c.json({
      launchId: id,
      source: 'curve_trades',
      note: 'Snipers = first N unique buyers by block order. Dump rate uses later sells.',
      window,
      snipers,
      summary,
    })
  })

  app.get('/v1/launches/:id/replies', async (c) => {
    await maybeSync(false)
    const id = Number(c.req.param('id'))
    const rows = await queryAll(
      `SELECT launch_id, reply_index, author, body, timestamp, tx_hash
       FROM replies WHERE launch_id = ? ORDER BY reply_index DESC LIMIT 100`,
      [id],
    )
    return c.json({ replies: rows })
  })

  return app
}

export function startApi(port = API_PORT) {
  const app = createApp()
  console.log(`[indexer-api] http://127.0.0.1:${port} (factory ${FACTORY_ADDRESS ?? 'unset'})`)
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
  return app
}
