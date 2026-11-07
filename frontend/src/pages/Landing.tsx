import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Flame,
  Lock,
  Rocket,
  Sparkles,
  ArrowRightLeft,
  Coins,
  Shield,
  Zap,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { ThemeToggle } from '../components/ThemeToggle'
import { HypeUsd } from '../components/HypeUsd'
import { VYNTRA_LOGO } from '../lib/config'
import { activeChain } from '../lib/chains'
import { fetchStatsFromIndexer, isIndexerConfigured } from '../lib/indexer'

function formatVolume(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2,
  }).format(value)
}

const FEATURES = [
  {
    icon: Flame,
    title: 'Direct Uniswap v4 launches',
    body: 'Each fixed 1B supply launches atomically into a no-hook HYPE pool with a bounded opening price.',
  },
  {
    icon: Lock,
    title: 'One pool, permanently locked',
    body: 'The full-range position has no withdrawal path. Graduation marks progress; trading stays in the same pool.',
  },
  {
    icon: Coins,
    title: 'Creators earn',
    body: 'The 1% pool fee is collected from the locked position; creators can claim half of HYPE fees.',
  },
  {
    icon: Zap,
    title: '$VYNTRA flywheel',
    body: 'Protocol fees buy and burn the platform token. Ops keeps a clear 20% runway slice.',
  },
]

const STEPS = [
  { n: '01', title: 'Get test HYPE', body: 'Request test HYPE from the Elysium faucet for gas and trading.', to: '/bridge' },
  { n: '02', title: 'Trade $VYNTRA', body: 'Buy the platform token on the seeded market.', to: '/vyntra' },
  { n: '03', title: 'Launch or trade', body: 'Spawn a meme with image + story, or trade live HYPE pools.', to: '/markets' },
]

const TICKER_ITEMS = [
  'Permissionless launches',
  'Creator-first trading',
  '$VYNTRA buybacks and burns',
  'Elysium Testnet rollout in progress',
]

