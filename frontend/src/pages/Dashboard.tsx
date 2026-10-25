import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useAccount,
  useChainId,
  useReadContracts,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Coins, ExternalLink, Wallet, TrendingUp, Layers } from 'lucide-react'
import { bondingCurveAbi, revenueSplitterAbi } from '../lib/abis'
import { botTestnet } from '../lib/chains'
import { useCreatorLaunches } from '../hooks/useLaunches'
import { explorerTx, formatBot, shortAddr, type LaunchView } from '../lib/config'
import { formatUserError } from '../lib/errors'
import { KeeperPanel } from '../components/KeeperPanel'
import { zeroAddress } from 'viem'

type ClaimKind = 'fees' | 'funds' | 'buyback' | 'dividends' | 'liquidity'

export function Dashboard() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: launches = [], all = [], isLoading, refetch } = useCreatorLaunches(address)
  const [claimingKey, setClaimingKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const onWrongChain = isConnected && chainId !== botTestnet.id
  const totalFeesEst = launches.reduce((sum, l) => sum + Number(l.creatorFees) / 1e18, 0)
  const graduated = launches.filter((l) => l.graduated).length
  const shown = isConnected ? launches : []

  const splitterReads = useReadContracts({
    contracts: shown.flatMap((l) =>
      l.splitter && l.splitter !== zeroAddress
        ? ([
            {
              address: l.splitter,
              abi: revenueSplitterAbi,
              functionName: 'fundsAccrued' as const,
            },
            {
              address: l.splitter,
              abi: revenueSplitterAbi,
              functionName: 'buybackAccrued' as const,
            },
            {
              address: l.splitter,
              abi: revenueSplitterAbi,
              functionName: 'dividendsAccrued' as const,
            },
            {
              address: l.splitter,
              abi: revenueSplitterAbi,
              functionName: 'liquidityAccrued' as const,
            },
          ] as const)
        : [],
    ),
    query: { enabled: shown.some((l) => l.splitter && l.splitter !== zeroAddress) },
  })

  function splitterAccruals(launch: LaunchView) {
    const taxed = shown.filter((l) => l.splitter && l.splitter !== zeroAddress)
    const idx = taxed.findIndex((l) => l.id === launch.id)
    if (idx < 0 || !splitterReads.data) {
      return { funds: 0n, buyback: 0n, dividends: 0n, liquidity: 0n }
    }
    const base = idx * 4
    const num = (i: number) => {
      const r = splitterReads.data?.[base + i]
      return r && r.status === 'success' ? (r.result as bigint) : 0n
    }
    return {
      funds: num(0),
      buyback: num(1),
      dividends: num(2),
      liquidity: num(3),
    }
  }

  function runClaim(
    key: string,
    fn: () => void,
  ) {
    setMsg(null)
    reset()
    if (onWrongChain) {
      setMsg('Switch to BOT Chain first.')
      return
    }
    setClaimingKey(key)
    fn()
  }

  function claimFees(curve: `0x${string}`) {
    runClaim(`fees-${curve}`, () => {
      writeContract({
        address: curve,
        abi: bondingCurveAbi,
        functionName: 'claimCreatorFees',
        chainId: botTestnet.id,
      })
    })
  }

  function claimTax(kind: ClaimKind, launch: LaunchView) {
    if (!launch.splitter || launch.splitter === zeroAddress) return
    const accruals = splitterAccruals(launch)
    runClaim(`${kind}-${launch.splitter}`, () => {
      if (kind === 'funds') {
        writeContract({
          address: launch.splitter,
          abi: revenueSplitterAbi,
          functionName: 'claimFunds',
          chainId: botTestnet.id,
        })
      } else if (kind === 'buyback') {
        writeContract({
          address: launch.splitter,
          abi: revenueSplitterAbi,
          functionName: 'buyAndBurnMeme',
          args: [accruals.buyback, 0n],
          chainId: botTestnet.id,
        })
      } else if (kind === 'dividends') {
        writeContract({
          address: launch.splitter,
          abi: revenueSplitterAbi,
          functionName: 'claimDividends',
          chainId: botTestnet.id,
        })
      } else if (kind === 'liquidity') {
        writeContract({
          address: launch.splitter,
          abi: revenueSplitterAbi,
          functionName: 'injectLiquidity',
          args: [accruals.liquidity],
          chainId: botTestnet.id,
        })
      }
    })
  }

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="page-kicker mb-2">Studio</p>
          <h1 className="page-title text-4xl sm:text-5xl lg:text-6xl">Your launches</h1>
          <p className="mt-3 max-w-lg text-base text-[var(--vyntra-muted)] sm:text-lg">
            Coins you launched. Claim protocol creator fees and tax buckets anytime.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isConnected && <ConnectButton />}
          {isConnected && onWrongChain && (
            <button
              type="button"
              className="btn-ghost"
              disabled={switching}
              onClick={() => switchChain({ chainId: botTestnet.id })}
            >
              Switch network
            </button>
          )}
          <Link to="/spawn" className="btn-primary">
            New launch
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Layers} label="Your launches" value={isConnected ? String(shown.length) : '—'} />
        <Stat
          icon={TrendingUp}
          label="Claimable fees"
          value={isConnected ? `${formatBot(totalFeesEst)} BOT` : '—'}
          mono
        />
        <Stat icon={Wallet} label="Wallet" value={isConnected ? shortAddr(address) : 'Not connected'} />
      </div>

      <KeeperPanel />

      {!isConnected ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-16 text-center">
          <p className="text-[var(--vyntra-muted)]">Connect a wallet to see your launches.</p>
          <ConnectButton />
          <p className="text-xs text-[var(--vyntra-faint)]">{all.length} launches on Vyntra</p>
        </div>
      ) : (
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--vyntra-border)] px-5 py-4">
            <h2 className="font-display text-lg">Portfolio</h2>
            <span className="chip">{graduated} graduated</span>
          </div>

          {isLoading ? (
            <div className="px-6 py-12 text-center text-[var(--vyntra-muted)]">Loading…</div>
          ) : shown.length === 0 ? (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--vyntra-elev)] text-[var(--vyntra-muted)]">
                <Coins className="h-6 w-6" />
              </div>
              <div>
                <p className="font-display text-lg">No launches for this wallet</p>
                <p className="mt-1 text-sm text-[var(--vyntra-muted)]">
                  Launch your first coin on Vyntra.
                </p>
              </div>
              <Link to="/spawn" className="btn-primary">
                Launch a coin
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[var(--vyntra-border)]">
              {shown.map((l) => {
                const progress = Math.min(100, l.progressBps / 100)
                const fees = Number(l.creatorFees) / 1e18
                const hasTax = (l.buyTaxBps > 0 || l.sellTaxBps > 0) && l.splitter !== zeroAddress
                const accruals = hasTax ? splitterAccruals(l) : null
                const busy = isPending || confirming

                return (
                  <div key={l.id} className="space-y-4 px-5 py-5 transition hover:bg-[var(--vyntra-hover)]">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--vyntra-elev)] text-xs font-bold">
                          {l.symbol.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {l.name}{' '}
                            <span className="font-mono text-sm font-normal text-[var(--vyntra-muted)]">
                              ${l.symbol}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[var(--vyntra-faint)]">
                            <span className="font-mono text-[var(--vyntra-muted)]">
                              {formatBot(l.raisedBot)} BOT raised
                            </span>
                            <span className="font-mono text-[var(--vyntra-success)]">
                              {formatBot(fees)} BOT fees
                            </span>
                            <span>
                              {l.graduated ? 'Graduated' : `${progress.toFixed(0)}% to graduate`}
                            </span>
                            {hasTax && (
                              <span className="chip">
                                Tax {(l.buyTaxBps / 100).toFixed(0)}%/{(l.sellTaxBps / 100).toFixed(0)}%
                              </span>
                            )}
                          </div>
                          {!l.graduated && (
                            <div className="progress-track mt-2 max-w-[200px]">
                              <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:shrink-0">
                        <button
                          type="button"
                          className="btn-ghost px-3.5 py-2 text-sm"
                          disabled={busy || fees <= 0}
                          onClick={() => claimFees(l.curve)}
                        >
                          {claimingKey === `fees-${l.curve}` && busy ? 'Claiming…' : 'Claim fees'}
                        </button>
                        <Link to={`/token/${l.id}`} className="btn-ghost px-3.5 py-2 text-sm">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open
                        </Link>
                      </div>
                    </div>

                    {hasTax && accruals && (
                      <div className="grid gap-2 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-3 sm:grid-cols-2 lg:grid-cols-4">
                        <TaxBucket
                          label="Funds"
                          amount={accruals.funds}
                          busy={busy}
                          active={claimingKey === `funds-${l.splitter}`}
                          onClaim={() => claimTax('funds', l)}
                          claimLabel="Claim"
                        />
                        <TaxBucket
                          label="Buyback"
                          amount={accruals.buyback}
                          busy={busy}
                          active={claimingKey === `buyback-${l.splitter}`}
                          onClaim={() => claimTax('buyback', l)}
                          claimLabel="Burn"
                        />
                        <TaxBucket
                          label="Dividends"
                          amount={accruals.dividends}
                          busy={busy}
                          active={claimingKey === `dividends-${l.splitter}`}
                          onClaim={() => claimTax('dividends', l)}
                          claimLabel="Claim"
                        />
                        <TaxBucket
                          label="Liquidity"
                          amount={accruals.liquidity}
                          busy={busy}
                          active={claimingKey === `liquidity-${l.splitter}`}
                          onClaim={() => claimTax('liquidity', l)}
                          claimLabel="Inject"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {(msg || error) && (
        <p className="text-sm text-[var(--vyntra-danger)]">
          {msg || formatUserError(error, 'Claim failed. Try again.')}
        </p>
      )}
      {isSuccess && (
        <p className="text-sm text-[var(--vyntra-success)]">
          Claim confirmed.{' '}
          {hash && (
            <a
              href={explorerTx(hash, botTestnet.id)}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              View tx
            </a>
          )}
        </p>
      )}
      {isConnected && (
        <button
          type="button"
          className="text-xs text-[var(--vyntra-faint)] hover:text-[var(--vyntra-fg)]"
          onClick={() => {
            refetch()
            splitterReads.refetch()
          }}
        >
          Refresh portfolio
        </button>
      )}
    </div>
  )
}

function TaxBucket({
  label,
  amount,
  busy,
  active,
  onClaim,
  claimLabel,
}: {
  label: string
  amount: bigint
  busy: boolean
  active: boolean
  onClaim: () => void
  claimLabel: string
}) {
  const n = Number(amount) / 1e18
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--vyntra-elev)] px-3 py-2">
      <div>
        <div className="label">{label}</div>
        <div className="mt-0.5 font-mono text-sm">{formatBot(n)} BOT</div>
      </div>
      <button
        type="button"
        className="btn-ghost px-2.5 py-1.5 text-xs"
        disabled={busy || n <= 0}
        onClick={onClaim}
      >
        {active && busy ? '…' : claimLabel}
      </button>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Wallet
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-md bg-[var(--vyntra-elev)] text-[var(--vyntra-fg)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="label">{label}</div>
      <div
        className={`mt-2 truncate text-2xl font-bold sm:text-3xl ${mono ? 'font-mono' : 'font-display'}`}
      >
        {value}
      </div>
    </div>
  )
}
