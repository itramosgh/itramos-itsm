'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateAnnouncementAction, deleteAnnouncementAction } from '@/app/(internal)/comunicados/actions'
import { RecipientSelector } from './RecipientSelector'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Company { id: string; name: string }
interface Contact { id: string; full_name: string; email: string }

interface Props {
  id: string
  subject: string
  recipientType: string
  recipientCompanyId: string
  recipientDepartments: string[]
  recipientContactIds: string[]
  scheduledAt: string | null
  companies: Company[]
  contacts: Contact[]
}

function fmtDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16) // "YYYY-MM-DDTHH:MM"
}

export function AnnouncementSettingsForm({
  id, subject, recipientType, recipientCompanyId, recipientDepartments, recipientContactIds,
  scheduledAt, companies, contacts,
}: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const updateWithId = updateAnnouncementAction.bind(null, id)

  async function handleUpdate(formData: FormData) {
    startTransition(async () => {
      const result = await updateWithId(formData)
      if (result?.error) {
        setError(result.error)
      } else {
        setEditing(false)
        setError('')
      }
    })
  }

  function handleDelete() {
    if (!confirm('Tem certeza que deseja remover este comunicado? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      await deleteAnnouncementAction(id)
      router.push('/comunicados')
    })
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Configurações</h2>
        <div className="flex gap-2">
          {!editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            Remover
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {editing ? (
        <form action={handleUpdate} className="space-y-4">
          <div>
            <Label>Assunto</Label>
            <Input name="subject" defaultValue={subject} required className="mt-1" />
          </div>
          <RecipientSelector
            companies={companies}
            contacts={contacts}
            initialType={recipientType}
            initialCompanyId={recipientCompanyId}
            initialDepartments={recipientDepartments}
            initialContactIds={recipientContactIds}
          />
          <div>
            <Label>Agendamento (opcional)</Label>
            <Input
              name="scheduled_at"
              type="datetime-local"
              defaultValue={fmtDatetimeLocal(scheduledAt)}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setEditing(false); setError('') }}
              disabled={isPending}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <dl className="text-sm space-y-1">
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-28 shrink-0">Assunto</dt>
            <dd>{subject}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground w-28 shrink-0">Destinatários</dt>
            <dd className="capitalize">{recipientType === 'all' ? 'Todos os contatos' : recipientType}</dd>
          </div>
          {scheduledAt && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground w-28 shrink-0">Agendado para</dt>
              <dd>{new Date(scheduledAt).toLocaleString('pt-BR')}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  )
}
