import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  AreaSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type AreaData,
  type WhitespaceData,
  type UTCTimestamp,
  type AutoscaleInfo,
  type AutoscaleInfoProvider,
} from 'lightweight-charts'
import type { TradePoint } from '../hooks/useTradeHistory'

export type ChartInterval = {
  id: string
  label: string
  seconds: number
}

/** Launchpad intervals — 5m default matches DexScreener / pump-style token pages. */
export const CHART_INTERVALS: ChartInterval[] = [
  { id: '1m', label: '1m', seconds: 60 },
  { id: '5m', label: '5m', seconds: 300 },
  { id: '15m', label: '15m', seconds: 900 },
  { id: '1H', label: '1H', seconds: 3600 },
  { id: '4H', label: '4H', seconds: 14_400 },
  { id: '1D', label: '1D', seconds: 86_400 },
]

type Props = {
  trades: TradePoint[]
  spotMcap?: number
  height?: number
  defaultInterval?: string
}

type CandleBucket = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/**
 * Target pixel width per bar — DexScreener / pump keep these thin.
 * Visible bar count is derived from chart width / BAR_SPACING so
 * setVisibleLogicalRange never stretches a handful of candles across the pane.
 */
const BAR_SPACING = 5
const MIN_BAR_SPACING = 2
const MAX_BAR_SPACING = 12
const RIGHT_OFFSET = 10
/** Floor so sparse tokens still sit as skinny bars on the right. */
const MIN_BARS_IN_VIEW = 100
/** Prefer area until enough real (non-whitespace) candles exist. */
const AREA_UNTIL_CANDLES = 6
/** Cap quiet-period whitespace so series stay bounded. */
const MAX_GAP_FILL = 96
const MAX_FORWARD_FILL = 48

function floorBucket(ts: number, intervalSec: number) {
  return Math.floor(ts / intervalSec) * intervalSec
}

function finitePositive(n: number) {
  return Number.isFinite(n) && n > 0
}

function formatMcap(price: number) {
  if (!Number.isFinite(price)) return '—'
  if (price >= 1_000_000) return `${(price / 1_000_000).toFixed(2)}M`
  if (price >= 1_000) return `${(price / 1_000).toFixed(2)}K`
  if (price >= 1) return price.toFixed(2)
  if (price >= 0.01) return price.toFixed(4)
  return price.toFixed(6)
}

function sanitizeCandle(c: CandleBucket): CandleBucket | null {
  if (!finitePositive(c.open) && !finitePositive(c.close)) return null
  const open = finitePositive(c.open) ? c.open : c.close
  const close = finitePositive(c.close) ? c.close : c.open
  if (!finitePositive(open) || !finitePositive(close)) return null
  return {
    time: c.time,
    open,
    high: Math.max(c.high || open, open, close),
    low: Math.min(c.low || open, open, close),
    close,
    volume: Number.isFinite(c.volume) && c.volume > 0 ? c.volume : 0,
  }
}

