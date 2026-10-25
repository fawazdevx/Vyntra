import { qAll } from '../../../../src/edge-db.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  try {
    const u = new URL(req.url)
    const parts = u.pathname.split('/').filter(Boolean)
    const id = Number(parts[parts.indexOf('launches') + 1])
    const limit = Math.min(Number(u.searchParams.get('limit') || 1000), 5000)
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
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
