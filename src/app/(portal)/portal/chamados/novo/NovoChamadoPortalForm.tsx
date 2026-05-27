'use client'
import { useActionState } from 'react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { KbSearchSuggestions } from '@/components/conhecimento/KbSearchSuggestions'

interface NovoChamadoPortalFormProps {
  categories: { id: string; name: string }[]
  createAction: (prevState: { error: string } | null, formData: FormData) => Promise<{ error: string } | null>
}

export function NovoChamadoPortalForm({ categories, createAction }: NovoChamadoPortalFormProps) {
  const [state, formAction, pending] = useActionState(createAction, null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [blocked, setBlocked] = useState(false)

  const searchQuery = [title, description].join(' ').trim()

  if (blocked) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-6 text-green-800">
        <p className="font-medium">Problema resolvido!</p>
        <p className="text-sm mt-1">Seu problema foi resolvido pela base de conhecimento. Nenhum chamado foi aberto.</p>
      </div>
    )
  }

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
        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? 'Abrindo chamado...' : 'Abrir chamado'}
        </Button>
      </form>
      <div>
        <KbSearchSuggestions query={searchQuery} onResolved={() => setBlocked(true)} />
      </div>
    </div>
  )
}
