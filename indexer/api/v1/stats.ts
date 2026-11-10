import { jsonCors, optionsOk } from '../../src/edge-cors.js'
import { maybeSyncEdge } from '../../src/edge-sync.js'
import { createClient } from '@libsql/client/web'
import { VYNTRA_MARKET_START_BLOCK } from '../../src/config.js'

export const config = { runtime: 'edge' }

export default async function handler(req?: Request) {
  if (req?.method === 'OPTIONS') return optionsOk()
  await maybeSyncEdge()
  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || ''
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN
  if (!url || url.startsWith('file:')) {
    return jsonCors(
      { error: 'turso_unconfigured', hasUrl: Boolean(url) },
      { status: 503 },
    )
  }

  try {
    const db = createClient({ url, authToken })
    const platformStartBlock = Number(VYNTRA_MARKET_START_BLOCK)
    const rs = await db.execute({ sql: `
      SELECT
        COUNT(*) AS launches,
        SUM(CASE WHEN graduated = 0 AND migrated = 0 THEN 1 ELSE 0 END) AS on_curve,
        SUM(CASE WHEN graduated = 1 OR migrated = 1 THEN 1 ELSE 0 END) AS graduated,
        COALESCE(SUM(raised_native), 0) AS raised_native,
        COALESCE((SELECT SUM(native_amount) FROM trades), 0) +
          COALESCE((SELECT SUM(native_amount) FROM platform_trades WHERE block_number >= ?), 0) AS volume_native,
        COALESCE((SELECT COUNT(*) FROM trades), 0) +
          COALESCE((SELECT COUNT(*) FROM platform_trades WHERE block_number >= ?), 0) AS trades
      FROM launches
    `, args: [platformStartBlock, platformStartBlock] })
    const row = rs.rows[0] || {}
    const meta = await db.execute(`SELECT key, value FROM meta WHERE key IN ('last_block', 'last_sync_at')`)
    const metaMap: Record<string, string> = {}
    for (const r of meta.rows) {
      metaMap[String(r.key)] = String(r.value)
    }
    return jsonCors({
      launches: Number(row.launches || 0),
      onCurve: Number(row.on_curve || 0),
      graduated: Number(row.graduated || 0),
      raisedNative: Number(row.raised_native || 0),
      volumeNative: Number(row.volume_native || 0),
      trades: Number(row.trades || 0),
      lastBlock: metaMap.last_block ?? null,
      lastSyncAt: metaMap.last_sync_at ?? null,
    })
  } catch (e) {
    return jsonCors(
      { error: 'query_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
