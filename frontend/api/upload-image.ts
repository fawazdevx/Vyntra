import type { VercelRequest, VercelResponse } from '@vercel/node'
import { uploadToCatbox, type UploadPayload } from '../server/uploadToCatbox'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  let payload: UploadPayload
  try {
    if (typeof req.body === 'string') {
      payload = JSON.parse(req.body) as UploadPayload
    } else if (req.body && typeof req.body === 'object') {
      payload = req.body as UploadPayload
    } else {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }

  try {
    const result = await uploadToCatbox(payload)
    if ('url' in result) {
      res.status(200).json({ url: result.url })
      return
    }
    res.status(result.status).json({
      error: result.error,
      ...(result.detail ? { detail: result.detail } : {}),
    })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    })
  }
}
