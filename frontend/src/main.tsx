import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import rainbowkitStyles from '@rainbow-me/rainbowkit/styles.css?url'
import { wagmiConfig } from './lib/wagmi'
import App from './App'
import './index.css'

// Load RainbowKit CSS as a URL so PostCSS/Tailwind does not parse vendor CSS.
const rkLink = document.createElement('link')
rkLink.rel = 'stylesheet'
rkLink.href = rainbowkitStyles
document.head.appendChild(rkLink)

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#8b5cf6',
            accentColorForeground: '#ffffff',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
)
