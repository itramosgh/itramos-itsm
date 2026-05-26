'use client'
import { useState, useTransition } from 'react'
import { updateTicketMetaAction } from '@/app/(internal)/chamados/actions'

interface Analyst { id: string; full_name: string }
interface Category { id: string; name: string }

interface Props {
  ticketId: string
  priority: string
  categoryId: string | null
  assignedTo: string | null
  analysts: Analyst[]
  categories: Category[]
  isClosed: boolean
}

const PRIORITIES = [
  { value: 'critica', label: '🔴 Crítica' },
  { value: 'alta', label: '🟠 Alta' },
  { value: 'media', label: '🟡 Média' },
  { value: 'baixa', label: '🟢 Baixa' },
]

export function TicketMetaEditor({ ticketId, priority, categoryId, assignedTo, analysts, categories, isClosed }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(field: 'priority' | 'category_id' | 'assigned_to', value: string) {
    setError(null)
    const payload =
      field === 'priority' ? { priority: value } :
      field === 'category_id' ? { category_id: value || null } :
      { assigned_to: value || null }

    startTransition(async () => {
      const result = await updateTicketMetaAction(ticketId, payload)
      if (result?.error) setError(result.error)
    })
  }

  const cls = `border rounded px-2 py-1 text-sm bg-background ${isClosed || isPending ? 'opacity-60 cursor-not-allowed' : ''}`

  return (
    <div className="contents">
      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Prioridade:</span>{' '}
        {isClosed ? (
          <span>{PRIORITIES.find(p => p.value === priority)?.label ?? priority}</span>
        ) : (
          <select
            defaultValue={priority}
            disabled={isPending}
            onChange={e => handleChange('priority', e.target.value)}
            className={cls}
          >
            {PRIORITIES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Categoria:</span>{' '}
        {isClosed ? (
          <span>{categories.find(c => c.id === categoryId)?.name ?? '—'}</span>
        ) : (
          <select
            defaultValue={categoryId ?? ''}
            disabled={isPending}
            onChange={e => handleChange('category_id', e.target.value)}
            className={cls}
          >
            <option value="">— Sem categoria</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-muted-foreground">Analista:</span>{' '}
        {isClosed ? (
          <span>{analysts.find(a => a.id === assignedTo)?.full_name ?? 'Não atribuído'}</span>
        ) : (
          <select
            defaultValue={assignedTo ?? ''}
            disabled={isPending}
            onChange={e => handleChange('assigned_to', e.target.value)}
            className={cls}
          >
            <option value="">— Não atribuído</option>
            {analysts.map(a => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p className="col-span-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}
