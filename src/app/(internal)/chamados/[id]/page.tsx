import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { SLAIndicator } from '@/components/tickets/SLAIndicator'
import { InteractionForm } from '@/components/tickets/InteractionForm'
import { SchedulingDialog } from '@/components/tickets/SchedulingDialog'
import { ApprovalDialog } from '@/components/tickets/ApprovalDialog'
import { ReopenDialog } from '@/components/tickets/ReopenDialog'
import { KbSuggestionApplyButton } from '@/components/tickets/KbSuggestionApplyButton'
import { changeStatusAction, closeTicketFormAction } from '../actions'
import { VALID_TRANSITIONS } from '@/lib/ticket-transitions'
import type { TicketStatus } from '@/types/database'
import { Button } from '@/components/ui/button'

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: ticketRaw },
    { data: interactionsRaw },
    { data: templates },
    _,
    { data: { user } },
  ] = await Promise.all([
    supabase.from('tickets').select(`
      *, companies(name), contacts(full_name, email),
      profiles!assigned_to(full_name), ticket_categories(name, requires_approval)
    `).eq('id', id).single(),
    supabase.from('ticket_interactions').select('*, profiles(full_name), contacts(full_name)')
      .eq('ticket_id', id).order('created_at'),
    supabase.from('response_templates').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.auth.getUser(),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = ticketRaw as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interactions = interactionsRaw as any[]

  if (!ticket) notFound()

  const { data: companyContacts } = ticket
    ? await supabase.from('contacts').select('id, full_name, email').eq('company_id', ticket.company_id).eq('is_active', true).order('full_name')
    : { data: [] }

  const currentProfile = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: kbSuggestions } = ticket
    ? await (supabase as any).rpc('search_kb_articles', {
        query: `${ticket.title} ${ticket.description ?? ''}`.trim().slice(0, 500)
      })
    : { data: [] }

  const validNextStatuses = VALID_TRANSITIONS[ticket.status as TicketStatus] ?? []

  const STATUS_LABELS: Record<TicketStatus, string> = {
    aberto: 'Aberto', agendado: 'Agendado', em_andamento: 'Em Andamento',
    aguardando_cliente: 'Aguardando Cliente', aguardando_fornecedor: 'Aguardando Fornecedor',
    aguardando_aprovacao: 'Aguardando Aprovação', em_mudanca: 'Em Mudança',
    resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
  }

  const PRIORITY_LABELS = { critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Média', baixa: '🟢 Baixa' }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono">#{ticket.number}</p>
          <h1 className="text-xl font-semibold mt-0.5">{ticket.title}</h1>
        </div>
        <TicketStatusBadge status={ticket.status as TicketStatus} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border rounded-md p-4">
        <div><span className="text-muted-foreground">Empresa:</span> {(ticket.companies as any)?.name}</div>
        <div><span className="text-muted-foreground">Solicitante:</span> {(ticket.contacts as any)?.full_name}</div>
        <div><span className="text-muted-foreground">Prioridade:</span> {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS]}</div>
        <div><span className="text-muted-foreground">Categoria:</span> {(ticket.ticket_categories as any)?.name ?? '—'}</div>
        <div>
          <span className="text-muted-foreground">Analista:</span>{' '}
          <span>{(ticket.profiles as any)?.full_name ?? 'Não atribuído'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">SLA:</span>{' '}
          <SLAIndicator
            createdAt={ticket.created_at}
            slaDeadline={ticket.sla_deadline}
            slaFirstResponseAt={ticket.sla_first_response_at}
            slaMet={ticket.sla_met}
            slaPausedAt={ticket.sla_paused_at}
          />
        </div>
      </div>

      {ticket.description && (
        <div className="border rounded-md p-4 text-sm">
          <p className="text-muted-foreground text-xs mb-1">Descrição</p>
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Sugestões da base de conhecimento */}
      {kbSuggestions && kbSuggestions.length > 0 && (
        <div className="rounded-md border border-blue-100 bg-blue-50 p-4 space-y-3">
          <p className="text-sm font-medium text-blue-800">
            Artigos sugeridos com base no chamado:
          </p>
          {(kbSuggestions as any[]).map((a: any) => (
            <details key={a.id} className="border rounded bg-white p-3">
              <summary className="text-sm font-medium cursor-pointer">{a.title}</summary>
              {a.solution && (
                <div className="mt-2 space-y-2">
                  <p className="text-sm whitespace-pre-wrap text-muted-foreground">{a.solution}</p>
                  <KbSuggestionApplyButton solution={a.solution} />
                </div>
              )}
            </details>
          ))}
        </div>
      )}

      {/* Ações de status */}
      {validNextStatuses.length > 0 && ticket.status !== 'fechado' && (
        <div className="flex flex-wrap gap-2">
          {validNextStatuses.includes('agendado') && (
            <SchedulingDialog ticketId={id} />
          )}
          {validNextStatuses.includes('aguardando_aprovacao') && (
            <ApprovalDialog ticketId={id} contacts={(companyContacts ?? []) as { id: string; full_name: string; email: string }[]} />
          )}
          {validNextStatuses.map(s => (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <form key={s} action={changeStatusAction.bind(null, id, s, undefined) as any}>
              <Button type="submit" variant="outline" size="sm">
                → {STATUS_LABELS[s]}
              </Button>
            </form>
          ))}
        </div>
      )}

      {/* Histórico */}
      <div className="space-y-3">
        <h2 className="font-medium">Histórico</h2>
        {interactions?.map(i => {
          const author = (i.profiles as any)?.full_name ?? (i.contacts as any)?.full_name ?? 'Sistema'
          const isSystem = i.is_system
          return (
            <div key={i.id} className={`border rounded-md p-3 text-sm ${isSystem ? 'bg-muted/30 border-dashed' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs">{author}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(i.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{i.content}</p>
            </div>
          )
        })}
      </div>

      {/* Formulário de resposta */}
      {ticket.status !== 'fechado' && (
        <InteractionForm
          ticketId={id}
          ticketNumber={ticket.number}
          contactName={(ticket.contacts as any)?.full_name ?? ''}
          analystName={(currentProfile?.data as any)?.full_name ?? ''}
          templates={(templates ?? []) as Parameters<typeof InteractionForm>[0]['templates']}
        />
      )}

      {/* Fechar com resolução */}
      {(ticket.status === 'resolvido' || ticket.status === 'em_andamento') && (
        <div className="border rounded-md p-4 space-y-3">
          <p className="text-sm font-medium">Fechar chamado</p>
          <form action={closeTicketFormAction.bind(null, id) as any} className="space-y-2">
            <textarea
              name="resolution"
              className="w-full border rounded p-2 text-sm"
              rows={3}
              placeholder="Descreva a resolução..."
              required
            />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="create_article" name="create_article" />
              <label htmlFor="create_article" className="text-sm">Salvar na base de conhecimento</label>
            </div>
            <Button type="submit" variant="outline" size="sm">Fechar chamado</Button>
          </form>
        </div>
      )}

      {/* Reabertura */}
      {ticket.status === 'fechado' && ticket.closed_at && (
        <ReopenDialog ticketId={id} closedAt={ticket.closed_at} />
      )}
    </div>
  )
}
