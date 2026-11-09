import { explorerTx, formatNative, shortAddr } from '../lib/config'
import type { TradePoint } from '../hooks/useTradeHistory'
import { activeChain } from '../lib/chains'
import { HypeUsd } from './HypeUsd'

type Props = {
  trades: TradePoint[]
  symbol: string
}

function timeLabel(timestamp: number) {
  if (!timestamp) return '—'
  return new Date(timestamp * 1000).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function TradeTape({ trades, symbol }: Props) {
  const rows = [...trades].reverse().slice(0, 24)

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)]">
      <div className="flex items-center justify-between border-b border-[var(--vyntra-border)] px-4 py-3.5 sm:px-5">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--vyntra-muted)]">
            Trade tape
          </div>
          <p className="mt-0.5 text-xs text-[var(--vyntra-faint)]">Most recent on-chain buys and sells</p>
        </div>
        <div className="font-mono text-xs tabular-nums text-[var(--vyntra-muted)]">{rows.length} / 24</div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="font-display text-lg text-[var(--vyntra-fg)]">Waiting for the first trade</p>
          <p className="mt-1 text-sm text-[var(--vyntra-muted)]">The tape will fill in when someone buys or sells ${symbol}.</p>
        </div>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--vyntra-elev)] text-[10px] uppercase tracking-[0.12em] text-[var(--vyntra-faint)]">
              <tr>
                <th className="px-4 py-3 font-semibold sm:px-5">Time</th>
                <th className="px-2 py-3 font-semibold">Side</th>
                <th className="px-2 py-3 font-semibold">HYPE</th>
                <th className="px-2 py-3 font-semibold">{symbol}</th>
                <th className="px-2 py-3 font-semibold">Market cap</th>
                <th className="px-4 py-3 text-right font-semibold sm:px-5">Wallet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={`${t.txHash}-${t.side}-${t.time}`}
                  className="border-t border-[var(--vyntra-border)] transition-colors hover:bg-[var(--vyntra-hover)]"
                >
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--vyntra-muted)] sm:px-5">
                    {timeLabel(t.time)}
                  </td>
                  <td className="px-2 py-3">
                    <span className={`inline-flex min-w-12 justify-center rounded px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${
                      t.side === 'buy'
                        ? 'bg-[rgba(15,122,78,0.09)] text-[var(--vyntra-success)]'
                        : 'bg-[rgba(194,59,59,0.08)] text-[var(--vyntra-danger)]'
                    }`}>
                      {t.side}
                    </span>
                  </td>
                  <td className="px-2 py-3 font-mono text-[var(--vyntra-fg)]">
                    {formatNative(t.amountNative)}
                    <HypeUsd value={t.amountNative} className="block text-[10px] font-normal text-[var(--vyntra-faint)]" />
                  </td>
                  <td className="px-2 py-3 font-mono text-[var(--vyntra-muted)]">{formatNative(t.amountToken)}</td>
                  <td className="px-2 py-3 font-mono text-[var(--vyntra-muted)]">
                    {formatNative(t.mcap)}
                    <HypeUsd value={t.mcap} className="block text-[10px] font-normal text-[var(--vyntra-faint)]" />
                  </td>
                  <td className="px-4 py-3 text-right sm:px-5">
                    <a
                      href={explorerTx(t.txHash, activeChain.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-[var(--vyntra-muted)] transition hover:text-[var(--vyntra-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vyntra-primary)] focus-visible:ring-offset-2"
                    >
                      {shortAddr(t.trader)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