function aggregateCandles(trades: TradePoint[], intervalSec: number): CandleBucket[] {
  const map = new Map<number, CandleBucket>()

  for (const t of trades) {
    if (!finitePositive(t.mcap) || !Number.isFinite(t.time) || t.time <= 0) continue
    const time = floorBucket(Math.floor(t.time), intervalSec)
    const vol = Number.isFinite(t.amountBot) && t.amountBot > 0 ? t.amountBot : 0
    const existing = map.get(time)
    if (!existing) {
      map.set(time, {
        time,
        open: t.mcap,
        high: t.mcap,
        low: t.mcap,
        close: t.mcap,
        volume: vol,
      })
    } else {
      existing.high = Math.max(existing.high, t.mcap)
      existing.low = Math.min(existing.low, t.mcap)
      existing.close = t.mcap
      existing.volume += vol
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.time - b.time)
    .map(sanitizeCandle)
    .filter((c): c is CandleBucket => c != null)
}

type SeriesPoint = CandleBucket | { time: number; whitespace: true }

function isWhitespace(p: SeriesPoint): p is { time: number; whitespace: true } {
  return 'whitespace' in p && p.whitespace === true
}

/**
 * Insert whitespace for quiet buckets (DexScreener-style empty slots)
 * instead of flat OHLC candles that look like fake fat bodies.
 */
function fillGapsWithWhitespace(candles: CandleBucket[], intervalSec: number): SeriesPoint[] {
  if (candles.length === 0) return []
  if (candles.length === 1) return candles

  const out: SeriesPoint[] = []
  for (let i = 0; i < candles.length; i++) {
    const cur = candles[i]
    if (i > 0) {
      const prev = candles[i - 1]
      const gap = Math.floor((cur.time - prev.time) / intervalSec) - 1
      if (gap > 0 && gap <= MAX_GAP_FILL) {
        let t = prev.time + intervalSec
        while (t < cur.time) {
          out.push({ time: t, whitespace: true })
          t += intervalSec
        }
      }
    }
    out.push(cur)
  }
  return out
}

function withSpot(points: SeriesPoint[], spotMcap: number | undefined, intervalSec: number): SeriesPoint[] {
  if (!finitePositive(spotMcap ?? 0)) return points
  const spot = spotMcap as number
  const nowBucket = floorBucket(Math.floor(Date.now() / 1000), intervalSec)

  if (points.length === 0) {
    return [{ time: nowBucket, open: spot, high: spot, low: spot, close: spot, volume: 0 }]
  }

  const out = points.map((p) => (isWhitespace(p) ? { ...p } : { ...p }))
  const last = out[out.length - 1]

  if (!isWhitespace(last) && nowBucket === last.time) {
    last.high = Math.max(last.high, spot)
    last.low = Math.min(last.low, spot)
    last.close = spot
    return out
  }

  const lastTime = last.time
  if (nowBucket > lastTime) {
    let t = lastTime + intervalSec
    let filled = 0
    while (t < nowBucket && filled < MAX_FORWARD_FILL) {
      out.push({ time: t, whitespace: true })
      t += intervalSec
      filled++
    }
    const prevClose = !isWhitespace(last)
      ? last.close
      : (() => {
          for (let i = out.length - 1; i >= 0; i--) {
            const p = out[i]
            if (!isWhitespace(p)) return p.close
          }
          return spot
        })()
    out.push({
      time: nowBucket,
      open: prevClose,
      high: Math.max(prevClose, spot),
      low: Math.min(prevClose, spot),
      close: spot,
      volume: 0,
    })
  }

  return out
}

/** Pad left with whitespace so sparse candles sit thin on the right. */
function padLeftWhitespace(points: SeriesPoint[], intervalSec: number, minSlots: number): SeriesPoint[] {
  if (points.length === 0) return points
  const need = minSlots - points.length
  if (need <= 0) return points
  const first = points[0].time
  const pad: SeriesPoint[] = []
  for (let i = need; i >= 1; i--) {
    pad.push({ time: first - i * intervalSec, whitespace: true })
  }
  return [...pad, ...points]
}

function padPriceRange(info: AutoscaleInfo | null): AutoscaleInfo | null {
  if (!info?.priceRange) return info
  const { minValue, maxValue } = info.priceRange
  const span = Math.max(maxValue - minValue, 0)
  // Sparse / flat series: exaggerate less by giving the pane breathing room
  const pad = span > 0 ? span * 0.35 : Math.max(maxValue * 0.12, 1e-9)
  return {
    ...info,
    priceRange: {
      minValue: Math.max(0, minValue - pad),
      maxValue: maxValue + pad,
    },
  }
}

function applyVisibleRange(chart: IChartApi, barCount: number, widthPx: number) {
  const ts = chart.timeScale()
  const width = widthPx > 0 ? widthPx : 800
  // Fit enough logical bars that each stays ~BAR_SPACING px wide
  const barsInView = Math.max(MIN_BARS_IN_VIEW, Math.floor(width / BAR_SPACING))
  const to = barCount - 1 + RIGHT_OFFSET
  const from = to - barsInView

  ts.applyOptions({
    barSpacing: BAR_SPACING,
    minBarSpacing: MIN_BAR_SPACING,
    maxBarSpacing: MAX_BAR_SPACING,
    rightOffset: RIGHT_OFFSET,
  })
  ts.setVisibleLogicalRange({ from, to })
}

export function PriceChart({ trades, spotMcap, height = 420, defaultInterval = '5m' }: Props) {
  const shellRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const barCountRef = useRef(0)

  const [intervalId, setIntervalId] = useState(defaultInterval)
  const interval = CHART_INTERVALS.find((i) => i.id === intervalId) ?? CHART_INTERVALS[1]
  const [ready, setReady] = useState(false)

  const { points, realCandleCount } = useMemo(() => {
    const raw = aggregateCandles(trades, interval.seconds)
    const gapped = fillGapsWithWhitespace(raw, interval.seconds)
    const spotted = withSpot(gapped, spotMcap, interval.seconds)
    const real = spotted.filter((p) => !isWhitespace(p)).length
    // Left pad so a few candles never dominate the pane width
    const padded = padLeftWhitespace(spotted, interval.seconds, MIN_BARS_IN_VIEW)
    return { points: padded, realCandleCount: real }
  }, [trades, spotMcap, interval.seconds])

  const empty = realCandleCount === 0
  const useArea = realCandleCount > 0 && realCandleCount < AREA_UNTIL_CANDLES

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#6b6860',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(26,25,23,0.06)' },
        horzLines: { color: 'rgba(26,25,23,0.06)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(26,25,23,0.35)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a1917',
        },
        horzLine: {
          color: 'rgba(26,25,23,0.35)',
          width: 1,
          style: 2,
          labelBackgroundColor: '#1a1917',
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.18, bottom: 0.26 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: RIGHT_OFFSET,
        barSpacing: BAR_SPACING,
        minBarSpacing: MIN_BAR_SPACING,
        maxBarSpacing: MAX_BAR_SPACING,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    })

    const priceFormat = {
      type: 'custom' as const,
      minMove: 0.000001,
      formatter: formatMcap,
    }

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#0f7a4e',
      downColor: '#c23b3b',
      borderVisible: false,
      wickUpColor: '#0f7a4e',
      wickDownColor: '#c23b3b',
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat,
      autoscaleInfoProvider: ((original) => padPriceRange(original())) as AutoscaleInfoProvider,
    })

    const area = chart.addSeries(AreaSeries, {
      lineColor: '#1a1917',
      topColor: 'rgba(26,25,23,0.16)',
      bottomColor: 'rgba(26,25,23,0.02)',
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat,
      visible: false,
      autoscaleInfoProvider: ((original) => padPriceRange(original())) as AutoscaleInfoProvider,
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.84, bottom: 0 },
    })

    chartRef.current = chart
    candleRef.current = candles
    areaRef.current = area
    volumeRef.current = volume
    setReady(true)

    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      if (w > 0) {
        chart.applyOptions({ width: w, height })
        if (barCountRef.current > 0) applyVisibleRange(chart, barCountRef.current, w)
      }
    })
    ro.observe(el)

    requestAnimationFrame(() => {
      const w = el.clientWidth
      if (w > 0) chart.applyOptions({ width: w, height })
    })

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      areaRef.current = null
      volumeRef.current = null
    }
  }, [height])

  useEffect(() => {
    chartRef.current?.applyOptions({
      timeScale: {
        timeVisible: true,
        secondsVisible: interval.seconds <= 60,
        barSpacing: BAR_SPACING,
        minBarSpacing: MIN_BAR_SPACING,
        maxBarSpacing: MAX_BAR_SPACING,
      },
    })
  }, [interval.seconds])

  useEffect(() => {
    if (!ready || !candleRef.current || !volumeRef.current || !areaRef.current || !chartRef.current) {
      return
    }
    if (points.length === 0) {
      candleRef.current.setData([])
      areaRef.current.setData([])
      volumeRef.current.setData([])
      barCountRef.current = 0
      return
    }

    try {
      const candleData: (CandlestickData | WhitespaceData)[] = points.map((p) => {
        if (isWhitespace(p)) return { time: p.time as UTCTimestamp }
        return {
          time: p.time as UTCTimestamp,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        }
      })

      const areaData: (AreaData | WhitespaceData)[] = points.map((p) => {
        if (isWhitespace(p)) return { time: p.time as UTCTimestamp }
        return {
          time: p.time as UTCTimestamp,
          value: p.close,
        }
      })

      const volumeData: (HistogramData | WhitespaceData)[] = points.map((p) => {
        if (isWhitespace(p)) return { time: p.time as UTCTimestamp }
        return {
          time: p.time as UTCTimestamp,
          value: p.volume,
          color: p.close >= p.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
        }
      })

      candleRef.current.setData(candleData)
      areaRef.current.setData(areaData)
      volumeRef.current.setData(volumeData)
      barCountRef.current = candleData.length

      candleRef.current.applyOptions({ visible: !useArea })
      areaRef.current.applyOptions({ visible: useArea })

      const w = containerRef.current?.clientWidth ?? 800
      applyVisibleRange(chartRef.current, candleData.length, w)
    } catch (err) {
      console.error('[PriceChart] failed to set series data', err)
    }
  }, [points, interval.seconds, ready, useArea])

  return (
    <div
      ref={shellRef}
      className="relative w-full overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vyntra-border)] px-4 py-2.5 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--vyntra-muted)]">
            Market cap
          </span>
          <span className="hidden items-center gap-1.5 font-mono text-[11px] text-[var(--vyntra-success)] sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--vyntra-success)]" />
            Live
          </span>
          {useArea && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
              Early chart
            </span>
          )}
        </div>
        <div
          className="flex flex-wrap items-center gap-0.5 rounded-md border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-0.5"
          role="tablist"
          aria-label="Chart interval"
        >
          {CHART_INTERVALS.map((opt) => {
            const active = opt.id === interval.id
            return (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setIntervalId(opt.id)}
                className={`min-w-[2.4rem] rounded px-2 py-1 font-mono text-xs font-semibold tabular-nums transition ${
                  active
                    ? 'bg-[var(--vyntra-fg)] text-[var(--vyntra-bg)]'
                    : 'text-[var(--vyntra-muted)] hover:bg-white hover:text-[var(--vyntra-fg)]'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="relative w-full" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {empty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/95">
            <div className="text-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--vyntra-faint)]">No trades yet</p>
              <p className="mt-2 text-sm text-[var(--vyntra-muted)]">Chart appears after the first buy</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