function useLandingReveals() {
  useEffect(() => {
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>('[data-vyntra-reveal]'),
    )

    if (!('IntersectionObserver' in window)) {
      targets.forEach((target) => target.setAttribute('data-revealed', 'true'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.setAttribute('data-revealed', 'true')
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
    )

    targets.forEach((target) => observer.observe(target))
    return () => observer.disconnect()
  }, [])
}

export function Landing() {
  useLandingReveals()

  const statsQuery = useQuery({
    queryKey: ['vyntra', 'landing-stats'],
    queryFn: fetchStatsFromIndexer,
    enabled: isIndexerConfigured,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  })
  const stats = statsQuery.data

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="landing-ambient landing-ambient-one absolute -left-24 top-0 h-[420px] w-[420px] rounded-full bg-[rgba(124,58,237,0.22)] blur-3xl" />
        <div className="landing-ambient landing-ambient-two absolute right-0 top-40 h-[360px] w-[360px] rounded-full bg-[rgba(6,182,212,0.16)] blur-3xl" />
        <div className="landing-ambient landing-ambient-three absolute bottom-0 left-1/3 h-[280px] w-[280px] rounded-full bg-[rgba(124,58,237,0.12)] blur-3xl" />
      </div>

      <header className="landing-header landing-enter mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={VYNTRA_LOGO} alt="" className="h-9 w-9 rounded-lg object-cover ring-1 ring-[var(--vyntra-border)]" />
          <span className="font-display text-2xl tracking-tight">Vyntra</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <Link to="/docs" className="btn-ghost hidden px-3 py-2 text-sm sm:inline-flex">
            Docs
          </Link>
          <Link to="/about" className="btn-ghost hidden px-3 py-2 text-sm sm:inline-flex">
            About
          </Link>
          <Link to="/markets" className="btn-ghost hidden px-3 py-2 text-sm sm:inline-flex">
            Markets
          </Link>
          <Link to="/markets" className="btn-primary px-3 py-2 text-sm sm:px-4">
            Enter app
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="landing-hero-copy">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] px-3 py-1.5">
                <span className="chip-live !border-0 !bg-transparent !px-0 !py-0">
                  Preparing for Elysium Testnet
                </span>
              </div>
              <h1 className="page-title mt-6 text-5xl sm:text-6xl lg:text-7xl">
                Launch memes.
                <br />
                <span className="bg-gradient-to-r from-[var(--vyntra-primary)] to-[var(--vyntra-accent-2)] bg-clip-text text-transparent">
                  Keep the market.
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--vyntra-muted)] sm:text-xl">
                Permissionless launches planned for Elysium Testnet. Direct HYPE pools, locked liquidity, creator fees, and a
                platform token that absorbs protocol volume.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/markets" className="btn-primary text-base">
                  <Sparkles className="h-5 w-5" />
                  Open markets
                </Link>
                <Link to="/spawn" className="btn-ghost text-base">
                  <Rocket className="h-5 w-5" />
                  Launch a token
                </Link>
                <Link to="/bridge" className="btn-ghost text-base">
                  <ArrowRightLeft className="h-5 w-5" />
                  Get test HYPE
                </Link>
              </div>
              <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
                <Stat label="Pool fee" value="1%" />
                <Stat label="To creators" value="50%" />
                <Stat label="Supply" value="1B" />
              </div>
            </div>

            <div className="landing-hero-art landing-enter relative">
              <div className="landing-float card overflow-hidden p-2 shadow-[0_24px_80px_rgba(109,40,217,0.18)]">
                <div className="relative overflow-hidden rounded-lg bg-[var(--vyntra-elev)]">
                  <img
                    src={VYNTRA_LOGO}
                    alt="Vyntra"
                    className="aspect-square w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(28,18,51,0.75)] to-transparent p-5 text-white">
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/70">
                      Platform token
                    </div>
                    <div className="mt-1 font-display text-3xl">$VYNTRA</div>
                    <p className="mt-1 text-sm text-white/80">Buybacks burn float as meme volume grows.</p>
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-4 -left-4 hidden rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] px-4 py-3 shadow-lg sm:block">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Shield className="h-4 w-4 text-[var(--vyntra-primary)]" />
                  Locked liquidity
                </div>
                <p className="mt-1 text-xs text-[var(--vyntra-muted)]">Pool position cannot be withdrawn</p>
              </div>
            </div>
          </div>
        </section>

        <section
          className="landing-activity mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8"
          aria-label={'Vyntra ' + activeChain.name + ' trading activity'}
          aria-busy={statsQuery.isFetching}
          data-vyntra-reveal=""
        >
          <div className="card grid gap-5 p-5 sm:grid-cols-2 sm:items-center sm:p-6 lg:grid-cols-[1fr_auto_auto] lg:gap-10">
            <div className="sm:col-span-2 lg:col-span-1">
              <p className="page-kicker">Elysium Testnet preview</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">Vyntra trading activity</h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--vyntra-muted)]">
                Combined HYPE volume across launch pools and the $VYNTRA platform-token market will appear here after deployment.
              </p>
            </div>

            <div className="min-w-0 lg:border-l lg:border-[var(--vyntra-border)] lg:pl-8">
              <p className="label">Total volume</p>
              <p className="mt-1 font-display text-2xl font-bold tracking-tight">
                {stats ? `${formatVolume(stats.volumeNative)} HYPE` : statsQuery.isFetching ? (
                  <span
                    aria-hidden="true"
                    className="inline-block h-8 w-36 animate-pulse rounded bg-[var(--vyntra-elev)] motion-reduce:animate-none"
                  />
                ) : '—'}
              </p>
              {stats && <HypeUsd value={stats.volumeNative} className="mt-1 block text-sm text-[var(--vyntra-muted)]" />}
            </div>

            <div className="min-w-0 sm:border-l sm:border-[var(--vyntra-border)] sm:pl-5 lg:pl-8">
              <p className="label">Recorded trades</p>
              <p className="mt-1 font-display text-2xl font-bold tracking-tight">
                {stats ? stats.trades.toLocaleString('en-US') : statsQuery.isFetching ? (
                  <span
                    aria-hidden="true"
                    className="inline-block h-8 w-14 animate-pulse rounded bg-[var(--vyntra-elev)] motion-reduce:animate-none"
                  />
                ) : '—'}
              </p>
              {!stats && isIndexerConfigured && !statsQuery.isFetching && (
                <button
                  type="button"
                  onClick={() => void statsQuery.refetch()}
                  className="mt-1 text-xs font-medium text-[var(--vyntra-primary)] hover:underline"
                >
                  Retry loading stats
                </button>
              )}
            </div>

            <p className="text-[11px] leading-relaxed text-[var(--vyntra-faint)] sm:col-span-2 lg:col-span-3">
              USD estimates use the current Hyperliquid mainnet HYPE spot price as a reference; testnet HYPE has no guaranteed dollar value.
            </p>
          </div>
        </section>

        <section className="landing-ticker-section border-y border-[var(--vyntra-border)] bg-[var(--vyntra-card)]/70" aria-label="Vyntra highlights">
          <p className="sr-only">{TICKER_ITEMS.join(' · ')}</p>
          <div className="landing-ticker" aria-hidden="true">
            <div className="landing-ticker-track">
              {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
                <span key={`${item}-${index}`} className="landing-ticker-item">
                  {item}
                  <Sparkles className="h-4 w-4 text-[var(--vyntra-primary)]" />
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-[var(--vyntra-border)] bg-[var(--vyntra-card)]/70">
          <div className="landing-stagger mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} data-vyntra-reveal="" className="space-y-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(124,58,237,0.12)] text-[var(--vyntra-primary)]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-[var(--vyntra-muted)]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="max-w-2xl" data-vyntra-reveal="">
            <p className="page-kicker">Get started</p>
            <h2 className="page-title mt-2 text-4xl sm:text-5xl">Three steps to trade</h2>
          </div>
          <div className="landing-stagger mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((step) => (
              <Link
                key={step.n}
                to={step.to}
                data-vyntra-reveal=""
                className="card hover-lift group p-6 transition hover:border-[var(--vyntra-border-strong)]"
              >
                <div className="font-mono text-sm font-bold text-[var(--vyntra-primary)]">{step.n}</div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight group-hover:text-[var(--vyntra-primary)]">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--vyntra-muted)]">{step.body}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--vyntra-primary)]">
                  Continue <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8" data-vyntra-reveal="">
          <div className="card relative overflow-hidden px-6 py-12 sm:px-10 sm:py-14">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[rgba(124,58,237,0.18)] blur-3xl" />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <h2 className="page-title text-3xl sm:text-4xl">The testnet rollout is next</h2>
                <p className="mt-3 text-base text-[var(--vyntra-muted)] sm:text-lg">
                  Vyntra is preparing its Elysium deployment. Read the model and tokenomics while the testnet markets are getting ready.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/about" className="btn-primary">
                  About Vyntra
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/bridge" className="btn-ghost">
                  Bridge test HYPE
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--vyntra-border)] px-4 py-8 text-center text-xs text-[var(--vyntra-faint)] sm:px-6">
        © {new Date().getFullYear()} Vyntra · Elysium Testnet deployment in preparation ·{' '}
        <Link to="/markets" className="hover:text-[var(--vyntra-fg)]">
          Open app
        </Link>
        {' '}·{' '}
        <Link to="/docs" className="hover:text-[var(--vyntra-fg)]">
          Docs
        </Link>
        {' '}·{' '}
        <Link to="/about" className="hover:text-[var(--vyntra-fg)]">
          About Vyntra
        </Link>
      </footer>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] px-3 py-3">
      <div className="label">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight">{value}</div>
    </div>
  )
}
