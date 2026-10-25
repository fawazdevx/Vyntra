import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { parseEther, formatEther, maxUint256 } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { ArrowLeft, Check, Copy, ExternalLink, Share2, Sparkles } from 'lucide-react'
import { PriceChart } from '../components/PriceChart'
import { TradeTape } from '../components/TradeTape'
import { HoldersPanel } from '../components/HoldersPanel'
import { ReplyThread } from '../components/ReplyThread'
import { erc20Abi, vyntraMarketAbi } from '../lib/abis'
import { botTestnet } from '../lib/chains'
import {
  BUYBACK_VAULT,
  explorerAddress,
  explorerTx,
  formatBot,
  shortAddr,
  PLATFORM_REPLY_ID,
  VYNTRA_LOGO,
  VYNTRA_MARKET,
  VYNTRA_TOKEN,
} from '../lib/config'
import { formatUserError } from '../lib/errors'
import { usePlatformTrades } from '../hooks/usePlatformTrades'

const PCTS = [25, 50, 75, 100] as const
const TOTAL_SUPPLY = 1_000_000_000

function safeParseEther(value: string): bigint | null {
  const v = value.trim()
  if (!v || v === '.' || v.endsWith('.')) return null
  try {
    return parseEther(v)
  } catch {
    return null
  }
}

function fmtInput(wei: bigint, decimals = 6): string {
  const raw = formatEther(wei)
  if (!raw.includes('.')) return raw
  const [i, d = ''] = raw.split('.')
  const trimmed = d.slice(0, decimals).replace(/0+$/, '')
  return trimmed ? `${i}.${trimmed}` : i
}

