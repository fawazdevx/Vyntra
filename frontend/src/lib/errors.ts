/** Turn wagmi / viem / RPC / config noise into short user-facing copy. */
export function formatUserError(err: unknown, fallback = 'Something went wrong. Try again.'): string {
  const raw = extractMessage(err)
  if (!raw) return fallback

  const m = raw.toLowerCase()

  // Config / env (never show VITE_* or .env paths to users)
  if (
    m.includes('vite_factory') ||
    m.includes('vite_') ||
    m.includes('.env') ||
    m.includes('is required. set it') ||
    m.includes('factory address')
  ) {
    return 'App is not configured yet. Please try again later.'
  }

  // Wallet / user actions
  if (
    m.includes('user rejected') ||
    m.includes('user denied') ||
    m.includes('rejected the request') ||
    m.includes('denied transaction') ||
    m.includes('request rejected')
  ) {
    return 'Transaction cancelled in wallet.'
  }

  if (m.includes('connector not connected') || m.includes('connection interrupted')) {
    return 'Wallet disconnected. Connect again to continue.'
  }

  if (m.includes('no client') || m.includes('no provider')) {
    return 'Wallet or network not ready. Connect and try again.'
  }

  // Chain
  if (
    m.includes('chain mismatch') ||
    m.includes('wrong chain') ||
    m.includes('unsupported chain') ||
    m.includes('switch chain') ||
    m.includes('chain id')
  ) {
    return 'Wrong network. Switch to BOT Chain and try again.'
  }

  // Funds / gas
  if (
    m.includes('insufficient funds') ||
    m.includes('insufficient balance') ||
    m.includes('exceeds balance') ||
    m.includes('gas required exceeds') ||
    m.includes('outoffunds') ||
    m.includes('out of funds')
  ) {
    return 'Not enough BOT for this trade (including network fee).'
  }

  // Spawn / factory domain errors
  if (m.includes('badimage')) return 'Image is required — upload a file or paste a URL.'
  if (m.includes('baddescription')) return 'Description is required before spawning.'
  if (m.includes('nametaken')) return 'That name is already taken — choose another.'
  if (m.includes('symboltaken')) return 'That ticker is already taken — choose another.'
  if (m.includes('badname')) return 'Enter a valid name (1–32 characters).'
  if (m.includes('badsymbol')) return 'Enter a valid symbol (1–10 characters).'

  // Trade / curve
  if (m.includes('slippage')) return 'Price moved too much. Try a smaller size or try again.'
  if (m.includes('maxbuy') || m.includes('antisnipe') || m.includes('anti-snipe')) {
    return 'Early buy limit — wait a moment or buy a smaller amount.'
  }
  if (m.includes('graduatedalready') || m.includes('curve closed')) {
    return 'This market has graduated. Trading is still open here.'
  }
  if (m.includes('allowance') || m.includes('transfer amount exceeds')) {
    return 'Token approval needed — approve and try again.'
  }

  // Uploads
  if (m.includes('upload failed') || m.includes('image upload') || m.includes('compress failed')) {
    return 'Image upload failed. Try another file or paste an image URL.'
  }
  if (m.includes('file must be an image') || m.includes('under 8mb')) {
    return raw.length <= 120 ? raw : 'Use a PNG, JPG, WebP, or GIF under 8MB.'
  }

  // RPC / network
  if (
    m.includes('failed to fetch') ||
    m.includes('network error') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    m.includes('503') ||
    m.includes('502') ||
    m.includes('http request failed') ||
    m.includes('rpc')
  ) {
    return 'Network issue. Check your connection and retry.'
  }

  if (m.includes('nonce too low') || m.includes('nonce too high') || m.includes('replacement transaction')) {
    return 'Wallet nonce conflict. Wait a moment and retry.'
  }

  // Generic contract revert without a known selector
  if (
    m.includes('execution reverted') ||
    m.includes('contractfunctionexecutionerror') ||
    m.includes('call_exception')
  ) {
    const short = shortRevertReason(raw)
    return short || 'Transaction failed. Check your inputs and try again.'
  }

  // Strip hex / verbose viem wrappers if somehow still long
  if (raw.length > 160 || m.includes('version=') || m.includes('docs=') || m.includes('args:')) {
    return fallback
  }

  // Already-friendly short messages
  if (raw.length <= 120 && !m.includes('0x') && !m.includes('http')) {
    return raw
  }

  return fallback
}

function extractMessage(err: unknown): string {
  if (!err) return ''
  if (typeof err === 'string') return err.trim()
  if (err instanceof Error) {
    const anyErr = err as Error & {
      shortMessage?: string
      details?: string
      cause?: unknown
      walk?: () => Error
    }
    const parts = [anyErr.shortMessage, anyErr.message, anyErr.details]
      .filter(Boolean)
      .map(String)
    if (anyErr.cause) {
      const nested = extractMessage(anyErr.cause)
      if (nested) parts.push(nested)
    }
    return parts.join(' | ')
  }
  if (typeof err === 'object' && err !== null && 'message' in err) {
    return String((err as { message: unknown }).message)
  }
  return String(err)
}

function shortRevertReason(raw: string): string | null {
  const match =
    raw.match(/reason:\s*([^\n]+)/i) ||
    raw.match(/reverted with reason string ['"]([^'"]+)['"]/i) ||
    raw.match(/error=\{?"?([^"}\n]+)["}]?/i)
  if (!match?.[1]) return null
  const reason = match[1].trim()
  if (reason.length < 3 || reason.length > 100) return null
  if (/^0x[0-9a-f]+$/i.test(reason)) return null
  return reason
}
