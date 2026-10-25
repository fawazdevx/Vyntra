import { jsonCors, optionsOk } from '../../src/edge-cors.js'
import { createClient } from '@libsql/client/web'

export const config = { runtime: 'edge' }

export default async function handler(req?: Request) {
  if (req?.method === 'OPTIONS') return optionsOk()
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
    const rs = await db.execute(`
      SELECT
        COUNT(*) AS launches,
        SUM(CASE WHEN graduated = 0 AND migrated = 0 THEN 1 ELSE 0 END) AS on_curve,
        SUM(CASE WHEN graduated = 1 OR migrated = 1 THEN 1 ELSE 0 END) AS graduated,
        COALESCE(SUM(raised_bot), 0) AS raised_bot,
        COALESCE(SUM(volume_bot), 0) AS volume_bot,
        COALESCE(SUM(trade_count), 0) AS trades
      FROM launches
    `)
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
      raisedBot: Number(row.raised_bot || 0),
      volumeBot: Number(row.volume_bot || 0),
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
