import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { parseEther, decodeEventLog, zeroAddress } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Rocket, Sparkles, Info, ExternalLink } from 'lucide-react'
import { ImageUpload } from '../components/ImageUpload'
import { spawnFactoryAbi } from '../lib/abis'
import { activeChain } from '../lib/chains'
import { explorerTx, FACTORY_ADDRESS } from '../lib/config'
import { formatUserError } from '../lib/errors'
import { BotUsd } from '../components/BotUsd'

const TAX_PRESETS = [
  { label: 'Off', buy: 0, sell: 0 },
  { label: '1%', buy: 100, sell: 100 },
  { label: '5%', buy: 500, sell: 500 },
  { label: '10%', buy: 1000, sell: 1000 },
] as const

/** Default 40/20/20/20 when tax is enabled */
const DEFAULT_SPLIT = { funds: 4000, buyback: 2000, dividends: 2000, liquidity: 2000 }

export function Spawn() {
  const navigate = useNavigate()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { isConnected } = useAccount()
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [imageURI, setImageURI] = useState('')
  const [description, setDescription] = useState('')
  const [seedBuy, setSeedBuy] = useState('0')
  const [agentMode, setAgentMode] = useState(false)
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [buyTaxBps, setBuyTaxBps] = useState(500)
  const [sellTaxBps, setSellTaxBps] = useState(500)
  const [fundsBps, setFundsBps] = useState(DEFAULT_SPLIT.funds)
  const [buybackBps, setBuybackBps] = useState(DEFAULT_SPLIT.buyback)
  const [dividendsBps, setDividendsBps] = useState(DEFAULT_SPLIT.dividends)
  const [liquidityBps, setLiquidityBps] = useState(DEFAULT_SPLIT.liquidity)
  const [status, setStatus] = useState<string | null>(null)

  const trimmedName = name.trim()
  const trimmedSymbol = symbol.trim()
  const trimmedImage = imageURI.trim()
  const trimmedDesc = description.trim()

  const { data: nameTaken } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: spawnFactoryAbi,
    functionName: 'isNameTaken',
    args: [trimmedName],
    query: { enabled: trimmedName.length > 0 },
  })

  const { data: symbolTaken } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: spawnFactoryAbi,
    functionName: 'isSymbolTaken',
    args: [trimmedSymbol],
    query: { enabled: trimmedSymbol.length > 0 },
  })

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const onWrongChain = isConnected && chainId !== activeChain.id
  const initials = (symbol || name || '??').slice(0, 2).toUpperCase()

  const splitTotal = fundsBps + buybackBps + dividendsBps + liquidityBps

  const taxArgs = useMemo(() => {
    if (!taxEnabled) return [0n, 0n, 0n, 0n, 0n, 0n] as const
    return [
      BigInt(buyTaxBps),
      BigInt(sellTaxBps),
      BigInt(fundsBps),
      BigInt(buybackBps),
      BigInt(dividendsBps),
      BigInt(liquidityBps),
    ] as const
  }, [taxEnabled, buyTaxBps, sellTaxBps, fundsBps, buybackBps, dividendsBps, liquidityBps])

  const validationError = useMemo(() => {
    if (!trimmedName || !trimmedSymbol) return 'Name and symbol are required.'
    if (!trimmedImage) return 'Image is required — upload a file or paste a URL before launching.'
    if (!trimmedDesc) return 'Description is required — tell the story of this coin.'
    if (nameTaken) return `Name "${trimmedName}" is already taken — pick a different name.`
    if (symbolTaken) return `Ticker $${trimmedSymbol.toUpperCase()} is already taken — change the symbol.`
    if (taxEnabled) {
      if ((buyTaxBps !== 0 && (buyTaxBps < 100 || buyTaxBps > 1000)) ||
          (sellTaxBps !== 0 && (sellTaxBps < 100 || sellTaxBps > 1000))) {
        return 'Buy/sell tax must be 0% or between 1% and 10%.'
      }
      if (buyTaxBps === 0 && sellTaxBps === 0) {
        return 'Enable tax with at least one of buy or sell set between 1–10%, or turn tax off.'
      }
      if (splitTotal !== 10_000) {
        return `Tax split must total 100% (currently ${(splitTotal / 100).toFixed(0)}%).`
      }
    }
    return null
  }, [
    trimmedName,
    trimmedSymbol,
    trimmedImage,
    trimmedDesc,
    nameTaken,
    symbolTaken,
    taxEnabled,
    buyTaxBps,
    sellTaxBps,
    splitTotal,
  ])

  const canSubmit = !validationError

  useEffect(() => {
    if (!isSuccess || !receipt) return
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: spawnFactoryAbi,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName === 'TokenSpawned') {
          const id = Number((decoded.args as { id: bigint }).id)
          setStatus(`Launched #${id}`)
          navigate(`/token/${id}`)
          return
        }
      } catch {
        // not our event
      }
    }
    setStatus('Launch confirmed — open Markets if redirect missed the id.')
  }, [isSuccess, receipt, navigate])

  function applyPreset(buy: number, sell: number) {
    if (buy === 0 && sell === 0) {
      setTaxEnabled(false)
      setBuyTaxBps(0)
      setSellTaxBps(0)
      return
    }
    setTaxEnabled(true)
    setBuyTaxBps(buy)
    setSellTaxBps(sell)
    setFundsBps(DEFAULT_SPLIT.funds)
    setBuybackBps(DEFAULT_SPLIT.buyback)
    setDividendsBps(DEFAULT_SPLIT.dividends)
    setLiquidityBps(DEFAULT_SPLIT.liquidity)
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    reset()

    if (validationError) {
      setStatus(validationError)
      return
    }
    if (!isConnected) {
      setStatus('Connect a wallet first.')
      return
    }
    if (onWrongChain) {
      setStatus('Switch to BOT Chain to continue.')
      return
    }

    const finalDescription = agentMode
      ? `${trimmedDesc}\n\n[Agent Launch]`
      : trimmedDesc

    writeContract({
      address: FACTORY_ADDRESS,
      abi: spawnFactoryAbi,
      functionName: 'spawn',
      args: [
        trimmedName,
        trimmedSymbol.toUpperCase(),
        trimmedImage,
        finalDescription,
        zeroAddress,
        ...taxArgs,
      ],
      value: seedBuy && Number(seedBuy) > 0 ? parseEther(seedBuy) : 0n,
      chainId: activeChain.id,
    })
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div className="space-y-4 animate-fade-up">
        <div>
          <p className="page-kicker mb-2">Create</p>
          <h1 className="page-title text-4xl sm:text-5xl lg:text-6xl">Launch a coin</h1>
          <p className="mt-3 max-w-md text-base text-[var(--vyntra-muted)] sm:text-lg">
            Fixed 1B supply. Early buys are limited for a few blocks. Optional creator tax on top of
            the 1.25% protocol fee.
          </p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-6 p-6 sm:p-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *">
              <input
                className={`input ${nameTaken ? 'border-[var(--vyntra-danger)]' : ''}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Agent Cat"
                maxLength={32}
                required
              />
              {nameTaken ? (
                <p className="mt-1.5 text-sm text-[var(--vyntra-danger)]">
                  This name is taken — choose another.
                </p>
              ) : null}
            </Field>
            <Field label="Symbol *">
              <input
                className={`input font-mono uppercase ${symbolTaken ? 'border-[var(--vyntra-danger)]' : ''}`}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="ACAT"
                maxLength={10}
                required
              />
              {symbolTaken ? (
                <p className="mt-1.5 text-sm text-[var(--vyntra-danger)]">
                  Ticker already exists — change the symbol.
                </p>
              ) : null}
            </Field>
          </div>

          <Field label="Image *">
            <ImageUpload
              value={imageURI}
              onChange={setImageURI}
              disabled={isPending || confirming}
            />
          </Field>

          <Field label="Description *">
            <textarea
              className="input min-h-[100px] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What’s the meme? What’s the agent?"
              required
            />
            <p className="mt-1.5 text-xs text-[var(--vyntra-faint)]">
              Required. Token will not launch without a description.
            </p>
          </Field>

          <Field label="Seed buy (BOT)">
            <input
              className="input font-mono"
              type="number"
              min="0"
              step="0.01"
              value={seedBuy}
              onChange={(e) => setSeedBuy(e.target.value)}
            />
            <BotUsd value={Number(seedBuy) || 0} className="text-xs text-[var(--vyntra-faint)]" />
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--vyntra-faint)]">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Optional first buy in the same tx. Only the creator can buy on the launch block.
            </p>
          </Field>

          {/* Creator tax (Argus Phase 2) */}
          <div className="space-y-4 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--vyntra-fg)]">Creator tax</p>
                <p className="mt-1 text-xs text-[var(--vyntra-muted)]">
                  Optional 0% or 1–10% buy/sell tax after the 1.25% protocol fee. Split into funds,
                  buyback, dividends, and LP.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !taxEnabled
                  setTaxEnabled(next)
                  if (next) {
                    setBuyTaxBps(500)
                    setSellTaxBps(500)
                    setFundsBps(DEFAULT_SPLIT.funds)
                    setBuybackBps(DEFAULT_SPLIT.buyback)
                    setDividendsBps(DEFAULT_SPLIT.dividends)
                    setLiquidityBps(DEFAULT_SPLIT.liquidity)
                  } else {
                    setBuyTaxBps(0)
                    setSellTaxBps(0)
                  }
                }}
                className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${
                  taxEnabled ? 'bg-[var(--vyntra-fg)]' : 'bg-[var(--vyntra-border-strong)]'
                }`}
                aria-pressed={taxEnabled}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white transition ${
                    taxEnabled ? 'translate-x-4' : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {TAX_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.buy, p.sell)}
                  className={`chip cursor-pointer transition ${
                    (!taxEnabled && p.buy === 0) ||
                    (taxEnabled && buyTaxBps === p.buy && sellTaxBps === p.sell)
                      ? 'border-[var(--vyntra-fg)] text-[var(--vyntra-fg)]'
                      : ''
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {taxEnabled && (
              <div className="space-y-4 border-t border-[var(--vyntra-border)] pt-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={`Buy tax ${(buyTaxBps / 100).toFixed(0)}%`}>
                    <input
                      className="input font-mono"
                      type="range"
                      min={100}
                      max={1000}
                      step={100}
                      value={buyTaxBps || 100}
                      onChange={(e) => setBuyTaxBps(Number(e.target.value))}
                    />
                  </Field>
                  <Field label={`Sell tax ${(sellTaxBps / 100).toFixed(0)}%`}>
                    <input
                      className="input font-mono"
                      type="range"
                      min={100}
                      max={1000}
                      step={100}
                      value={sellTaxBps || 100}
                      onChange={(e) => setSellTaxBps(Number(e.target.value))}
                    />
                  </Field>
                </div>

                <p className="label">Split (must total 100%)</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SplitField
                    label="Funds"
                    value={fundsBps}
                    onChange={setFundsBps}
                  />
                  <SplitField
                    label="Buyback"
                    value={buybackBps}
                    onChange={setBuybackBps}
                  />
                  <SplitField
                    label="Dividends"
                    value={dividendsBps}
                    onChange={setDividendsBps}
                  />
                  <SplitField
                    label="Liquidity"
                    value={liquidityBps}
                    onChange={setLiquidityBps}
                  />
                </div>
                <p
                  className={`text-xs font-mono ${
                    splitTotal === 10_000
                      ? 'text-[var(--vyntra-success)]'
                      : 'text-[var(--vyntra-danger)]'
                  }`}
                >
                  Total {(splitTotal / 100).toFixed(0)}%
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAgentMode((v) => !v)}
            className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3.5 text-left transition ${
              agentMode
                ? 'border-[var(--vyntra-fg)] bg-[var(--vyntra-hover)]'
                : 'border-[var(--vyntra-border)] bg-[var(--vyntra-card)] hover:border-[var(--vyntra-border-strong)]'
            }`}
          >
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-md ${
                agentMode
                  ? 'bg-[var(--vyntra-fg)] text-[var(--vyntra-card)]'
                  : 'bg-[var(--vyntra-elev)] text-[var(--vyntra-muted)]'
              }`}
            >
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold">Agent launch</span>
              <span className="block text-sm text-[var(--vyntra-muted)]">
                Marks this coin as launched for an agent
              </span>
            </span>
            <span
              className={`h-5 w-9 rounded-full p-0.5 transition ${
                agentMode ? 'bg-[var(--vyntra-fg)]' : 'bg-[var(--vyntra-border-strong)]'
              }`}
            >
              <span
                className={`block h-4 w-4 rounded-full bg-white transition ${
                  agentMode ? 'translate-x-4' : ''
                }`}
              />
            </span>
          </button>

          {!isConnected ? (
            <div className="flex justify-center py-2">
              <ConnectButton />
            </div>
          ) : onWrongChain ? (
            <button
              type="button"
              className="btn-primary w-full py-3.5"
              disabled={switching}
              onClick={() => switchChain({ chainId: activeChain.id })}
            >
              {switching ? 'Switching…' : 'Switch to BOT Chain'}
            </button>
          ) : (
            <button
              type="submit"
              className="btn-primary w-full py-3.5"
              disabled={isPending || confirming || !canSubmit}
            >
              <Rocket className="h-4 w-4" />
              {isPending || confirming ? 'Confirm in wallet…' : 'Launch token'}
            </button>
          )}

          {validationError && isConnected && !onWrongChain && (
            <p className="text-sm text-amber-700">{validationError}</p>
          )}
          {status && <p className="text-sm text-[var(--vyntra-success)]">{status}</p>}
          {error && (
            <p className="text-sm text-[var(--vyntra-danger)]">{formatUserError(error)}</p>
          )}
          {hash && (
            <a
              href={explorerTx(hash, activeChain.id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-[var(--vyntra-muted)] hover:underline"
            >
              {hash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </form>
      </div>

      <aside
        className="space-y-4 animate-fade-up lg:sticky lg:top-24 lg:self-start"
        style={{ animationDelay: '80ms' }}
      >
        <p className="page-kicker">Preview</p>
        <div className="card overflow-hidden">
          <div className="relative h-44 bg-[var(--vyntra-elev)]">
            <div className="absolute bottom-5 left-5 flex items-end gap-3.5">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-[var(--vyntra-elev)] text-xl font-bold text-[var(--vyntra-fg)] ring-2 ring-[var(--vyntra-bg)]">
                {imageURI ? (
                  <img src={imageURI} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="pb-1">
                <div className="font-display text-2xl">{name || 'Token name'}</div>
                <div className="font-mono text-base text-[var(--vyntra-muted)]">
                  ${symbol || 'TICKER'}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-base leading-relaxed text-[var(--vyntra-muted)]">
              {description || 'Your description will show on the token page after launch.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="chip">1B supply</span>
              <span className="chip">1.25% fee</span>
              <span className="chip">Creator earns</span>
              {taxEnabled && (
                <span className="chip">
                  Tax {(buyTaxBps / 100).toFixed(0)}%/{(sellTaxBps / 100).toFixed(0)}%
                </span>
              )}
              <span className="chip-live">{activeChain.testnet ? 'Testnet' : 'Mainnet'}</span>
              {agentMode && <span className="chip-demo">Agent</span>}
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2.5">
      <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--vyntra-muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function SplitField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex justify-between text-xs font-medium text-[var(--vyntra-muted)]">
        <span>{label}</span>
        <span className="font-mono">{(value / 100).toFixed(0)}%</span>
      </span>
      <input
        className="w-full accent-[var(--vyntra-fg)]"
        type="range"
        min={0}
        max={10000}
        step={500}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}
