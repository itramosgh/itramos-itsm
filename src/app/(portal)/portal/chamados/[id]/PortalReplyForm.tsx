'use client'
import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendPortalReplyAction } from './actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface Props {
  ticketId: string
}

export function PortalReplyForm({ ticketId }: Props) {
  const [state, formAction, pending] = useActionState(sendPortalReplyAction, null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!state || !('ok' in state)) return

    async function uploadFilesAndRefresh() {
      const files = fileInputRef.current?.files
      if (files && files.length > 0) {
        const failedFiles: string[] = []
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('ticket_id', ticketId)
          const res = await fetch('/api/upload/attachment', { method: 'POST', body: fd })
          if (!res.ok) failedFiles.push(file.name)
        }
        if (failedFiles.length > 0) {
          window.alert(`Resposta enviada! Alguns arquivos não puderam ser enviados: ${failedFiles.join(', ')}`)
        }
      }
      if (formRef.current) formRef.current.reset()
      router.refresh()
    }

    uploadFilesAndRefresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <div className="space-y-1">
        <Label htmlFor="content">Responder</Label>
        <Textarea id="content" name="content" rows={3} required />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground block mb-1">
          Anexos (opcional)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="block w-full text-sm text-muted-foreground
            file:mr-3 file:py-1 file:px-3 file:rounded-md file:border
            file:text-xs file:font-medium file:bg-muted file:text-foreground
            hover:file:bg-muted/70 cursor-pointer"
        />
      </div>
      {'error' in (state ?? {}) && (
        <p className="text-sm text-destructive">{(state as { error: string }).error}</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando...' : 'Enviar'}
      </Button>
    </form>
  )
}
