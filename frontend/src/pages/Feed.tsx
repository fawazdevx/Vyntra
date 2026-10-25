import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Rocket, Flame, Clock, Trophy, RefreshCw, Star } from 'lucide-react'
import { TokenCard } from '../components/TokenCard'
import { PlatformTokenCard } from '../components/PlatformTokenCard'
import { useLaunches } from '../hooks/useLaunches'
import { useWatchlist } from '../hooks/useWatchlist'
import { formatBot, type LaunchView } from '../lib/config'
import { formatUserError } from '../lib/errors'
import { BotUsd } from '../components/BotUsd'

type Tab = 'live' | 'new' | 'graduating' | 'graduated' | 'watchlist'

export function Feed() {
  const [tab, setTab] = useState<Tab>('live')
  const { data: launches = [], isLoading, isError, error, refetch, isFetching } = useLaunches()
  const { ids: watchIds, count: watchCount } = useWatchlist()

  const filtered = useMemo(() => {
    const list = [...launches]
    if (tab === 'watchlist') {
      const set = new Set(watchIds)
      return list.filter((l) => set.has(l.id)).sort((a, b) => b.createdAt - a.createdAt)
    }
    if (tab === 'new') return list.sort((a, b) => b.createdAt - a.createdAt)
    if (tab === 'graduating')
      return list
        .filter((l) => !l.graduated && l.progressBps >= 5000)
        .sort((a, b) => b.progressBps - a.progressBps)
    if (tab === 'graduated') return list.filter((l) => l.graduated || l.migrated)
    return list.sort((a, b) => b.progressBps - a.progressBps)
  }, [launches, tab, watchIds])

  const stats = useMemo(() => {
    const live = launches.filter((l) => !l.graduated && !l.migrated).length
    const graduated = launches.filter((l) => l.graduated || l.migrated).length
    const volume = launches.reduce((s, l) => s + l.raisedBot, 0)
    return { live, graduated, volume: formatBot(volume), volumeBot: volume, total: launches.length, watchCount }
  }, [launches, watchCount])

  const tabs: { id: Tab; label: string; icon: typeof Flame }[] = [
    { id: 'live', label: 'Trending', icon: Flame },
    { id: 'new', label: 'New', icon: Clock },
    { id: 'graduating', label: 'Almost', icon: Rocket },
    { id: 'graduated', label: 'Graduated', icon: Trophy },
    { id: 'watchlist', label: 'Watchlist', icon: Star },
  ]

  return (
    <div className="space-y-8">
      <div className="sys-bar mb-2">
        <span className="text-[var(--vyntra-fg)]">Vyntra</span>
        <span className="text-[var(--vyntra-faint)]">/</span>
        <span>Markets feed</span>
        <span className="hidden text-[var(--vyntra-muted)] sm:inline">
          Creators earn from every trade
        </span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--vyntra-success)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vyntra-success)]" />
          Live
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-kicker mb-2">Live markets</p>
          <h1 className="page-title text-4xl sm:text-5xl lg:text-6xl">Markets</h1>
          <p className="mt-3 max-w-xl text-base text-[var(--vyntra-muted)] sm:text-lg">
            Fair launches on BOT Chain. Star coins to watch. Share and reply on-chain.
          </p>
        </div>
        <Link to="/spawn" className="btn-primary text-base">
          <Rocket className="h-5 w-5" />
          Launch token
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Stat label="Launches" value={String(stats.total)} />
        <Stat label="On curve" value={String(stats.live)} />
        <Stat label="Graduated" value={String(stats.graduated)} />
        <Stat label="Watching" value={String(stats.watchCount)} />
        <Stat label="BOT raised" value={stats.volume} mono sub={<BotUsd value={stats.volumeBot} />} />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-1.5">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-[var(--radius)] px-3.5 py-2.5 text-sm font-semibold transition ${
                tab === id
                  ? 'bg-[rgba(124,58,237,0.12)] text-[var(--vyntra-primary)]'
                  : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'
              }`}
            >
              <Icon className={`h-4 w-4 ${id === 'watchlist' && watchCount > 0 ? 'fill-current' : ''}`} />
              {label}
              {id === 'watchlist' && watchCount > 0 ? (
                <span className="font-mono text-xs text-[var(--vyntra-faint)]">{watchCount}</span>
              ) : null}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost px-4 py-2.5 text-sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="card px-6 py-20 text-center text-base text-[var(--vyntra-muted)]">
          Loading markets…
        </div>
      ) : isError ? (
        <div className="card space-y-3 px-6 py-12 text-center">
          <p className="text-lg text-[var(--vyntra-danger)]">Couldn&apos;t load markets</p>
          <p className="text-base text-[var(--vyntra-muted)]">
            {formatUserError(error, 'Network issue. Check your connection and retry.')}
          </p>
          <button type="button" className="btn-primary mx-auto" onClick={() => refetch()}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-4">
          {tab !== 'watchlist' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <PlatformTokenCard />
            </div>
          ) : null}
          <div className="card flex flex-col items-center gap-4 px-6 py-20 text-center">
            <p className="font-display text-2xl">
              {tab === 'watchlist' ? 'Watchlist is empty' : 'No meme launches yet'}
            </p>
            <p className="text-base text-[var(--vyntra-muted)]">
              {tab === 'watchlist'
                ? 'Star a coin on any card to pin it here.'
                : 'Trade $VYNTRA above, or be the first to launch a meme.'}
            </p>
            {tab !== 'watchlist' && (
              <Link to="/spawn" className="btn-primary mt-1">
                Launch token
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tab !== 'watchlist' ? <PlatformTokenCard /> : null}
          {filtered.map((launch: LaunchView) => (
            <TokenCard key={launch.id} launch={launch} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, mono, sub }: { label: string; value: string; mono?: boolean; sub?: React.ReactNode }) {
  return (
    <div className="card px-4 py-4 sm:px-5 sm:py-5">
      <div className="label">{label}</div>
      <div
        className={`mt-2 text-2xl font-bold tracking-tight sm:text-3xl ${
          mono ? 'font-mono' : 'font-display'
        }`}
      >
        {value}
      </div>
      {sub}
    </div>
  )
}
