'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  updateActionItemStatusAction,
  convertActionItemToTaskAction,
  addActionItemAction,
  updateActionItemAction,
  deleteActionItemAction,
} from '@/app/(internal)/reunioes/actions'

type ActionItem = {
  id: string
  description: string
  due_date: string | null
  status: string
  converted_to_task_id: string | null
  responsible_profile_id: string | null
  profiles: { full_name: string } | null
}

interface ActionItemsPanelProps {
  items: ActionItem[]
  meetingId: string
  meetingStatus: string
  profiles: { id: string; full_name: string }[]
}

const emptyForm = { description: '', responsible_profile_id: '', due_date: '' }

export function ActionItemsPanel({ items, meetingId, meetingStatus, profiles }: ActionItemsPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(emptyForm)
  const [isAdding, setIsAdding] = useState(false)
  const [addForm, setAddForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const canEdit = meetingStatus !== 'cancelada'

  function startEdit(item: ActionItem) {
    setEditingId(item.id)
    setEditForm({
      description: item.description,
      responsible_profile_id: item.responsible_profile_id ?? '',
      due_date: item.due_date ?? '',
    })
    setIsAdding(false)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm(emptyForm)
  }

  function handleSaveEdit(itemId: string) {
    if (!editForm.description.trim()) return
    startTransition(async () => {
      const result = await updateActionItemAction(itemId, meetingId, {
        description: editForm.description,
        responsible_profile_id: editForm.responsible_profile_id || null,
        due_date: editForm.due_date || null,
      })
      if (result.error) { setError(result.error); return }
      setEditingId(null)
      router.refresh()
    })
  }

  function handleAdd() {
    if (!addForm.description.trim()) return
    startTransition(async () => {
      const result = await addActionItemAction(meetingId, {
        description: addForm.description,
        responsible_profile_id: addForm.responsible_profile_id || null,
        due_date: addForm.due_date || null,
      })
      if (result.error) { setError(result.error); return }
      setAddForm(emptyForm)
      setIsAdding(false)
      router.refresh()
    })
  }

  function handleDelete(itemId: string) {
    startTransition(async () => {
      await deleteActionItemAction(itemId, meetingId)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Itens de ação</h3>
        {canEdit && !isAdding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => { setIsAdding(true); setEditingId(null); setError(null) }}
          >
            + Adicionar item
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {items.map(item => (
        <div key={item.id} className="border rounded-md p-3">
          {editingId === item.id ? (
            <div className="space-y-2">
              <Input
                placeholder="Descrição..."
                value={editForm.description}
                onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                autoFocus
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 border rounded-md px-2 py-2 text-sm bg-background"
                  value={editForm.responsible_profile_id}
                  onChange={e => setEditForm(prev => ({ ...prev, responsible_profile_id: e.target.value }))}
                >
                  <option value="">Responsável...</option>
                  {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                <Input
                  type="date"
                  className="w-36"
                  value={editForm.due_date}
                  onChange={e => setEditForm(prev => ({ ...prev, due_date: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" disabled={isPending} onClick={() => handleSaveEdit(item.id)}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1 min-w-0">
                <p className="text-sm font-medium">{item.description}</p>
                {item.profiles && (
                  <p className="text-xs text-muted-foreground">Responsável: {item.profiles.full_name}</p>
                )}
                {item.due_date && (
                  <p className="text-xs text-muted-foreground">
                    Prazo: {new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </p>
                )}
                {item.converted_to_task_id && (
                  <Badge variant="secondary" className="text-xs">Convertido em tarefa</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2 justify-end shrink-0">
                {canEdit && !item.converted_to_task_id && (
                  <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                    Editar
                  </Button>
                )}
                {!item.converted_to_task_id && item.responsible_profile_id && (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  <form action={convertActionItemToTaskAction.bind(null, item.id, meetingId) as any}>
                    <Button variant="outline" size="sm" type="submit">Converter em tarefa</Button>
                  </form>
                )}
                {item.status === 'pendente' && (
                  <form action={updateActionItemStatusAction.bind(null, item.id, meetingId, 'concluido')}>
                    <Button variant="ghost" size="sm" type="submit">Concluir</Button>
                  </form>
                )}
                {canEdit && !item.converted_to_task_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isPending}
                    onClick={() => handleDelete(item.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    Excluir
                  </Button>
                )}
                <Badge variant={item.status === 'concluido' ? 'default' : 'outline'}>
                  {item.status}
                </Badge>
              </div>
            </div>
          )}
        </div>
      ))}

      {isAdding && (
        <div className="border border-dashed rounded-md p-3 space-y-2">
          <Input
            placeholder="Descrição da ação..."
            value={addForm.description}
            onChange={e => setAddForm(prev => ({ ...prev, description: e.target.value }))}
            autoFocus
          />
          <div className="flex gap-2">
            <select
              className="flex-1 border rounded-md px-2 py-2 text-sm bg-background"
              value={addForm.responsible_profile_id}
              onChange={e => setAddForm(prev => ({ ...prev, responsible_profile_id: e.target.value }))}
            >
              <option value="">Responsável...</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <Input
              type="date"
              className="w-36"
              value={addForm.due_date}
              onChange={e => setAddForm(prev => ({ ...prev, due_date: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={isPending} onClick={handleAdd}>
              Adicionar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setIsAdding(false); setAddForm(emptyForm) }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && !isAdding && (
        <p className="text-sm text-muted-foreground">Nenhum item de ação registrado.</p>
      )}
    </div>
  )
}
