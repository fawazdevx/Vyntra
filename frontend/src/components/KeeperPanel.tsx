import { useMemo, useState } from 'react'
import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { RefreshCw, Zap } from 'lucide-react'
import { vyntraKeeperAbi } from '../lib/abis'
import { activeChain } from '../lib/chains'
import { useLaunches } from '../hooks/useLaunches'
import { explorerTx, isKeeperConfigured, KEEPER_ADDRESS, ZERO_ADDRESS } from '../lib/config'
import { formatUserError } from '../lib/errors'

/** Permissionless sweep UI: protocol fees → buyback burn + meme tax automation. */
export function KeeperPanel() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { data: launches = [], refetch, isFetching } = useLaunches()
  const [msg, setMsg] = useState<string | null>(null)

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const onWrongChain = isConnected && chainId !== activeChain.id

  const { curves, splitters } = useMemo(() => {
    const curves: `0x${string}`[] = []
    const splitters: `0x${string}`[] = []
    for (const l of launches) {
      if (l.curve && l.curve !== ZERO_ADDRESS) curves.push(l.curve)
      if (l.splitter && l.splitter !== ZERO_ADDRESS && !l.migrated) splitters.push(l.splitter)
    }
    return { curves, splitters }
  }, [launches])

  function runSweep() {
    setMsg(null)
    reset()
    if (!isKeeperConfigured) {
      setMsg('Set VITE_KEEPER_ADDRESS after deploy.')
      return
    }
    if (!isConnected) {
      setMsg('Connect a wallet to run the keeper.')
      return
    }
    if (onWrongChain) {
      setMsg('Switch to BOT Chain first.')
      return
    }
    if (curves.length === 0 && splitters.length === 0) {
      setMsg('No markets to sweep yet.')
      return
    }
    writeContract({
      address: KEEPER_ADDRESS,
      abi: vyntraKeeperAbi,
      functionName: 'sweepAll',
      args: [curves, splitters, 0n],
      chainId: activeChain.id,
    })
  }

  if (!isKeeperConfigured) {
    return (
      <div className="card px-5 py-5 text-sm text-[var(--vyntra-muted)]">
        Keeper comes online after redeploy sets{' '}
        <span className="font-mono">VITE_KEEPER_ADDRESS</span>. Cron:{' '}
        <span className="font-mono">./scripts/run-keeper.sh</span>
      </div>
    )
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vyntra-border)] px-5 py-4">
        <div>
          <p className="page-kicker mb-1">Automation</p>
          <h2 className="font-display text-xl">Keeper</h2>
          <p className="mt-1 max-w-xl text-sm text-[var(--vyntra-muted)]">
            Permissionless sweep: claim protocol fees → 80/20 distribute → buy &amp; burn $VYNTRA,
            then meme tax buyback + LP inject. Migrated BDEX markets are skipped for tax actions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {!isConnected ? (
            <ConnectButton />
          ) : onWrongChain ? (
            <button
              type="button"
              className="btn-ghost px-3 py-2 text-sm"
              disabled={switching}
              onClick={() => switchChain({ chainId: activeChain.id })}
            >
              Switch network
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary px-4 py-2.5 text-sm"
              disabled={isPending || confirming}
              onClick={runSweep}
            >
              <Zap className="h-4 w-4" />
              {isPending || confirming ? 'Sweeping…' : 'Run sweep'}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
        <div>
          <div className="label">Curves in batch</div>
          <div className="mt-1 font-mono text-lg">{curves.length}</div>
        </div>
        <div>
          <div className="label">Splitters in batch</div>
          <div className="mt-1 font-mono text-lg">{splitters.length}</div>
        </div>
        <div>
          <div className="label">Markets</div>
          <div className="mt-1 font-mono text-lg">{launches.length}</div>
        </div>
      </div>

      {(msg || error) && (
        <p className="border-t border-[var(--vyntra-border)] px-5 py-3 text-sm text-[var(--vyntra-danger)]">
          {msg || formatUserError(error, 'Sweep failed.')}
        </p>
      )}
      {isSuccess && (
        <p className="border-t border-[var(--vyntra-border)] px-5 py-3 text-sm text-[var(--vyntra-success)]">
          Sweep confirmed.{' '}
          {hash && (
            <a
              href={explorerTx(hash, activeChain.id)}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              View tx
            </a>
          )}
        </p>
      )}
    </section>
  )
}
