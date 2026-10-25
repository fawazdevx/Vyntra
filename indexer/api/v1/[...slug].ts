import { qAll, qOne } from '../../src/edge-db.js'

type Arg = string | number | bigint | null

export const config = { runtime: 'edge' }

function launchJson(row: Record<string, unknown>) {
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

function scrub(n: number) {
  if (!Number.isFinite(n)) return 0
  if (Math.abs(n) < 1e-12) return 0
  return Math.round(n * 1e12) / 1e12
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url)
    // /api/v1/...
    const parts = url.pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean)

    // launches/:id
    if (parts[0] === 'launches' && parts.length === 2) {
      const id = Number(parts[1])
      const row = await qOne('SELECT * FROM launches WHERE id = ?', [id])
      if (!row) return Response.json({ error: 'not_found' }, { status: 404 })
      return Response.json({ launch: launchJson(row) })
    }

    // launches/:id/trades
    if (parts[0] === 'launches' && parts[2] === 'trades') {
      const id = Number(parts[1])
      const limit = Math.min(Number(url.searchParams.get('limit') || 1000), 5000)
      const rows = await qAll(
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
      return Response.json({ trades })
    }

    // launches/:id/ohlcv
    if (parts[0] === 'launches' && parts[2] === 'ohlcv') {
      const id = Number(parts[1])
      const interval = Number(url.searchParams.get('interval') || 300)
      const allowed = new Set([60, 300, 900, 3600, 86400])
      const sec = allowed.has(interval) ? interval : 300
      const limit = Math.min(Number(url.searchParams.get('limit') || 500), 2000)
      const rows = await qAll(
        `SELECT timestamp, price, bot_amount AS volume FROM trades WHERE launch_id = ? ORDER BY timestamp ASC, id ASC`,
        [id],
      )
      const candles: Array<Record<string, number>> = []
      let bucket = -1
      let cur: Record<string, number> | null = null
      for (const r of rows) {
        const b = Math.floor(Number(r.timestamp) / sec) * sec
        if (b !== bucket || !cur) {
          if (cur) candles.push(cur)
          bucket = b
          cur = {
            time: b,
            open: Number(r.price),
            high: Number(r.price),
            low: Number(r.price),
            close: Number(r.price),
            volume: Number(r.volume) || 0,
            trades: 1,
          }
        } else {
          cur.high = Math.max(cur.high, Number(r.price))
          cur.low = Math.min(cur.low, Number(r.price))
          cur.close = Number(r.price)
          cur.volume += Number(r.volume) || 0
          cur.trades += 1
        }
      }
      if (cur) candles.push(cur)
      return Response.json({ interval: sec, candles: candles.slice(-limit) })
    }

    // launches/:id/holders
    if (parts[0] === 'launches' && parts[2] === 'holders') {
      const id = Number(parts[1])
      const limit = Math.min(Number(url.searchParams.get('limit') || 100), 500)
      const exists = await qOne('SELECT id FROM launches WHERE id = ?', [id])
      if (!exists) return Response.json({ error: 'not_found' }, { status: 404 })
      const rows = await qAll(
        `SELECT
           trader AS address,
           SUM(CASE WHEN side = 'buy' THEN token_amount ELSE 0 END) AS bought,
           SUM(CASE WHEN side = 'sell' THEN token_amount ELSE 0 END) AS sold,
           SUM(CASE WHEN side = 'buy' THEN bot_amount ELSE 0 END) AS spent_bot,
           SUM(CASE WHEN side = 'sell' THEN bot_amount ELSE 0 END) AS received_bot,
           COUNT(*) AS trade_count,
           MIN(timestamp) AS first_trade_at,
           MAX(timestamp) AS last_trade_at
         FROM trades WHERE launch_id = ? GROUP BY trader`,
        [id],
      )
      const holders = rows
        .map((r) => {
          const bought = Number(r.bought) || 0
          const sold = Number(r.sold) || 0
          const held = scrub(bought - sold)
          return {
            address: String(r.address),
            boughtToken: scrub(bought),
            soldToken: scrub(sold),
            heldToken: held,
            spentBot: scrub(Number(r.spent_bot) || 0),
            receivedBot: scrub(Number(r.received_bot) || 0),
            tradeCount: Number(r.trade_count) || 0,
            firstTradeAt: Number(r.first_trade_at) || 0,
            lastTradeAt: Number(r.last_trade_at) || 0,
          }
        })
        .filter((h) => h.heldToken > 1e-9)
        .sort((a, b) => b.heldToken - a.heldToken)
      const top = holders.slice(0, limit)
      const totalHeld = holders.reduce((s, h) => s + h.heldToken, 0)
      return Response.json({
        launchId: id,
        source: 'curve_trades',
        holders: top.map((h, i) => ({
          ...h,
          rank: i + 1,
          shareBps: totalHeld > 0 ? Math.round((h.heldToken / totalHeld) * 10_000) : 0,
        })),
        summary: {
          holderCount: holders.length,
          totalHeldToken: scrub(totalHeld),
        },
      })
    }

    // launches/:id/snipers — first N unique buyers
    if (parts[0] === 'launches' && parts[2] === 'snipers') {
      const id = Number(parts[1])
      const limit = Math.min(Number(url.searchParams.get('limit') || 20), 100)
      const exists = await qOne('SELECT id FROM launches WHERE id = ?', [id])
      if (!exists) return Response.json({ error: 'not_found' }, { status: 404 })
      const buys = await qAll(
        `SELECT trader, timestamp, block_number, token_amount, bot_amount
         FROM trades WHERE launch_id = ? AND side = 'buy'
         ORDER BY block_number ASC, id ASC`,
        [id],
      )
      const seen = new Set<string>()
      const snipers = []
      for (const b of buys) {
        const addr = String(b.trader).toLowerCase()
        if (seen.has(addr)) continue
        seen.add(addr)
        const agg = await qOne(
          `SELECT
             SUM(CASE WHEN side = 'buy' THEN token_amount ELSE 0 END) AS bought,
             SUM(CASE WHEN side = 'sell' THEN token_amount ELSE 0 END) AS sold
           FROM trades WHERE launch_id = ? AND trader = ?`,
          [id, String(b.trader)],
        )
        const bought = Number(agg?.bought) || 0
        const sold = Number(agg?.sold) || 0
        snipers.push({
          address: b.trader,
          firstBuyAt: Number(b.timestamp),
          firstBuyBlock: Number(b.block_number),
          boughtToken: scrub(bought),
          soldToken: scrub(sold),
          heldToken: scrub(bought - sold),
          dumped: sold > bought * 0.5,
        })
        if (snipers.length >= limit) break
      }
      return Response.json({
        launchId: id,
        source: 'curve_trades',
        snipers,
        summary: {
          sniperCount: snipers.length,
          dumpedCount: snipers.filter((s) => s.dumped).length,
        },
      })
    }

    // launches/:id/replies
    if (parts[0] === 'launches' && parts[2] === 'replies') {
      const id = Number(parts[1])
      const rows = await qAll(
        `SELECT launch_id, reply_index, author, body, timestamp, tx_hash
         FROM replies WHERE launch_id = ? ORDER BY reply_index DESC LIMIT 100`,
        [id],
      )
      return Response.json({ replies: rows })
    }

    // wallets/:address/portfolio — lightweight summary from trades
    if (parts[0] === 'wallets' && parts[2] === 'portfolio') {
      const address = parts[1]
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return Response.json({ error: 'invalid_address' }, { status: 400 })
      }
      // Reuse full portfolio module via dynamic import of local logic would pull sqlite —
      // inline a minimal version
      const { getPortfolio } = await import('../../src/portfolio.js')
      const data = await getPortfolio(address)
      return Response.json({
        ...data,
        source: 'curve_trades',
        note: 'PnL uses average cost basis; mark price is last curve trade.',
      })
    }

    if (parts[0] === 'wallets' && parts[2] === 'trades') {
      const address = parts[1]
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return Response.json({ error: 'invalid_address' }, { status: 400 })
      }
      const limit = Math.min(Number(url.searchParams.get('limit') || 200), 2000)
      const { getWalletTrades } = await import('../../src/portfolio.js')
      return Response.json(await getWalletTrades(address, limit))
    }

    return Response.json({ error: 'not_found', path: parts }, { status: 404 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes('turso_unconfigured') ? 503 : 500
    return Response.json({ error: msg }, { status })
  }
}
