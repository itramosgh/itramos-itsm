// src/app/(portal)/portal/chamados/novo/NovoChamadoPortalForm.tsx
'use client'
import { useActionState, useEffect, useRef } from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { KbSearchSuggestions } from '@/components/conhecimento/KbSearchSuggestions'

interface NovoChamadoPortalFormProps {
  categories: { id: string; name: string }[]
  createAction: (
    prevState: { ticketId: string } | { error: string } | null,
    formData: FormData
  ) => Promise<{ ticketId: string } | { error: string }>
}

export function NovoChamadoPortalForm({ categories, createAction }: NovoChamadoPortalFormProps) {
  const [state, formAction, pending] = useActionState(createAction, null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [blocked, setBlocked] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Quando o ticket for criado com sucesso, fazer upload dos arquivos e navegar
  useEffect(() => {
    if (!state || !('ticketId' in state)) return

    async function uploadAndRedirect() {
      const ticketId = (state as { ticketId: string }).ticketId
      const files = fileInputRef.current?.files
      if (files && files.length > 0) {
        setUploading(true)
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('ticket_id', ticketId)
          await fetch('/api/upload/attachment', { method: 'POST', body: fd })
        }
      }
      router.push('/portal/chamados')
    }

    uploadAndRedirect()
  }, [state, router])

  const searchQuery = [title, description].join(' ').trim()

  if (blocked) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-6 text-green-800">
        <p className="font-medium">Problema resolvido!</p>
        <p className="text-sm mt-1">Seu problema foi resolvido pela base de conhecimento. Nenhum chamado foi aberto.</p>
      </div>
    )
  }

  const isLoading = pending || uploading

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="title">Título *</Label>
          <Input
            id="title"
            name="title"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="priority">Prioridade</Label>
          <select
            id="priority"
            name="priority"
            defaultValue="baixa"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
        {categories.length > 0 && (
          <div>
            <Label htmlFor="category_id">Categoria</Label>
            <select
              id="category_id"
              name="category_id"
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Selecionar (opcional)</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label>Anexos (opcional)</Label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="mt-1 block w-full text-sm text-muted-foreground
              file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border
              file:text-xs file:font-medium file:bg-muted file:text-foreground
              hover:file:bg-muted/70 cursor-pointer"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Os arquivos serão enviados após a abertura do chamado.
          </p>
        </div>
        {'error' in (state ?? {}) && (
          <p className="text-sm text-destructive">{(state as { error: string }).error}</p>
        )}
        <Button type="submit" disabled={isLoading}>
          {pending ? 'Abrindo chamado...' : uploading ? 'Enviando arquivos...' : 'Abrir chamado'}
        </Button>
      </form>
      <div>
        <KbSearchSuggestions query={searchQuery} onResolved={() => setBlocked(true)} />
      </div>
    </div>
  )
}
