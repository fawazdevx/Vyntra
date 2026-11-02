import { useEffect, useMemo, useState } from 'react'
import { explorerAddress, formatBot, shortAddr } from '../lib/config'
import { activeChain } from '../lib/chains'
import {
  fetchHoldersFromIndexer,
  fetchSnipersFromIndexer,
  isIndexerConfigured,
  type HoldersPayload,
  type SnipersPayload,
} from '../lib/indexer'
import { holdersFromTrades, snipersFromTrades } from '../lib/holdersFromTrades'
import type { TradePoint } from '../hooks/useTradeHistory'
import { BotUsd } from './BotUsd'

type Props = {
  symbol: string
  /** Meme launch id — uses indexer when set and trades are not provided. */
  launchId?: number
  /** Trade tape for client-side holders/snipers (platform market or RPC fallback). */
  trades?: TradePoint[]
}

type Tab = 'holders' | 'snipers'

const CLUSTER_STYLE: Record<string, string> = {
  whale: 'bg-[var(--vyntra-fg)] text-[var(--vyntra-card)]',
  dolphin: 'bg-[rgba(124,58,237,0.12)] text-[var(--vyntra-fg)]',
  shrimp: 'bg-[var(--vyntra-elev)] text-[var(--vyntra-muted)]',
}

