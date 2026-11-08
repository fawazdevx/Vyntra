/**
 * Edge health — instant on Vercel Hobby. No Node/libsql/viem imports.
 */
import { jsonCors, optionsOk } from '../src/edge-cors.js'

export const config = { runtime: 'edge' }

export default function handler(req: Request) {
  if (req.method === 'OPTIONS') return optionsOk()
  const factory =
    process.env.FACTORY_ADDRESS || process.env.VITE_FACTORY_ADDRESS || null
  const vyntraMarket =
    process.env.VYNTRA_MARKET_ADDRESS ||
    process.env.VITE_VYNTRA_MARKET ||
    process.env.VITE_SPAWN_MARKET ||
    null
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL || ''
  return jsonCors({
    ok: true,
    service: 'vyntra-indexer',
    runtime: 'edge',
    factory,
    hasTursoUrl: Boolean(tursoUrl) && !tursoUrl.startsWith('file:'),
    hasTursoToken: Boolean(
      process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN,
    ),
    chainId: Number(
      process.env.INDEXER_CHAIN_ID || 99801,
    ),
    vyntraMarket,
    vyntraMarketStartBlock:
      process.env.VYNTRA_MARKET_START_BLOCK ||
      process.env.INDEXER_START_BLOCK ||
      null,
    rpc:
      process.env.INDEXER_RPC_URL ||
      process.env.ELYSIUM_TESTNET_RPC_URL ||
      'https://testnet-rpc.elysium.kinetiq.xyz',
  })
}
