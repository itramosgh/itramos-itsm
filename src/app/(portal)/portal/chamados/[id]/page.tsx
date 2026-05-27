import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { fmtDateTime } from '@/lib/format-date'
import { ReopenDialog } from '@/components/tickets/ReopenDialog'
import type { TicketStatus } from '@/types/database'
import { AttachmentList } from '@/components/tickets/AttachmentList'
import type { AttachmentItem } from '@/components/tickets/AttachmentList'
import { PortalReplyForm } from './PortalReplyForm'

export default async function PortalTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('user_id', user!.id)
    .single() as { data: any }

  if (!contact) notFound()

  const [{ data: ticketRaw }, { data: interactionsRaw }, { data: attachmentsRaw }] = await Promise.all([
    supabase.from('tickets').select('*, ticket_categories(name)').eq('id', id).single(),
    supabase.from('ticket_interactions')
      .select('*, profiles(full_name), contacts(full_name)')
      .eq('ticket_id', id)
      .order('created_at'),
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

  if (!ticket || ticket.company_id !== contact.company_id) notFound()

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-mono">#{ticket.number}</p>
          <h1 className="text-xl font-semibold">{ticket.title}</h1>
        </div>
        <TicketStatusBadge status={ticket.status as TicketStatus} />
      </div>

      {ticket.description && (
        <div className="border rounded-md p-3 text-sm">
          <p className="whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="border rounded-md p-3">
          <AttachmentList attachments={attachments} bucket="ticket-attachments" />
        </div>
      )}

      <div className="space-y-3">
        {interactions?.map((i: any) => {
          const author = (i.profiles as any)?.full_name ?? (i.contacts as any)?.full_name ?? 'Sistema'
          return (
            <div key={i.id} className={`border rounded-md p-3 text-sm ${i.is_system ? 'bg-muted/30 border-dashed' : ''}`}>
              <div className="flex justify-between mb-1">
                <span className="font-medium text-xs">{author}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(i.created_at)}</span>
              </div>
              <p className="whitespace-pre-wrap">{i.content}</p>
            </div>
          )
        })}
      </div>

      {ticket.status !== 'fechado' && <PortalReplyForm ticketId={id} />}

      {ticket.status === 'fechado' && ticket.closed_at && (
        <ReopenDialog ticketId={id} closedAt={ticket.closed_at} />
      )}
    </div>
  )
}
