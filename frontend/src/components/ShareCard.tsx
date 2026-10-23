import { useMemo, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { formatBot, type LaunchView } from '../lib/config'

type Props = {
  launch: LaunchView
  compact?: boolean
}

export function ShareCard({ launch, compact }: Props) {
  const [copied, setCopied] = useState(false)
  const url = useMemo(() => {
    if (typeof window === 'undefined') return `/token/${launch.id}`
    return `${window.location.origin}/token/${launch.id}`
  }, [launch.id])

  const shareText = useMemo(() => {
    const status = launch.migrated
      ? 'live on BDEX'
      : launch.graduated
        ? 'graduated'
        : `${Math.min(100, launch.progressBps / 100).toFixed(0)}% to graduate`
    return `$${launch.symbol} · ${launch.name} — ${status} · ${formatBot(launch.raisedBot)} BOT raised on Vyntra`
  }, [launch])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${shareText}\n${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }

  async function nativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `$${launch.symbol} on Vyntra`, text: shareText, url })
        return
      } catch {
        // fall through to copy
      }
    }
    await copyLink()
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={nativeShare}>
          <Share2 className="h-4 w-4" />
          Share
        </button>
        <button type="button" className="btn-ghost px-3 py-2 text-sm" onClick={copyLink}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-4 border-b border-[var(--vyntra-border)] bg-[var(--vyntra-elev)] p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white text-sm font-bold">
          {launch.imageURI ? (
            <img src={launch.imageURI} alt="" className="h-full w-full object-cover" />
          ) : (
            launch.symbol.slice(0, 2)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="page-kicker">Share card</p>
          <p className="truncate font-display text-xl leading-tight">{launch.name}</p>
          <p className="font-mono text-sm text-[var(--vyntra-muted)]">${launch.symbol}</p>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm leading-relaxed text-[var(--vyntra-muted)]">{shareText}</p>
        <p className="truncate font-mono text-xs text-[var(--vyntra-faint)]">{url}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary px-4 py-2.5 text-sm" onClick={nativeShare}>
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button type="button" className="btn-ghost px-4 py-2.5 text-sm" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>
  )
}
