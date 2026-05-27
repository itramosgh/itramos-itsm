'use client'
import { useState, useRef, useEffect } from 'react'
import { AttachmentList } from '@/components/tickets/AttachmentList'
import type { AttachmentItem } from '@/components/tickets/AttachmentList'

interface Props {
  announcementId: string
  canEdit?: boolean
}

export function AnnouncementAttachments({ announcementId, canEdit = true }: Props) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/comunicados/${announcementId}/attachments`)
      .then(r => r.json())
      .then(data => setAttachments(data.attachments ?? []))
      .catch(() => {})
  }, [announcementId])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('announcement_id', announcementId)
      const res = await fetch('/api/upload/comunicado', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Erro ao enviar arquivo')
        break
      } else {
        setAttachments(prev => [...prev, {
          id: data.path,
          filename: file.name,
          storage_path: data.path,
          mime_type: file.type,
          size_bytes: file.size,
        }])
      }
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <AttachmentList attachments={attachments} bucket="announcements" />
      {canEdit && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => handleUpload(e.target.files)}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="text-sm border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-50"
          >
            {uploading ? 'Enviando...' : '📎 Adicionar arquivo'}
          </button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  )
}
