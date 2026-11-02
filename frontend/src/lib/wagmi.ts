import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { activeChain } from './chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Vyntra',
  projectId: import.meta.env.VITE_WALLETCONNECT_ID || 'spawnfun-local-dev',
  chains: [activeChain],
  ssr: false,
})
