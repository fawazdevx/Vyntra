import { getAddress, type Address, formatEther } from 'viem'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address
export const NATIVE_TOKEN_SYMBOL = 'HYPE'
const ELYSIUM_TESTNET_EXPLORER = 'https://explorer-elysium-testnet.t.conduit.xyz'

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

const hiddenLaunchIds = new Set(
  String(import.meta.env.VITE_HIDDEN_LAUNCH_IDS ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((id) => Number.isSafeInteger(id) && id > 0),
)

/** Launch IDs hidden from Vyntra's UI, for example registry entries imported from an old factory. */
export function isHiddenLaunchId(id: number | null | undefined): boolean {
  return id != null && hiddenLaunchIds.has(id)
}

/** Platform token + buyback stack (set after economy deploy). */
export const VYNTRA_TOKEN = optionalAddress(
  import.meta.env.VITE_VYNTRA_TOKEN ?? import.meta.env.VITE_SPAWN_TOKEN,
)
export const VYNTRA_MARKET = optionalAddress(
  import.meta.env.VITE_VYNTRA_MARKET ?? import.meta.env.VITE_SPAWN_MARKET,
)
export const BUYBACK_VAULT = optionalAddress(import.meta.env.VITE_BUYBACK_VAULT)
export const FEE_ROUTER = optionalAddress(import.meta.env.VITE_FEE_ROUTER)
export const VYNTRA_RESERVE_TIMELOCK = optionalAddress(import.meta.env.VITE_VYNTRA_RESERVE_TIMELOCK)
export const VYNTRA_RESERVE_VAULT = optionalAddress(import.meta.env.VITE_VYNTRA_RESERVE_VAULT)
export const VYNTRA_PROMOTION = optionalAddress(import.meta.env.VITE_VYNTRA_PROMOTION)
export const LEGACY_VYNTRA_PROMOTION = optionalAddress(import.meta.env.VITE_LEGACY_VYNTRA_PROMOTION)
export const BOARD_ADDRESS = (optionalAddress(import.meta.env.VITE_BOARD_ADDRESS) ??
  ZERO_ADDRESS) as Address
export const isBoardConfigured = Boolean(optionalAddress(import.meta.env.VITE_BOARD_ADDRESS))
export const LEGACY_BOARD_ADDRESS = optionalAddress(import.meta.env.VITE_LEGACY_BOARD_ADDRESS)

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
  raisedNative: number
  graduated: boolean
  migrated: boolean
  externalPair: Address
  creatorFees: bigint
  buyTaxBps: number
  sellTaxBps: number
  tradeCount?: number
  volumeNative?: number
}

export function shortAddr(addr?: string) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatNative(value: number | string | bigint) {
  if (typeof value === 'bigint') {
    const n = Number(formatEther(value))
    return formatNative(n)
  }
  const n = typeof value === 'string' ? Number(value) : value
  if (!Number.isFinite(n)) return '0'
  if (n >= 1000) return n.toFixed(0)
  if (n >= 1) return n.toFixed(3)
  if (n === 0) return '0'
  return n.toFixed(4)
}

export function explorerTx(hash: string, _chainId?: number) {
  return `${ELYSIUM_TESTNET_EXPLORER}/tx/${hash}`
}

export function explorerAddress(addr: string, _chainId?: number) {
  return `${ELYSIUM_TESTNET_EXPLORER}/address/${addr}`
}

export const ELYSIUM_FAUCET_URL = 'https://elysium.kinetiq.xyz/testnet-faucet'
export const ELYSIUM_BRIDGE_URL = 'https://testnet.elysium.kinetiq.xyz/bridge'
