import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { botMainnet, botTestnet } from './chains'

export const wagmiConfig = getDefaultConfig({
  appName: 'Vyntra',
  projectId: import.meta.env.VITE_WALLETCONNECT_ID || 'spawnfun-local-dev',
  chains: [botTestnet, botMainnet],
  ssr: false,
})
