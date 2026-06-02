import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, fmtDateTime } from '@/lib/format-date'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { SLAIndicator } from '@/components/tickets/SLAIndicator'
import { InteractionForm } from '@/components/tickets/InteractionForm'
import { SchedulingDialog } from '@/components/tickets/SchedulingDialog'
import { ApprovalDialog } from '@/components/tickets/ApprovalDialog'
import { ReopenDialog } from '@/components/tickets/ReopenDialog'
import { KbSuggestionApplyButton } from '@/components/tickets/KbSuggestionApplyButton'
import { PresentialCostPanel } from '@/components/tickets/PresentialCostPanel'
import { BillingSummary } from '@/components/tickets/BillingSummary'
import { TicketMetaEditor } from '@/components/tickets/TicketMetaEditor'
import { changeStatusAction, closeTicketFormAction } from '../actions'
import { VALID_TRANSITIONS } from '@/lib/ticket-transitions'
import type { TicketStatus } from '@/types/database'
import { Button } from '@/components/ui/button'
import { AttachmentList } from '@/components/tickets/AttachmentList'
import type { AttachmentItem } from '@/components/tickets/AttachmentList'

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
    { data: analystsRaw },
    { data: { user } },
    { data: linkedGmuds },
    { data: costData },
    { data: categoriesRaw },
    { data: attachmentsRaw },
  ] = await Promise.all([
    supabase.from('tickets').select(`
      *, companies(name), contacts(full_name, email, phone, is_whatsapp),
      profiles!assigned_to(full_name), ticket_categories(name, requires_approval)
    `).eq('id', id).single(),
    supabase.from('ticket_interactions').select('*, profiles(full_name), contacts(full_name)')
      .eq('ticket_id', id).order('created_at'),
    supabase.from('response_templates').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.auth.getUser(),
    supabase
      .from('change_requests')
      .select('id, title, status, maintenance_start')
      .eq('origin_ticket_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase.from('ticket_costs').select('*').eq('ticket_id', id).maybeSingle(),
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('ticket_attachments')
      .select('id, filename, storage_path, mime_type, size_bytes')
      .eq('ticket_id', id)
      .eq('is_deleted', false)
      .order('created_at'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = ticketRaw as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interactions = interactionsRaw as any[]
  const attachments: AttachmentItem[] = (attachmentsRaw ?? []) as AttachmentItem[]

  if (!ticket) notFound()

  const { data: companyContacts } = ticket
    ? await supabase.from('contacts').select('id, full_name, email').eq('company_id', ticket.company_id).eq('is_active', true).order('full_name')
    : { data: [] }

  const currentProfile = user
    ? await supabase.from('profiles').select('full_name, role').eq('id', user.id).single()
    : null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = (currentProfile?.data as any)
  const canDiscount = ['admin', 'gestor'].includes(profile?.role)

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
    em_deslocamento: 'Em Deslocamento',
    resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono">#{ticket.number}</p>
          <h1 className="text-xl font-semibold mt-0.5">{ticket.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <TicketStatusBadge status={ticket.status as TicketStatus} />
          {ticket.channel === 'recorrente' && (
            <span className="text-xs border rounded-full px-2 py-0.5 text-blue-600 border-blue-200">
              🔁 Recorrente
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm border rounded-md p-4">
        <div><span className="text-muted-foreground">Empresa:</span> {(ticket.companies as any)?.name}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-muted-foreground">Solicitante:</span>
          {(ticket.contacts as any)?.full_name}
          {(ticket.contacts as any)?.is_whatsapp && (ticket.contacts as any)?.phone && (() => {
            const digits = ((ticket.contacts as any).phone as string).replace(/\D/g, '')
            const waNumber = digits.startsWith('55') ? digits : `55${digits}`
            return (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir conversa no WhatsApp"
                className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 border border-green-200 hover:border-green-400 rounded-full px-2 py-0.5 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            )
          })()}
        </div>
        <TicketMetaEditor
          ticketId={id}
          priority={ticket.priority}
          categoryId={ticket.category_id ?? null}
          assignedTo={ticket.assigned_to ?? null}
          analysts={(analystsRaw ?? []) as { id: string; full_name: string }[]}
          categories={(categoriesRaw ?? []) as { id: string; name: string }[]}
          isClosed={ticket.status === 'fechado'}
        />
        <div>
          <span className="text-muted-foreground">SLA:</span>{' '}
          <SLAIndicator
            createdAt={ticket.created_at}
            updatedAt={ticket.updated_at}
            slaStartsAt={ticket.sla_starts_at ?? null}
            slaDeadline={ticket.sla_deadline}
            slaFirstResponseAt={ticket.sla_first_response_at}
            slaMet={ticket.sla_met}
            slaPausedAt={ticket.sla_paused_at}
            status={ticket.status}
          />
        </div>
      </div>

      {ticket.description && (
        <div className="border rounded-md p-4 text-sm">
          <p className="text-muted-foreground text-xs mb-1">Descrição</p>
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* GMUDs vinculadas */}
      {linkedGmuds && linkedGmuds.length > 0 && (
        <div className="border rounded-md p-4 space-y-2">
          <h3 className="text-sm font-medium">Gestão de Mudanças vinculadas</h3>
          {(linkedGmuds as any[]).map((gmud: any) => (
            <a
              key={gmud.id}
              href={`/mudancas/${gmud.id}`}
              className="flex items-center justify-between text-sm hover:bg-muted rounded px-2 py-1"
            >
              <span>{gmud.title}</span>
              <span className="text-muted-foreground text-xs">
                {gmud.status} · {fmtDate(gmud.maintenance_start)}
              </span>
            </a>
          ))}
          <a
            href={`/mudancas/nova?ticket_id=${id}&ticket_title=${encodeURIComponent(ticket.title)}`}
            className="text-xs text-primary hover:underline block mt-2"
          >
            + Criar nova GMUD a partir deste chamado
          </a>
        </div>
      )}

      {linkedGmuds && linkedGmuds.length === 0 && ticket.status !== 'fechado' && (
        <a
          href={`/mudancas/nova?ticket_id=${id}&ticket_title=${encodeURIComponent(ticket.title)}`}
          className="text-xs text-primary hover:underline"
        >
          + Criar GMUD a partir deste chamado
        </a>
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

      {attachments.length > 0 && (
        <div className="border rounded-md p-4">
          <AttachmentList attachments={attachments} bucket="ticket-attachments" />
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
                  {fmtDateTime(i.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{i.content}</p>
            </div>
          )
        })}
      </div>

      {/* Atendimento presencial */}
      {ticket.status !== 'fechado' && (
        <PresentialCostPanel ticketId={id} cost={costData as any} canDiscount={canDiscount} />
      )}

      {/* Resumo de cobrança */}
      <BillingSummary
        ticketId={id}
        billingStatus={ticket.billing_status as any}
        cost={costData as any}
        canMarkBilled={canDiscount}
      />

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
