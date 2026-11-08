const MAX_INPUT_BYTES = 8 * 1024 * 1024
const MAX_DIM = 512
const JPEG_QUALITY = 0.86

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image'))
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.readAsDataURL(blob)
  })
}

/** Resize + JPEG compress in the browser before upload. */
export async function compressTokenImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image (PNG, JPG, WebP, GIF).')
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error('Image must be under 8MB.')
  }

  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image compress failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })

    const base = file.name.replace(/\.[^.]+$/, '') || 'token'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } finally {
    bitmap.close()
  }
}

async function uploadViaLocalProxy(file: File): Promise<string | null> {
  const dataBase64 = await blobToBase64(file)
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || 'image/jpeg',
      dataBase64,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { url?: string }
  return data.url && /^https?:\/\//i.test(data.url) ? data.url : null
}

/**
 * Compress then host the image.
 * The server endpoint handles permanent image hosts without exposing an API key in the client.
 * Returns a public https URL for on-chain imageURI.
 */
export async function uploadTokenImage(file: File): Promise<string> {
  const compressed = await compressTokenImage(file)

  try {
    const viaProxy = await uploadViaLocalProxy(compressed)
    if (viaProxy) return viaProxy
  } catch {
    // The endpoint may be unavailable locally; allow the error below to explain the issue.
  }

  throw new Error(
    'Image upload failed. Check the upload endpoint or paste a public image URL that will stay available.',
  )
}
