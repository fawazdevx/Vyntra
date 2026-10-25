export type UploadPayload = {
  filename?: string
  contentType?: string
  dataBase64?: string
}

export type UploadOk = { url: string }
export type UploadErr = { error: string; status: number; detail?: string }

function buildFile(payload: UploadPayload) {
  const { filename = 'token.jpg', contentType = 'image/jpeg', dataBase64 } = payload
  if (!dataBase64 || typeof dataBase64 !== 'string') {
    return { error: 'Missing dataBase64' as const }
  }
  const buf = Buffer.from(dataBase64, 'base64')
  if (buf.byteLength === 0) return { error: 'Empty image' as const }
  if (buf.byteLength > 2_500_000) {
    return { error: 'Image too large (max ~2.5MB after compress)' as const }
  }
  const safeName = filename.replace(/[^\w.\-]+/g, '_') || 'token.jpg'
  const blob = new Blob([new Uint8Array(buf)], { type: contentType || 'image/jpeg' })
  return { blob, safeName, contentType: contentType || 'image/jpeg', size: buf.byteLength }
}

async function postMultipart(
  url: string,
  fields: Record<string, string>,
  fileField: string,
  blob: Blob,
  filename: string,
): Promise<string | null> {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  form.append(fileField, blob, filename)
  const res = await fetch(url, { method: 'POST', body: form, signal: AbortSignal.timeout(25_000) })
  const text = (await res.text()).trim()
  if (!res.ok) return null
  // hosts return raw URL or JSON
  if (/^https?:\/\//i.test(text)) return text.split(/\s+/)[0]
  try {
    const json = JSON.parse(text) as { url?: string; data?: { url?: string; display_url?: string } }
    const u = json.url || json.data?.display_url || json.data?.url
    if (u && /^https?:\/\//i.test(u)) return u
  } catch {
    // ignore
  }
  return null
}

async function uploadCatbox(blob: Blob, filename: string): Promise<string | null> {
  return postMultipart(
    'https://catbox.moe/user/api.php',
    { reqtype: 'fileupload' },
    'fileToUpload',
    blob,
    filename,
  )
}

async function uploadLitterbox(blob: Blob, filename: string): Promise<string | null> {
  return postMultipart(
    'https://litterbox.catbox.moe/resources/internals/api.php',
    { reqtype: 'fileupload', time: '72h' },
    'fileToUpload',
    blob,
    filename,
  )
}

async function uploadZeroXZero(blob: Blob, filename: string): Promise<string | null> {
  return postMultipart('https://0x0.st', {}, 'file', blob, filename)
}

/**
 * Shared upload used by Vite middleware and Vercel `/api/upload-image`.
 * Tries Catbox → Litterbox → 0x0.st so launches keep working if one host is down.
 */
export async function uploadToCatbox(payload: UploadPayload): Promise<UploadOk | UploadErr> {
  const built = buildFile(payload)
  if ('error' in built) {
    const message = built.error || 'Invalid image'
    const status = message.includes('large') ? 413 : 400
    return { error: message, status }
  }

  const { blob, safeName } = built
  const errors: string[] = []

  for (const [name, fn] of [
    ['catbox', uploadCatbox],
    ['litterbox', uploadLitterbox],
    ['0x0', uploadZeroXZero],
  ] as const) {
    try {
      const url = await fn(blob, safeName)
      if (url) return { url }
      errors.push(`${name}: rejected`)
    } catch (err) {
      errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return {
    error: 'Upload host unavailable. Paste an image URL instead.',
    status: 502,
    detail: errors.join(' · ').slice(0, 280),
  }
}
