import { qAll, qOne } from '../../src/edge-db.js'
import { jsonCors, optionsOk, withCors } from '../../src/edge-cors.js'
import { maybeSyncEdge } from '../../src/edge-sync.js'
import { getHolders, getSnipers } from '../../src/analytics.js'
import { VYNTRA_MARKET_ADDRESS, VYNTRA_MARKET_START_BLOCK } from '../../src/config.js'

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

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsOk()
  try {
    await maybeSyncEdge()
    const u = new URL(req.url)
    const kind = u.searchParams.get('kind') || ''
    const id = Number(u.searchParams.get('id') || 0)
    const address = u.searchParams.get('address') || ''
    const limit = Math.min(Number(u.searchParams.get('limit') || 100), 5000)

    if (kind === 'launch') {
      const row = await qOne('SELECT * FROM launches WHERE id = ?', [id])
      if (!row) return jsonCors({ error: 'not_found' }, { status: 404 })
      return jsonCors({ launch: launchJson(row) })
    }

    if (kind === 'trades') {
      const rows = await qAll(
        `SELECT * FROM trades WHERE launch_id = ? ORDER BY timestamp ASC, id ASC LIMIT ?`,
        [id, Math.min(limit, 5000)],
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
        })
        last = time
      }
      return jsonCors({ trades })
    }

    if (kind === 'platform_trades') {
      const rows = await qAll(
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
          blockNumber: Number(r.block_number),
        })
        last = time
      }
      const cursor = await qOne(
        'SELECT value FROM meta WHERE key = ?',
        ['last_vyntra_market_block'],
      )
      return jsonCors({
        market: VYNTRA_MARKET_ADDRESS ?? null,
        trades,
        lastBlock: cursor?.value ?? null,
      })
    }

    if (kind === 'ohlcv') {
      const interval = Number(u.searchParams.get('interval') || 300)
      const allowed = new Set([60, 300, 900, 3600, 86400])
      const sec = allowed.has(interval) ? interval : 300
      const rows = await qAll(
        `SELECT timestamp, price, native_amount AS volume FROM trades WHERE launch_id = ? ORDER BY timestamp ASC, id ASC`,
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
      return jsonCors({ interval: sec, candles: candles.slice(-Math.min(limit, 2000)) })
    }

    if (kind === 'holders') {
      if (!(await qOne('SELECT id FROM launches WHERE id = ?', [id]))) {
        return jsonCors({ error: 'not_found' }, { status: 404 })
      }
      const { holders, summary } = await getHolders(id, Math.min(limit, 500))
      return jsonCors({
        launchId: id,
        source: 'curve_trades',
        note: 'Balances are net Buy/Sell on the bonding curve (wallet transfers ignored).',
        holders,
        summary,
      })
    }

    if (kind === 'snipers') {
      if (!(await qOne('SELECT id FROM launches WHERE id = ?', [id]))) {
        return jsonCors({ error: 'not_found' }, { status: 404 })
      }
      const earlySeconds = Number(u.searchParams.get('earlySeconds') || 0)
      const { snipers, summary, window } = await getSnipers(id, {
        limit: Math.min(limit || 20, 100),
        earlySeconds,
      })
      return jsonCors({
        launchId: id,
        source: 'curve_trades',
        note: 'Snipers = first N unique buyers by block order. Dump rate uses later sells.',
        window,
        snipers,
        summary,
      })
    }

    if (kind === 'replies') {
      const rows = await qAll(
        `SELECT launch_id, reply_index, author, body, timestamp, tx_hash
         FROM replies WHERE launch_id = ? ORDER BY reply_index DESC LIMIT 100`,
        [id],
      )
      return jsonCors({ replies: rows })
    }

    if (kind === 'portfolio') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return jsonCors({ error: 'invalid_address' }, { status: 400 })
      }
      const { getPortfolio } = await import('../../src/portfolio.js')
      const data = await getPortfolio(address)
      return jsonCors({
        ...data,
        source: 'curve_trades',
        note: 'PnL uses average cost basis; mark price is last curve trade.',
      })
    }

    if (kind === 'wallet_trades') {
      if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return jsonCors({ error: 'invalid_address' }, { status: 400 })
      }
      const { getWalletTrades } = await import('../../src/portfolio.js')
      return jsonCors(await getWalletTrades(address, Math.min(limit, 2000)))
    }

    return jsonCors({ error: 'unknown_kind', kind }, { status: 400 })
  } catch (e) {
    return jsonCors(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
