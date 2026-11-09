import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { http, webSocket } from 'viem'
import { activeChain } from './chains'

const rpcUrl =
  import.meta.env.VITE_ELYSIUM_TESTNET_RPC_URL || activeChain.rpcUrls.default.http[0]
const websocketUrl = import.meta.env.VITE_ELYSIUM_TESTNET_WSS_URL

export const wagmiConfig = getDefaultConfig({
  appName: 'Vyntra',
  projectId: import.meta.env.VITE_WALLETCONNECT_ID || 'spawnfun-local-dev',
  chains: [activeChain],
  transports: {
    [activeChain.id]: websocketUrl ? webSocket(websocketUrl) : http(rpcUrl),
  },
  ssr: false,
})
