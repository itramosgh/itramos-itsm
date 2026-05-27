'use client'
import { useActionState, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NotificationContactsSelector } from './NotificationContactsSelector'
import { createChangeRequestAction } from '@/app/(internal)/mudancas/actions'

interface Props {
  analysts: Array<{ id: string; full_name: string }>
  allContacts: Array<{ id: string; full_name: string; email: string }>
  originTicketId?: string
  originTicketTitle?: string
  canPreApprove: boolean
}

export function ChangeRequestForm({ analysts, allContacts, originTicketId, originTicketTitle, canPreApprove }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [state, action, pending] = useActionState(createChangeRequestAction, null) as any
  const router = useRouter()
  const [files, setFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const uploadStartedRef = useRef(false)
  const [isPreApproved, setIsPreApproved] = useState(false)

  useEffect(() => {
    if (!state?.success || !state.id || uploadStartedRef.current) return
    uploadStartedRef.current = true

    async function uploadAndNavigate() {
      setUploading(true)
      if (files && files.length > 0) {
        for (const file of Array.from(files)) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('change_request_id', state!.id!)
          const res = await fetch('/api/upload/gmud', { method: 'POST', body: fd })
          if (!res.ok) {
            const errData = await res.json()
            window.alert(errData?.error ?? 'Erro ao enviar anexo. Os outros arquivos serão ignorados.')
            break
          }
        }
      }
      setUploading(false)
      router.push(`/mudancas/${state!.id}`)
    }

    uploadAndNavigate()
  }, [state, files, router])

  return (
    <form action={action} className="space-y-6 max-w-2xl">
      {originTicketId && (
        <>
          <input type="hidden" name="origin_ticket_id" value={originTicketId} />
          <p className="text-sm bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-blue-700">
            Vinculada ao chamado: <strong>{originTicketTitle}</strong>
          </p>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descrição detalhada *</Label>
        <Textarea id="description" name="description" rows={4} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="impacted_systems">Sistemas/servidores/aplicações impactados *</Label>
        <Textarea id="impacted_systems" name="impacted_systems" rows={2} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="impacted_users">Usuários e clientes impactados *</Label>
        <Textarea id="impacted_users" name="impacted_users" rows={2} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="maintenance_start">Início da janela *</Label>
          <Input id="maintenance_start" name="maintenance_start" type="datetime-local" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="maintenance_end">Fim previsto *</Label>
          <Input id="maintenance_end" name="maintenance_end" type="datetime-local" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rollback_plan">Plano de rollback *</Label>
        <Textarea id="rollback_plan" name="rollback_plan" rows={3} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="risk_level">Nível de risco *</Label>
          <select
            id="risk_level"
            name="risk_level"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar…</option>
            <option value="baixo">Baixo</option>
            <option value="medio">Médio</option>
            <option value="alto">Alto</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="responsible_id">Analista responsável *</Label>
          <select
            id="responsible_id"
            name="responsible_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecionar…</option>
            {analysts.map((a) => (
              <option key={a.id} value={a.id}>{a.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Contatos a comunicar (início e conclusão) *</Label>
        <NotificationContactsSelector dbContacts={allContacts} />
      </div>

      {/* Pré-aprovação — visível apenas para admin/gestor */}
      {canPreApprove && (
        <div className="space-y-3 rounded-md border p-4 bg-muted/30">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is_pre_approved"
              name="is_pre_approved"
              checked={isPreApproved}
              onChange={(e) => setIsPreApproved(e.target.checked)}
              className="h-4 w-4 rounded border"
            />
            <Label htmlFor="is_pre_approved" className="cursor-pointer font-medium">
              GMUD pré-aprovada (pular envio de aprovação)
            </Label>
          </div>
          {isPreApproved && (
            <div className="space-y-2">
              <Label htmlFor="pre_approval_email">
                E-mail do responsável pela pré-aprovação *
              </Label>
              <Input
                id="pre_approval_email"
                name="pre_approval_email"
                type="email"
                placeholder="aprovador@empresa.com"
                required
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
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

      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}

      <div className="flex gap-3">
        <Button type="submit" disabled={pending || uploading}>
          {uploading
            ? 'Enviando anexos…'
            : pending
            ? 'Salvando…'
            : isPreApproved
            ? 'Criar como aprovada'
            : 'Criar GMUD'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
