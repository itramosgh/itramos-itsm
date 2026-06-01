'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  ticketId: string
  interactionId?: string
  onUploaded?: () => void
}

export function AttachmentUpload({ ticketId, interactionId, onUploaded }: Props) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')

    for (const file of Array.from(files)) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('ticket_id', ticketId)
      if (interactionId) fd.append('interaction_id', interactionId)

      const res = await fetch('/api/upload/attachment', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error); break }
    }

    setUploading(false)
    onUploaded?.()
    router.refresh()
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? 'Enviando...' : '📎 Anexar arquivo'}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
