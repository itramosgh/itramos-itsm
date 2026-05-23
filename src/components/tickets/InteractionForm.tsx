'use client'
import { useActionState, useState } from 'react'
import { addInteractionAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TemplateSelector } from './TemplateSelector'
import { AttachmentUpload } from './AttachmentUpload'

interface Template {
  id: string; name: string; category: string | null; body: string
  variables: { key: string; label: string; auto_filled: boolean }[]
}

interface Props {
  ticketId: string
  ticketNumber: number
  contactName: string
  analystName: string
  templates: Template[]
}

export function InteractionForm({ ticketId, ticketNumber, contactName, analystName, templates }: Props) {
  const [content, setContent] = useState('')
  const [state, formAction, pending] = useActionState(addInteractionAction, null)

  const autoValues = {
    nome_cliente: contactName,
    numero_chamado: String(ticketNumber),
    nome_analista: analystName,
    data_hoje: new Date().toLocaleDateString('pt-BR'),
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="type" value="mensagem" />
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-medium">Adicionar resposta</p>
        <TemplateSelector
          templates={templates}
          autoValues={autoValues}
          onApply={(text) => setContent(text)}
        />
      </div>
      <Textarea
        name="content"
        value={content}
        onChange={e => setContent(e.target.value)}
        rows={4}
        placeholder="Digite sua resposta..."
        required
      />
      <AttachmentUpload ticketId={ticketId} />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enviando...' : 'Enviar'}
      </Button>
    </form>
  )
}
