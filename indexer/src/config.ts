import { getAddress, type Address, type Hex } from 'viem'

function optionalAddress(raw?: string): Address | undefined {
  if (!raw) return undefined
  try {
    return getAddress(raw)
  } catch {
    return undefined
  }
}

export const RPC_URL =
  process.env.INDEXER_RPC_URL ||
  process.env.BOT_TESTNET_RPC_URL ||
  process.env.VITE_BOT_TESTNET_RPC_URL ||
  'https://rpc.bohr.life'

export const CHAIN_ID = Number(process.env.INDEXER_CHAIN_ID || process.env.BOT_TESTNET_CHAIN_ID || 968)

export const FACTORY_ADDRESS = optionalAddress(
  process.env.FACTORY_ADDRESS || process.env.VITE_FACTORY_ADDRESS,
)

export const BOARD_ADDRESS = optionalAddress(
  process.env.BOARD_ADDRESS || process.env.VITE_BOARD_ADDRESS,
)

export const VYNTRA_MARKET_ADDRESS = optionalAddress(
  process.env.VYNTRA_MARKET_ADDRESS ||
    process.env.VITE_VYNTRA_MARKET ||
    process.env.VITE_SPAWN_MARKET,
)

const isVercel = Boolean(process.env.VERCEL)

/** Turso URL on Vercel; local file URL only when not on Vercel. */
export const DATABASE_URL =
  process.env.TURSO_DATABASE_URL ||
  process.env.LIBSQL_URL ||
  process.env.INDEXER_DATABASE_URL ||
  (isVercel ? '' : 'file:local.db')

export const DATABASE_AUTH_TOKEN =
  process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || undefined

export const hasRemoteDatabase = Boolean(
  DATABASE_URL && !DATABASE_URL.startsWith('file:'),
)

export const API_PORT = Number(process.env.INDEXER_API_PORT || process.env.PORT || 8787)
export const POLL_MS = Number(process.env.INDEXER_POLL_MS || 8_000)
export const CONFIRMATIONS = Number(process.env.INDEXER_CONFIRMATIONS || 1)
export const LOG_CHUNK = Number(process.env.INDEXER_LOG_CHUNK || 2_000)
export const START_BLOCK = BigInt(process.env.INDEXER_START_BLOCK || '0')
export const VYNTRA_MARKET_START_BLOCK = BigInt(
  process.env.VYNTRA_MARKET_START_BLOCK || process.env.INDEXER_START_BLOCK || '0',
)
export const SYNC_STALE_SEC = Number(process.env.INDEXER_SYNC_STALE_SEC || 20)
export const CRON_SECRET = process.env.CRON_SECRET || ''

export function requireFactory(): Address {
  if (!FACTORY_ADDRESS) {
    throw new Error(
      'Set FACTORY_ADDRESS or VITE_FACTORY_ADDRESS before running the indexer (after deploy).',
    )
  }
  return FACTORY_ADDRESS
}

export type HexAddress = Hex
