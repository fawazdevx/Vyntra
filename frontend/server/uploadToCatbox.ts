export type UploadPayload = {
  filename?: string
  contentType?: string
  dataBase64?: string
}

export type UploadOk = { url: string }
export type UploadErr = { error: string; status: number; detail?: string }

/** Shared Catbox upload used by Vite middleware and Vercel `/api/upload-image`. */
export async function uploadToCatbox(payload: UploadPayload): Promise<UploadOk | UploadErr> {
  const { filename = 'token.jpg', contentType = 'image/jpeg', dataBase64 } = payload

  if (!dataBase64 || typeof dataBase64 !== 'string') {
    return { error: 'Missing dataBase64', status: 400 }
  }

  const buf = Buffer.from(dataBase64, 'base64')
  if (buf.byteLength === 0) {
    return { error: 'Empty image', status: 400 }
  }
  if (buf.byteLength > 2_500_000) {
    return { error: 'Image too large (max ~2.5MB after compress)', status: 413 }
  }

  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append(
    'fileToUpload',
    new Blob([new Uint8Array(buf)], { type: contentType || 'image/jpeg' }),
    filename.replace(/[^\w.\-]+/g, '_') || 'token.jpg',
  )

  let catboxRes: Response
  try {
    catboxRes = await fetch('https://catbox.moe/user/api.php', {
      method: 'POST',
      body: form,
    })
  } catch (err) {
    return {
      error: 'Upload host unreachable',
      status: 502,
      detail: err instanceof Error ? err.message : String(err),
    }
  }

  const text = (await catboxRes.text()).trim()
  if (!catboxRes.ok || !/^https?:\/\//i.test(text)) {
    return {
      error: 'Upload host rejected the file',
      status: 502,
      detail: text.slice(0, 240),
    }
  }

  return { url: text }
}
