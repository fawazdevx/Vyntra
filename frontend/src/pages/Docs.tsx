import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { VYNTRA_LOGO } from '../lib/config'
import { ThemeToggle } from '../components/ThemeToggle'

type DocSection = { title: string; body: ReactNode }
type DocPage = {
  slug: string
  group: string
  title: string
  summary: string
  keywords: string
  sections: DocSection[]
}

const docPages: DocPage[] = [
  {
    slug: 'welcome',
    group: 'Get started',
    title: 'Welcome to Vyntra',
    summary: 'Find a market, launch a token, and understand how Vyntra handles liquidity, fees, and graduation.',
    keywords: 'overview testnet HYPE Elysium markets launchpad',
    sections: [
      {
        title: 'The quick picture',
        body: (
          <>
            <p>Vyntra is a token launchpad on Kinetiq Elysium Testnet. Each launch starts on a buyer-funded HYPE bonding curve. Creators do not need to deposit liquidity or pay a platform launch fee; they need HYPE only for network gas unless they choose to make an optional first buy.</p>
            <p>When the curve sells its 60% allocation and reaches the configured HYPE target, the remaining 40% and raised HYPE initialize a no-hook Uniswap v4 pool. Vyntra&apos;s full-range position has no withdrawal function.</p>
          </>
        ),
      },
      {
        title: 'Choose where to start',
        body: (
          <div className="grid gap-3 sm:grid-cols-2">
            <DocLink to="/markets" title="Browse markets" text="Review launch details, charts, pool progress, and trades." />
            <DocLink to="/spawn" title="Launch a token" text="Create a token without a liquidity deposit or platform fee." />
            <DocLink to="/vyntra" title="Read about $VYNTRA" text="See the platform-token market and reserve information." />
            <DocLink to="/docs/agents-mcp" title="Use an AI agent" text="Connect the Vyntra MCP server for reads and unsigned transaction preparation." />
          </div>
        ),
      },
      {
        title: 'Before you confirm',
        body: <Callout title="Testnet means test assets" tone="amber">Elysium Testnet uses HYPE for gas and trading. Testnet HYPE has no guaranteed dollar value. Check the network, contract address, optional buy amount, and minimum output in your wallet before signing.</Callout>,
      },
    ],
  },
  {
    slug: 'markets',
    group: 'Use Vyntra',
    title: 'Find and trade a token',
    summary: 'Read a launch page before swapping, and understand what a quote can and cannot tell you.',
    keywords: 'markets browse buy sell quote slippage chart trade HYPE',
    sections: [
      {
        title: 'Review the launch',
        body: <p>The Markets summary includes total indexed trades across creator launches and the VYNTRA market. Market cards show curve progress toward a locked V4 pool, HYPE raised, per-launch trading volume and trade count, creator, and launch date. Use <strong>Top volume</strong> to sort launches by recorded volume. Open a token page for its chart, recent trades, token and creator addresses, and detailed pool status. Verify that the token is registered by the Vyntra factory; the recognizable <code>7f7</code> address ending alone is not proof.</p>,
      },
      {
        title: 'Buy and sell',
        body: <><p>Launch tokens trade against HYPE. Enter the amount, review the quote and slippage setting, then confirm the transaction in your wallet. A sell may need a separate token approval first.</p><p>Quotes are estimates from the current pool state. The minimum-output check protects the transaction from executing below the limit you set; it does not guarantee a fill or protect against ordinary price movement.</p></>,
      },
      {
        title: 'Opening protection',
        body: <p>During the first three blocks after launch, the contract caps aggregate buys at 2% of the token supply. This limits the earliest buy burst; it does not prevent later price changes or guarantee a fair market price.</p>,
      },
      {
        title: 'Charts and indexed data',
        body: <p>Charts and trade tapes combine recent on-chain buys and sells with the Vyntra indexer&apos;s full history. New events can appear before the indexer has caught up; older trades, holders, wallet activity, and volume still depend on indexed records. Choose a timeframe from one minute through one day, or select <strong>All</strong> to fit the available indexed history (up to 5,000 trades). Switch between market cap and token price, and use Auto, Candles, or Line to choose how the chart is drawn. Use a transaction link and the Elysium explorer to verify a trade if it has not appeared in the app yet.</p>,
      },
    ],
  },
  {
    slug: 'launch',
    group: 'Use Vyntra',
    title: 'Launch a token',
    summary: 'Create a token without a liquidity deposit, then let buyers fund its curve.',
    keywords: 'create launch curve liquidity deposit launch fee 1 billion token 7f7 creator image',
    sections: [
      {
        title: 'What you need',
        body: <ul><li>A unique name and ticker.</li><li>An image URI and a non-empty description.</li><li>HYPE for network gas. No HYPE liquidity deposit or Vyntra launch fee is required.</li><li>A wallet connected to Elysium Testnet.</li></ul>,
      },
      {
        title: 'What launch does',
        body: <p>The factory creates a fixed 1 billion token supply and opens a linear HYPE curve: 600 million tokens are offered to buyers and 400 million are reserved for the graduation pool. The curve begins at one third of its terminal price and rises smoothly; when its sale allocation is exhausted, the raised HYPE and reserved tokens initialize a no-hook Uniswap v4 pool in the same transaction. The Vyntra position is locked. Creator token addresses must end in <code>7f7</code>; the factory checks this on-chain. The platform token also uses this suffix on deployments made with the current deployment script.</p>,
      },
      {
        title: 'No required opening buy',
        body: <p>Creating a token costs network gas only. You can leave the opening buy at zero or include a HYPE buy in the launch transaction. Early buys share a 2% of supply limit across the first three blocks; an opening buy that exceeds the remaining limit reverts. Any amount beyond the curve&apos;s remaining capacity is refunded. Public buyers fund the curve; the creator does not have to provide the graduation liquidity.</p>,
      },
      {
        title: 'Profile and creator fee wallet',
        body: <p>Add a website, X account, and Telegram link to the launch profile. Vyntra stores these as labeled lines in the token&apos;s on-chain description and shows them as links on its token page. On the updated factory, you may choose a creator fee wallet and change it later in Studio. Only the launch creator can trigger a claim; HYPE claims and collected token fees go to the selected fee wallet. The original Elysium testnet factory pays the connected creator wallet and does not support fee-wallet changes.</p>,
      },
      {
        title: 'Fixed trading rules',
        body: <p>Creator buy and sell taxes are disabled. Curve buys and sells each charge a 1% trade fee, split equally between creator and protocol. After graduation, Uniswap v4 pools use a fixed 1% swap fee. HYPE pairing, supply, allocation, graduation target, and early-block limit are shared across launches; see <Link to="/docs/fees" className="doc-inline-link">Fees and rewards</Link>.</p>,
      },
    ],
  },
  {
    slug: 'after-launch',
    group: 'Use Vyntra',
    title: 'After you launch',
    summary: 'Track your pool, claim creator fees, and understand graduation.',
    keywords: 'creator studio claim fees graduated threshold after launch',
    sections: [
      {
        title: 'Follow the market',
        body: <p>Your token page shows the live pool state, recent on-chain buys and sells, and the indexed trade record. The indexer fills in complete history in the background; verify a transaction on the Elysium explorer if the tape has not received its event yet.</p>,
      },
      {
        title: 'Claim creator fees',
        body: <p>The creator can claim the creator share of HYPE-denominated fees from Studio. The contract collects fees from its position and pays the creator. Token-denominated fees collected from the position are also sent to the creator.</p>,
      },
      {
        title: 'What graduation changes',
        body: <p>When the curve sells its 60% allocation, its net HYPE reserve reaches the launch threshold. That final buy automatically initializes the no-hook V4 pool and supplies the 40% reserved token allocation. If pool initialization fails, the whole buy reverts atomically. The V4 position cannot be withdrawn by the creator or an administrator. Graduation is therefore an automatic curve-to-pool transition, not a separate manual migration.</p>,
      },
    ],
  },
  {
    slug: 'fees',
    group: 'Protocol',
    title: 'Fees and rewards',
    summary: 'Where pool fees go, and how protocol revenue reaches the VYNTRA buyback vault.',
    keywords: 'fees 1 percent creator protocol treasury buyback burn ops',
    sections: [
      {
        title: 'Launch pool fee',
        body: <p>Buys and sells on a bonding curve each charge 1%. After graduation, the Uniswap v4 pool charges 1% per swap. Curve fees are split equally between the creator and protocol. When Vyntra collects fees from the locked V4 position, half of HYPE fees are credited to the creator and half to the protocol; token-denominated fees go to the creator.</p>,
      },
      {
        title: 'Protocol share',
        body: <ul><li>80% of protocol HYPE revenue is routed to the VYNTRA buyback vault.</li><li>20% is sent to the operations treasury.</li><li>Buybacks are limited to 0.5% of current HYPE pool reserves per purchase, with at least six hours between purchases and a 99% quote floor.</li><li>Purchased VYNTRA is transferred to the burn address.</li></ul>,
      },
      {
        title: 'A buyback is not a price promise',
        body: <Callout title="Market risk remains" tone="violet">Buybacks depend on protocol fees and market conditions. They do not guarantee demand, a minimum price, or a financial return.</Callout>,
      },
    ],
  },
  {
    slug: 'vyntra-tokenomics',
    group: 'Protocol',
      title: '$VYNTRA and its reserve',
    summary: 'Supply, what is available to buy, and how reserve releases are governed.',
    keywords: 'VYNTRA platform token 1 billion 50 million 950 million allocations reserve policy vault 30 day campaign release cap',
    sections: [
      {
        title: 'Where the supply starts',
        body: <><p>VYNTRA has a fixed supply of 1 billion. At deployment, 50 million tokens enter the platform market: 30 million are offered on its buyer-funded curve and 20 million are reserved for its locked HYPE/VYNTRA Uniswap v4 pool after the curve raises its configured target. The default target is 5 HYPE. The deployer supplies no HYPE for this market; buyers provide it through trades.</p><p>The other 950 million are held in <code>VyntraReserveVault</code>, outside the trading market. There is no team allocation. The reserve is split into 190 million community and creator incentives, 142.5 million ecosystem grants, and 617.5 million unallocated reserve.</p><Callout title="What buyers can trade" tone="violet">Buyers can trade the 30 million curve allocation from launch. At graduation, the remaining 20 million joins the accumulated HYPE in the locked V4 pool. Reserve tokens remain outside the market and become claimable only through public campaigns after the timelock process.</Callout></>,
      },
      {
        title: 'How the reserve can be used',
        body: <p>The treasury Safe is the only proposer for reserve operations. A queued action must wait at least 30 days, after which anyone can execute it. The delay cannot be reduced below 30 days. The vault has no general withdrawal method: reserve tokens are made claimable through campaigns with an on-chain category, amount, Merkle root, metadata URI and hash, and claim window. Public campaign metadata should include the recipient list and each allocation. Recipients can claim immediately transferable VYNTRA during the published window.</p>,
      },
      {
        title: 'Release pacing and expired campaigns',
        body: <p>All reserve campaigns share a 50 million VYNTRA cap per rolling 365 days. The full campaign amount counts when it is funded, even if some recipients never claim. Anyone can expire a campaign after its claim window; unclaimed tokens return to the same budget, but the release cap does not reset. Unallocated reserve can be moved into the incentive or grant budgets only through a separate 30-day timelock operation. The full reserve is not promised to be released within four years, and this deployment does not provide reserve-funded market liquidity.</p>,
      },
      {
        title: 'Additional token use',
        body: <p>Creators can pay VYNTRA for labeled featured placement in Markets. The starting rate is 250,000 VYNTRA per day; accepted durations are one, three, or seven days, and the fee goes to the burn address. Feature placement changes visibility only, not trading outcomes.</p>,
      },
      {
        title: 'Check addresses and balances',
        body: <p>The VYNTRA page reads live reserve bucket balances and the rolling release cap from the configured vault, along with the timelock delay. Campaign and reallocation events appear when the indexer is configured. Verify the token, vault, timelock, and market addresses on the Elysium explorer.</p>,
      },
    ],
  },
  {
    slug: 'developers',
    group: 'Build',
    title: 'Contracts and infrastructure',
    summary: 'Learn what each Vyntra contract does and how the app, indexer, and MCP use them.',
    keywords: 'developer contracts Elysium indexer RPC deployment addresses VyntraFactory VyntraMarket',
    sections: [
      {
        title: 'Network',
        body: <p>Kinetiq Elysium Testnet uses chain ID <code>99801</code>, native token HYPE, and RPC <code>https://testnet-rpc.elysium.kinetiq.xyz</code>. The deployment script currently refuses to run on other chain IDs.</p>,
      },
      {
        title: 'Core contracts',
        body: <InfoTable rows={[
          ['VyntraFactory', 'Registers launches, creates each token market, and enforces shared launch rules.'],
          ['VyntraMarketDeployer', 'Creates the bonding-curve market contracts for new launches.'],
          ['VyntraCurve', 'Per-token market: curve trading, fees, creator claims, graduation, and locked Uniswap v4 liquidity.'],
          ['VYNTRA', 'Fixed-supply platform token paired with HYPE in the platform market.'],
          ['VyntraPlatformTokenDeployer', 'Uses CREATE2 to deploy the platform token with the 0x7f7 address suffix.'],
          ['VyntraMarket', 'The HYPE/VYNTRA market and platform-token quote source.'],
          ['VyntraReserveTimelock', 'Enforces the public delay for reserve release proposals.'],
          ['VyntraReserveVault', 'Holds the platform-token reserve and applies allocation and release limits.'],
          ['VyntraFeeRouter', 'Splits protocol HYPE fees between the buyback vault and operations treasury.'],
          ['VyntraBuybackVault', 'Runs capped VYNTRA buybacks and sends acquired tokens to the burn address.'],
          ['VyntraBoard', 'Stores on-chain replies for launches and the platform token.'],
          ['VyntraPromotion', 'Handles paid featured placement using VYNTRA.'],
          ['VyntraKeeper', 'Allows anyone to trigger eligible protocol maintenance actions.'],
          ['Uniswap v4 PoolManager', 'Elysium v4 infrastructure used by graduated markets.'],
        ]} />,
      },
      {
        title: 'Where contract addresses are used',
        body: <p>The frontend uses the active <code>VyntraFactory</code>, <code>VyntraBoard</code>, and <code>VyntraPromotion</code> contracts, plus the platform-token contracts above. The indexer reads the active factory and board, and also reads the VYNTRA market, token, and reserve vault. The MCP server needs the factory and RPC; its indexer and platform-market reads are optional. Use the deployment output to enter contract addresses in each service&apos;s private configuration.</p>,
      },
      {
        title: 'Indexer and factory migration',
        body: <><p>Run the indexer on Elysium Testnet with a durable database. Keep the indexer&apos;s existing database and checkpoint when upgrading the factory; imported launch records remain available, and the indexer continues reading future activity from the new factory.</p><p>After a factory migration, configure the new <code>VyntraFactory</code>, <code>VyntraBoard</code>, and <code>VyntraPromotion</code> addresses for new activity. Keep the previous Board and Promotion contracts as legacy readers so older replies and placements remain visible. Store database and scheduled-sync credentials in the indexer host&apos;s server-side settings.</p></>,
      },
      {
        title: 'Keep signing credentials private',
        body: <Callout title="Your wallet controls transactions" tone="amber">Never publish a deployer key, seed phrase, or database credential. The app and MCP prepare reads or unsigned transaction data; your wallet signs transactions. Keep database and scheduled indexer credentials in the indexer host&apos;s private settings.</Callout>,
      },
    ],
  },
  {
    slug: 'agents-mcp',
    group: 'Build',
    title: 'Vyntra for agents (MCP)',
    summary: 'Connect an MCP-compatible agent to Vyntra reads and unsigned transaction preparation.',
    keywords: 'MCP agent Codex Claude Cursor install tools launch trade wallet read only',
    sections: [
      {
        title: 'What this MCP can do',
        body: <><p>The local Vyntra MCP server reads the Elysium factory and Vyntra indexer. It can search launches, inspect a pool, read indexed trades and wallet activity, and get live launch or platform quotes.</p><p>It can also prepare unsigned launches with project links and an optional opening buy. A factory that supports creator payout settings can prepare a launch with a selected creator fee wallet. It also prepares buy, sell, and fee-claim transactions. Your wallet reviews and signs each transaction separately.</p></>,
      },
      {
        title: 'What it cannot do',
        body: <Callout title="The wallet stays in control" tone="green">The server does not request or store private keys, sign transactions, submit transactions, or fund wallets. It returns transaction fields for a compatible wallet or agent client to review. Quotes may change before signing.</Callout>,
      },
      {
        title: 'Install and configure',
        body: <><p>Use Node.js 20 or newer. From the repository, install the MCP package dependencies:</p><CodeBlock code={'cd mcp\nnpm install'} /><p>Configure the MCP host with the deployed <code>VyntraFactory</code> address and Elysium Testnet RPC. Add the indexer endpoint for indexed activity, and the <code>VyntraMarket</code> and <code>VYNTRA</code> addresses for platform-token quotes. Keep this connection configuration on your local MCP host.</p></>,
      },
      {
        title: 'Example MCP host command',
        body: <p>Point your MCP-compatible client at the local server using the package path. Add the deployed <code>VyntraFactory</code> address and optional indexer and platform-market addresses in the host&apos;s local connection settings. Each MCP host stores these settings in a different place. Restart the host, then inspect the available Vyntra tools before using them.</p>,
      },
      {
        title: 'Available tools',
        body: <ul><li><code>vyntra_search_launches</code> and <code>vyntra_get_launch</code></li><li><code>vyntra_get_stats</code>, <code>vyntra_get_launch_trades</code>, and <code>vyntra_get_wallet_activity</code> (indexer required)</li><li><code>vyntra_get_trade_quote</code></li><li><code>vyntra_prepare_launch</code> with the 7f7 vanity check, profile links, optional first buy, and supported creator payout selection</li><li><code>vyntra_prepare_trade</code>, including an approval step when a sell needs one</li><li><code>vyntra_prepare_creator_fee_claim</code></li></ul>,
      },
      {
        title: 'Keep approvals explicit',
        body: <p>Ask the agent for a quote or unsigned transaction first. Review the chain, token, recipient, value, approval amount, and minimum output in your wallet before signing. The server is a transaction-preparation tool, not a wallet or autonomous trader.</p>,
      },
    ],
  },
]

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function DocLink({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-4 transition hover:border-[var(--vyntra-border-strong)] hover:bg-[var(--vyntra-elev)]">
      <span className="font-semibold text-[var(--vyntra-fg)]">{title}</span>
      <span className="mt-1 block text-sm leading-relaxed text-[var(--vyntra-muted)]">{text}</span>
      <ArrowRight className="mt-3 h-4 w-4 text-[var(--vyntra-primary)] transition group-hover:translate-x-1" />
    </Link>
  )
}

