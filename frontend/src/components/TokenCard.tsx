import { Link } from 'react-router-dom'
import { Star } from 'lucide-react'
import { formatBot, shortAddr, type LaunchView } from '../lib/config'
import { useWatchlist } from '../hooks/useWatchlist'

type Props = {
  launch: LaunchView
  index?: number
}

export function TokenCard({ launch }: Props) {
  const progress = Math.min(100, launch.progressBps / 100)
  const initials = launch.symbol.slice(0, 2).toUpperCase()
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
        className={`absolute right-3 top-3 z-10 rounded-md border border-[var(--vyntra-border)] bg-white p-1.5 transition ${
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
                {launch.migrated ? 'BDEX' : 'LIVE'}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate font-display text-lg tracking-tight text-[var(--vyntra-fg)]">
                {launch.name}
              </h3>
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
                ? 'On BDEX'
                : launch.graduated
                  ? 'Graduated'
                  : `${progress.toFixed(0)}% to graduate`}
            </span>
            <span className="font-mono text-base text-[var(--vyntra-fg)]">
              {formatBot(launch.raisedBot)} BOT
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