function pct(n: number, digits = 1) {
  if (!Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function fmtTokens(n: number) {
  if (!Number.isFinite(n) || n === 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toFixed(2)
  return n.toPrecision(3)
}

export function HoldersPanel({ launchId, symbol, trades }: Props) {
  const [tab, setTab] = useState<Tab>('holders')
  const [holders, setHolders] = useState<HoldersPayload | null>(null)
  const [snipers, setSnipers] = useState<SnipersPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fromTrades = useMemo(() => {
    if (!trades) return null
    return {
      holders: holdersFromTrades(trades, 50),
      snipers: snipersFromTrades(trades, 20),
    }
  }, [trades])

  useEffect(() => {
    if (fromTrades) {
      setHolders(fromTrades.holders)
      setSnipers(fromTrades.snipers)
      setError(null)
      setLoading(false)
      return
    }
    if (!isIndexerConfigured || !launchId) {
      setHolders(null)
      setSnipers(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([fetchHoldersFromIndexer(launchId, 50), fetchSnipersFromIndexer(launchId, 20)])
      .then(([h, s]) => {
        if (cancelled) return
        setHolders(h)
        setSnipers(s)
        if (!h && !s) setError("Couldn't load holders right now. Please try again shortly.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [launchId, fromTrades])

  if (!fromTrades && !isIndexerConfigured) return null
  if (!fromTrades && !launchId) return null

  const summary = holders?.summary
  const sniperSummary = snipers?.summary

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vyntra-border)] px-4 py-3.5 sm:px-5">
        <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--vyntra-muted)]">
          Holders & snipers
        </div>
        <div className="flex gap-1 rounded-md bg-[var(--vyntra-elev)] p-1">
          {([
            ['holders', 'Holders'],
            ['snipers', 'Snipers'],
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

      {loading && !holders && !snipers ? (
        <div className="px-4 py-10 text-center text-base text-[var(--vyntra-muted)]">
          Loading analytics…
        </div>
      ) : error && !holders && !snipers ? (
        <div className="px-4 py-10 text-center text-base text-[var(--vyntra-muted)]">{error}</div>
      ) : tab === 'holders' ? (
        <div>
          {summary && (
            <div className="grid grid-cols-2 gap-3 border-b border-[var(--vyntra-border)] px-4 py-4 sm:grid-cols-4 sm:px-5">
              <Stat label="Holders" value={String(summary.holderCount)} />
              <Stat label="Top 1" value={pct(summary.top1Pct)} />
              <Stat label="Top 10" value={pct(summary.top10Pct)} />
              <Stat
                label="Whales"
                value={`${summary.clusters.whale.count} · ${pct(summary.clusters.whale.pct, 0)}`}
              />
            </div>
          )}
          {summary && (
            <div className="flex flex-wrap gap-2 border-b border-[var(--vyntra-border)] px-4 py-3 sm:px-5">
              {(['whale', 'dolphin', 'shrimp'] as const).map((key) => {
                const c = summary.clusters[key]
                return (
                  <span
                    key={key}
                    className={`rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${CLUSTER_STYLE[key]}`}
                  >
                    {key} {c.count} · {pct(c.pct, 0)}
                  </span>
                )
              })}
            </div>
          )}
          {!holders?.holders?.length ? (
            <div className="px-4 py-10 text-center text-base text-[var(--vyntra-muted)]">
              No holders yet
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--vyntra-card)] text-xs uppercase tracking-wider text-[var(--vyntra-faint)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold sm:px-5">#</th>
                    <th className="px-2 py-3 font-semibold">Wallet</th>
                    <th className="px-2 py-3 font-semibold">{symbol}</th>
                    <th className="px-2 py-3 font-semibold">Share</th>
                    <th className="px-4 py-3 font-semibold text-right sm:px-5">Cluster</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.holders.map((h, i) => (
                    <tr key={h.address} className="border-t border-[var(--vyntra-border)]">
                      <td className="px-4 py-3 font-mono text-[var(--vyntra-faint)] sm:px-5">
                        {i + 1}
                      </td>
                      <td className="px-2 py-3">
                        <a
                          href={explorerAddress(h.address, activeChain.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[var(--vyntra-fg)] hover:underline"
                        >
                          {shortAddr(h.address)}
                        </a>
                      </td>
                      <td className="px-2 py-3 font-mono">{fmtTokens(h.balance)}</td>
                      <td className="px-2 py-3 font-mono">{pct(h.pct)}</td>
                      <td className="px-4 py-3 text-right sm:px-5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${CLUSTER_STYLE[h.cluster]}`}
                        >
                          {h.cluster}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-[var(--vyntra-border)] px-4 py-2.5 text-xs text-[var(--vyntra-faint)] sm:px-5">
            Net market buys − sells. Wallet-to-wallet transfers are not counted.
          </p>
        </div>
      ) : (
        <div>
          {sniperSummary && (
            <div className="grid grid-cols-2 gap-3 border-b border-[var(--vyntra-border)] px-4 py-4 sm:grid-cols-4 sm:px-5">
              <Stat label="Early buyers" value={String(sniperSummary.sniperCount)} />
              <Stat label="Still holding" value={String(sniperSummary.stillHolding)} />
              <Stat label="Fully dumped" value={String(sniperSummary.fullyDumped)} />
              <Stat label="Avg dump" value={pct((sniperSummary.avgDumpBps || 0) / 100, 0)} />
            </div>
          )}
          {sniperSummary && (
            <div className="flex flex-wrap gap-4 border-b border-[var(--vyntra-border)] px-4 py-3 text-sm text-[var(--vyntra-muted)] sm:px-5">
              <span>
                Spent{' '}
                <span className="font-mono text-[var(--vyntra-fg)]">
                  {formatBot(sniperSummary.totalSpentBot)}
                  <BotUsd value={sniperSummary.totalSpentBot} className="ml-1 inline text-[11px] font-normal text-[var(--vyntra-faint)]" />
                </span>{' '}
                BOT
              </span>
              <span>
                Hold{' '}
                <span className="font-mono text-[var(--vyntra-fg)]">
                  {pct(sniperSummary.heldPctOfCirculating, 1)}
                </span>{' '}
                of float
              </span>
            </div>
          )}
          {!snipers?.snipers?.length ? (
            <div className="px-4 py-10 text-center text-base text-[var(--vyntra-muted)]">
              No early buyers yet
            </div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[var(--vyntra-card)] text-xs uppercase tracking-wider text-[var(--vyntra-faint)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold sm:px-5">#</th>
                    <th className="px-2 py-3 font-semibold">Wallet</th>
                    <th className="px-2 py-3 font-semibold">Held</th>
                    <th className="px-2 py-3 font-semibold">Dump</th>
                    <th className="px-4 py-3 font-semibold text-right sm:px-5">Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {snipers.snipers.map((s) => (
                    <tr key={s.address} className="border-t border-[var(--vyntra-border)]">
                      <td className="px-4 py-3 font-mono text-[var(--vyntra-faint)] sm:px-5">
                        {s.rank}
                      </td>
                      <td className="px-2 py-3">
                        <a
                          href={explorerAddress(s.address, activeChain.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[var(--vyntra-fg)] hover:underline"
                        >
                          {shortAddr(s.address)}
                        </a>
                      </td>
                      <td className="px-2 py-3 font-mono">
                        {s.stillHolding ? (
                          fmtTokens(s.heldToken)
                        ) : (
                          <span className="text-[var(--vyntra-danger)]">dumped</span>
                        )}
                      </td>
                      <td
                        className={`px-2 py-3 font-mono ${
                          s.dumpBps >= 5000
                            ? 'text-[var(--vyntra-danger)]'
                            : 'text-[var(--vyntra-fg)]'
                        }`}
                      >
                        {pct(s.dumpBps / 100, 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono sm:px-5">
                        {formatBot(s.spentBot)}
                        <BotUsd value={s.spentBot} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-[var(--vyntra-border)] px-4 py-2.5 text-xs text-[var(--vyntra-faint)] sm:px-5">
            First {snipers?.window?.uniqueBuyers ?? 20} unique buyers by trade time.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
        {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold tracking-tight text-[var(--vyntra-fg)]">
        {value}
      </div>
    </div>
  )
}
