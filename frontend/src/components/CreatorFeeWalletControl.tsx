import { useEffect, useState } from 'react'
import { getAddress, isAddress, type Address } from 'viem'
import { useAccount, useChainId, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { ArrowRightLeft } from 'lucide-react'
import { useReadContract } from 'wagmi'
import { bondingCurveAbi } from '../lib/abis'
import { formatUserError } from '../lib/errors'
import { activeChain } from '../lib/chains'

export function CreatorFeeWalletControl({
  curve,
  creator,
}: {
  curve: Address
  creator: Address
}) {
  const { address } = useAccount()
  const chainId = useChainId()
  const isCreator = Boolean(address && address.toLowerCase() === creator.toLowerCase())
  const {
    data: currentRecipient,
    isError: unsupported,
    refetch,
  } = useReadContract({
    address: curve,
    abi: bondingCurveAbi,
    functionName: 'creatorFeeRecipient',
    query: { enabled: isCreator },
  })
  const [recipient, setRecipient] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const { writeContractAsync, data: hash, isPending, error } = useWriteContract()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (currentRecipient) setRecipient(currentRecipient)
  }, [currentRecipient])

  useEffect(() => {
    if (isSuccess) {
      setMessage('Fee wallet updated.')
      void refetch()
    }
  }, [isSuccess, refetch])

  if (!isCreator) return null

  if (unsupported) {
    return (
      <div className="rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] px-4 py-3 text-sm">
        <p className="font-semibold text-[var(--vyntra-fg)]">Creator fee wallet</p>
        <p className="mt-1 text-[var(--vyntra-muted)]">
          This launch pays creator fees to its launch wallet. Custom fee wallets are available on the updated factory.
        </p>
      </div>
    )
  }

  const validRecipient = isAddress(recipient)
  const unchanged = Boolean(
    currentRecipient &&
    validRecipient &&
    currentRecipient.toLowerCase() === recipient.toLowerCase(),
  )
  const busy = isPending || confirming
  const wrongChain = chainId !== activeChain.id

  async function saveRecipient() {
    setMessage(null)
    if (!validRecipient) {
      setMessage('Enter a valid wallet address.')
      return
    }
    try {
      await writeContractAsync({
        address: curve,
        abi: bondingCurveAbi,
        functionName: 'setCreatorFeeRecipient',
        args: [getAddress(recipient)],
        chainId: activeChain.id,
      })
    } catch (saveError) {
      setMessage(formatUserError(saveError, 'Could not update the fee wallet.'))
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div>
        <label className="block text-sm font-semibold text-[var(--vyntra-fg)]" htmlFor={`fee-wallet-${curve}`}>
          Creator fee wallet
        </label>
        <p className="mt-1 text-xs text-[var(--vyntra-muted)]">
          Only your creator wallet can change the recipient or trigger a claim. HYPE claims and collected token fees go to this address.
        </p>
        {wrongChain && <p className="mt-2 text-xs text-amber-600">Switch to Elysium Testnet to update this wallet.</p>}
        <input
          id={`fee-wallet-${curve}`}
          className="input mt-3 font-mono text-sm"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          spellCheck={false}
          maxLength={42}
        />
        {(message || error) && (
          <p className="mt-2 text-xs text-[var(--vyntra-danger)]">
            {message || formatUserError(error, 'Could not update the fee wallet.')}
          </p>
        )}
      </div>
      <button
        type="button"
        className="btn-ghost px-3.5 py-2 text-sm"
        disabled={busy || wrongChain || !validRecipient || unchanged}
        onClick={() => void saveRecipient()}
      >
        <ArrowRightLeft className="h-4 w-4" />
        {busy ? 'Updating…' : 'Update wallet'}
      </button>
    </div>
  )
}
