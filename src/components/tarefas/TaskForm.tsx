'use client'
import { useActionState, useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ActionResult = { error?: string; success?: boolean; taskId?: string } | null

interface TaskFormProps {
  action: (prevState: unknown, formData: FormData) => Promise<ActionResult>
  initialData?: {
    title?: string
    description?: string | null
    company_id?: string | null
    assigned_to?: string
    due_date?: string
    priority?: string | null
    reminder_days_before?: number
    is_recurring?: boolean
    recurrence_type?: string | null
  }
  companies: { id: string; name: string }[]
  profiles: { id: string; full_name: string }[]
  currentUserId?: string
  isAnalista?: boolean
}

export function TaskForm({ action, initialData, companies, profiles, currentUserId, isAnalista }: TaskFormProps) {
  const [state, formAction, pending] = useActionState(action, null)
  const [isRecurring, setIsRecurring] = useState(initialData?.is_recurring ?? false)
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadStartedRef = useRef(false)
  const router = useRouter()

  const isEdit = !!initialData

  useEffect(() => {
    if (!state?.taskId || uploadStartedRef.current) return
    uploadStartedRef.current = true

    async function uploadAndNavigate() {
      setUploading(true)
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('task_id', state!.taskId!)
          const res = await fetch('/api/upload/task', { method: 'POST', body: fd })
          if (!res.ok) {
            const data = await res.json()
            window.alert(data?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
            break
          }
        }
      }
      setUploading(false)
      router.push('/tarefas')
    }

    uploadAndNavigate()
  }, [state, files, router])

  return (
    <form action={formAction} className="space-y-4 max-w-xl">
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" defaultValue={initialData?.title} required />
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" defaultValue={initialData?.description ?? ''} rows={3} />
      </div>
      <div>
        <Label htmlFor="company_id">Cliente</Label>
        <select
          id="company_id"
          name="company_id"
          defaultValue={initialData?.company_id ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem cliente vinculado</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <Label htmlFor="assigned_to">Responsável *</Label>
        {isAnalista ? (
          <input type="hidden" name="assigned_to" value={currentUserId} />
        ) : (
          <select
            id="assigned_to"
            name="assigned_to"
            defaultValue={initialData?.assigned_to ?? currentUserId ?? ''}
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="">Selecione...</option>
            {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        )}
      </div>
      <div>
        <Label htmlFor="due_date">Data de vencimento *</Label>
        <Input id="due_date" name="due_date" type="date" defaultValue={initialData?.due_date} required />
      </div>
      <div>
        <Label htmlFor="priority">Prioridade</Label>
        <select
          id="priority"
          name="priority"
          defaultValue={initialData?.priority ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm bg-background"
        >
          <option value="">Sem prioridade</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
      </div>
      <div>
        <Label htmlFor="reminder_days_before">Lembrete antecipado (dias antes)</Label>
        <Input
          id="reminder_days_before"
          name="reminder_days_before"
          type="number"
          min="0"
          defaultValue={initialData?.reminder_days_before ?? 3}
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_recurring"
          name="is_recurring"
          checked={isRecurring}
          onChange={e => setIsRecurring(e.target.checked)}
        />
        <Label htmlFor="is_recurring">Tarefa recorrente</Label>
      </div>
      {isRecurring && (
        <div>
          <Label htmlFor="recurrence_type">Tipo de recorrência</Label>
          <select
            id="recurrence_type"
            name="recurrence_type"
            defaultValue={initialData?.recurrence_type ?? 'mensal'}
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
          >
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      )}
      {!isEdit && (
        <div>
          <Label htmlFor="attachments">Anexos</Label>
          <Input
            id="attachments"
            type="file"
            multiple
            onChange={e => setFiles(e.target.files)}
            className="cursor-pointer"
          />
          <p className="text-xs text-muted-foreground mt-1">Máximo 10 MB por arquivo</p>
        </div>
      )}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || uploading}>
        {uploading ? 'Enviando anexos...' : pending ? 'Salvando...' : 'Salvar tarefa'}
      </Button>
    </form>
  )
}
