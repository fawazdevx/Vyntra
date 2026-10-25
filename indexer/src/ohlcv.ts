import { queryAll } from './db.js'

export type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  trades: number
}

/** Build OHLCV candles from indexed trades. intervalSec: 60 | 300 | 900 | 3600 | 86400 */
export async function buildOhlcv(launchId: number, intervalSec: number, limit = 500): Promise<Candle[]> {
  const rows = await queryAll<{ timestamp: number; price: number; volume: number }>(
    `SELECT timestamp, price, bot_amount AS volume
     FROM trades WHERE launch_id = ? ORDER BY timestamp ASC, id ASC`,
    [launchId],
  )

  if (rows.length === 0) return []

  const candles: Candle[] = []
  let bucket = -1
  let cur: Candle | null = null

  for (const r of rows) {
    const b = Math.floor(Number(r.timestamp) / intervalSec) * intervalSec
    if (b !== bucket || !cur) {
      if (cur) candles.push(cur)
      bucket = b
      cur = {
        time: b,
        open: r.price,
        high: r.price,
        low: r.price,
        close: r.price,
        volume: Number(r.volume) || 0,
        trades: 1,
      }
    } else {
      cur.high = Math.max(cur.high, r.price)
      cur.low = Math.min(cur.low, r.price)
      cur.close = r.price
      cur.volume += Number(r.volume) || 0
      cur.trades += 1
    }
  }
  if (cur) candles.push(cur)
  return candles.slice(-limit)
}
