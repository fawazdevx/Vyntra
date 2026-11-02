import { useTheme } from '../lib/theme'

const GECKOTERMINAL_NETWORK = 'bot-chain'

export function GeckoTerminalChart({ poolAddress }: { poolAddress: string }) {
  const { theme } = useTheme()
  const background = theme === 'dark' ? '14101f' : 'ffffff'
  const params = new URLSearchParams({
    embed: '1',
    info: '0',
    swaps: '0',
    light_chart: theme === 'light' ? '1' : '0',
    chart_type: 'market_cap',
    resolution: '1d',
    bg_color: background,
  })
  const poolUrl =
    'https://www.geckoterminal.com/' +
    GECKOTERMINAL_NETWORK +
    '/pools/' +
    poolAddress

  return (
    <section className="overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vyntra-border)] px-4 py-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--vyntra-muted)]">
            GeckoTerminal · BDEX pool
          </p>
          <p className="mt-1 text-xs text-[var(--vyntra-faint)]">External market chart after liquidity migration</p>
        </div>
        <a
          href={poolUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-[var(--vyntra-muted)] underline underline-offset-4 hover:text-[var(--vyntra-fg)]"
        >
          Open on GeckoTerminal
        </a>
      </div>
      <iframe
        title="GeckoTerminal BDEX pool chart"
        src={poolUrl + '?' + params.toString()}
        loading="lazy"
        allow="clipboard-write"
        allowFullScreen
        className="block h-[420px] w-full border-0"
      />
      <p className="px-4 py-2 text-[10px] text-[var(--vyntra-faint)]">
        Chart and USD market data provided by GeckoTerminal. Vyntra’s on-chain trade history remains above.
      </p>
    </section>
  )
}
