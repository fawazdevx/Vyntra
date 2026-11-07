import { useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatEther } from 'viem'
import { Link } from 'react-router-dom'
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { activeChain } from '../lib/chains'
import { erc20Abi, vyntraPromotionAbi } from '../lib/abis'
import { explorerTx, formatNative, VYNTRA_PROMOTION, VYNTRA_TOKEN, type LaunchView } from '../lib/config'
import { formatUserError } from '../lib/errors'

const DURATION_OPTIONS = [1, 3, 7] as const

export function LaunchPromotionControl({ launch }: { launch: LaunchView }) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [durationDays, setDurationDays] = useState<(typeof DURATION_OPTIONS)[number]>(1)
  const [txAction, setTxAction] = useState<'approve' | 'feature' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [approvalConfirmed, setApprovalConfirmed] = useState(false)

  const configured = Boolean(VYNTRA_TOKEN && VYNTRA_PROMOTION)
  const isCreator = Boolean(address && address.toLowerCase() === launch.creator.toLowerCase())
  const onWrongChain = isConnected && chainId !== activeChain.id

  const { data: feePerDay } = useReadContract({
    address: VYNTRA_PROMOTION,
    abi: vyntraPromotionAbi,
    functionName: 'feePerDay',
    query: { enabled: Boolean(VYNTRA_PROMOTION), staleTime: 30_000 },
  })
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: VYNTRA_TOKEN,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && VYNTRA_PROMOTION ? [address, VYNTRA_PROMOTION] : undefined,
    query: { enabled: Boolean(VYNTRA_TOKEN && VYNTRA_PROMOTION && address) },
  })
  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: VYNTRA_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(VYNTRA_TOKEN && address) },
  })
  const { data: featuredUntil, refetch: refetchFeatured } = useReadContract({
    address: VYNTRA_PROMOTION,
    abi: vyntraPromotionAbi,
    functionName: 'featuredUntil',
    args: [launch.token],
    query: { enabled: Boolean(VYNTRA_PROMOTION), refetchInterval: 30_000 },
  })

  const cost = (feePerDay ?? 0n) * BigInt(durationDays)
  const hasEnoughVyntra = tokenBalance != null && tokenBalance >= cost
  const requiresApproval = (allowance ?? 0n) < cost && !approvalConfirmed
  const now = BigInt(Math.floor(Date.now() / 1000))
  const currentEnd = (featuredUntil ?? 0n) > now ? featuredUntil! : now
  const horizonValid = currentEnd + BigInt(durationDays * 86_400) <= now + 30n * 86_400n
  const currentlyFeatured = Boolean(featuredUntil && featuredUntil > now)
  const featureEnd = currentlyFeatured && featuredUntil
    ? new Date(Number(featuredUntil) * 1000).toLocaleString()
    : null

  const { writeContractAsync, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const {
    isLoading: confirming,
    isSuccess,
    isError: receiptFailed,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess || !txAction) return
    if (txAction === 'approve') {
      setApprovalConfirmed(true)
      setMessage('Approval confirmed. You can now feature this launch.')
    } else {
      setApprovalConfirmed(false)
      setMessage('Featured placement is active. The VYNTRA fee was sent to the burn address.')
      void refetchFeatured()
    }
    void refetchAllowance()
    void refetchTokenBalance()
    setTxAction(null)
  }, [isSuccess, txAction, refetchAllowance, refetchFeatured, refetchTokenBalance])

  useEffect(() => {
    if (!receiptFailed || !txAction) return
    setMessage(formatUserError(receiptError, 'The transaction was not confirmed. Check the wallet and retry.'))
    setTxAction(null)
  }, [receiptFailed, receiptError, txAction])

  async function submit() {
    if (
      !address || !VYNTRA_TOKEN || !VYNTRA_PROMOTION || cost === 0n
      || !hasEnoughVyntra || !horizonValid
    ) return
    setMessage(null)
    reset()
    const action = requiresApproval ? 'approve' : 'feature'
    setTxAction(action)
    try {
      if (action === 'approve') {
        await writeContractAsync({
          address: VYNTRA_TOKEN,
          abi: erc20Abi,
          functionName: 'approve',
          args: [VYNTRA_PROMOTION, cost],
          chainId: activeChain.id,
        })
      } else {
        await writeContractAsync({
          address: VYNTRA_PROMOTION,
          abi: vyntraPromotionAbi,
          functionName: 'feature',
          args: [launch.token, durationDays],
          chainId: activeChain.id,
        })
      }
    } catch (error) {
      setTxAction(null)
      setMessage(formatUserError(error, 'Transaction failed. Try again.'))
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
          Creator utility
        </p>
        <h2 className="mt-1 font-display text-lg font-bold">Featured placement</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--vyntra-muted)]">
          Creators can pay in $VYNTRA to feature this launch in Markets. The fee is sent to the burn address.
          Placement is labeled and does not promise trading activity.
        </p>
      </div>

      {currentlyFeatured && featureEnd ? (
        <p className="rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] px-3 py-2 text-sm text-[var(--vyntra-success)]">
          Featured placement active until {featureEnd}
        </p>
      ) : null}

      {!configured ? (
        <p className="text-sm text-[var(--vyntra-muted)]">Promotion contract addresses are not configured.</p>
      ) : !isConnected ? (
        <div className="flex justify-center"><ConnectButton /></div>
      ) : !isCreator ? (
        <p className="text-sm text-[var(--vyntra-muted)]">Only this token&apos;s creator can purchase a feature.</p>
      ) : onWrongChain ? (
        <button
          type="button"
          className="btn-primary w-full"
          disabled={switching}
          onClick={() => switchChain({ chainId: activeChain.id })}
        >
          {switching ? 'Switching…' : 'Switch to Elysium Testnet'}
        </button>
      ) : (
        <>
          <label className="block space-y-2 text-sm">
            <span className="text-[var(--vyntra-muted)]">Duration</span>
            <select
              className="input w-full font-mono"
              value={durationDays}
              onChange={(event) => {
                setDurationDays(Number(event.target.value) as (typeof DURATION_OPTIONS)[number])
                setApprovalConfirmed(false)
                setMessage(null)
              }}
            >
              {DURATION_OPTIONS.map((days) => (
                <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>
              ))}
            </select>
          </label>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--vyntra-muted)]">Fee (burned)</span>
            <span className="font-mono font-semibold">{formatNative(cost)} VYNTRA</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--vyntra-muted)]">Your balance</span>
            <span className="font-mono">{tokenBalance != null ? `${formatNative(tokenBalance)} VYNTRA` : 'Checking…'}</span>
          </div>
          <p className="text-xs text-[var(--vyntra-faint)]">
            {feePerDay != null ? `${formatEther(feePerDay)} VYNTRA per day · max 7 days per purchase` : 'Loading fee…'}
          </p>
          {!hasEnoughVyntra && tokenBalance != null ? (
            <Link to="/vyntra" className="btn-ghost w-full justify-center">
              Get VYNTRA to feature this launch
            </Link>
          ) : null}
          {!horizonValid ? (
            <p className="text-xs text-amber-600 dark:text-amber-300">
              Featured placement can only be extended up to 30 days ahead. Choose a shorter duration or try again later.
            </p>
          ) : null}
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => void submit()}
            disabled={isPending || confirming || cost === 0n || feePerDay == null || !hasEnoughVyntra || !horizonValid}
          >
            {isPending || confirming
              ? txAction === 'approve' ? 'Confirm VYNTRA approval…' : 'Confirm feature…'
              : tokenBalance == null ? 'Checking VYNTRA balance…'
              : !hasEnoughVyntra ? 'Insufficient VYNTRA'
                : !horizonValid ? '30-day limit reached'
                  : requiresApproval
                ? `Approve ${formatNative(cost)} VYNTRA`
                : `Feature for ${durationDays} ${durationDays === 1 ? 'day' : 'days'}`}
          </button>
        </>
      )}

      {(message || writeError) && (
        <p className="text-center text-sm text-[var(--vyntra-muted)]">
          {message || formatUserError(writeError, 'Transaction failed. Try again.')}
        </p>
      )}
      {hash ? (
        <a
          href={explorerTx(hash, activeChain.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-full items-center justify-center gap-1.5 font-mono text-xs text-[var(--vyntra-muted)] hover:text-[var(--vyntra-primary)]"
        >
          View transaction
        </a>
      ) : null}
    </section>
  )
}