function Callout({ title, tone, children }: { title: string; tone: 'amber' | 'violet' | 'green'; children: ReactNode }) {
  const colors = {
    amber: 'border-amber-500/30 bg-amber-500/[0.07] text-amber-950 dark:text-amber-100',
    violet: 'border-violet-500/25 bg-violet-500/[0.06] text-violet-950 dark:text-violet-100',
    green: 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-950 dark:text-emerald-100',
  }
  return (
    <aside className={`rounded-xl border p-4 ${colors[tone]}`}>
      <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4" />{title}</div>
      <div className="mt-2 text-sm leading-relaxed opacity-90">{children}</div>
    </aside>
  )
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="relative overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)]">
      <button
        type="button"
        className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] px-2.5 py-1.5 text-xs text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          })
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto p-4 pr-20 text-xs leading-relaxed text-[var(--vyntra-fg)] sm:text-sm"><code>{code}</code></pre>
    </div>
  )
}

function InfoTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--vyntra-border)]">
      <table className="w-full min-w-[520px] border-collapse text-left text-sm">
        <thead className="bg-[var(--vyntra-elev)] text-[var(--vyntra-faint)]">
          <tr><th className="px-3 py-2.5 font-semibold">Contract</th><th className="px-3 py-2.5 font-semibold">Purpose</th></tr>
        </thead>
        <tbody>
          {rows.map(([name, purpose]) => (
            <tr key={name} className="border-t border-[var(--vyntra-border)] align-top">
              <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-[var(--vyntra-primary)]">{name}</td>
              <td className="px-3 py-2.5 leading-relaxed text-[var(--vyntra-muted)]">{purpose}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Docs({ fixedSlug }: { fixedSlug?: string }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const currentSlug = fixedSlug ?? slug ?? 'welcome'
  const current = docPages.find((page) => page.slug === currentSlug) ?? docPages[0]
  const filteredPages = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return docPages
    return docPages.filter((page) => `${page.title} ${page.summary} ${page.keywords} ${page.group}`.toLowerCase().includes(term))
  }, [search])
  const currentIndex = docPages.findIndex((page) => page.slug === current.slug)
  const previous = docPages[currentIndex - 1]
  const next = docPages[currentIndex + 1]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    document.title = `${current.title} | Vyntra Docs`
    return () => {
      document.title = 'Vyntra'
    }
  }, [current])

  const pathFor = (page: DocPage) => page.slug === 'welcome' ? '/docs' : `/docs/${page.slug}`

  return (
    <div className="min-h-screen bg-[var(--vyntra-bg)] text-[var(--vyntra-fg)]">
      <header className="sticky top-0 z-40 border-b border-[var(--vyntra-border)] bg-[var(--vyntra-bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="flex shrink-0 items-center gap-2">
              <img src={VYNTRA_LOGO} alt="" className="h-8 w-8 rounded-md object-cover" />
              <span className="font-display text-xl font-bold">Vyntra</span>
            </Link>
            <span className="text-[var(--vyntra-faint)]">/</span>
            <Link to="/docs" className="truncate text-sm font-medium text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]">Docs</Link>
            <span className="chip hidden sm:inline-flex">Elysium Testnet</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/apps/mcp" className="btn-ghost hidden px-3 py-2 text-sm sm:inline-flex"><Bot className="h-4 w-4" />For agents</Link>
            <Link to="/markets" className="btn-primary px-3 py-2 text-sm">Open app<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1440px] gap-8 px-4 py-7 sm:px-6 lg:grid-cols-[230px_minmax(0,760px)_190px] lg:gap-12 lg:py-10">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--vyntra-faint)]" />
              <input
                ref={searchRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="input w-full pl-9 pr-12 text-sm"
                placeholder="Search docs"
                aria-label="Search documentation"
              />
              <kbd className="absolute right-2.5 top-2.5 rounded border border-[var(--vyntra-border)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--vyntra-faint)]">⌘K</kbd>
            </div>
            <nav className="mt-7 space-y-6" aria-label="Documentation sections">
              {Array.from(new Set(filteredPages.map((page) => page.group))).map((group) => (
                <div key={group}>
                  <p className="mb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">{group}</p>
                  <div className="space-y-0.5">
                    {filteredPages.filter((page) => page.group === group).map((page) => (
                      <Link
                        key={page.slug}
                        to={pathFor(page)}
                        className={`block rounded-lg px-2.5 py-2 text-sm transition ${page.slug === current.slug ? 'bg-[rgba(124,58,237,0.1)] font-semibold text-[var(--vyntra-primary)]' : 'text-[var(--vyntra-muted)] hover:bg-[var(--vyntra-elev)] hover:text-[var(--vyntra-fg)]'}`}
                      >
                        {page.title}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {filteredPages.length === 0 ? <p className="px-2 text-sm text-[var(--vyntra-faint)]">No matching pages.</p> : null}
            </nav>
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:hidden">
            <label className="relative block flex-1">
              <span className="sr-only">Choose a documentation page</span>
              <select
                value={current.slug}
                onChange={(event) => navigate(pathFor(docPages.find((page) => page.slug === event.target.value) ?? docPages[0]))}
                className="input w-full appearance-none pr-10"
              >
                {docPages.map((page) => <option key={page.slug} value={page.slug}>{page.group} · {page.title}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[var(--vyntra-faint)]" />
            </label>
            <label className="relative block flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--vyntra-faint)]" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} className="input w-full pl-9" placeholder="Filter docs" aria-label="Filter documentation" />
            </label>
          </div>

          <div className="mb-5 flex items-center gap-2 text-xs text-[var(--vyntra-faint)]">
            <BookOpen className="h-3.5 w-3.5" />{current.group}<span>/</span><span>{current.title}</span>
          </div>
          <article>
            <h1 className="page-title text-4xl sm:text-5xl">{current.title}</h1>
            <p className="mt-4 max-w-3xl text-lg leading-relaxed text-[var(--vyntra-muted)]">{current.summary}</p>
            {current.slug === 'welcome' ? (
              <div className="mt-7 flex flex-wrap gap-3">
                <Link to="/markets" className="btn-primary">Browse markets<ArrowRight className="h-4 w-4" /></Link>
                <Link to="/apps/mcp" className="btn-ghost"><Bot className="h-4 w-4" />Connect an agent</Link>
              </div>
            ) : null}
            <div className="mt-10 space-y-10">
              {current.sections.map((section) => (
                <section key={section.title} id={slugify(section.title)} className="scroll-mt-24">
                  <h2 className="mb-3 border-b border-[var(--vyntra-border)] pb-2 font-display text-2xl font-bold tracking-tight">{section.title}</h2>
                  <div className="doc-prose space-y-4 text-[15px] leading-7 text-[var(--vyntra-muted)]">{section.body}</div>
                </section>
              ))}
            </div>
          </article>

          <div className="mt-12 grid gap-3 border-t border-[var(--vyntra-border)] pt-6 sm:grid-cols-2">
            {previous ? <Link to={pathFor(previous)} className="rounded-xl border border-[var(--vyntra-border)] p-4 transition hover:bg-[var(--vyntra-elev)]"><span className="inline-flex items-center gap-1 text-xs text-[var(--vyntra-faint)]"><ArrowLeft className="h-3 w-3" />Previous</span><span className="mt-1 block font-semibold">{previous.title}</span></Link> : <div />}
            {next ? <Link to={pathFor(next)} className="rounded-xl border border-[var(--vyntra-border)] p-4 text-right transition hover:bg-[var(--vyntra-elev)]"><span className="inline-flex items-center gap-1 text-xs text-[var(--vyntra-faint)]">Next<ArrowRight className="h-3 w-3" /></span><span className="mt-1 block font-semibold">{next.title}</span></Link> : null}
          </div>
        </main>

        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <p className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">On this page</p>
            <nav className="space-y-2 border-l border-[var(--vyntra-border)] pl-3">
              {current.sections.map((section) => (
                <a key={section.title} href={`#${slugify(section.title)}`} className="block text-xs leading-relaxed text-[var(--vyntra-muted)] hover:text-[var(--vyntra-primary)]">{section.title}</a>
              ))}
            </nav>
            <Link to="/apps/mcp" className="mt-8 block rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)] p-3 text-sm transition hover:border-[var(--vyntra-border-strong)]">
              <span className="flex items-center gap-2 font-semibold"><Bot className="h-4 w-4 text-[var(--vyntra-primary)]" />For agents</span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--vyntra-muted)]">Connect the read and transaction-preparation tools.</span>
            </Link>
          </div>
        </aside>
      </div>

      <footer className="border-t border-[var(--vyntra-border)] px-4 py-6 text-center text-xs text-[var(--vyntra-faint)]">
        <span>Vyntra docs · Elysium Testnet · </span>
        <a href="https://explorer-elysium-testnet.t.conduit.xyz" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-[var(--vyntra-fg)]">Explorer<ExternalLink className="h-3 w-3" /></a>
        <span> · </span>
        <Link to="/apps/mcp" className="hover:text-[var(--vyntra-fg)]">For agents</Link>
        <span> · </span>
        <Link to="/markets" className="hover:text-[var(--vyntra-fg)]">Open Vyntra</Link>
      </footer>
    </div>
  )
}

export function VyntraAgentsPage() {
  return <Docs fixedSlug="agents-mcp" />
}
