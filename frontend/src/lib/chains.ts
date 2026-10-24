import { defineChain } from 'viem'

export const botTestnet = defineChain({
  id: 968,
  name: 'BOT Chain Testnet',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_BOT_TESTNET_RPC_URL || 'https://rpc.bohr.life'] },
  },
  blockExplorers: {
    default: { name: 'BOT Scan', url: 'https://scan.bohr.life' },
  },
  testnet: true,
})

export const botMainnet = defineChain({
  id: 677,
  name: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai'] },
  },
  blockExplorers: {
    default: { name: 'BOT Scan', url: 'https://scan.botchain.ai' },
  },
})
