import { StrictMode, useMemo } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import rainbowkitStyles from '@rainbow-me/rainbowkit/styles.css?url'
import { wagmiConfig } from './lib/wagmi'
import { ThemeProvider, useTheme } from './lib/theme'
import App from './App'
import './index.css'

const rkLink = document.createElement('link')
rkLink.rel = 'stylesheet'
rkLink.href = rainbowkitStyles
document.head.appendChild(rkLink)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 12_000,
      gcTime: 5 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
      networkMode: 'online',
    },
  },
})

function RainbowKitThemed({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()
  const rkTheme = useMemo(() => {
    const opts = {
      accentColor: '#7c3aed',
      accentColorForeground: '#ffffff',
      borderRadius: 'medium' as const,
      overlayBlur: 'small' as const,
    }
    return theme === 'dark' ? darkTheme(opts) : lightTheme(opts)
  }, [theme])

  return <RainbowKitProvider theme={rkTheme}>{children}</RainbowKitProvider>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitThemed>
            <App />
          </RainbowKitThemed>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  </StrictMode>,
)
