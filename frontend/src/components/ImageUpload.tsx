import { useCallback, useId, useRef, useState } from 'react'
import { Image as ImageIcon, Loader2, Link2, Trash2, Upload } from 'lucide-react'
import { formatUserError } from '../lib/errors'
import { uploadTokenImage } from '../lib/imageUpload'

type Props = {
  value: string
  onChange: (url: string) => void
  disabled?: boolean
}

export function ImageUpload({ value, onChange, disabled }: Props) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUrl, setShowUrl] = useState(false)
  const [localPreview, setLocalPreview] = useState<string | null>(null)

  const preview = localPreview || value

  const clear = useCallback(() => {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    onChange('')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [localPreview, onChange])

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file || disabled) return
      setError(null)
      setUploading(true)

      const objectUrl = URL.createObjectURL(file)
      if (localPreview) URL.revokeObjectURL(localPreview)
      setLocalPreview(objectUrl)

      try {
        const url = await uploadTokenImage(file)
        onChange(url)
      } catch (err) {
        onChange('')
        setError(formatUserError(err, 'Image upload failed. Try another file or paste a URL.'))
      } finally {
        setUploading(false)
      }
    },
    [disabled, localPreview, onChange],
  )

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (!disabled && !uploading) fileRef.current?.click()
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void handleFile(e.dataTransfer.files?.[0])
        }}
        onClick={() => {
          if (!disabled && !uploading) fileRef.current?.click()
        }}
        className={`relative flex min-h-[148px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed px-4 py-6 text-center transition ${
          dragging
            ? 'border-cyan-400/70 bg-cyan-500/10'
            : 'border-spawn-border bg-spawn-elev/50 hover:border-spawn-border-strong hover:bg-spawn-elev/80'
        } ${disabled || uploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        {preview ? (
          <img
            src={preview}
            alt="Token"
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        ) : null}

        <div className="relative z-10 flex flex-col items-center gap-2">
          {uploading ? (
            <>
              <Loader2 className="h-7 w-7 animate-spin text-cyan-300" />
              <p className="text-sm font-medium text-cyan-100">Uploading…</p>
              <p className="text-xs text-spawn-faint">Compressing and hosting your image</p>
            </>
          ) : preview ? (
            <>
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl ring-2 ring-spawn-bg shadow-glow">
                <img src={preview} alt="" className="h-full w-full object-cover" />
              </div>
              <p className="text-sm font-medium text-spawn-text">Image ready — click to replace</p>
              <p className="max-w-xs truncate font-mono text-[11px] text-spawn-faint">
                {value || 'Waiting for host URL…'}
              </p>
            </>
          ) : (
            <>
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
                <Upload className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-spawn-text">Drop an image or click to upload</p>
              <p className="text-xs text-spawn-faint">PNG, JPG, WebP, GIF · max 8MB · resized to 512px</p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/jpg"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => {
            void handleFile(e.target.files?.[0])
          }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-spawn-border bg-spawn-elev/60 px-2.5 py-1.5 text-xs font-medium text-spawn-muted transition hover:border-spawn-border-strong hover:text-spawn-text"
          disabled={disabled || uploading}
          onClick={(e) => {
            e.stopPropagation()
            fileRef.current?.click()
          }}
        >
          <ImageIcon className="h-3.5 w-3.5" />
          Choose file
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-spawn-border bg-spawn-elev/60 px-2.5 py-1.5 text-xs font-medium text-spawn-muted transition hover:border-spawn-border-strong hover:text-spawn-text"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            setShowUrl((v) => !v)
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
          {showUrl ? 'Hide URL' : 'Paste URL'}
        </button>
        {value || localPreview ? (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-400/50"
            disabled={disabled || uploading}
            onClick={(e) => {
              e.stopPropagation()
              clear()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        ) : null}
      </div>

      {showUrl ? (
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-spawn-faint" />
          <input
            className="input pl-10"
            value={value}
            disabled={disabled || uploading}
            onChange={(e) => {
              if (localPreview) {
                URL.revokeObjectURL(localPreview)
                setLocalPreview(null)
              }
              onChange(e.target.value)
              setError(null)
            }}
            placeholder="https://… or ipfs://"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <p className="text-xs text-spawn-faint">Required. Upload a file or paste a URL — spawn needs an image.</p>
    </div>
  )
}
