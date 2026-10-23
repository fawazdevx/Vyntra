import { useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Sparkles, Rocket, LayoutDashboard, Briefcase, ExternalLink } from 'lucide-react'
import { isAppConfigured } from '../lib/config'

const nav = [
  { to: '/', label: 'Markets', icon: Sparkles },
  { to: '/spawn', label: 'Launch', icon: Rocket },
  { to: '/dashboard', label: 'Studio', icon: LayoutDashboard },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase },
]

const year = new Date().getFullYear()

export function Layout() {
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
              <Link to="/" className="flex items-center gap-2">
                <span className="font-display text-2xl tracking-tight text-[var(--vyntra-fg)]">Vyntra</span>
                <span className="mt-1 font-mono text-[10px] text-[var(--vyntra-faint)]">TM</span>
              </Link>

              <nav className="hidden items-center gap-1 md:flex">
                {nav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === '/'}
                    className={({ isActive }) => (isActive ? 'nav-link-active' : 'nav-link')}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-3">
              <span className="chip-live">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--vyntra-success)]" />
                Testnet
              </span>
              <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            </div>
          </div>

          <nav className="flex gap-1.5 overflow-x-auto border-t border-[var(--vyntra-border)] px-3 py-2 md:hidden">
            {nav.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
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
        {!isAppConfigured ? (
          <div className="mx-auto max-w-lg rounded-xl border border-amber-500/30 bg-amber-50 px-6 py-12 text-center">
            <p className="font-display text-3xl text-amber-950">Coming online</p>
            <p className="mt-3 text-base leading-relaxed text-amber-900/80">
              Vyntra is warming up. Check back shortly.
            </p>
          </div>
        ) : (
          <Outlet />
        )}
      </main>

      <footer className="mt-auto border-t border-[var(--vyntra-border)] bg-white/60">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <Link to="/" className="inline-flex items-center gap-2">
                <span className="font-display text-xl tracking-tight">Vyntra</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-[var(--vyntra-muted)]">
                Fair-launch coins on BOT Chain. Creators earn from trading. Platform fees buy and burn
                $VYNTRA.
              </p>
            </div>

            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
                Product
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--vyntra-muted)]">
                <li>
                  <Link to="/" className="transition hover:text-[var(--vyntra-fg)]">
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
              </ul>
            </div>

            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
                Network
              </p>
              <ul className="mt-4 space-y-2.5 text-sm text-[var(--vyntra-muted)]">
                <li>
                  <a
                    href="https://scan.bohr.life"
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
                    href="https://botchain.ai"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 transition hover:text-[var(--vyntra-fg)]"
                  >
                    BOT Chain
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
                <li>1.25% per trade</li>
                <li>Half goes to creators</li>
                <li>Optional creator tax (1–10%)</li>
                <li>Protocol share buys &amp; burns $VYNTRA</li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-[var(--vyntra-border)] pt-6 text-xs text-[var(--vyntra-faint)] sm:flex-row sm:items-center">
            <p>© {year} Vyntra. Built on BOT Chain.</p>
            <p>Testnet</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
