import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Star } from 'lucide-react'
import { formatNative, shortAddr, type LaunchView } from '../lib/config'
import { useWatchlist } from '../hooks/useWatchlist'
import { HypeUsd } from './HypeUsd'
import { parseLaunchDescription } from '../lib/launchMetadata'

type Props = {
  launch: LaunchView
  index?: number
  featuredUntil?: number
}

export function TokenCard({ launch, featuredUntil }: Props) {
  const progress = Math.min(100, launch.progressBps / 100)
  const initials = launch.symbol.slice(0, 2).toUpperCase()
  const isFeatured = Boolean(featuredUntil && featuredUntil > Date.now() / 1000)
  const { isWatched, toggle } = useWatchlist()
  const watched = isWatched(launch.id)

  return (
    <div className="group card relative block overflow-hidden p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[var(--vyntra-primary)] hover:shadow-[0_16px_42px_rgba(48,33,92,0.08)] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <button
        type="button"
        aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggle(launch.id)
        }}
        className={`absolute right-3 top-3 z-10 rounded-md border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vyntra-primary)] focus-visible:ring-offset-2 ${
          watched
            ? 'text-[var(--vyntra-fg)]'
            : 'text-[var(--vyntra-faint)] hover:text-[var(--vyntra-fg)]'
        }`}
      >
        <Star className={`h-4 w-4 ${watched ? 'fill-current' : ''}`} />
      </button>

      <Link to={`/token/${launch.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vyntra-primary)] focus-visible:ring-offset-2">
        <div className="flex items-start gap-4 pr-8">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--vyntra-elev)] text-sm font-bold text-[var(--vyntra-fg)]">
            {launch.imageURI ? (
              <img src={launch.imageURI} alt="" className="h-full w-full object-cover" />
            ) : (
              initials
            )}
            {(launch.migrated || launch.graduated) && (
              <span className="absolute -bottom-1 -right-1 rounded bg-[var(--vyntra-success)] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                {launch.migrated ? 'LP BURNED' : 'LIVE'}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="truncate font-display text-lg tracking-tight text-[var(--vyntra-fg)]">
                  {launch.name}
                </h3>
                {isFeatured ? (
                  <span
                    title="Paid featured placement; the VYNTRA fee is burned"
                    className="chip-live inline-flex shrink-0 items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3" /> Paid
                  </span>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-sm text-[var(--vyntra-muted)]">
                ${launch.symbol}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--vyntra-muted)]">
              {parseLaunchDescription(launch.description).description || 'No description'}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-3.5">
          <div className="mb-2 flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
            <span className={launch.graduated || launch.migrated ? 'text-[var(--vyntra-faint)]' : 'text-[var(--vyntra-primary)]'}>
              Curve
            </span>
            <span className={launch.graduated || launch.migrated ? 'text-[var(--vyntra-success)]' : 'text-[var(--vyntra-faint)]'}>
              Locked V4 pool
            </span>
          </div>
          <div className="relative h-1.5 rounded-full bg-[var(--vyntra-border-strong)]">
            <div
              className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${launch.graduated || launch.migrated ? 'bg-[var(--vyntra-success)]' : 'bg-[var(--vyntra-primary)]'}`}
              style={{ width: `${launch.graduated || launch.migrated ? 100 : progress}%` }}
            />
            <span
              className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--vyntra-card)] ${launch.graduated || launch.migrated ? 'bg-[var(--vyntra-success)]' : 'bg-[var(--vyntra-primary)]'}`}
              style={{ left: `${launch.graduated || launch.migrated ? 100 : progress}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs">
            <span className={launch.graduated || launch.migrated ? 'font-semibold text-[var(--vyntra-success)]' : 'text-[var(--vyntra-muted)]'}>
              {launch.migrated ? 'Legacy pool' : launch.graduated ? 'V4 pool live' : `${progress.toFixed(0)}% funded`}
            </span>
            <span className="font-mono tabular-nums text-[var(--vyntra-fg)]">
              {formatNative(launch.raisedNative)} HYPE raised
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--vyntra-border)] rounded-lg border border-[var(--vyntra-border)]">
          <CardMetric label="Volume" value={launch.volumeNative == null ? '—' : `${formatNative(launch.volumeNative)} HYPE`} sub={launch.volumeNative != null ? <HypeUsd value={launch.volumeNative} /> : undefined} />
          <CardMetric label="Trades" value={launch.tradeCount == null ? '—' : launch.tradeCount.toLocaleString()} />
          <CardMetric
            label="Creator"
            value={shortAddr(launch.creator)}
            sub={launch.createdAt ? <span>{new Date(launch.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span> : undefined}
          />
        </div>
      </Link>
    </div>
  )
}

function CardMetric({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="min-w-0 px-2.5 py-2.5 sm:px-3.5">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--vyntra-faint)]">{label}</p>
      <p className="mt-1 truncate font-mono text-xs font-semibold tabular-nums text-[var(--vyntra-fg)]">{value}</p>
      {sub ? <div className="mt-0.5 truncate text-[10px] text-[var(--vyntra-faint)]">{sub}</div> : null}
    </div>
  )
}
