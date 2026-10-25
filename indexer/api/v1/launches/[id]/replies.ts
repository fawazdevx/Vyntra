import { qAll } from '../../../../src/edge-db.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  try {
    const parts = new URL(req.url).pathname.split('/').filter(Boolean)
    const id = Number(parts[parts.indexOf('launches') + 1])
    const rows = await qAll(
      `SELECT launch_id, reply_index, author, body, timestamp, tx_hash
       FROM replies WHERE launch_id = ? ORDER BY reply_index DESC LIMIT 100`,
      [id],
    )
    return Response.json({ replies: rows })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
