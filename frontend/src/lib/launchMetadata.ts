export type LaunchLinks = {
  website: string
  x: string
  telegram: string
}

export type ParsedLaunchDescription = {
  description: string
  links: LaunchLinks
}

const LINKS_MARKER = '\n\nVyntra links:\n'
const emptyLinks = (): LaunchLinks => ({ website: '', x: '', telegram: '' })

function safeLink(value: string, kind: keyof LaunchLinks) {
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return ''
    const host = parsed.hostname.toLowerCase()
    if (kind === 'x' && !['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(host)) return ''
    if (kind === 'telegram' && !['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(host)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export function normalizeWebsite(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Website link must use http or https.')
  }
  return parsed.toString().replace(/\/$/, '')
}

export function normalizeSocialLink(value: string, service: 'x' | 'telegram') {
  const raw = value.trim()
  if (!raw) return ''

  const canonicalHost = service === 'x' ? 'x.com' : 't.me'
  const acceptedHosts = service === 'x'
    ? new Set(['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'])
    : new Set(['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'])

  if (/^https?:\/\//i.test(raw)) {
    const parsed = new URL(raw)
    if (!acceptedHosts.has(parsed.hostname.toLowerCase())) {
      throw new Error(`Enter a ${service === 'x' ? 'X' : 'Telegram'} handle or link.`)
    }
    parsed.protocol = 'https:'
    parsed.hostname = canonicalHost
    return parsed.toString().replace(/\/$/, '')
  }

  const handle = raw.replace(/^@/, '').replace(/^\//, '')
  if (!/^[A-Za-z0-9_]{1,64}$/.test(handle)) {
    throw new Error(`Enter a valid ${service === 'x' ? 'X' : 'Telegram'} handle.`)
  }
  return `https://${canonicalHost}/${handle}`
}

export function buildLaunchDescription(description: string, links: LaunchLinks) {
  const rows = [
    links.website ? `Website: ${links.website}` : '',
    links.x ? `X: ${links.x}` : '',
    links.telegram ? `Telegram: ${links.telegram}` : '',
  ].filter(Boolean)

  return rows.length > 0
    ? `${description.trim()}${LINKS_MARKER}${rows.join('\n')}`
    : description.trim()
}

export function parseLaunchDescription(raw: string): ParsedLaunchDescription {
  const markerAt = raw.lastIndexOf(LINKS_MARKER)
  if (markerAt < 0) return { description: raw, links: emptyLinks() }

  const description = raw.slice(0, markerAt).trimEnd()
  const metadata = raw.slice(markerAt + LINKS_MARKER.length)
  const links = emptyLinks()

  for (const row of metadata.split('\n')) {
    const separator = row.indexOf(':')
    if (separator < 0) continue
    const key = row.slice(0, separator).trim().toLowerCase()
    const value = row.slice(separator + 1).trim()
    if (key === 'website') links.website = safeLink(value, 'website')
    if (key === 'x') links.x = safeLink(value, 'x')
    if (key === 'telegram') links.telegram = safeLink(value, 'telegram')
  }

  return { description, links }
}
