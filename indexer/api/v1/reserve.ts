import { jsonCors, optionsOk } from '../../src/edge-cors.js'
import { qAll, qOne } from '../../src/edge-db.js'
import { maybeSyncEdge } from '../../src/edge-sync.js'

export const config = { runtime: 'edge' }

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsOk()
  try {
    await maybeSyncEdge()
    const url = new URL(req.url)
    const parsedLimit = Number(url.searchParams.get('limit') || 100)
    const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 500)
    const rows = await qAll(
      `SELECT event_name, campaign_id, bucket, amount, recipient, block_number,
              tx_hash, log_index, timestamp, payload_json
       FROM reserve_events ORDER BY block_number DESC, log_index DESC LIMIT ?`,
      [limit],
    )
    const meta = await qOne("SELECT value FROM meta WHERE key = 'last_reserve_block'")
    return jsonCors({
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
      lastBlock: meta?.value == null ? null : String(meta.value),
    })
  } catch (error) {
    return jsonCors(
      { error: 'reserve_index_unavailable', detail: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    )
  }
}
