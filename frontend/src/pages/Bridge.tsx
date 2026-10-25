import { useState } from 'react'
import { ExternalLink, ArrowRightLeft, BookOpen, Shield } from 'lucide-react'

const BRIDGE_URL = 'https://bridge.botchain.ai/'
const DEX_URL = 'https://dex.botchain.ai/'
const DOCS_URL = 'https://dev-docs.botchain.ai/docs/Bridge/contract-addresses/'
const BOT_USDT = '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C'

type Direction = 'in' | 'out'

const STEPS_IN = [
  {
    title: 'Get USDT on BNB Smart Chain',
    body: 'Buy or transfer USDT on BSC (BNB Chain). Keep a little BNB for gas on that network.',
  },
  {
    title: 'Open the BOT Chain bridge',
    body: 'Use the official bridge below (by BOT Chain). Connect your wallet on BSC, choose From: BNB Smart Chain → To: BOT Chain, asset USDT.',
  },
  {
    title: 'Approve and bridge',
    body: 'Approve USDT if asked, confirm the bridge transaction, then wait for finality (often a few minutes). Switch your wallet network to BOT Chain afterward.',
  },
  {
    title: 'Add BOT USDT (optional)',
    body: `On BOT Chain, import the USDT token so your wallet shows the balance. Contract: ${BOT_USDT}`,
  },
  {
    title: 'Swap USDT → $BOT on BDEX',
    body: 'Open BDEX, connect on BOT Chain, swap bridged USDT for native $BOT. You need $BOT for gas and for trading on Vyntra.',
  },
]

const STEPS_OUT = [
  {
    title: 'Swap $BOT → USDT on BDEX',
    body: 'On BOT Chain, use BDEX to swap the $BOT you want to exit into BOT-chain USDT. Keep a little $BOT for gas.',
  },
  {
    title: 'Bridge USDT out',
    body: 'In the official bridge, connect on BOT Chain. Choose From: BOT Chain → To: BNB Smart Chain (or another supported chain), asset USDT.',
  },
  {
    title: 'Confirm and switch networks',
    body: 'Approve if needed, confirm, wait for the bridge to complete, then switch your wallet back to the destination chain to see USDT.',
  },
]

export function Bridge() {
  const [direction, setDirection] = useState<Direction>('in')
  const [iframeFailed, setIframeFailed] = useState(false)
  const steps = direction === 'in' ? STEPS_IN : STEPS_OUT

  return (
    <div className="space-y-8">
      <div className="sys-bar">
        <span className="text-[var(--vyntra-fg)]">Vyntra</span>
        <span className="text-[var(--vyntra-faint)]">/</span>
        <span>Bridge</span>
        <span className="ml-auto chip-demo">Powered by BOT Chain</span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="page-kicker mb-2">Get BOT gas</p>
          <h1 className="page-title text-4xl sm:text-5xl">Bridge</h1>
          <p className="mt-3 max-w-2xl text-base text-[var(--vyntra-muted)] sm:text-lg">
            New to BOT Chain? Bridge USDT in, swap to $BOT on BDEX, then launch or trade on Vyntra —
            without leaving this tab for the hard parts.
          </p>
        </div>
        <a
          href={BRIDGE_URL}
          target="_blank"
          rel="noreferrer"
          className="btn-primary"
        >
          Open bridge
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid gap-4 rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-4 sm:grid-cols-3 sm:p-5">
        <Note
          icon={<Shield className="h-4 w-4" />}
          title="Official bridge"
          body="The widget and links point at bridge.botchain.ai — operated by BOT Chain, not Vyntra."
        />
        <Note
          icon={<ArrowRightLeft className="h-4 w-4" />}
          title="Path"
          body="BSC USDT → bridge → BOT USDT → BDEX swap → $BOT → Vyntra."
        />
        <Note
          icon={<BookOpen className="h-4 w-4" />}
          title="Need gas"
          body="Every Vyntra tx spends native $BOT. Bridge first if your wallet has none."
        />
      </div>

      <div className="flex gap-1 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-1.5 w-fit">
        {(
          [
            ['in', 'Bridge in'],
            ['out', 'Bridge out'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setDirection(id)}
            className={`rounded-[var(--radius)] px-4 py-2.5 text-sm font-semibold transition ${
              direction === id
                ? 'bg-[rgba(124,58,237,0.12)] text-[var(--vyntra-primary)]'
                : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vyntra-border)] px-4 py-3.5 sm:px-5">
            <div>
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--vyntra-muted)]">
                BOT Chain bridge
              </div>
              <p className="mt-1 text-sm text-[var(--vyntra-faint)]">Embedded for convenience</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={BRIDGE_URL} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-2 text-sm">
                Full screen
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a href={DEX_URL} target="_blank" rel="noreferrer" className="btn-ghost px-3 py-2 text-sm">
                Open BDEX
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {iframeFailed ? (
            <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <p className="font-display text-2xl">Bridge opens in a new tab</p>
              <p className="max-w-md text-base text-[var(--vyntra-muted)]">
                Some wallets and browsers block embedding the bridge. Use the official site — same
                flow as the tutorial on the right.
              </p>
              <a href={BRIDGE_URL} target="_blank" rel="noreferrer" className="btn-primary">
                Continue on bridge.botchain.ai
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : (
            <iframe
              title="BOT Chain bridge"
              src={BRIDGE_URL}
              className="h-[640px] w-full bg-[var(--vyntra-elev)]"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer-when-downgrade"
              onError={() => setIframeFailed(true)}
            />
          )}
          <p className="border-t border-[var(--vyntra-border)] px-4 py-2.5 text-xs text-[var(--vyntra-faint)] sm:px-5">
            If the frame stays blank, your browser blocked it — use <strong>Full screen</strong>.
            Always verify you are on <span className="font-mono">bridge.botchain.ai</span>.
          </p>
        </section>

        <section className="card p-5 sm:p-6">
          <p className="page-kicker mb-2">Tutorial</p>
          <h2 className="font-display text-2xl">
            {direction === 'in' ? 'Bridge into BOT Chain' : 'Bridge out of BOT Chain'}
          </h2>
          <ol className="mt-6 space-y-5">
            {steps.map((step, i) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(124,58,237,0.12)] font-mono text-sm font-bold text-[var(--vyntra-primary)]">
                  {i + 1}
                </span>
                <div>
                  <div className="font-semibold text-[var(--vyntra-fg)]">{step.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--vyntra-muted)]">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 space-y-3 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-4 text-sm">
            <div className="font-semibold">Helpful links</div>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-[var(--vyntra-primary)] hover:underline"
            >
              Bridge contract docs <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <p className="font-mono text-xs break-all text-[var(--vyntra-faint)]">
              BOT USDT: {BOT_USDT}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function Note({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 text-[var(--vyntra-primary)]">{icon}</span>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-1 text-sm leading-relaxed text-[var(--vyntra-muted)]">{body}</p>
      </div>
    </div>
  )
}
