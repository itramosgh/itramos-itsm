'use client'
import { useState, useRef, useEffect } from 'react'
import { AttachmentList } from '@/components/tickets/AttachmentList'
import type { AttachmentItem } from '@/components/tickets/AttachmentList'

interface Props { taskId: string }

export function TaskAttachments({ taskId }: Props) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/tasks/${taskId}/attachments`)
      .then(r => r.json())
      .then(d => setAttachments(d.attachments ?? []))
      .catch(() => {})
  }, [taskId])

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('task_id', taskId)
      const res = await fetch('/api/upload/task', { method: 'POST', body: fd })
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
    <div className="border rounded-md p-4 space-y-3">
      <h3 className="text-sm font-medium">Anexos</h3>
      <AttachmentList attachments={attachments} bucket="task-attachments" />
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
    </div>
  )
}
