/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_ADDRESS?: string
  readonly VITE_VYNTRA_TOKEN?: string
  readonly VITE_VYNTRA_MARKET?: string
  /** @deprecated use VITE_VYNTRA_TOKEN */
  readonly VITE_SPAWN_TOKEN?: string
  /** @deprecated use VITE_VYNTRA_MARKET */
  readonly VITE_SPAWN_MARKET?: string
  readonly VITE_BUYBACK_VAULT?: string
  readonly VITE_FEE_ROUTER?: string
  readonly VITE_VYNTRA_RESERVE_TIMELOCK?: string
  readonly VITE_VYNTRA_RESERVE_VAULT?: string
  readonly VITE_VYNTRA_PROMOTION?: string
  readonly VITE_BOARD_ADDRESS?: string
  readonly VITE_KEEPER_ADDRESS?: string
  readonly VITE_INDEXER_URL?: string
  readonly VITE_WALLETCONNECT_ID?: string
  readonly VITE_ELYSIUM_TESTNET_RPC_URL?: string
  /** Optional ImgBB key for image upload when Vite Catbox proxy is unavailable (static hosts). */
  readonly VITE_IMGBB_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
