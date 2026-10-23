import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { API_PORT, CHAIN_ID, FACTORY_ADDRESS, BOARD_ADDRESS, RPC_URL } from './config.js'
import { getDb, getMeta, type LaunchRow, type TradeRow } from './db.js'
import { buildOhlcv } from './ohlcv.js'
import { getHolders, getSnipers } from './analytics.js'
import { getPortfolio, getWalletTrades } from './portfolio.js'

function launchJson(row: LaunchRow) {
  return {
    id: row.id,
    token: row.token,
    curve: row.curve,
    splitter: row.splitter,
    creator: row.creator,
    name: row.name,
    symbol: row.symbol,
    imageURI: row.image_uri,
    description: row.description,
    createdAt: row.created_at * 1000,
    progressBps: row.progress_bps,
    raisedBot: row.raised_bot,
    graduated: Boolean(row.graduated),
    migrated: Boolean(row.migrated),
    externalPair: row.external_pair,
    buyTaxBps: row.buy_tax_bps,
    sellTaxBps: row.sell_tax_bps,
    tradeCount: row.trade_count,
    volumeBot: row.volume_bot,
    updatedAt: row.updated_at,
  }
}

export function createApp() {
  const app = new Hono()
  app.use('*', cors())

  app.get('/health', (c) =>
    c.json({
      ok: true,
      chainId: CHAIN_ID,
      factory: FACTORY_ADDRESS ?? null,
      board: BOARD_ADDRESS ?? null,
      rpc: RPC_URL,
      lastBlock: getMeta('last_block'),
      lastSyncAt: getMeta('last_sync_at'),
      ready: Boolean(FACTORY_ADDRESS),
    }),
  )

  app.get('/v1/stats', (c) => {
    const row = getDb()
      .prepare(
        `SELECT
          COUNT(*) AS launches,
          SUM(CASE WHEN graduated = 0 AND migrated = 0 THEN 1 ELSE 0 END) AS on_curve,
          SUM(CASE WHEN graduated = 1 OR migrated = 1 THEN 1 ELSE 0 END) AS graduated,
          COALESCE(SUM(raised_bot), 0) AS raised_bot,
          COALESCE(SUM(volume_bot), 0) AS volume_bot,
          COALESCE(SUM(trade_count), 0) AS trades
         FROM launches`,
      )
      .get() as Record<string, number>
    return c.json({
      launches: row.launches || 0,
      onCurve: row.on_curve || 0,
      graduated: row.graduated || 0,
      raisedBot: row.raised_bot || 0,
      volumeBot: row.volume_bot || 0,
      trades: row.trades || 0,
      lastBlock: getMeta('last_block'),
    })
  })

  app.get('/v1/launches', (c) => {
    const sort = c.req.query('sort') || 'trending'
    const limit = Math.min(Number(c.req.query('limit') || 100), 500)
    const orderBy: Record<string, string> = {
      trending: 'progress_bps DESC, id DESC',
      new: 'created_at DESC',
      volume: 'volume_bot DESC',
      graduated: 'migrated DESC, graduated DESC, id DESC',
    }
    const order = orderBy[sort] || orderBy.trending
    const rows = getDb()
      .prepare(`SELECT * FROM launches ORDER BY ${order} LIMIT ?`)
      .all(limit) as LaunchRow[]
    return c.json({ launches: rows.map(launchJson) })
  })

  app.get('/v1/launches/:id', (c) => {
    const id = Number(c.req.param('id'))
    const row = getDb().prepare('SELECT * FROM launches WHERE id = ?').get(id) as LaunchRow | undefined
    if (!row) return c.json({ error: 'not_found' }, 404)
    return c.json({ launch: launchJson(row) })
  })

  app.get('/v1/launches/:id/trades', (c) => {
    const id = Number(c.req.param('id'))
    const limit = Math.min(Number(c.req.query('limit') || 1000), 5000)
    const rows = getDb()
      .prepare(
        `SELECT * FROM trades WHERE launch_id = ? ORDER BY timestamp ASC, id ASC LIMIT ?`,
      )
      .all(id, limit) as TradeRow[]

    // unique ascending timestamps for lightweight-charts
    const trades = []
    let last = 0
    for (const r of rows) {
      let time = r.timestamp
      if (time <= last) time = last + 1
      trades.push({
        time,
        price: r.price,
        mcap: r.mcap,
        amountBot: r.bot_amount,
        amountToken: r.token_amount,
        side: r.side,
        trader: r.trader,
        txHash: r.tx_hash,
        fee: r.fee,
        blockNumber: r.block_number,
      })
      last = time
    }
    return c.json({ trades })
  })

  app.get('/v1/launches/:id/ohlcv', (c) => {
    const id = Number(c.req.param('id'))
    const interval = Number(c.req.query('interval') || 300)
    const allowed = new Set([60, 300, 900, 3600, 86400])
    const sec = allowed.has(interval) ? interval : 300
    const limit = Math.min(Number(c.req.query('limit') || 500), 2000)
    return c.json({ interval: sec, candles: buildOhlcv(id, sec, limit) })
  })



  app.get('/v1/wallets/:address/portfolio', (c) => {
    const address = c.req.param('address')
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'invalid_address' }, 400)
    }
    const data = getPortfolio(address)
    return c.json({
      ...data,
      source: 'curve_trades',
      note: 'PnL uses average cost basis; mark price is last curve trade. Transfers ignored.',
    })
  })

  app.get('/v1/wallets/:address/trades', (c) => {
    const address = c.req.param('address')
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return c.json({ error: 'invalid_address' }, 400)
    }
    const limit = Math.min(Number(c.req.query('limit') || 200), 2000)
    return c.json(getWalletTrades(address, limit))
  })

  app.get('/v1/launches/:id/holders', (c) => {
    const id = Number(c.req.param('id'))
    const launch = getDb().prepare('SELECT id FROM launches WHERE id = ?').get(id)
    if (!launch) return c.json({ error: 'not_found' }, 404)
    const limit = Math.min(Number(c.req.query('limit') || 100), 500)
    const { holders, summary } = getHolders(id, limit)
    return c.json({
      launchId: id,
      source: 'curve_trades',
      note: 'Balances are net Buy/Sell on the bonding curve (wallet transfers ignored).',
      holders,
      summary,
    })
  })

  app.get('/v1/launches/:id/snipers', (c) => {
    const id = Number(c.req.param('id'))
    const launch = getDb().prepare('SELECT id FROM launches WHERE id = ?').get(id)
    if (!launch) return c.json({ error: 'not_found' }, 404)
    const limit = Math.min(Number(c.req.query('limit') || 20), 100)
    const earlySeconds = Number(c.req.query('earlySeconds') || 0)
    const { snipers, summary, window } = getSnipers(id, { limit, earlySeconds })
    return c.json({
      launchId: id,
      source: 'curve_trades',
      note: 'Snipers = first N unique buyers by block order. Dump rate uses later sells.',
      window,
      snipers,
      summary,
    })
  })

  app.get('/v1/launches/:id/replies', (c) => {
    const id = Number(c.req.param('id'))
    const rows = getDb()
      .prepare(
        `SELECT launch_id, reply_index, author, body, timestamp, tx_hash
         FROM replies WHERE launch_id = ? ORDER BY reply_index DESC LIMIT 100`,
      )
      .all(id)
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
