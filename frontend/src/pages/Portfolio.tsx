import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Briefcase, ExternalLink } from 'lucide-react'
import { activeChain } from '../lib/chains'
import { BotUsd } from '../components/BotUsd'
import { explorerTx, formatBot, shortAddr } from '../lib/config'
import {
  fetchPortfolioFromIndexer,
  fetchWalletTradesFromIndexer,
  isIndexerConfigured,
  type PortfolioPayload,
  type WalletTradesPayload,
} from '../lib/indexer'

type Tab = 'positions' | 'history'

function pnlClass(n: number) {
  if (n > 0) return 'text-[var(--vyntra-success)]'
  if (n < 0) return 'text-[var(--vyntra-danger)]'
  return 'text-[var(--vyntra-muted)]'
}

function fmtSigned(n: number) {
  const sign = n > 0 ? '+' : ''
  return `${sign}${formatBot(n)}`
}

function fmtTokens(n: number) {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toFixed(2)
  return n.toPrecision(3)
}

function fmtTime(ts: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function Portfolio() {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>('positions')
  const [portfolio, setPortfolio] = useState<PortfolioPayload | null>(null)
  const [history, setHistory] = useState<WalletTradesPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isIndexerConfigured || !address) {
      setPortfolio(null)
      setHistory(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      fetchPortfolioFromIndexer(address),
      fetchWalletTradesFromIndexer(address, 100),
    ])
      .then(([p, t]) => {
        if (cancelled) return
        setPortfolio(p)
        setHistory(t)
        if (!p) setError("Couldn't load your portfolio right now. Please try again in a moment.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [address])

  const openPositions = useMemo(
    () => portfolio?.positions.filter((p) => p.heldToken > 1e-12) ?? [],
    [portfolio],
  )
  const closedPositions = useMemo(
    () => portfolio?.positions.filter((p) => p.heldToken <= 1e-12) ?? [],
    [portfolio],
  )

  if (!isIndexerConfigured) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 px-6 py-16 text-center">
        <Briefcase className="mx-auto h-8 w-8 text-[var(--vyntra-faint)]" />
        <p className="font-display text-2xl">Portfolio unavailable</p>
        <p className="text-base text-[var(--vyntra-muted)]">
          Trade history and PnL are temporarily unavailable. Please try again later.
        </p>
      </div>
    )
  }

  if (!isConnected || !address) {
    return (
      <div className="card mx-auto max-w-lg space-y-5 px-6 py-16 text-center">
        <Briefcase className="mx-auto h-8 w-8 text-[var(--vyntra-faint)]" />
        <p className="font-display text-2xl">Your portfolio</p>
        <p className="text-base text-[var(--vyntra-muted)]">
          Connect a wallet to see positions, cost basis, and trade history.
        </p>
        <div className="flex justify-center">
          <ConnectButton />
        </div>
      </div>
    )
  }

  const s = portfolio?.summary

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-kicker">Portfolio</p>
          <h1 className="page-title mt-1">Trade history & PnL</h1>
          <p className="mt-2 font-mono text-sm text-[var(--vyntra-muted)]">{shortAddr(address)}</p>
        </div>
        <div className="flex gap-1 rounded-md bg-[var(--vyntra-elev)] p-1">
          {([
            ['positions', 'Positions'],
            ['history', 'History'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded px-3 py-1.5 text-sm font-semibold transition ${
                tab === key
                  ? 'bg-[var(--vyntra-fg)] text-[var(--vyntra-card)]'
                  : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Open" value={String(s?.openCount ?? '—')} />
        <Metric
          label="Held value"
          value={s ? `${formatBot(s.heldValueBot)} BOT` : '—'}
          sub={s ? <BotUsd value={s.heldValueBot} /> : null}
        />
        <Metric
          label="Realized"
          value={s ? `${fmtSigned(s.realizedPnlBot)} BOT` : '—'}
          sub={s ? <BotUsd value={s.realizedPnlBot} /> : null}
          valueClass={s ? pnlClass(s.realizedPnlBot) : undefined}
        />
        <Metric
          label="Total PnL"
          value={s ? `${fmtSigned(s.totalPnlBot)} BOT` : '—'}
          sub={s ? <BotUsd value={s.totalPnlBot} /> : null}
          valueClass={s ? pnlClass(s.totalPnlBot) : undefined}
        />
      </div>

      {loading && !portfolio ? (
        <div className="card px-4 py-12 text-center text-[var(--vyntra-muted)]">Loading portfolio…</div>
      ) : error && !portfolio ? (
        <div className="card space-y-3 px-4 py-12 text-center">
          <p className="text-[var(--vyntra-muted)]">{error}</p>
          <button
            type="button"
            className="btn-ghost mx-auto"
            onClick={() => {
              setError(null)
              setLoading(true)
              Promise.all([
                fetchPortfolioFromIndexer(address),
                fetchWalletTradesFromIndexer(address, 100),
              ])
                .then(([p, t]) => {
                  setPortfolio(p)
                  setHistory(t)
                  if (!p) {
                    setError("Couldn't load your portfolio right now. Please try again in a moment.")
                  }
                })
                .finally(() => setLoading(false))
            }}
          >
            Try again
          </button>
        </div>
      ) : tab === 'positions' ? (
        <div className="space-y-4">
          <PositionTable title="Open positions" rows={openPositions} empty="No open positions yet" />
          {closedPositions.length > 0 && (
            <PositionTable title="Closed" rows={closedPositions} empty="" />
          )}
          <p className="text-xs text-[var(--vyntra-faint)]">
            Average cost basis from indexed market buys/sells. Mark price is the last indexed trade.
            Wallet transfers are not counted.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="border-b border-[var(--vyntra-border)] px-4 py-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--vyntra-muted)] sm:px-5">
            Recent trades
          </div>
          {!history?.trades?.length ? (
            <div className="px-4 py-12 text-center text-[var(--vyntra-muted)]">No trades yet</div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--vyntra-card)] text-xs uppercase tracking-wider text-[var(--vyntra-faint)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold sm:px-5">When</th>
                    <th className="px-2 py-3 font-semibold">Token</th>
                    <th className="px-2 py-3 font-semibold">Side</th>
                    <th className="px-2 py-3 font-semibold">BOT</th>
                    <th className="px-4 py-3 font-semibold text-right sm:px-5">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {history.trades.map((t) => (
                    <tr key={`${t.txHash}-${t.side}-${t.timestamp}`} className="border-t border-[var(--vyntra-border)]">
                      <td className="px-4 py-3 font-mono text-xs text-[var(--vyntra-muted)] sm:px-5">
                        {fmtTime(t.timestamp)}
                      </td>
                      <td className="px-2 py-3">
                        <Link
                          to={t.market === 'platform' ? '/vyntra' : `/token/${t.launchId}`}
                          className="font-semibold hover:underline"
                        >
                          ${t.symbol}
                        </Link>
                      </td>
                      <td
                        className={`px-2 py-3 font-semibold capitalize ${
                          t.side === 'buy' ? 'text-[var(--vyntra-success)]' : 'text-[var(--vyntra-danger)]'
                        }`}
                      >
                        {t.side}
                      </td>
                      <td className="px-2 py-3 font-mono">
                        {formatBot(t.botAmount)}
                        <BotUsd value={t.botAmount} />
                      </td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <a
                          href={explorerTx(t.txHash, activeChain.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]"
                        >
                          {shortAddr(t.txHash)}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  valueClass,
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  sub?: React.ReactNode
}) {
  return (
    <div className="card px-4 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
        {label}
      </div>
      <div className={`mt-1.5 font-display text-xl font-bold tracking-tight ${valueClass ?? ''}`}>
        {value}
      </div>
      {sub}
    </div>
  )
}

function PositionTable({
  title,
  rows,
  empty,
}: {
  title: string
  rows: NonNullable<PortfolioPayload>['positions']
  empty: string
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-[var(--vyntra-border)] px-4 py-3.5 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--vyntra-muted)] sm:px-5">
        {title}
      </div>
      {!rows.length ? (
        empty ? (
          <div className="px-4 py-12 text-center text-[var(--vyntra-muted)]">{empty}</div>
        ) : null
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[var(--vyntra-card)] text-xs uppercase tracking-wider text-[var(--vyntra-faint)]">
              <tr>
                <th className="px-4 py-3 font-semibold sm:px-5">Token</th>
                <th className="px-2 py-3 font-semibold">Held</th>
                <th className="px-2 py-3 font-semibold">Avg cost</th>
                <th className="px-2 py-3 font-semibold">Mark</th>
                <th className="px-2 py-3 font-semibold">Realized</th>
                <th className="px-4 py-3 font-semibold text-right sm:px-5">Total PnL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.launchId ?? `platform:${p.token || p.symbol}`}
                  className="border-t border-[var(--vyntra-border)]"
                >
                  <td className="px-4 py-3 sm:px-5">
                    <Link
                      to={p.launchId === null ? '/vyntra' : `/token/${p.launchId}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-md bg-[var(--vyntra-elev)] text-xs font-bold">
                        {p.imageURI ? (
                          <img src={p.imageURI} alt="" className="h-full w-full object-cover" />
                        ) : (
                          p.symbol.slice(0, 2)
                        )}
                      </div>
                      <div>
                        <div className="font-semibold">{p.name}</div>
                        <div className="font-mono text-xs text-[var(--vyntra-muted)]">${p.symbol}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-2 py-3 font-mono">{fmtTokens(p.heldToken)}</td>
                  <td className="px-2 py-3 font-mono text-[var(--vyntra-muted)]">
                    {formatBot(p.avgCostBot)}
                    <BotUsd value={p.avgCostBot} />
                  </td>
                  <td className="px-2 py-3 font-mono text-[var(--vyntra-muted)]">
                    {formatBot(p.lastPrice)}
                    <BotUsd value={p.lastPrice} />
                  </td>
                  <td className={`px-2 py-3 font-mono ${pnlClass(p.realizedPnlBot)}`}>
                    {fmtSigned(p.realizedPnlBot)}
                    <BotUsd value={p.realizedPnlBot} />
                  </td>
                  <td className={`px-4 py-3 text-right font-mono sm:px-5 ${pnlClass(p.totalPnlBot)}`}>
                    {fmtSigned(p.totalPnlBot)} BOT
                    <BotUsd value={p.totalPnlBot} />
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
