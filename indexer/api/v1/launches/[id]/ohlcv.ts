import { qAll } from '../../../../src/edge-db.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  try {
    const u = new URL(req.url)
    const parts = u.pathname.split('/').filter(Boolean)
    const id = Number(parts[parts.indexOf('launches') + 1])
    const interval = Number(u.searchParams.get('interval') || 300)
    const allowed = new Set([60, 300, 900, 3600, 86400])
    const sec = allowed.has(interval) ? interval : 300
    const limit = Math.min(Number(u.searchParams.get('limit') || 500), 2000)
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
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
