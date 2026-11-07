import { jsonCors, optionsOk } from '../../../src/edge-cors.js'
import { maybeSyncEdge } from '../../../src/edge-sync.js'
import { createClient } from '@libsql/client/web'

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
  await maybeSyncEdge()
  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || ''
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN
  if (!url || url.startsWith('file:')) {
    return jsonCors({ error: 'turso_unconfigured' }, { status: 503 })
  }
  const u = new URL(req.url)
  const sort = u.searchParams.get('sort') || 'trending'
  const limit = Math.min(Number(u.searchParams.get('limit') || 100), 500)
  const orderBy: Record<string, string> = {
    trending: 'progress_bps DESC, id DESC',
    new: 'created_at DESC',
    volume: 'volume_native DESC',
    graduated: 'migrated DESC, graduated DESC, id DESC',
  }
  const order = orderBy[sort] || orderBy.trending
  try {
    const db = createClient({ url, authToken })
    const rs = await db.execute({
      sql: `SELECT * FROM launches WHERE id < 9000 ORDER BY ${order} LIMIT ?`,
      args: [limit],
    })
    const launches = rs.rows.map((r) => {
      const row: Record<string, unknown> = {}
      for (const col of rs.columns) row[col] = r[col]
      return launchJson(row)
    })
    return jsonCors({ launches })
  } catch (e) {
    return jsonCors(
      { error: 'query_failed', detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
