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
    const limit = Math.min(Number(u.searchParams.get('limit') || 100), 500)
    if (!(await qOne('SELECT id FROM launches WHERE id = ?', [id]))) {
      return Response.json({ error: 'not_found' }, { status: 404 })
    }
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
        return {
          address: String(r.address),
          boughtToken: scrub(bought),
          soldToken: scrub(sold),
          heldToken: scrub(bought - sold),
          spentBot: scrub(Number(r.spent_bot) || 0),
          receivedBot: scrub(Number(r.received_bot) || 0),
          tradeCount: Number(r.trade_count) || 0,
          firstTradeAt: Number(r.first_trade_at) || 0,
          lastTradeAt: Number(r.last_trade_at) || 0,
        }
      })
      .filter((h) => h.heldToken > 1e-9)
      .sort((a, b) => b.heldToken - a.heldToken)
    const totalHeld = holders.reduce((s, h) => s + h.heldToken, 0)
    return Response.json({
      launchId: id,
      source: 'curve_trades',
      holders: holders.slice(0, limit).map((h, i) => ({
        ...h,
        rank: i + 1,
        shareBps: totalHeld > 0 ? Math.round((h.heldToken / totalHeld) * 10_000) : 0,
      })),
      summary: { holderCount: holders.length, totalHeldToken: scrub(totalHeld) },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
