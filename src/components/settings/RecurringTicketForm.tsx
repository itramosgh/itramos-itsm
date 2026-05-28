'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createRecurringTemplateAction } from '@/app/(internal)/configuracoes/chamados-recorrentes/actions'

interface Props {
  companies: { id: string; name: string }[]
  allContacts: { id: string; full_name: string; company_id: string }[]
  categories: { id: string; name: string }[]
  onSuccess?: () => void
}

const FREQUENCY_LABELS = [
  { value: 'semanal',      label: 'Semanal (a cada 7 dias)' },
  { value: 'quinzenal',    label: 'Quinzenal (a cada 14 dias)' },
  { value: 'mensal',       label: 'Mensal' },
  { value: 'personalizado', label: 'Personalizado (N dias)' },
]

const PRIORITY_LABELS = [
  { value: 'baixa',   label: 'Baixa' },
  { value: 'media',   label: 'Média' },
  { value: 'alta',    label: 'Alta' },
  { value: 'critica', label: 'Crítica' },
]

export function RecurringTicketForm({ companies, allContacts, categories, onSuccess }: Props) {
  const [isPending, startTransition] = useTransition()
  const [companyId, setCompanyId] = useState('')
  const [frequency, setFrequency] = useState('mensal')
  const [error, setError] = useState<string | null>(null)

  const filteredContacts = companyId
    ? allContacts.filter(c => c.company_id === companyId)
    : []

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createRecurringTemplateAction(formData)
      if (result?.error) { setError(result.error); return }
      ;(e.target as HTMLFormElement).reset()
      setCompanyId('')
      setFrequency('mensal')
      onSuccess?.()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="company_id">Cliente *</Label>
          <select
            id="company_id"
            name="company_id"
            required
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Selecionar...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact_id">Contato/Solicitante *</Label>
          <select
            id="contact_id"
            name="contact_id"
            required
            disabled={!companyId}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background disabled:opacity-50"
          >
            <option value="">Selecionar...</option>
            {filteredContacts.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" rows={3} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="priority">Prioridade</Label>
          <select id="priority" name="priority" defaultValue="media"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            {PRIORITY_LABELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id"
            className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="frequency">Frequência *</Label>
          <select id="frequency" name="frequency" required value={frequency}
            onChange={e => setFrequency(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            {FREQUENCY_LABELS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
        {frequency === 'personalizado' && (
          <div className="space-y-1">
            <Label htmlFor="interval_days">Intervalo (dias) *</Label>
            <Input id="interval_days" name="interval_days" type="number" min={1} required />
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="next_run_at">Primeira execução *</Label>
        <Input id="next_run_at" name="next_run_at" type="date" required />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Salvando...' : 'Criar template'}
      </Button>
    </form>
  )
}
