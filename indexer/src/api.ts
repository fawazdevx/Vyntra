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
  VYNTRA_MARKET_ADDRESS,
  VYNTRA_MARKET_START_BLOCK,
} from './config.js'
import { ensureSchema, getMeta, queryAll, queryOne, type LaunchRow, type TradeRow } from './db.js'
import { buildOhlcv } from './ohlcv.js'
import { getHolders, getSnipers } from './analytics.js'
import { getPortfolio, getWalletTrades } from './portfolio.js'
import { getHypeUsdPrice } from './hype-price.js'

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
    raisedNative: Number(row.raised_native),
    graduated: Boolean(Number(row.graduated)),
    migrated: Boolean(Number(row.migrated)),
    externalPair: row.external_pair,
    buyTaxBps: Number(row.buy_tax_bps),
    sellTaxBps: Number(row.sell_tax_bps),
    tradeCount: Number(row.trade_count),
    volumeNative: Number(row.volume_native),
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
      const { syncOnce } = await import('./sync.js')
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

  // Prefer api/health.ts on Vercel (no heavy imports). This is the local/dev fallback.
  app.get('/health', (c) =>
    c.json({
      ok: true,
      service: 'vyntra-indexer',
      chainId: CHAIN_ID,
      factory: FACTORY_ADDRESS ?? null,
      board: BOARD_ADDRESS ?? null,
      rpc: safeRpcHost(RPC_URL),
      ready: Boolean(FACTORY_ADDRESS),
    }),
  )

  app.get('/v1/hype-usd', async (c) => {
    try {
      const price = await getHypeUsdPrice()
      c.header('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300')
      return c.json(price)
    } catch (error) {
      c.header('Cache-Control', 'no-store')
      return c.json(
        { error: 'hype_price_unavailable', detail: error instanceof Error ? error.message : String(error) },
        503,
      )
    }
  })

  app.use('/v1/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    try {
      await Promise.race([
        ensureSchema(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('schema_timeout')), 2500)),
      ])
    } catch (e) {
      console.error('[indexer] schema', e)
      return c.json({ error: 'db_unavailable', detail: String(e) }, 503)
    }
    // Non-blocking refresh; daily cron is the backup on Hobby.
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
      const { syncOnce } = await import('./sync.js')
      const r = await syncOnce()
      return c.json({ ok: true, ...r, from: r.from.toString(), to: r.to.toString() })
    } catch (e) {
      console.error('[indexer] cron sync', e)
      return c.json({ ok: false, error: String(e) }, 500)
    }
  })

  app.get('/v1/stats', async (c) => {
    const row = await queryOne<Record<string, number>>(
      `SELECT
        COUNT(*) AS launches,
        SUM(CASE WHEN graduated = 0 AND migrated = 0 THEN 1 ELSE 0 END) AS on_curve,
        SUM(CASE WHEN graduated = 1 OR migrated = 1 THEN 1 ELSE 0 END) AS graduated,
        COALESCE(SUM(raised_native), 0) AS raised_native,
        COALESCE((SELECT SUM(native_amount) FROM trades), 0) +
          COALESCE((SELECT SUM(native_amount) FROM platform_trades WHERE block_number >= ?), 0) AS volume_native,
        COALESCE((SELECT COUNT(*) FROM trades), 0) +
          COALESCE((SELECT COUNT(*) FROM platform_trades WHERE block_number >= ?), 0) AS trades
       FROM launches`,
      [Number(VYNTRA_MARKET_START_BLOCK), Number(VYNTRA_MARKET_START_BLOCK)],
    )
    return c.json({
      launches: Number(row?.launches || 0),
      onCurve: Number(row?.on_curve || 0),
      graduated: Number(row?.graduated || 0),
      raisedNative: Number(row?.raised_native || 0),
      volumeNative: Number(row?.volume_native || 0),
      trades: Number(row?.trades || 0),
      lastBlock: await getMeta('last_block'),
    })
  })

  app.get('/v1/reserve', async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query('limit') || 100), 1), 500)
    const rows = await queryAll<Record<string, unknown>>(
      `SELECT event_name, campaign_id, bucket, amount, recipient, block_number,
              tx_hash, log_index, timestamp, payload_json
       FROM reserve_events ORDER BY block_number DESC, log_index DESC LIMIT ?`,
      [limit],
    )
    return c.json({
      events: rows.map((row) => {
        let payload: unknown = {}
        try {
          payload = JSON.parse(String(row.payload_json || '{}'))
        } catch {
          // Preserve the event row if a malformed legacy payload is found.
        }
        return {
          eventName: String(row.event_name),
          campaignId: row.campaign_id == null ? null : String(row.campaign_id),
          bucket: row.bucket == null ? null : Number(row.bucket),
          amount: row.amount == null ? null : String(row.amount),
          recipient: row.recipient == null ? null : String(row.recipient),
          blockNumber: Number(row.block_number),
          txHash: String(row.tx_hash),
          logIndex: Number(row.log_index),
          timestamp: Number(row.timestamp),
          payload,
        }
      }),
      lastBlock: await getMeta('last_reserve_block'),
    })
  })

  app.get('/v1/launches', async (c) => {
    const sort = c.req.query('sort') || 'trending'
    const limit = Math.min(Number(c.req.query('limit') || 100), 500)
    const orderBy: Record<string, string> = {
      trending: 'progress_bps DESC, id DESC',
      new: 'created_at DESC',
      volume: 'volume_native DESC',
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
    const id = Number(c.req.param('id'))
    const row = await queryOne<LaunchRow>('SELECT * FROM launches WHERE id = ?', [id])
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ launch: launchJson(row) })
  })

  app.get('/v1/launches/:id/trades', async (c) => {
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
        amountNative: Number(r.native_amount),
        amountToken: Number(r.token_amount),
        side: r.side,
        trader: r.trader,
        txHash: r.tx_hash,
        fee: Number(r.fee),
        blockNumber: Number(r.block_number),
        logIndex: Number(r.log_index),
      })
      last = time
    }
    return c.json({ trades })
  })

  app.get('/v1/platform-trades', async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query('limit') || 1000), 1), 5000)
    const rows = await queryAll<Record<string, unknown>>(
      `SELECT side, trader, native_amount, token_amount, price, mcap,
              block_number, tx_hash, log_index, timestamp
       FROM platform_trades
       WHERE block_number >= ?
       ORDER BY timestamp DESC, block_number DESC, log_index DESC
       LIMIT ?`,
      [Number(VYNTRA_MARKET_START_BLOCK), limit],
    )
    rows.reverse()
    const trades = []
    let last = 0
    for (const row of rows) {
      let time = Number(row.timestamp)
      if (time <= last) time = last + 1
      trades.push({
        time,
        price: Number(row.price),
        mcap: Number(row.mcap),
        amountNative: Number(row.native_amount),
        amountToken: Number(row.token_amount),
        side: row.side,
        trader: row.trader,
        txHash: row.tx_hash,
        blockNumber: Number(row.block_number),
        logIndex: Number(row.log_index),
      })
      last = time
    }
    return c.json({
      market: VYNTRA_MARKET_ADDRESS ?? null,
      trades,
      lastBlock: await getMeta('last_vyntra_market_block'),
    })
  })

  app.get('/v1/launches/:id/ohlcv', async (c) => {
    const id = Number(c.req.param('id'))
    const interval = Number(c.req.query('interval') || 300)
    const allowed = new Set([60, 300, 900, 3600, 86400])
    const sec = allowed.has(interval) ? interval : 300
    const limit = Math.min(Number(c.req.query('limit') || 500), 2000)
    return c.json({ interval: sec, candles: await buildOhlcv(id, sec, limit) })
  })

  app.get('/v1/wallets/:address/portfolio', async (c) => {
    const address = c.req.param('address')
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'invalid_address' }, 400)
    }
    const data = await getPortfolio(address)
    return c.json({
      ...data,
      source: 'indexed_trades',
      note: 'PnL uses average cost basis; positions include indexed launch and VYNTRA market trades. Transfers are ignored.',
    })
  })

  app.get('/v1/wallets/:address/trades', async (c) => {
    const address = c.req.param('address')
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'invalid_address' }, 400)
    }
    const limit = Math.min(Number(c.req.query('limit') || 200), 2000)
    return c.json(await getWalletTrades(address, limit))
  })

  app.get('/v1/launches/:id/holders', async (c) => {
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

function safeRpcHost(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).host
  } catch {
    return 'configured'
  }
}
