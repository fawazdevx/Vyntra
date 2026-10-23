import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAddress, type Address, type Hex } from 'viem'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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

export const DB_PATH =
  process.env.INDEXER_DB_PATH || path.join(__dirname, '..', 'data', 'vyntra.sqlite')

export const API_PORT = Number(process.env.INDEXER_API_PORT || 8787)
export const POLL_MS = Number(process.env.INDEXER_POLL_MS || 8_000)
export const CONFIRMATIONS = Number(process.env.INDEXER_CONFIRMATIONS || 1)
/** Max blocks per eth_getLogs chunk (RPC providers vary). */
export const LOG_CHUNK = Number(process.env.INDEXER_LOG_CHUNK || 2_000)

export const START_BLOCK = BigInt(process.env.INDEXER_START_BLOCK || '0')

export function requireFactory(): Address {
  if (!FACTORY_ADDRESS) {
    throw new Error(
      'Set FACTORY_ADDRESS or VITE_FACTORY_ADDRESS before running the indexer (after deploy).',
    )
  }
  return FACTORY_ADDRESS
}

export type HexAddress = Hex
