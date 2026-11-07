import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { decodeEventLog, zeroAddress } from 'viem'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Rocket, Sparkles, Info, ExternalLink } from 'lucide-react'
import { ImageUpload } from '../components/ImageUpload'
import { spawnFactoryAbi } from '../lib/abis'
import { activeChain } from '../lib/chains'
import { explorerTx, FACTORY_ADDRESS } from '../lib/config'
import { formatUserError } from '../lib/errors'

export function Spawn() {
  const navigate = useNavigate()
  const chainId = useChainId()
  const { switchChain, isPending: switching } = useSwitchChain()
  const { isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: activeChain.id })
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [imageURI, setImageURI] = useState('')
  const [description, setDescription] = useState('')
  const [agentMode, setAgentMode] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [findingAddress, setFindingAddress] = useState(false)

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

  const { writeContractAsync, data: hash, isPending, error, reset } = useWriteContract()
  const { isLoading: confirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash })

  const onWrongChain = isConnected && chainId !== activeChain.id
  const initials = (symbol || name || '??').slice(0, 2).toUpperCase()

  const validationError = useMemo(() => {
    if (!trimmedName || !trimmedSymbol) return 'Name and symbol are required.'
    if (!trimmedImage) return 'Image is required — upload a file or paste a URL before launching.'
    if (!trimmedDesc) return 'Description is required — tell the story of this coin.'
    if (nameTaken) return `Name "${trimmedName}" is already taken — pick a different name.`
    if (symbolTaken) return `Ticker $${trimmedSymbol.toUpperCase()} is already taken — change the symbol.`
    return null
  }, [trimmedName, trimmedSymbol, trimmedImage, trimmedDesc, nameTaken, symbolTaken])

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
      setStatus('Switch to Elysium Testnet to continue.')
      return
    }

    const finalDescription = agentMode
      ? `${trimmedDesc}\n\n[Agent Launch]`
      : trimmedDesc

    if (!publicClient) {
      setStatus('Unable to read Elysium Testnet. Check the network connection and try again.')
      return
    }

    setFindingAddress(true)
    try {
      setStatus('Finding a token address ending in 7f7…')
      const [tokenSalt, predictedToken] = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: spawnFactoryAbi,
        functionName: 'findVanitySalt',
        args: [trimmedName, trimmedSymbol.toUpperCase(), trimmedImage, finalDescription],
      })
      setStatus(`Vyntra address ${predictedToken} ends in 7f7. Confirm the launch in your wallet.`)
      await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: spawnFactoryAbi,
        functionName: 'spawn',
        args: [
          trimmedName,
          trimmedSymbol.toUpperCase(),
          trimmedImage,
          finalDescription,
          zeroAddress,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          tokenSalt,
        ],
        value: 0n,
        chainId: activeChain.id,
      })
    } catch (launchError) {
      setStatus(formatUserError(launchError))
    } finally {
      setFindingAddress(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div className="space-y-4 animate-fade-up">
        <div>
          <p className="page-kicker mb-2">Create</p>
          <h1 className="page-title text-4xl sm:text-5xl lg:text-6xl">Launch a coin</h1>
          <p className="mt-3 max-w-md text-base text-[var(--vyntra-muted)] sm:text-lg">
            Launch on a buyer-funded curve with no HYPE liquidity deposit. When it fills, the
            contract creates a permanently locked Uniswap v4 pool from the HYPE raised.
          </p>
          <p className="mt-2 max-w-md text-sm text-[var(--vyntra-muted)]">
            Every Vyntra token contract ends in <span className="font-mono font-semibold">7f7</span> for quick identification.
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

          <div className="rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-[var(--vyntra-fg)]">
              <Info className="h-4 w-4" /> No HYPE deposit required
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--vyntra-muted)]">
              Token creation uses HYPE only for network gas. Buyers fund the curve through trades.
              At graduation, 40% of supply joins the collected HYPE in the locked V4 pool; the
              remaining 60% is sold through the curve. You can choose to buy after launch.
            </p>
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
              {switching ? 'Switching…' : 'Switch to Elysium Testnet'}
            </button>
          ) : (
            <button
              type="submit"
              className="btn-primary w-full py-3.5"
              disabled={findingAddress || isPending || confirming || !canSubmit}
            >
              <Rocket className="h-4 w-4" />
              {findingAddress ? 'Finding address…' : isPending || confirming ? 'Confirm in wallet…' : 'Launch token'}
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
              <span className="chip">Address ends 7f7</span>
              <span className="chip">Curve → Uniswap v4</span>
              <span className="chip">1% trade fee</span>
              <span className="chip">V4 position locks at graduation</span>
              <span className="chip">Published curve pricing</span>
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
