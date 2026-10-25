import { getAddress, type Address, formatEther } from 'viem'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address

function optionalAddress(raw: string | undefined): Address | undefined {
  if (!raw) return undefined
  try {
    return getAddress(raw) as Address
  } catch {
    return undefined
  }
}

const rawFactory = import.meta.env.VITE_FACTORY_ADDRESS as string | undefined
const parsedFactory = optionalAddress(rawFactory)

/** False when VITE_FACTORY_ADDRESS is missing or invalid — UI should show a friendly gate. */
export const isAppConfigured = Boolean(parsedFactory)

/** Factory address; zero address when not configured (hooks should be disabled via isAppConfigured). */
export const FACTORY_ADDRESS = (parsedFactory ?? ZERO_ADDRESS) as Address

/** Platform token + buyback stack (set after economy deploy). */
export const VYNTRA_TOKEN = optionalAddress(
  import.meta.env.VITE_VYNTRA_TOKEN ?? import.meta.env.VITE_SPAWN_TOKEN,
)
export const VYNTRA_MARKET = optionalAddress(
  import.meta.env.VITE_VYNTRA_MARKET ?? import.meta.env.VITE_SPAWN_MARKET,
)
export const BUYBACK_VAULT = optionalAddress(import.meta.env.VITE_BUYBACK_VAULT)
export const FEE_ROUTER = optionalAddress(import.meta.env.VITE_FEE_ROUTER)
export const BOARD_ADDRESS = (optionalAddress(import.meta.env.VITE_BOARD_ADDRESS) ??
  ZERO_ADDRESS) as Address
export const isBoardConfigured = Boolean(optionalAddress(import.meta.env.VITE_BOARD_ADDRESS))

export const KEEPER_ADDRESS = (optionalAddress(import.meta.env.VITE_KEEPER_ADDRESS) ??
  ZERO_ADDRESS) as Address
export const isKeeperConfigured = Boolean(optionalAddress(import.meta.env.VITE_KEEPER_ADDRESS))

/** Static brand art in frontend/public (platform token has no on-chain imageURI). */
export const VYNTRA_LOGO = '/vyntra.png'

/** On-chain board thread id for $VYNTRA (VyntraBoard.PLATFORM_THREAD). */
export const PLATFORM_REPLY_ID = 0

/** @deprecated use VYNTRA_TOKEN */
export const SPAWN_TOKEN = VYNTRA_TOKEN
/** @deprecated use VYNTRA_MARKET */
export const SPAWN_MARKET = VYNTRA_MARKET

export type LaunchView = {
  id: number
  token: Address
  curve: Address
  creator: Address
  splitter: Address
  name: string
  symbol: string
  imageURI: string
  description: string
  createdAt: number
  progressBps: number
  raisedBot: number
  graduated: boolean
  migrated: boolean
  externalPair: Address
  creatorFees: bigint
  buyTaxBps: number
  sellTaxBps: number
}

export function shortAddr(addr?: string) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatBot(value: number | string | bigint) {
  if (typeof value === 'bigint') {
    const n = Number(formatEther(value))
    return formatBot(n)
  }
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '0'
  if (n >= 1000) return n.toFixed(0)
  if (n >= 1) return n.toFixed(3)
  if (n === 0) return '0'
  return n.toFixed(4)
}

export function explorerTx(hash: string, chainId?: number) {
  const base = chainId === 677 ? 'https://scan.botchain.ai' : 'https://scan.bohr.life'
  return `${base}/tx/${hash}`
}

export function explorerAddress(addr: string, chainId?: number) {
  const base = chainId === 677 ? 'https://scan.botchain.ai' : 'https://scan.bohr.life'
  return `${base}/address/${addr}`
}

/** BDEX swap deep-link (token as output currency). */
export function bdexSwapUrl(token: string) {
  return `https://dex.botchain.ai/swap?outputCurrency=${token}`
}

/** BDEX pool / info deep-link when a V2 pair is known. */
export function bdexPairUrl(pair: string) {
  return `https://dex.botchain.ai/pools/${pair}`
}

/** Official BOT Chain bridge (not operated by Vyntra). */
export const BRIDGE_URL = 'https://bridge.botchain.ai/'
export const BDEX_URL = 'https://dex.botchain.ai/'
export const BOT_CHAIN_USDT = '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C' as Address
