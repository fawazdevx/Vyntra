import { createClient, type Client, type InArgs } from '@libsql/client/web'

let _client: Client | null = null

export function getEdgeDb(): Client {
  if (_client) return _client
  const url = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || ''
  const authToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN
  if (!url || url.startsWith('file:')) {
    throw new Error('turso_unconfigured')
  }
  _client = createClient({ url, authToken })
  return _client
}

export async function qAll(sql: string, args: Array<string | number | bigint | null | boolean> = []) {
  const rs = await getEdgeDb().execute({ sql, args: args as InArgs })
  return rs.rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const col of rs.columns) out[col] = row[col]
    return out
  })
}

export async function qOne(sql: string, args: Array<string | number | bigint | null | boolean> = []) {
  const rows = await qAll(sql, args)
  return rows[0]
}
