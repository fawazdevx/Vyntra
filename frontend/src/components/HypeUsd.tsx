import { useHypeUsdPrice } from '../hooks/useHypeUsdPrice'

function formatUsd(value: number) {
  const abs = Math.abs(value)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: abs >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: abs >= 1 ? 2 : 4,
  }).format(value)
}

export function HypeUsd({ value, className }: { value: number; className?: string }) {
  const { data } = useHypeUsdPrice()
  if (!Number.isFinite(value) || !data?.priceUsd) return null

  const usd = value * data.priceUsd
  if (!Number.isFinite(usd)) return null

  return (
    <span
      className={className ?? 'block text-xs font-normal text-[var(--vyntra-muted)]'}
      title={
        'Estimate using the current Hyperliquid mainnet HYPE price from GeckoTerminal (' +
        formatUsd(data.priceUsd) +
        ' per HYPE). Elysium testnet HYPE has no guaranteed dollar value.'
      }
    >
      ≈ {formatUsd(usd)}
    </span>
  )
}
