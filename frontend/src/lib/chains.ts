import { defineChain } from 'viem'

// Kinetiq's Elysium is chain 99801. Do not use viem's built-in `elysiumTestnet`
// export; that name refers to a different network (chain 1338).
export const elysiumTestnet = defineChain({
  id: 99801,
  name: 'Elysium Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        import.meta.env.VITE_ELYSIUM_TESTNET_RPC_URL ||
          'https://testnet-rpc.elysium.kinetiq.xyz',
      ],
    },
  },
  blockExplorers: {
    default: {
      name: 'Elysium Explorer',
      url: 'https://explorer-elysium-testnet.t.conduit.xyz',
    },
  },
  testnet: true,
})

const configuredChainId = Number(import.meta.env.VITE_CHAIN_ID || elysiumTestnet.id)

if (configuredChainId !== elysiumTestnet.id) {
  throw new Error('VITE_CHAIN_ID must be 99801 (Kinetiq Elysium Testnet).')
}

/** This build targets Kinetiq Elysium Testnet. */
export const activeChain = elysiumTestnet
export const isMainnet = false