export function Platform() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.1')
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const configured = Boolean(VYNTRA_TOKEN && VYNTRA_MARKET)
  const onWrongChain = isConnected && chainId !== botTestnet.id

  const {
    data: trades = [],
    isLoading: tradesLoading,
    refetch: refetchTrades,
  } = usePlatformTrades(VYNTRA_MARKET)

  const { data: botBalance } = useBalance({
    address,
    chainId: botTestnet.id,
    query: { enabled: Boolean(address) },
  })

  const { data: tokenBalance, refetch: refetchTokenBal } = useReadContract({
    address: VYNTRA_TOKEN,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(VYNTRA_TOKEN && address) },
  })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: VYNTRA_TOKEN,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && VYNTRA_MARKET ? [address, VYNTRA_MARKET] : undefined,
    query: { enabled: Boolean(VYNTRA_TOKEN && VYNTRA_MARKET && address) },
  })

  const { data: reserveBot } = useReadContract({
    address: VYNTRA_MARKET,
    abi: vyntraMarketAbi,
    functionName: 'reserveBot',
    query: { enabled: Boolean(VYNTRA_MARKET), refetchInterval: 8_000 },
  })

  const { data: reserveVyntra } = useReadContract({
    address: VYNTRA_MARKET,
    abi: vyntraMarketAbi,
    functionName: 'reserveVyntra',
    query: { enabled: Boolean(VYNTRA_MARKET), refetchInterval: 8_000 },
  })

  const parsedAmount = useMemo(() => safeParseEther(amount), [amount])

  const { data: buyQuote } = useReadContract({
    address: VYNTRA_MARKET,
    abi: vyntraMarketAbi,
    functionName: 'quoteBuyVyntra',
    args: parsedAmount && side === 'buy' ? [parsedAmount] : undefined,
    query: {
      enabled: Boolean(VYNTRA_MARKET && side === 'buy' && parsedAmount && parsedAmount > 0n),
    },
  })

  const { data: sellQuote } = useReadContract({
    address: VYNTRA_MARKET,
    abi: vyntraMarketAbi,
    functionName: 'quoteSellVyntra',
    args: parsedAmount && side === 'sell' ? [parsedAmount] : undefined,
    query: {
      enabled: Boolean(VYNTRA_MARKET && side === 'sell' && parsedAmount && parsedAmount > 0n),
    },
  })

  const price =
    reserveBot != null && reserveVyntra != null && reserveVyntra > 0n
      ? Number(formatEther(reserveBot)) / Number(formatEther(reserveVyntra))
      : 0
  const spotMcap = price > 0 ? price * TOTAL_SUPPLY : trades.at(-1)?.mcap ?? 0

  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess) return
    void refetchTokenBal()
    void refetchAllowance()
    void refetchTrades()
  }, [isSuccess, refetchTokenBal, refetchAllowance, refetchTrades])

  const needsApprove =
    side === 'sell' &&
    parsedAmount != null &&
    parsedAmount > 0n &&
    (allowance == null || allowance < parsedAmount)

  function setPercent(pct: number) {
    if (side === 'buy') {
      const bal = botBalance?.value ?? 0n
      setAmount(fmtInput((bal * BigInt(pct)) / 100n))
    } else {
      const bal = tokenBalance ?? 0n
      setAmount(fmtInput((bal * BigInt(pct)) / 100n))
    }
  }

  function trade() {
    setMsg(null)
    reset()
    if (!VYNTRA_MARKET || !VYNTRA_TOKEN) {
      setMsg('Platform market is not configured yet.')
      return
    }
    if (onWrongChain) {
      setMsg('Switch to BOT Chain first.')
      return
    }
    if (parsedAmount == null || parsedAmount <= 0n) {
      setMsg('Enter a valid amount.')
      return
    }

    if (side === 'buy') {
      const minOut = buyQuote ? (buyQuote * 95n) / 100n : 0n
      writeContract({
        address: VYNTRA_MARKET,
        abi: vyntraMarketAbi,
        functionName: 'buyVyntra',
        args: [minOut],
        value: parsedAmount,
        chainId: botTestnet.id,
      })
      return
    }

    if (needsApprove) {
      writeContract({
        address: VYNTRA_TOKEN,
        abi: erc20Abi,
        functionName: 'approve',
        args: [VYNTRA_MARKET, maxUint256],
        chainId: botTestnet.id,
      })
      return
    }

    const minOut = sellQuote ? (sellQuote * 95n) / 100n : 0n
    writeContract({
      address: VYNTRA_MARKET,
      abi: vyntraMarketAbi,
      functionName: 'sellVyntra',
      args: [parsedAmount, minOut],
      chainId: botTestnet.id,
    })
  }


  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(label)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      setMsg('Could not copy')
    }
  }

  async function sharePlatform() {
    const url = typeof window !== 'undefined' ? `${window.location.origin}/vyntra` : '/vyntra'
    const text = '$VYNTRA · platform token on Vyntra — protocol fees buy and burn'
    if (navigator.share) {
      try {
        await navigator.share({ title: '$VYNTRA on Vyntra', text, url })
        return
      } catch {
        // fall through
      }
    }
    await copyText('link', `${text}\n${url}`)
  }

  if (!configured) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 px-6 py-16 text-center">
        <img src={VYNTRA_LOGO} alt="" className="mx-auto h-16 w-16 rounded-xl object-cover" />
        <p className="font-display text-2xl">$VYNTRA market coming online</p>
        <p className="text-base text-[var(--vyntra-muted)]">
          Set <span className="font-mono">VITE_VYNTRA_TOKEN</span> and{' '}
          <span className="font-mono">VITE_VYNTRA_MARKET</span> after deploy.
        </p>
        <Link to="/markets" className="btn-primary mx-auto">
          Back to markets
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/markets"
          className="inline-flex items-center gap-2 text-base text-[var(--vyntra-muted)] transition hover:text-[var(--vyntra-fg)]"
        >
          <ArrowLeft className="h-5 w-5" />
          Markets
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={sharePlatform}>
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            className="btn-ghost px-3 py-2 text-sm"
            onClick={() => VYNTRA_TOKEN && copyText('token', VYNTRA_TOKEN)}
          >
            {copied === 'token' || copied === 'link' ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied === 'token' ? 'Copied' : copied === 'link' ? 'Link copied' : 'Copy token'}
          </button>
          <span className="chip-demo">
            <Sparkles className="h-3 w-3" />
            Platform token
          </span>
          <span className="chip-live">Live market</span>
        </div>
      </div>

      <div className="card flex flex-wrap items-start justify-between gap-5 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-[var(--vyntra-elev)] ring-1 ring-[var(--vyntra-border)]">
            <img src={VYNTRA_LOGO} alt="VYNTRA" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 className="page-title text-3xl sm:text-4xl">Vyntra</h1>
              <span className="font-mono text-base text-[var(--vyntra-muted)]">$VYNTRA</span>
            </div>
            <p className="mt-1.5 max-w-xl text-base text-[var(--vyntra-muted)]">
              Fixed-supply platform token. Protocol fees buy and burn VYNTRA.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-7 sm:gap-10">
          <Metric label="Market cap" value={`${formatBot(spotMcap)} BOT`} />
          <Metric label="Spot" value={price > 0 ? `${formatBot(price)} BOT` : '—'} />
          <Metric
            label="Pool BOT"
            value={reserveBot != null ? formatBot(reserveBot) : '—'}
          />
          <Metric label="Trades" value={String(trades.length)} />
          <Metric
            label="Token"
            value={
              <button
                type="button"
                onClick={() => VYNTRA_TOKEN && copyText('token', VYNTRA_TOKEN)}
                className="inline-flex items-center gap-1.5 font-mono text-base text-[var(--vyntra-fg)] hover:text-[var(--vyntra-primary)]"
              >
                {shortAddr(VYNTRA_TOKEN!)}
                <Copy className="h-4 w-4 text-[var(--vyntra-faint)]" />
              </button>
            }
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <PriceChart trades={trades} spotMcap={spotMcap} height={420} />
          {tradesLoading && trades.length === 0 ? (
            <div className="card px-4 py-10 text-center text-base text-[var(--vyntra-muted)]">
              Loading trade history…
            </div>
          ) : (
            <TradeTape trades={trades} symbol="VYNTRA" />
          )}
          <HoldersPanel symbol="VYNTRA" trades={trades} />
          <ReplyThread
            launchId={PLATFORM_REPLY_ID}
            tokenSymbol="VYNTRA"
            platformThread
          />

          <div className="card space-y-4 p-5">
            <p className="page-kicker">About $VYNTRA</p>
            <ul className="space-y-3 text-base text-[var(--vyntra-muted)]">
              <li>First market on Vyntra — trade the platform token alongside meme launches.</li>
              <li>1B fixed supply. Protocol volume routes BOT into this pool and burns VYNTRA.</li>
              <li>0% pool fee on this market (buybacks and public trading).</li>
              <li>
                Always tradeable here. To use an external market on mainnet, import the token contract
                on BDEX.
              </li>
            </ul>
            <div className="space-y-2 border-t border-[var(--vyntra-border)] pt-4 text-sm">
              <AddrRow label="Token" addr={VYNTRA_TOKEN!} />
              <AddrRow label="Market" addr={VYNTRA_MARKET!} />
              {BUYBACK_VAULT ? <AddrRow label="Buyback vault" addr={BUYBACK_VAULT} /> : null}
            </div>
          </div>
        </div>

        <aside className="card p-5 xl:sticky xl:top-24 xl:self-start">
          <div className="mb-5 flex gap-1.5 rounded-lg bg-[var(--vyntra-elev)] p-1.5">
            {(['buy', 'sell'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSide(s)
                  setMsg(null)
                  setAmount(s === 'buy' ? '0.1' : '')
                }}
                className={`flex-1 rounded-lg py-3 text-base font-bold capitalize transition ${
                  side === s
                    ? s === 'buy'
                      ? 'bg-emerald-500 text-black'
                      : 'bg-rose-500 text-white'
                    : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <label className="block space-y-2.5">
            <div className="flex justify-between text-sm text-[var(--vyntra-muted)]">
              <span>{side === 'buy' ? 'Pay (BOT)' : 'Sell ($VYNTRA)'}</span>
              <span className="font-mono">
                {side === 'buy'
                  ? `Bal ${formatBot(botBalance?.value ?? 0n)} BOT`
                  : `Bal ${formatBot(tokenBalance ?? 0n)} VYNTRA`}
              </span>
            </div>
            <input
              className="input font-mono text-lg"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {PCTS.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={!isConnected}
                onClick={() => setPercent(pct)}
                className="rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] py-2.5 text-sm font-semibold transition hover:border-[var(--vyntra-border-strong)] disabled:opacity-40"
              >
                {pct}%
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-2 rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] px-4 py-3.5 text-sm">
            {side === 'buy' && buyQuote != null ? (
              <Row label="You receive" value={`~${formatBot(buyQuote)} $VYNTRA`} mono />
            ) : null}
            {side === 'sell' && sellQuote != null ? (
              <Row label="You receive" value={`~${formatBot(sellQuote)} BOT`} mono />
            ) : null}
            <Row label="Slippage guard" value="5%" />
          </div>

          <div className="mt-5">
            {!isConnected ? (
              <div className="flex justify-center">
                <ConnectButton />
              </div>
            ) : onWrongChain ? (
              <button
                type="button"
                className="btn-primary w-full"
                disabled={switching}
                onClick={() => switchChain({ chainId: botTestnet.id })}
              >
                {switching ? 'Switching…' : 'Switch to BOT Chain'}
              </button>
            ) : (
              <button
                type="button"
                className={
                  side === 'buy'
                    ? 'inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 py-3.5 text-base font-bold text-black transition hover:brightness-110 disabled:opacity-45'
                    : 'inline-flex w-full items-center justify-center rounded-xl bg-rose-500 py-3.5 text-base font-bold text-white transition hover:brightness-110 disabled:opacity-45'
                }
                onClick={trade}
                disabled={isPending || confirming || parsedAmount == null || parsedAmount <= 0n}
              >
                {isPending || confirming
                  ? 'Confirm in wallet…'
                  : side === 'sell' && needsApprove
                    ? 'Approve & sell $VYNTRA'
                    : `${side === 'buy' ? 'Buy' : 'Sell'} $VYNTRA`}
              </button>
            )}
          </div>

          {(msg || writeError) && (
            <p className="mt-3 text-center text-sm text-[var(--vyntra-danger)]">
              {msg || formatUserError(writeError, 'Transaction failed. Try again.')}
            </p>
          )}
          {isSuccess && (
            <p className="mt-3 text-center text-sm text-[var(--vyntra-success)]">Trade confirmed</p>
          )}
          {hash && (
            <a
              href={explorerTx(hash, botTestnet.id)}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 font-mono text-sm text-[var(--vyntra-muted)] hover:text-[var(--vyntra-primary)]"
            >
              View transaction <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-faint)]">
        {label}
      </div>
      <div className="mt-1.5 font-display text-xl font-bold tracking-tight sm:text-2xl">{value}</div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--vyntra-muted)]">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  )
}

function AddrRow({ label, addr }: { label: string; addr: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[var(--vyntra-muted)]">{label}</span>
      <a
        href={explorerAddress(addr, botTestnet.id)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 font-mono text-[var(--vyntra-fg)] hover:text-[var(--vyntra-primary)]"
      >
        {shortAddr(addr)}
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}
