import { useEffect, useState } from 'react'
import { ExternalLink, Fuel, Waves } from 'lucide-react'
import { ELYSIUM_BRIDGE_URL, ELYSIUM_FAUCET_URL } from '../lib/config'

const HYPEREVM_FAUCET_URL = 'https://app.hyperliquid-testnet.xyz/drip'
const ELYSIUM_DOCS_URL = 'https://elysium.kinetiq.xyz/docs/connecting-to-elysium'

export function Bridge() {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (loaded) return
    const timeout = window.setTimeout(() => setTimedOut(true), 15_000)
    return () => window.clearTimeout(timeout)
  }, [loaded])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="page-kicker mb-2">Elysium Testnet</p>
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Bridge into Elysium</h1>
        <p className="mt-3 max-w-2xl text-[var(--vyntra-muted)]">
          Move test HYPE between HyperEVM Testnet and Elysium Testnet with Kinetiq’s official bridge.
          The bridge runs here inside Vyntra.
        </p>
      </div>

      <section className="card overflow-hidden p-3 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1 sm:px-2">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--vyntra-elev)] text-[var(--vyntra-accent)]">
              <Waves className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Kinetiq bridge</h2>
              <p className="text-sm text-[var(--vyntra-muted)]">HyperEVM Testnet ↔ Elysium Testnet</p>
            </div>
          </div>
          <a
            href={ELYSIUM_BRIDGE_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost inline-flex px-3 py-2 text-sm"
          >
            Open official bridge <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-white">
          {!loaded && (
            <div className="absolute inset-0 z-10 grid min-h-[620px] place-items-center bg-white p-6 text-center sm:min-h-[700px]">
              {timedOut ? (
                <div className="max-w-sm">
                  <p className="font-semibold">The embedded bridge did not load.</p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--vyntra-muted)]">Your browser may block embedded bridge pages. Open Kinetiq’s official bridge from the button above.</p>
                </div>
              ) : (
                <div>
                  <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[var(--vyntra-border-strong)] border-t-[var(--vyntra-primary)] motion-reduce:animate-none" />
                  <p className="mt-4 text-sm font-medium text-[var(--vyntra-muted)]">Loading the official Elysium bridge…</p>
                </div>
              )}
            </div>
          )}
          <iframe
            src={ELYSIUM_BRIDGE_URL}
            title="Official Kinetiq Elysium Testnet bridge"
            className="block h-[680px] w-full border-0 bg-white sm:h-[760px]"
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-read; clipboard-write; fullscreen"
            allowFullScreen
            onLoad={() => setLoaded(true)}
            onError={() => setTimedOut(true)}
          />
        </div>
        <p className="mt-3 px-1 text-xs leading-relaxed text-[var(--vyntra-faint)] sm:px-2">
          The embedded page is served by Kinetiq. If your browser or wallet blocks embedded connections,
          use “Open official bridge” above. Funds leaving Elysium are claimed on HyperEVM.
        </p>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card flex flex-col p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--vyntra-elev)] text-[var(--vyntra-accent)]">
              <Fuel className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Need test HYPE?</h2>
              <p className="text-sm text-[var(--vyntra-muted)]">Request HYPE directly on Elysium.</p>
            </div>
          </div>
          <a
            href={ELYSIUM_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-primary mt-6 inline-flex justify-center"
          >
            Elysium faucet <ExternalLink className="h-4 w-4" />
          </a>
        </section>

        <section className="card flex flex-col p-5 sm:p-6">
          <div>
            <h2 className="font-semibold">Get HYPE on HyperEVM</h2>
            <p className="mt-1 text-sm text-[var(--vyntra-muted)]">Use the official testnet faucet, then bridge here.</p>
          </div>
          <a
            href={HYPEREVM_FAUCET_URL}
            target="_blank"
            rel="noreferrer"
            className="btn-ghost mt-6 inline-flex justify-center"
          >
            HyperEVM faucet <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="font-semibold">Network details</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-[var(--vyntra-muted)]">Network</dt>
            <dd className="mt-1 font-medium">Kinetiq Elysium Testnet</dd>
          </div>
          <div>
            <dt className="text-[var(--vyntra-muted)]">Chain ID</dt>
            <dd className="mt-1 font-mono font-medium">99801</dd>
          </div>
          <div>
            <dt className="text-[var(--vyntra-muted)]">Gas token</dt>
            <dd className="mt-1 font-mono font-medium">HYPE</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-[var(--vyntra-faint)]">
          Testnet HYPE is for testing and has no guaranteed dollar value.
        </p>
        <a
          href={ELYSIUM_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--vyntra-accent)] hover:underline"
        >
          Elysium connection guide <ExternalLink className="h-4 w-4" />
        </a>
      </section>
    </div>
  )
}
