import { Link } from 'react-router-dom'
import { useReadContract } from 'wagmi'
import { formatEther } from 'viem'
import { Sparkles, ArrowUpRight } from 'lucide-react'
import { vyntraMarketAbi } from '../lib/abis'
import { formatNative, VYNTRA_LOGO, VYNTRA_MARKET, VYNTRA_TOKEN } from '../lib/config'
import { HypeUsd } from './HypeUsd'

/** Pinned first on Markets — platform token entry point. */
export function PlatformTokenCard() {
  const ready = Boolean(VYNTRA_TOKEN && VYNTRA_MARKET)

  const { data: reserveNative } = useReadContract({
    address: VYNTRA_MARKET,
    abi: vyntraMarketAbi,
    functionName: 'reserveNative',
    query: { enabled: ready, refetchInterval: 15_000, staleTime: 10_000 },
  })

  const { data: spotPriceWad } = useReadContract({
    address: VYNTRA_MARKET,
    abi: vyntraMarketAbi,
    functionName: 'spotPriceWad',
    query: { enabled: ready, refetchInterval: 15_000, staleTime: 10_000 },
  })

  // Use the market's marginal spot quote, matching the Platform page and chart.
  // reserveNative / reserveVyntra is an average-reserve ratio on the curve and
  // materially understates price (and FDV) before graduation.
  const price = spotPriceWad != null ? Number(formatEther(spotPriceWad)) : 0

  const mcap = price > 0 ? price * 1_000_000_000 : 0

  return (
    <Link
      to="/vyntra"
      className="card platform-hero hover-lift group relative col-span-full overflow-hidden border-[var(--vyntra-border-strong)] p-5 sm:p-6"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-[rgba(124,58,237,0.15)] blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 rounded-full bg-[rgba(6,182,212,0.12)] blur-2xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-[var(--vyntra-elev)] shadow-glow ring-1 ring-[var(--vyntra-border)]">
            <img src={VYNTRA_LOGO} alt="VYNTRA" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip-demo">
                <Sparkles className="h-3 w-3" />
                Platform
              </span>
              <span className="chip-live">Live market</span>
            </div>
            <h2 className="mt-2 font-display text-2xl tracking-tight sm:text-3xl">$VYNTRA</h2>
            <p className="mt-1 max-w-xl text-sm text-[var(--vyntra-muted)] sm:text-base">
              Buy the platform token first. Protocol fees buy and burn VYNTRA from this pool.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-6 sm:gap-10">
          <div>
            <div className="label">Market cap / FDV</div>
            <div className="mt-1 font-mono text-xl font-bold sm:text-2xl">
              {ready && mcap > 0 ? `${formatNative(mcap)} HYPE` : ready ? '—' : 'Configure'}
            </div>
            {ready && mcap > 0 && <HypeUsd value={mcap} />}
          </div>
          <div>
            <div className="label">Spot</div>
            <div className="mt-1 font-mono text-xl font-bold sm:text-2xl">
              {ready && price > 0 ? `${formatNative(price)} HYPE` : '—'}
            </div>
            {ready && price > 0 && <HypeUsd value={price} />}
          </div>
          <div>
            <div className="label">Pool HYPE</div>
            <div className="mt-1 font-mono text-xl font-bold sm:text-2xl">
              {reserveNative != null ? formatNative(reserveNative) : '—'}
            </div>
            {reserveNative != null && <HypeUsd value={Number(formatEther(reserveNative))} />}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--vyntra-primary)] px-4 py-2.5 text-sm font-semibold text-[#faf8ff] transition group-hover:brightness-110">
            Trade
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  )
}
