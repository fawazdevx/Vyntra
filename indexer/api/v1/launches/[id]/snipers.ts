import { qAll, qOne } from '../../../../src/edge-db.js'

export const config = { runtime: 'edge' }

function scrub(n: number) {
  if (!Number.isFinite(n)) return 0
  if (Math.abs(n) < 1e-12) return 0
  return Math.round(n * 1e12) / 1e12
}

export default async function handler(req: Request) {
  try {
    const u = new URL(req.url)
    const parts = u.pathname.split('/').filter(Boolean)
    const id = Number(parts[parts.indexOf('launches') + 1])
    const limit = Math.min(Number(u.searchParams.get('limit') || 20), 100)
    if (!(await qOne('SELECT id FROM launches WHERE id = ?', [id]))) {
      return Response.json({ error: 'not_found' }, { status: 404 })
    }
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
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
