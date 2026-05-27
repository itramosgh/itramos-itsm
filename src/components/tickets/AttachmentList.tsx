// src/components/tickets/AttachmentList.tsx
'use client'
import { useState } from 'react'

export interface AttachmentItem {
  id: string
  filename: string
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
}

interface Props {
  attachments: AttachmentItem[]
  bucket: string
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1_048_576).toFixed(1)} MB`
}

function fileIcon(mime: string | null): string {
  if (!mime) return '📄'
  if (mime.startsWith('image/')) return '🖼️'
  if (mime === 'application/pdf') return '📕'
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊'
  if (mime.includes('word') || mime.includes('document')) return '📝'
  if (mime.startsWith('video/')) return '🎥'
  return '📄'
}

export function AttachmentList({ attachments, bucket }: Props) {
  const [loading, setLoading] = useState<string | null>(null)

  if (attachments.length === 0) return null

  async function handleDownload(att: AttachmentItem) {
    setLoading(att.id)
    try {
      const res = await fetch(
        `/api/download/attachment?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(att.storage_path)}`
      )
      const data = await res.json()
      if (data.url) {
        const a = document.createElement('a')
        a.href = data.url
        a.download = att.filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Anexos ({attachments.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {attachments.map(att => (
          <button
            key={att.id}
            type="button"
            onClick={() => handleDownload(att)}
            disabled={loading === att.id}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50 border rounded-md px-2 py-1 bg-muted/30"
          >
            <span>{fileIcon(att.mime_type)}</span>
            <span className="max-w-[180px] truncate">{att.filename}</span>
            {att.size_bytes !== null && (
              <span className="text-xs text-muted-foreground">({formatBytes(att.size_bytes)})</span>
            )}
            {loading === att.id && <span className="text-xs text-muted-foreground ml-1">↓</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
