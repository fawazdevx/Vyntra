import type { Plugin, Connect } from 'vite'
import type { ServerResponse } from 'node:http'
import { Buffer } from 'node:buffer'
import { uploadToCatbox, type UploadPayload } from '../server/uploadToCatbox'

async function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

async function handleUpload(req: Connect.IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  let payload: UploadPayload
  try {
    payload = JSON.parse((await readBody(req)).toString('utf8')) as UploadPayload
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON body' })
    return
  }

  const result = await uploadToCatbox(payload)
  if ('url' in result) {
    sendJson(res, 200, { url: result.url })
    return
  }
  sendJson(res, result.status, {
    error: result.error,
    ...(result.detail ? { detail: result.detail } : {}),
  })
}

function mount(middlewares: Connect.Server) {
  middlewares.use('/api/upload-image', (req, res) => {
    void handleUpload(req, res).catch((err: unknown) => {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
    })
  })
}

/** Dev + preview middleware: compress client → POST JSON → Catbox → public URL. */
export function uploadImagePlugin(): Plugin {
  return {
    name: 'spawn-upload-image',
    configureServer(server) {
      mount(server.middlewares)
    },
    configurePreviewServer(server) {
      mount(server.middlewares)
    },
  }
}
