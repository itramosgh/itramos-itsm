'use client'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  submitForApprovalAction,
  iniciarExecucaoAction,
  concluirGmudAction,
  reverterGmudAction,
} from '@/app/(internal)/mudancas/[id]/actions'
import type { ChangeRequestStatus, RiskLevel } from '@/types/database'

const statusLabel: Record<ChangeRequestStatus, string> = {
  rascunho: 'Rascunho', aguardando_aprovacao: 'Aguardando Aprovação',
  aprovada: 'Aprovada', em_execucao: 'Em Execução',
  concluida: 'Concluída', revertida: 'Revertida', reprovada: 'Reprovada',
}

const statusVariant: Record<ChangeRequestStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  rascunho: 'outline', aguardando_aprovacao: 'secondary',
  aprovada: 'default', em_execucao: 'default',
  concluida: 'secondary', revertida: 'destructive', reprovada: 'destructive',
}

interface Props {
  cr: {
    id: string; title: string; description: string; impacted_systems: string
    impacted_users: string; maintenance_start: string; maintenance_end: string
    rollback_plan: string; risk_level: string; status: string
    execution_started_at: string | null; execution_completed_at: string | null
    reversal_reason: string | null; origin_ticket_id: string | null
    profiles: { full_name: string } | null
    origin_ticket: { number: number; title: string } | null
    change_request_contacts: Array<{
      id: string; external_email: string | null; external_name: string | null
      contacts: { full_name: string; email: string } | null
    }>
  }
  companyContacts: Array<{ id: string; full_name: string; email: string }>
}

export function ChangeRequestDetail({ cr, companyContacts }: Props) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showApprovalForm, setShowApprovalForm] = useState(false)
  const [showReversalForm, setShowReversalForm] = useState(false)
  const [closeTicket, setCloseTicket] = useState(true)
  const status = cr.status as ChangeRequestStatus
  const risk = cr.risk_level as RiskLevel
  const riskColor: Record<RiskLevel, string> = { baixo: 'text-green-600', medio: 'text-yellow-600', alto: 'text-red-600' }

  async function handleIniciar() {
    startTransition(async () => {
      const result = await iniciarExecucaoAction(cr.id)
      if (result?.error) setError(result.error)
    })
  }

  async function handleConcluir() {
    startTransition(async () => {
      const result = await concluirGmudAction(cr.id, closeTicket)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cr.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Responsável: {cr.profiles?.full_name ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
          <span className={`text-xs font-medium ${riskColor[risk]}`}>
            Risco {risk.charAt(0).toUpperCase() + risk.slice(1)}
          </span>
        </div>
      </div>

      {cr.origin_ticket && (
        <div className="text-sm bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          Chamado de origem:{' '}
          <a href={`/chamados/${cr.origin_ticket_id}`} className="font-medium text-blue-700 hover:underline">
            #{cr.origin_ticket.number} — {cr.origin_ticket.title}
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 text-sm">
        <div><span className="font-medium">Início da janela:</span>{' '}{new Date(cr.maintenance_start).toLocaleString('pt-BR')}</div>
        <div><span className="font-medium">Fim previsto:</span>{' '}{new Date(cr.maintenance_end).toLocaleString('pt-BR')}</div>
      </div>

      <div className="space-y-3 text-sm">
        <div><p className="font-medium">Descrição</p><p className="mt-1 text-muted-foreground">{cr.description}</p></div>
        <div><p className="font-medium">Sistemas impactados</p><p className="mt-1 text-muted-foreground">{cr.impacted_systems}</p></div>
        <div><p className="font-medium">Usuários impactados</p><p className="mt-1 text-muted-foreground">{cr.impacted_users}</p></div>
        <div><p className="font-medium">Plano de rollback</p><p className="mt-1 text-muted-foreground">{cr.rollback_plan}</p></div>
      </div>

      {cr.change_request_contacts.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Contatos a comunicar</p>
          <ul className="text-sm space-y-1">
            {cr.change_request_contacts.map((c) => (
              <li key={c.id} className="text-muted-foreground">
                {c.contacts ? `${c.contacts.full_name} (${c.contacts.email})` : `${c.external_name} (${c.external_email})`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Ações por status */}
      {status === 'rascunho' && (
        <div className="space-y-3">
          {!showApprovalForm ? (
            <Button onClick={() => setShowApprovalForm(true)}>Enviar para Aprovação</Button>
          ) : (
            <form
              action={async (fd) => {
                const result = await submitForApprovalAction(cr.id, fd)
                if (result?.error) startTransition(() => setError(result.error!))
                else startTransition(() => setShowApprovalForm(false))
              }}
              className="space-y-3 border rounded-md p-4"
            >
              <p className="text-sm font-medium">Solicitar aprovação</p>
              <div className="space-y-2">
                <Label htmlFor="approver_email">E-mail do aprovador *</Label>
                <div className="flex gap-2">
                  <select
                    name="approver_contact_id"
                    className="flex-1 border rounded-md px-3 py-2 text-sm"
                    defaultValue=""
                  >
                    <option value="">E-mail manual</option>
                    {companyContacts.map((c) => (
                      <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
                    ))}
                  </select>
                </div>
                <Input id="approver_email" name="approver_email" type="email" placeholder="ou digitar e-mail" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isPending}>Enviar</Button>
                <Button type="button" variant="outline" onClick={() => setShowApprovalForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      )}

      {status === 'aprovada' && (
        <Button onClick={handleIniciar} disabled={isPending}>
          Iniciar Execução
        </Button>
      )}

      {status === 'em_execucao' && (
        <div className="space-y-3">
          {cr.origin_ticket_id && (
            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="close_ticket"
                checked={closeTicket}
                onChange={(e) => setCloseTicket(e.target.checked)}
              />
              <Label htmlFor="close_ticket">Fechar chamado de origem ao concluir</Label>
            </div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleConcluir} disabled={isPending}>Concluir GMUD</Button>
            <Button variant="destructive" onClick={() => setShowReversalForm(true)} disabled={isPending}>
              Reverter (Rollback)
            </Button>
          </div>

          {showReversalForm && (
            <form
              action={async (fd) => {
                const result = await reverterGmudAction(cr.id, fd)
                if (result?.error) startTransition(() => setError(result.error!))
                else startTransition(() => setShowReversalForm(false))
              }}
              className="space-y-3 border border-destructive rounded-md p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="reversal_reason">Motivo da reversão *</Label>
                <Textarea id="reversal_reason" name="reversal_reason" rows={3} required />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={isPending}>Confirmar Reversão</Button>
                <Button type="button" variant="outline" onClick={() => setShowReversalForm(false)}>Cancelar</Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
