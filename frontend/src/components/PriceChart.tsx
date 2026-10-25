import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '../lib/theme'
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
import { BotUsd } from './BotUsd'
import { botTestnet } from '../lib/chains'


function chartTheme(mode: 'light' | 'dark') {
  if (mode === 'dark') {
    return {
      background: '#14101f',
      text: '#a89bc4',
      grid: 'rgba(167, 139, 250, 0.08)',
      crosshair: 'rgba(244, 240, 255, 0.35)',
      crosshairLabel: '#1c162c',
      areaLine: '#c4b5fd',
      areaTop: 'rgba(167, 139, 250, 0.22)',
      areaBottom: 'rgba(167, 139, 250, 0.02)',
      up: '#34d399',
      down: '#f87171',
    }
  }
  return {
    background: '#ffffff',
    text: '#6b6860',
    grid: 'rgba(26,25,23,0.06)',
    crosshair: 'rgba(26,25,23,0.35)',
    crosshairLabel: '#1a1917',
    areaLine: '#1a1917',
    areaTop: 'rgba(26,25,23,0.16)',
    areaBottom: 'rgba(26,25,23,0.02)',
    up: '#0f7a4e',
    down: '#c23b3b',
  }
}

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
  loading?: boolean
  error?: boolean
  onRetry?: () => void
}

type CandleBucket = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  trades: number
}

type ChartMetric = 'mcap' | 'price'
type ChartStyle = 'auto' | 'candles' | 'line'

const TOTAL_SUPPLY = 1_000_000_000

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

function formatBotValue(value: number) {
  if (!Number.isFinite(value)) return '—'
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1_000) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value)
  }
  const decimals = Math.min(12, Math.max(3, Math.ceil(-Math.log10(abs)) + 2))
  return value.toFixed(decimals).replace(/\.?0+$/, '')
}

function formatChartValue(value: number, metric: ChartMetric) {
  return metric === 'mcap' ? formatMcap(value) : formatBotValue(value)
}

function formatChartTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp * 1000))
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
    trades: Number.isFinite(c.trades) && c.trades > 0 ? c.trades : 0,
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
        trades: 1,
      })
    } else {
      existing.high = Math.max(existing.high, t.mcap)
      existing.low = Math.min(existing.low, t.mcap)
      existing.close = t.mcap
      existing.volume += vol
      existing.trades += 1
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
    return [{ time: nowBucket, open: spot, high: spot, low: spot, close: spot, volume: 0, trades: 0 }]
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
      trades: 0,
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

export function PriceChart({
  trades,
  spotMcap,
  height = 420,
  defaultInterval = '5m',
  loading = false,
  error = false,
  onRetry,
}: Props) {
  const { theme } = useTheme()
  const shellRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const areaRef = useRef<ISeriesApi<'Area'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const barCountRef = useRef(0)
  const candleLookupRef = useRef(new Map<number, CandleBucket>())

  const [intervalId, setIntervalId] = useState(defaultInterval)
  const interval = CHART_INTERVALS.find((i) => i.id === intervalId) ?? CHART_INTERVALS[1]
  const [metric, setMetric] = useState<ChartMetric>('mcap')
  const [chartStyle, setChartStyle] = useState<ChartStyle>('auto')
  const [hoveredTime, setHoveredTime] = useState<number | null>(null)
  const [ready, setReady] = useState(false)
  const metricRef = useRef(metric)
  metricRef.current = metric

  const marketStats = useMemo(() => {
    const ordered = trades
      .filter((trade) => Number.isFinite(trade.time) && finitePositive(trade.mcap))
      .slice()
      .sort((a, b) => a.time - b.time)
    const currentMcap = finitePositive(spotMcap ?? 0) ? spotMcap! : ordered[ordered.length - 1]?.mcap
    const cutoff = Math.floor(Date.now() / 1000) - 86_400
    const recent = ordered.filter((trade) => trade.time >= cutoff)
    const previous = ordered.filter((trade) => trade.time < cutoff).at(-1)
    const referenceMcap = recent.length > 0 ? previous?.mcap ?? recent[0].mcap : undefined
    const changePct =
      finitePositive(currentMcap ?? 0) && finitePositive(referenceMcap ?? 0)
        ? ((currentMcap! - referenceMcap!) / referenceMcap!) * 100
        : undefined

    return {
      currentMcap: currentMcap ?? 0,
      currentPrice: (currentMcap ?? 0) / TOTAL_SUPPLY,
      changePct,
      volumeBot: recent.reduce((sum, trade) => sum + (trade.amountBot > 0 ? trade.amountBot : 0), 0),
      trades24h: recent.length,
    }
  }, [trades, spotMcap])

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
  const noTradeHistory = trades.length === 0
  const useArea =
    chartStyle === 'line' ||
    (chartStyle === 'auto' && realCandleCount > 0 && realCandleCount < AREA_UNTIL_CANDLES)
  const hoveredCandle = hoveredTime == null ? null : candleLookupRef.current.get(hoveredTime) ?? null

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const colors = chartTheme(theme)
    const chart = createChart(el, {
      autoSize: true,
      height,
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.text,
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: colors.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: colors.crosshairLabel,
        },
        horzLine: {
          color: colors.crosshair,
          width: 1,
          style: 2,
          labelBackgroundColor: colors.crosshairLabel,
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
      minMove: 0.000000000001,
      formatter: (value: number) => formatChartValue(value, metricRef.current),
    }

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat,
      autoscaleInfoProvider: ((original) => padPriceRange(original())) as AutoscaleInfoProvider,
    })

    const area = chart.addSeries(AreaSeries, {
      lineColor: colors.areaLine,
      topColor: colors.areaTop,
      bottomColor: colors.areaBottom,
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

    const handleCrosshairMove = (param: Parameters<typeof chart.subscribeCrosshairMove>[0] extends (arg: infer T) => void ? T : never) => {
      setHoveredTime(typeof param.time === 'number' ? param.time : null)
    }
    chart.subscribeCrosshairMove(handleCrosshairMove)
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
      chart.unsubscribeCrosshairMove(handleCrosshairMove)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      areaRef.current = null
      volumeRef.current = null
    }
  }, [height, theme])

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
      candleLookupRef.current.clear()
      barCountRef.current = 0
      return
    }

    try {
      const displayValue = (value: number) => metric === 'mcap' ? value : value / TOTAL_SUPPLY
      const chartPoints = points.map((p) =>
        isWhitespace(p)
          ? p
          : {
              ...p,
              open: displayValue(p.open),
              high: displayValue(p.high),
              low: displayValue(p.low),
              close: displayValue(p.close),
            },
      )
      candleLookupRef.current = new Map(
        points.filter((p): p is CandleBucket => !isWhitespace(p)).map((p) => [p.time, p]),
      )

      const candleData: (CandlestickData | WhitespaceData)[] = chartPoints.map((p) => {
        if (isWhitespace(p)) return { time: p.time as UTCTimestamp }
        return {
          time: p.time as UTCTimestamp,
          open: p.open,
          high: p.high,
          low: p.low,
          close: p.close,
        }
      })

      const areaData: (AreaData | WhitespaceData)[] = chartPoints.map((p) => {
        if (isWhitespace(p)) return { time: p.time as UTCTimestamp }
        return {
          time: p.time as UTCTimestamp,
          value: p.close,
        }
      })

      const volumeData: (HistogramData | WhitespaceData)[] = chartPoints.map((p) => {
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
  }, [points, interval.seconds, ready, useArea, metric])

  const statusLabel = error ? 'Trade data issue' : loading ? 'Updating trades' : 'On-chain trades'
  const emptyOverlay = loading && noTradeHistory
    ? {
        title: 'Loading chart data',
        message: 'Fetching recent trades from the testnet.',
      }
    : error && noTradeHistory
      ? {
          title: 'Chart data unavailable',
          message: 'Could not fetch testnet trades. Try loading them again.',
        }
      : !loading && !error && noTradeHistory
        ? {
            title: 'Waiting for the first trade',
            message: 'Current BOT values are shown above. Price history starts when a trade is recorded.',
          }
        : empty
          ? {
              title: 'No chartable trades',
              message: 'Trade history is available, but it does not contain valid price data yet.',
            }
          : null

  const metricLabel = metric === 'mcap' ? 'Market cap · BOT' : 'Token price · BOT / token'

  return (
    <div
      ref={shellRef}
      className="relative w-full overflow-hidden rounded-xl border border-[var(--vyntra-border)] bg-[var(--vyntra-card)]"
    >
      <div className="space-y-3 border-b border-[var(--vyntra-border)] px-3 py-3 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-muted)]">
              {metricLabel}
            </span>
            <span className="rounded border border-amber-400/25 bg-amber-400/[0.08] px-2 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              {botTestnet.name}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded border border-[var(--vyntra-border)] px-2 py-1 font-mono text-[10px] text-[var(--vyntra-muted)]">
              <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-rose-400' : loading ? 'animate-pulse bg-amber-300' : 'bg-[var(--vyntra-success)]'}`} />
              {statusLabel}
            </span>
            {chartStyle === 'auto' && useArea && (
              <span className="rounded border border-[var(--vyntra-border)] px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-[var(--vyntra-faint)]">
                Early chart
              </span>
            )}
            {error && trades.length > 0 && onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="font-mono text-[10px] font-semibold text-rose-300 underline decoration-rose-300/40 underline-offset-2 hover:text-rose-200"
              >
                Retry update
              </button>
            )}
          </div>

          <div
            className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-0.5"
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
                  className={`min-w-[2.4rem] shrink-0 rounded px-2 py-1.5 font-mono text-xs font-semibold tabular-nums transition ${
                    active
                      ? 'bg-[var(--vyntra-fg)] text-[var(--vyntra-bg)]'
                      : 'text-[var(--vyntra-muted)] hover:bg-[var(--vyntra-elev)] hover:text-[var(--vyntra-fg)]'
                  }`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-0.5" role="tablist" aria-label="Chart metric">
              {([
                ['mcap', 'Market cap'],
                ['price', 'Token price'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={metric === id}
                  onClick={() => setMetric(id)}
                  className={`rounded px-2.5 py-1.5 font-mono text-[10px] font-semibold transition ${
                    metric === id
                      ? 'bg-[var(--vyntra-fg)] text-[var(--vyntra-bg)]'
                      : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-md border border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-0.5" role="tablist" aria-label="Chart style">
              {([
                ['auto', 'Auto'],
                ['candles', 'Candles'],
                ['line', 'Line'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={chartStyle === id}
                  onClick={() => setChartStyle(id)}
                  className={`rounded px-2.5 py-1.5 font-mono text-[10px] font-semibold transition ${
                    chartStyle === id
                      ? 'bg-[var(--vyntra-fg)] text-[var(--vyntra-bg)]'
                      : 'text-[var(--vyntra-muted)] hover:text-[var(--vyntra-fg)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] leading-4 text-[var(--vyntra-faint)]">
            USD is an estimate using the mainnet BOT reference price; testnet BOT has no market-set dollar value.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--vyntra-border)] sm:grid-cols-3 xl:grid-cols-5 xl:divide-y-0">
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--vyntra-faint)]">Market cap</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-[var(--vyntra-fg)]">{marketStats.currentMcap > 0 ? `${formatBotValue(marketStats.currentMcap)} BOT` : '—'}</p>
          {marketStats.currentMcap > 0 && <BotUsd value={marketStats.currentMcap} className="mt-1 block text-[10px] text-[var(--vyntra-faint)]" />}
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--vyntra-faint)]">Token price</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-[var(--vyntra-fg)]">{marketStats.currentPrice > 0 ? `${formatBotValue(marketStats.currentPrice)} BOT` : '—'}</p>
          {marketStats.currentPrice > 0 && <BotUsd value={marketStats.currentPrice} className="mt-1 block text-[10px] text-[var(--vyntra-faint)]" />}
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--vyntra-faint)]">24h change</p>
          <p className={`mt-1 truncate font-mono text-xs font-semibold ${marketStats.changePct == null ? 'text-[var(--vyntra-muted)]' : marketStats.changePct >= 0 ? 'text-[var(--vyntra-success)]' : 'text-rose-400'}`}>
            {marketStats.changePct == null ? '—' : `${marketStats.changePct >= 0 ? '+' : ''}${marketStats.changePct.toFixed(2)}%`}
          </p>
          <p className="mt-1 text-[10px] text-[var(--vyntra-faint)]">From recorded trades</p>
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--vyntra-faint)]">24h volume</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-[var(--vyntra-fg)]">{formatBotValue(marketStats.volumeBot)} BOT</p>
          <BotUsd value={marketStats.volumeBot} className="mt-1 block text-[10px] text-[var(--vyntra-faint)]" />
        </div>
        <div className="min-w-0 px-3 py-3 sm:px-4">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--vyntra-faint)]">24h trades</p>
          <p className="mt-1 truncate font-mono text-xs font-semibold text-[var(--vyntra-fg)]">{marketStats.trades24h.toLocaleString()}</p>
          <p className="mt-1 text-[10px] text-[var(--vyntra-faint)]">On BOT Chain Testnet</p>
        </div>
      </div>

      <div className="relative w-full" style={{ height }}>
        <div ref={containerRef} className="absolute inset-0" />
        {hoveredCandle && (
          <div className="pointer-events-none absolute left-3 top-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg border border-[var(--vyntra-border)] bg-[color-mix(in_srgb,var(--vyntra-card)_94%,transparent)] px-3 py-2 shadow-lg backdrop-blur-sm">
            <p className="mb-2 font-mono text-[9px] uppercase tracking-wide text-[var(--vyntra-faint)]">
              {formatChartTime(hoveredCandle.time)} · {hoveredCandle.trades} trades
            </p>
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-6">
              {([
                ['O', hoveredCandle.open],
                ['H', hoveredCandle.high],
                ['L', hoveredCandle.low],
                ['C', hoveredCandle.close],
              ] as const).map(([label, rawValue]) => (
                <div key={label}>
                  <p className="font-mono text-[9px] text-[var(--vyntra-faint)]">{label}</p>
                  <p className="font-mono text-[10px] font-semibold text-[var(--vyntra-fg)]">
                    {formatChartValue(metric === 'mcap' ? rawValue : rawValue / TOTAL_SUPPLY, metric)}
                  </p>
                </div>
              ))}
              <div>
                <p className="font-mono text-[9px] text-[var(--vyntra-faint)]">VOL</p>
                <p className="font-mono text-[10px] font-semibold text-[var(--vyntra-fg)]">{formatBotValue(hoveredCandle.volume)} BOT</p>
                <BotUsd value={hoveredCandle.volume} className="font-mono text-[9px] text-[var(--vyntra-faint)]" />
              </div>
              <div>
                <p className="font-mono text-[9px] text-[var(--vyntra-faint)]">UNIT</p>
                <p className="font-mono text-[10px] font-semibold text-[var(--vyntra-fg)]">{metric === 'mcap' ? 'BOT mcap' : 'BOT / token'}</p>
              </div>
            </div>
          </div>
        )}
        {emptyOverlay && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[color-mix(in_srgb,var(--vyntra-card)_88%,transparent)] px-4 text-center backdrop-blur-[1px]">
            <div className="max-w-sm">
              {(loading && noTradeHistory) && <span className="mx-auto mb-3 block h-5 w-5 animate-spin rounded-full border-2 border-[var(--vyntra-border)] border-t-[var(--vyntra-fg)]" />}
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-[var(--vyntra-fg)]">{emptyOverlay.title}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--vyntra-muted)]">{emptyOverlay.message}</p>
              {error && noTradeHistory && onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="pointer-events-auto mt-4 rounded-md border border-[var(--vyntra-border)] px-3 py-2 font-mono text-xs font-semibold text-[var(--vyntra-fg)] transition hover:bg-[var(--vyntra-elev)]"
                >
                  Retry loading chart
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
