import { useState } from 'react'
import {
  ArrowRight,
  Coins,
  Flame,
  LockKeyhole,
  Shield,
  Sparkles,
  Waves,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const ALLOCATIONS = [
  { name: 'VYNTRA market', amount: '50M', total: '5%', reserve: '30M curve sale · 20M locked pool allocation at graduation', color: 'bg-[var(--vyntra-primary)]' },
  { name: 'Community & creator incentives', amount: '190M', total: '19%', reserve: '20% of the reserve', color: 'bg-[#9c7bea]' },
  { name: 'Ecosystem grants', amount: '142.5M', total: '14.25%', reserve: '15% of the reserve', color: 'bg-[var(--vyntra-accent-2)]' },
  { name: 'Unallocated reserve', amount: '617.5M', total: '61.75%', reserve: '65% of the reserve', color: 'bg-[#d9ccef]' },
]

const PRINCIPLES = [
  {
    icon: Waves,
    title: 'Buyers fund the curve',
    body: 'A launch opens on a published price curve with no creator liquidity deposit. Public trades build the HYPE reserve toward graduation.',
  },
  {
    icon: LockKeyhole,
    title: 'Vyntra liquidity stays locked',
    body: 'At graduation, the remaining 40% allocation and raised HYPE enter a no-hook, full-range V4 position with no withdrawal path.',
  },
  {
    icon: Shield,
    title: 'A bounded opening',
    body: 'The linear curve sets a transparent opening price path. During the first three blocks, aggregate buys are capped at 2% of supply; this cannot prevent later price swings.',
  },
]

export function About() {
  return (
    <div className="mx-auto max-w-6xl space-y-16 pb-8 sm:space-y-24">
      <section className="grid items-center gap-10 pt-2 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
        <div>
          <p className="page-kicker">The Vyntra model</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] px-3 py-1.5 text-xs font-semibold text-[var(--vyntra-muted)]">
            <span className="h-2 w-2 rounded-full bg-[var(--vyntra-accent-2)]" />
            Live on Elysium Testnet
          </p>
          <h1 className="page-title mt-6 max-w-3xl text-5xl leading-[1.04] sm:text-6xl lg:text-7xl">
            Launch with a story.
            <br />
            <span className="text-[var(--vyntra-primary)]">Keep the market.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--vyntra-muted)] sm:text-xl">
            Vyntra lets creators launch without supplying liquidity up front. Buyers trade on a transparent HYPE curve; at graduation, the remaining token allocation and raised HYPE initialize a permanently locked Uniswap v4 pool.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--vyntra-faint)]">
            Vyntra is live on Elysium Testnet. Test HYPE has no guaranteed dollar value; this deployment is for product testing and feedback.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/docs" className="btn-primary">
              Read the docs <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/markets" className="btn-ghost">
              Explore markets
            </Link>
          </div>
        </div>

        <div className="card relative overflow-hidden p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-[rgba(124,58,237,0.12)] blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">A launch’s trading path</p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-tight">A clear path to locked liquidity.</h2>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--vyntra-elev)] text-[var(--vyntra-primary)]">
                <Waves className="h-5 w-5" />
              </span>
            </div>

            <div className="mt-10 px-1">
              <div className="about-pool-rail"><span className="about-flow-dot" /></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:text-sm">
                <div><p className="font-semibold">Launch</p><p className="mt-1 text-[var(--vyntra-muted)]">Buyer-funded curve</p></div>
                <div className="text-center"><p className="font-semibold">Graduation</p><p className="mt-1 text-[var(--vyntra-muted)]">HYPE + token allocation</p></div>
                <div className="text-right"><p className="font-semibold">Uniswap v4</p><p className="mt-1 text-[var(--vyntra-muted)]">Locked pool opens</p></div>
              </div>
            </div>

            <div className="mt-8 border-t border-[var(--vyntra-border)] pt-5">
              <p className="text-sm leading-relaxed text-[var(--vyntra-muted)]">
                A launch starts on its curve. When the sale allocation and HYPE target are reached, the contract initializes a no-hook V4 pool and locks Vyntra’s full-range position.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Vyntra launch settings" className="grid gap-px overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-border)] sm:grid-cols-2 lg:grid-cols-4">
        <Fact value="1B" label="Fixed supply per creator token" />
        <Fact value="1%" label="Curve and V4 trade fee" />
        <Fact value="50%" label="Of HYPE pool fees to creators" />
        <Fact value="0x7f7" label="Suffix on new platform and launch tokens" />
      </section>

      <section>
        <div className="max-w-2xl">
          <p className="page-kicker">For creators and traders</p>
          <h2 className="page-title mt-2 text-3xl sm:text-4xl">A launch should give people something to follow.</h2>
          <p className="mt-4 leading-relaxed text-[var(--vyntra-muted)]">
            Creators bring the name, image, links, and idea. They can include an optional first buy when launching. Traders get a live HYPE market, charts, and a shared view of activity.
          </p>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <Principle icon={Sparkles} title="Make the idea legible">
            Each launch includes a name, ticker, image, and description. Vyntra checks names and tickers for duplicates.
          </Principle>
          <Principle icon={Coins} title="Start with defined bounds">
            The creator pays network gas; any HYPE sent with creation is an optional first buy. The Elysium testnet factory currently sends creator fees to the launch wallet. The upgraded factory adds a selectable creator fee wallet and Studio updates.
          </Principle>
          <Principle icon={Flame} title="Share trading fees">
            Creators claim half of collected HYPE fees and all fees collected in their token. The protocol receives the other half of HYPE fees.
          </Principle>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--vyntra-faint)]">
          New full deployments and creator launches use the 0x7f7 suffix. The existing testnet platform token keeps its current address until redeployed. A suffix alone does not prove a creator token is from Vyntra; check that the factory registered it.
        </p>
      </section>

      <section className="border-y border-[var(--vyntra-border)] py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-14">
          <div>
            <p className="page-kicker">The trading model</p>
            <h2 className="page-title mt-2 text-3xl sm:text-4xl">Build a market without a creator deposit.</h2>
            <p className="mt-4 leading-relaxed text-[var(--vyntra-muted)]">
            Each creator token has a fixed 1B supply: 600M are sold on the curve and 400M are reserved for V4 liquidity. At graduation, the contract initializes the no-hook pool from the collected HYPE and reserved tokens in the same transaction. The initial full-range position is locked.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="card p-5">
                <Icon className="h-5 w-5 text-[var(--vyntra-primary)]" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--vyntra-muted)]">{body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="vyntra-token" className="scroll-mt-24">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start lg:gap-14">
          <div>
            <p className="page-kicker">The platform token</p>
            <h2 className="page-title mt-2 text-3xl sm:text-4xl">$VYNTRA has a defined job.</h2>
            <p className="mt-4 leading-relaxed text-[var(--vyntra-muted)]">
              The fee router sends 80% of protocol HYPE fees to the buyback vault and 20% to the operations treasury. Capped buys burn the VYNTRA they acquire. Creators can also burn VYNTRA to feature a launch; those payments do not go to the treasury.
            </p>
            <div className="mt-6 rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-5">
              <p className="font-semibold">Protocol fee routing</p>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full" aria-label="80 percent routed to the buyback vault; 20 percent to the operations treasury">
                <span className="w-4/5 bg-[var(--vyntra-primary)]" />
                <span className="w-1/5 bg-[var(--vyntra-accent-2)]" />
              </div>
              <div className="mt-3 flex justify-between gap-3 text-sm">
                <span><strong>80%</strong> buyback vault</span>
                <span><strong>20%</strong> ops treasury</span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-[var(--vyntra-faint)]">
                Anyone can run a buyback sweep when the pool limits allow it. Each buy is capped at 0.5% of HYPE reserves, with at least six hours between buys. Revenue and buybacks do not guarantee a token price.
              </p>
            </div>
          </div>

          <div className="card overflow-hidden p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">Fixed supply</p>
                <p className="mt-2 font-display text-3xl font-bold sm:text-4xl">1,000,000,000</p>
                <p className="mt-1 text-sm text-[var(--vyntra-muted)]">VYNTRA · no post-deployment mint</p>
              </div>
              <p className="rounded-lg bg-[var(--vyntra-elev)] px-3 py-2 text-sm font-semibold text-[var(--vyntra-primary)]">No direct team allocation at deployment</p>
            </div>

            <div className="mt-7 flex h-4 overflow-hidden rounded-full" aria-label="VYNTRA supply allocation">
              {ALLOCATIONS.map((allocation) => (
                <span key={allocation.name} className={allocation.color} style={{ width: allocation.total }} title={`${allocation.name}: ${allocation.total}`} />
              ))}
            </div>
            <div className="mt-5 space-y-4">
              {ALLOCATIONS.map((allocation) => (
                <div key={allocation.name} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${allocation.color}`} />
                    <span className="font-medium">{allocation.name}</span>
                  </div>
                  <span className="font-mono font-semibold">{allocation.amount} <span className="text-[var(--vyntra-faint)]">({allocation.total})</span></span>
                  <span className="col-span-2 pl-5 text-xs text-[var(--vyntra-muted)]">{allocation.reserve}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-[var(--vyntra-border)] pt-5 text-sm leading-relaxed text-[var(--vyntra-muted)]">
              <p><strong className="text-[var(--vyntra-fg)]">Reserve rules:</strong> a treasury Safe must schedule each campaign or reallocation through a 30-day timelock. To use unallocated tokens, the Safe first timelocks a move into an eligible program bucket, then separately timelocks the campaign. Campaign funding is capped at 50M VYNTRA in any rolling 365 days. Unclaimed tokens return to their original budget when a campaign ends, but that does not restore cap capacity.</p>
              <p className="mt-3">A campaign records its category, amount, claim window, Merkle root, metadata URI, and metadata hash on-chain. The contract does not inspect the metadata contents or exclude team wallets, so recipient lists and affiliations must be disclosed for each proposal. The reserve does not automatically add tokens to the trading pool.</p>
            </div>
          </div>
        </div>
      </section>

      <FeeFlowSimulator />

      <section className="grid gap-8 rounded-2xl bg-[var(--vyntra-elev)] p-6 sm:p-9 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
        <div>
          <p className="page-kicker">Know the trade</p>
          <h2 className="page-title mt-2 text-3xl">Markets move both ways.</h2>
        </div>
        <div className="space-y-3 text-sm leading-relaxed text-[var(--vyntra-muted)]">
          <p>Thin liquidity and large swaps can move a token’s price. Slippage limits help control execution, but they do not prevent losses.</p>
          <p>Vyntra locks its initial position. Independent liquidity providers can create separate positions and withdraw those positions. Read each token’s details and verify its factory registration before trading.</p>
          <p>Vyntra is live on Elysium Testnet. Test HYPE has no guaranteed dollar value, and VYNTRA’s buyback policy promises neither demand nor price appreciation.</p>
        </div>
      </section>

      <section className="card flex flex-col items-start justify-between gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
        <div>
          <p className="page-kicker">Follow the launch</p>
          <h2 className="page-title mt-2 text-2xl sm:text-3xl">Meet Vyntra at the market.</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--vyntra-muted)]">
            Read the contract and tokenomics docs, then explore the live Elysium Testnet markets.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link to="/docs" className="btn-ghost">Read docs</Link>
          <Link to="/markets" className="btn-primary">Open markets <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </div>
  )
}

function FeeFlowSimulator() {
  const [market, setMarket] = useState<'creator' | 'platform'>('creator')
  const [volume, setVolume] = useState(1000)
  const estimatedPoolFees = volume * 0.01
  const creatorFees = market === 'creator' ? estimatedPoolFees * 0.5 : 0
  const protocolFees = estimatedPoolFees - creatorFees
  const buyback = protocolFees * 0.8
  const operations = protocolFees * 0.2
  const formatHype = (value: number) =>
    `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)} HYPE`

  const allocations = market === 'creator'
    ? [
        { label: 'Creator', width: '50%', className: 'bg-[var(--vyntra-accent-2)]' },
        { label: 'Buyback vault', width: '40%', className: 'bg-[var(--vyntra-primary)]' },
        { label: 'Operations', width: '10%', className: 'bg-[var(--vyntra-fg)]' },
      ]
    : [
        { label: 'Buyback vault', width: '80%', className: 'bg-[var(--vyntra-primary)]' },
        { label: 'Operations', width: '20%', className: 'bg-[var(--vyntra-fg)]' },
      ]

  return (
    <section aria-labelledby="fee-flow-title" className="card overflow-hidden p-6 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
        <div>
          <p className="page-kicker">Interactive fee guide</p>
          <h2 id="fee-flow-title" className="page-title mt-2 text-3xl sm:text-4xl">Follow the HYPE fees.</h2>
          <p className="mt-4 leading-relaxed text-[var(--vyntra-muted)]">
            Choose a market and adjust the trading volume to see where its estimated 1% trade fees go.
          </p>
          <div className="mt-6 inline-flex rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-1" role="group" aria-label="Choose a market for the fee estimate">
            <button
              type="button"
              aria-pressed={market === 'creator'}
              onClick={() => setMarket('creator')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${market === 'creator' ? 'bg-[var(--vyntra-primary)] text-white' : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'}`}
            >
              Creator token
            </button>
            <button
              type="button"
              aria-pressed={market === 'platform'}
              onClick={() => setMarket('platform')}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${market === 'platform' ? 'bg-[var(--vyntra-primary)] text-white' : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'}`}
            >
              $VYNTRA market
            </button>
          </div>
          <label htmlFor="fee-volume" className="mt-7 flex items-center justify-between gap-3 text-sm font-semibold">
            <span>Estimated swap turnover</span>
            <output htmlFor="fee-volume" className="font-mono text-[var(--vyntra-primary)]">{formatHype(volume)}</output>
          </label>
          <input
            id="fee-volume"
            type="range"
            min="100"
            max="5000"
            step="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            className="mt-4 w-full cursor-pointer"
            style={{ accentColor: 'var(--vyntra-primary)' }}
            aria-describedby="fee-flow-note"
          />
          <div className="mt-1 flex justify-between text-xs text-[var(--vyntra-faint)]">
            <span>100 HYPE</span>
            <span>5,000 HYPE</span>
          </div>
        </div>

        <div aria-live="polite" className="rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-5 sm:p-6">
          <p className="text-sm font-semibold">Illustrative fee flow</p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full" aria-label="Estimated distribution of HYPE pool fees">
            {allocations.map((allocation) => (
              <span
                key={allocation.label}
                className={allocation.className}
                style={{ width: allocation.width }}
                title={`${allocation.label}: ${allocation.width}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--vyntra-muted)]">
            {allocations.map((allocation) => (
              <span key={allocation.label} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-sm ${allocation.className}`} />
                {allocation.label} {allocation.width}
              </span>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <FeeResult label="Estimated trading fees" value={formatHype(estimatedPoolFees)} detail="1% of selected turnover" />
            <FeeResult label="Creator HYPE fees" value={formatHype(creatorFees)} detail={market === 'creator' ? '50% of HYPE fees' : 'No creator share in this market'} />
            <FeeResult label="HYPE routed to buyback vault" value={formatHype(buyback)} detail="80% of protocol HYPE fees" />
            <FeeResult label="Operations treasury" value={formatHype(operations)} detail="20% of protocol HYPE fees" />
          </div>
          <p id="fee-flow-note" className="mt-5 text-xs leading-relaxed text-[var(--vyntra-faint)]">
            Estimate only: it applies the 1% trade fee to selected turnover on either the curve or V4 market. A permissionless keeper sweep collects protocol fees and routes the operations share to the TREASURY address set at deployment. Buyback HYPE stays in the vault until a safeguarded buy runs. Creator markets also send token-denominated V4 fees to the creator; $VYNTRA market token fees are burned. Treasury revenue depends on trading activity, and test HYPE has no guaranteed dollar value.
          </p>
        </div>
      </div>
    </section>
  )
}

function FeeResult({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[var(--vyntra-border)] px-4 py-3">
      <p className="text-xs text-[var(--vyntra-muted)]">{label}</p>
      <p className="mt-1 font-mono text-lg font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--vyntra-faint)]">{detail}</p>
    </div>
  )
}

function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--vyntra-card)] px-5 py-5 sm:px-6">
      <p className="font-display text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--vyntra-muted)]">{label}</p>
    </div>
  )
}

function Principle({ icon: Icon, title, children }: { icon: typeof Waves; title: string; children: React.ReactNode }) {
  return (
    <article className="card p-5">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--vyntra-elev)] text-[var(--vyntra-primary)]">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--vyntra-muted)]">{children}</p>
    </article>
  )
}
