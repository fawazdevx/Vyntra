import { useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Sparkles, Rocket, LayoutDashboard, Briefcase, ArrowRightLeft, ExternalLink, BookOpen, Info } from 'lucide-react'
import { isAppConfigured, VYNTRA_LOGO } from '../lib/config'
import { activeChain } from '../lib/chains'
import { ThemeToggle } from './ThemeToggle'

const nav = [
  { to: '/markets', label: 'Markets', icon: Sparkles },
  { to: '/spawn', label: 'Launch', icon: Rocket },
  { to: '/dashboard', label: 'Studio', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/bridge', label: 'Bridge', icon: ArrowRightLeft },
  { to: '/about', label: 'About', icon: Info },
  { to: '/docs', label: 'Docs', icon: BookOpen },
]

const year = new Date().getFullYear()

export function Layout({ allowUnconfigured = false }: { allowUnconfigured?: boolean }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="relative flex min-h-screen flex-col">
      <header className={`sticky z-50 transition-all duration-500 ${scrolled ? 'top-3 px-3 sm:px-4' : 'top-0'}`}>
        <div
          className={`mx-auto transition-all duration-500 ${
            scrolled
              ? 'glass-header is-scrolled max-w-6xl'
              : 'glass-header max-w-7xl'
          }`}
        >
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:h-[4.25rem] sm:px-6 lg:px-8">
            <div className="flex items-center gap-7">
              <Link to="/" className="flex items-center gap-2.5">
                <img
                  src={VYNTRA_LOGO}
                  alt=""
                  className="h-8 w-8 rounded-md object-cover ring-1 ring-[var(--vyntra-border)]"
                />
                <span className="font-display text-2xl tracking-tight text-[var(--vyntra-fg)]">Vyntra</span>
              </Link>

              <nav className="hidden items-center gap-1 md:flex">
                {nav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/markets'}
                    className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <span className="chip-live hidden sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--vyntra-success)]" />
                {activeChain.testnet ? 'Testnet' : 'Mainnet'}
              </span>
              <ThemeToggle />
              <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            </div>
          </div>

          <nav className="flex gap-1.5 overflow-x-auto border-t border-[var(--vyntra-border)] px-3 py-2 md:hidden">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/markets'}
                className={({ isActive }) => `${isActive ? 'nav-link-active' : 'nav-link'} shrink-0`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {!isAppConfigured && !allowUnconfigured ? (
          <div className="card mx-auto max-w-lg border-[rgba(245,158,11,0.35)] px-6 py-12 text-center">
            <p className="font-display text-3xl">Coming online</p>
            <p className="mt-3 text-base leading-relaxed text-[var(--vyntra-muted)]">
              Vyntra is warming up. Check back shortly.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <footer className="mt-auto border-t border-[var(--vyntra-border)] bg-[var(--vyntra-card)]/70">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Link to="/" className="inline-flex items-center gap-2">
                <img src={VYNTRA_LOGO} alt="" className="h-7 w-7 rounded-md object-cover" />
                <span className="font-display text-xl tracking-tight">Vyntra</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--vyntra-muted)]">
                Creator token launches with a shared market, locked initial liquidity, and clear supply rules. Elysium Testnet deployment is in preparation.
              </p>
            </div>

            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--vyntra-muted)]">
                <li>
                  <Link to="/markets" className="transition hover:text-[var(--vyntra-fg)]">
                    Markets
                  </Link>
                </li>
                <li>
                  <Link to="/spawn" className="transition hover:text-[var(--vyntra-fg)]">
                    Launch a token
                  </Link>
                </li>
                <li>
                  <Link to="/dashboard" className="transition hover:text-[var(--vyntra-fg)]">
                    Creator studio
                  </Link>
                </li>
                <li>
                  <Link to="/portfolio" className="transition hover:text-[var(--vyntra-fg)]">
                    Portfolio
                  </Link>
                </li>
                <li>
                  <Link to="/bridge" className="transition hover:text-[var(--vyntra-fg)]">
                    Bridge
                  </Link>
                </li>
                <li>
                  <Link to="/vyntra" className="transition hover:text-[var(--vyntra-fg)]">
                    $VYNTRA
                  </Link>
                </li>
                <li>
                  <Link to="/about" className="transition hover:text-[var(--vyntra-fg)]">
                    About Vyntra
                  </Link>
                </li>
                <li>
                  <Link to="/docs" className="transition hover:text-[var(--vyntra-fg)]">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link to="/apps/mcp" className="transition hover:text-[var(--vyntra-fg)]">
                    MCP for agents
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
                Network
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--vyntra-muted)]">
                <li>
                  <a
                    href="https://explorer-elysium-testnet.t.conduit.xyz"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition hover:text-[var(--vyntra-fg)]"
                  >
                    Explorer
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                </li>
                <li>
                  <a
                    href="https://elysium.kinetiq.xyz"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition hover:text-[var(--vyntra-fg)]"
                  >
                    Elysium Testnet
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
                Fees
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--vyntra-muted)]">
                <li>1% Uniswap v4 pool fee</li>
                <li>Half of HYPE pool fees to creators</li>
                <li>Full-range liquidity locked at launch</li>
                <li>Protocol share buys &amp; burns $VYNTRA</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-[var(--vyntra-border)] pt-6 text-xs text-[var(--vyntra-faint)] sm:flex-row sm:items-center">
            <p>© {year} Vyntra. Elysium Testnet deployment in preparation.</p>
            <p>{activeChain.testnet ? 'Testnet' : 'Mainnet'}</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
