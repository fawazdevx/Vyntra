import { Link } from 'react-router-dom'
import { Sparkles, Star } from 'lucide-react'
import { formatNative, shortAddr, type LaunchView } from '../lib/config'
import { useWatchlist } from '../hooks/useWatchlist'
import { HypeUsd } from './HypeUsd'

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
    <div className="group card hover-lift relative block p-5 transition hover:border-[var(--vyntra-border-strong)]">
      <button
        type="button"
        aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggle(launch.id)
        }}
        className={`absolute right-3 top-3 z-10 rounded-md border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-1.5 transition ${
          watched
            ? 'text-[var(--vyntra-fg)]'
            : 'text-[var(--vyntra-faint)] hover:text-[var(--vyntra-fg)]'
        }`}
      >
        <Star className={`h-4 w-4 ${watched ? 'fill-current' : ''}`} />
      </button>

      <Link to={`/token/${launch.id}`} className="block">
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
              {launch.description || 'No description'}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between text-sm">
            <span
              className={
                launch.migrated || launch.graduated
                  ? 'font-medium text-[var(--vyntra-success)]'
                  : 'text-[var(--vyntra-muted)]'
              }
            >
              {launch.migrated
                ? 'LP locked'
                : launch.graduated
                  ? 'Graduated'
                  : `${progress.toFixed(0)}% to graduate`}
            </span>
            <span className="text-right font-mono text-base text-[var(--vyntra-fg)]">
              {formatNative(launch.raisedNative)} HYPE
              <HypeUsd value={launch.raisedNative} />
            </span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between text-xs text-[var(--vyntra-faint)] sm:text-sm">
            <span className="font-mono">{shortAddr(launch.creator)}</span>
            <span>
              {launch.createdAt
                ? new Date(launch.createdAt).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'}
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}
