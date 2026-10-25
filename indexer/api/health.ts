/**
 * Lightweight health for Vercel Hobby cold starts.
 * Must NOT import the Hono app / viem / libsql (those hang cold starts).
 */
export const config = {
  runtime: 'nodejs',
  maxDuration: 10,
}

export default function handler(
  _req: { method?: string },
  res: {
    statusCode: number
    setHeader: (k: string, v: string) => void
    end: (b: string) => void
  },
) {
  const factory =
    process.env.FACTORY_ADDRESS || process.env.VITE_FACTORY_ADDRESS || null
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || ''
  const body = {
    ok: true,
    service: 'vyntra-indexer',
    factory,
    hasTursoUrl: Boolean(tursoUrl) && !tursoUrl.startsWith('file:'),
    hasTursoToken: Boolean(process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN),
    chainId: Number(process.env.INDEXER_CHAIN_ID || process.env.BOT_TESTNET_CHAIN_ID || 968),
    rpc: process.env.INDEXER_RPC_URL || process.env.BOT_TESTNET_RPC_URL || null,
    note: 'Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN on this Vercel project. Full DB status: /api/v1/stats after sync.',
  }
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}
