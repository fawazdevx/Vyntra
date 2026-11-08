import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { MessageCircle, Send } from 'lucide-react'
import { vyntraBoardAbi } from '../lib/abis'
import { activeChain } from '../lib/chains'
import {
  BOARD_ADDRESS,
  isBoardConfigured,
  LEGACY_BOARD_ADDRESS,
  shortAddr,
} from '../lib/config'
import { formatUserError } from '../lib/errors'

const MAX_BODY = 280

type Reply = {
  author: `0x${string}`
  createdAt: bigint
  body: string
}

type Props = {
  launchId: number
  tokenSymbol?: string
  /** When true, copy mentions platform thread (launchId 0). */
  platformThread?: boolean
}

export function ReplyThread({ launchId, tokenSymbol, platformThread }: Props) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [body, setBody] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const enabled = isBoardConfigured && launchId >= 0
  const legacyEnabled = Boolean(
    LEGACY_BOARD_ADDRESS &&
    LEGACY_BOARD_ADDRESS.toLowerCase() !== BOARD_ADDRESS.toLowerCase() &&
    launchId >= 0,
  )

  const { data: count, refetch: refetchCount } = useReadContract({
    address: BOARD_ADDRESS,
    abi: vyntraBoardAbi,
    functionName: 'getReplyCount',
    args: [BigInt(launchId)],
    query: { enabled, refetchInterval: 12_000 },
  })

  const {
    data: legacyCount,
    refetch: refetchLegacyCount,
  } = useReadContract({
    address: LEGACY_BOARD_ADDRESS,
    abi: vyntraBoardAbi,
    functionName: 'getReplyCount',
    args: [BigInt(launchId)],
    query: { enabled: legacyEnabled, refetchInterval: 12_000 },
  })

  const replyCount = Number(count ?? 0n)
  const legacyReplyCount = Number(legacyCount ?? 0n)
  const totalReplyCount = replyCount + legacyReplyCount
  const pageSize = Math.min(50, Math.max(replyCount, 1))
  const legacyPageSize = Math.min(50, Math.max(legacyReplyCount, 1))

  const { data: page, refetch: refetchPage } = useReadContract({
    address: BOARD_ADDRESS,
    abi: vyntraBoardAbi,
    functionName: 'getReplies',
    args: [BigInt(launchId), 0n, BigInt(pageSize)],
    query: { enabled: enabled && replyCount > 0, refetchInterval: 12_000 },
  })

  const {
    data: legacyPage,
    refetch: refetchLegacyPage,
  } = useReadContract({
    address: LEGACY_BOARD_ADDRESS,
    abi: vyntraBoardAbi,
    functionName: 'getReplies',
    args: [BigInt(launchId), 0n, BigInt(legacyPageSize)],
    query: { enabled: legacyEnabled && legacyReplyCount > 0, refetchInterval: 12_000 },
  })

  const replies = useMemo(() => {
    const current = (page as Reply[] | undefined) ?? []
    const legacy = (legacyPage as Reply[] | undefined) ?? []
    return [...current, ...legacy].sort((a, b) => Number(b.createdAt - a.createdAt))
  }, [page, legacyPage])

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const onWrongChain = isConnected && chainId !== activeChain.id

  useEffect(() => {
    if (!isSuccess) return
    setBody('')
    setMsg('Reply posted on-chain.')
    refetchCount()
    refetchPage()
    refetchLegacyCount()
    refetchLegacyPage()
  }, [isSuccess, refetchCount, refetchPage, refetchLegacyCount, refetchLegacyPage])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    reset()
    const trimmed = body.trim()
    if (!trimmed) {
      setMsg('Write something first.')
      return
    }
    if (trimmed.length > MAX_BODY) {
      setMsg(`Max ${MAX_BODY} characters.`)
      return
    }
    if (!isConnected) {
      setMsg('Connect a wallet to reply.')
      return
    }
    if (onWrongChain) {
      setMsg('Switch to Elysium Testnet to continue.')
      return
    }
    writeContract({
      address: BOARD_ADDRESS,
      abi: vyntraBoardAbi,
      functionName: 'postReply',
      args: [BigInt(launchId), trimmed],
      chainId: activeChain.id,
    })
  }

  if (!isBoardConfigured) {
    return (
      <div className="card px-5 py-6 text-sm text-[var(--vyntra-muted)]">
        Replies come online after the next deploy sets <span className="font-mono">VITE_BOARD_ADDRESS</span>.
      </div>
    )
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--vyntra-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-[var(--vyntra-muted)]" />
          <h2 className="font-display text-lg">
            Replies{tokenSymbol ? ` · $${tokenSymbol}` : ''}{platformThread ? ' · platform' : ''}
          </h2>
        </div>
          <span className="chip">{totalReplyCount}</span>
      </div>

      <form onSubmit={submit} className="space-y-3 border-b border-[var(--vyntra-border)] px-5 py-4">
        <textarea
          className="input min-h-[88px] resize-y"
          value={body}
          maxLength={MAX_BODY}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Say something on-chain… (gas on HYPE)"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="font-mono text-xs text-[var(--vyntra-faint)]">
            {body.trim().length}/{MAX_BODY}
            {address ? ` · ${shortAddr(address)}` : ''}
          </span>
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
              type="submit"
              className="btn-primary px-4 py-2.5 text-sm"
              disabled={isPending || confirming || !body.trim()}
            >
              <Send className="h-4 w-4" />
              {isPending || confirming ? 'Confirm…' : 'Post reply'}
            </button>
          )}
        </div>
        {(msg || error) && (
          <p className={`text-sm ${error ? 'text-[var(--vyntra-danger)]' : 'text-[var(--vyntra-success)]'}`}>
            {msg || formatUserError(error, 'Reply failed.')}
          </p>
        )}
      </form>

      <div className="divide-y divide-[var(--vyntra-border)]">
        {totalReplyCount === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[var(--vyntra-muted)]">
            No replies yet. Be the first voice here.
          </p>
        ) : (
          replies.map((r, i) => (
            <article key={`${r.author}-${r.createdAt.toString()}-${i}`} className="px-5 py-4">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--vyntra-faint)]">
                <span className="font-mono text-[var(--vyntra-muted)]">{shortAddr(r.author)}</span>
                <span>·</span>
                <time dateTime={new Date(Number(r.createdAt) * 1000).toISOString()}>
                  {new Date(Number(r.createdAt) * 1000).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--vyntra-fg)]">
                {r.body}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  )
}
