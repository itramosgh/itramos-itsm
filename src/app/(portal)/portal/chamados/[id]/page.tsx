import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { fmtDateTime } from '@/lib/format-date'
import { ReopenDialog } from '@/components/tickets/ReopenDialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { revalidatePath } from 'next/cache'
import type { TicketStatus } from '@/types/database'

async function sendPortalReplyAction(formData: FormData) {
  'use server'
  const ticketId = formData.get('ticket_id') as string
  const content = formData.get('content') as string
  if (!content?.trim()) return

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user!.id)
    .single() as { data: any }

  if (!contact) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: ticket } = await supabase
    .from('tickets')
    .select('status, company_id')
    .eq('id', ticketId)
    .single() as { data: any }

  if (!ticket || ticket.company_id !== contact.company_id) return

  await supabase.from('ticket_interactions').insert({
    ticket_id: ticketId,
    type: 'mensagem',
    content,
    author_contact_id: contact.id,
  } as never)

  // Se aguardando cliente → retomar em_andamento
  if (ticket.status === 'aguardando_cliente') {
    await supabase.from('tickets').update({ status: 'em_andamento' } as never).eq('id', ticketId)
  }

  // Notificar analista quando cliente responde via portal
  try {
    const { data: ticketForNotif } = await supabase
      .from('tickets')
      .select('number, title, assigned_to')
      .eq('id', ticketId)
      .single()
    const tn = ticketForNotif as any
    if (tn.assigned_to) {
      const { createServiceClient } = await import('@/lib/supabase/server')
      const serviceSupabase = await createServiceClient()
      const { resolveAnalystEmail } = await import('@/lib/email-notifications')
      const analystEmail = await resolveAnalystEmail(serviceSupabase, tn.assigned_to)
      if (analystEmail) {
        const { data: contactData } = await supabase
          .from('contacts')
          .select('full_name')
          .eq('id', contact.id)
          .single()
        const { data: settingsRaw } = await serviceSupabase
          .from('platform_settings')
          .select('email_from_name, email_from_address')
          .single()
        const settings = settingsRaw as any
        const { sendEmail, buildFromAddress } = await import('@/lib/email')
        const appUrl = process.env.NEXT_PUBLIC_APP_URL!
        await sendEmail({
          to: analystEmail,
          subject: `Retorno do cliente — Chamado #${tn.number}`,
          from: buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null),
          html: `<p>O cliente <strong>${(contactData as any)?.full_name ?? ''}</strong> respondeu ao chamado <strong>#${tn.number} — ${tn.title}</strong>.</p><p><a href="${appUrl}/chamados/${ticketId}">Abrir chamado</a></p>`,
        })
      }
    }
  } catch (e) {
    console.error('Erro ao notificar analista sobre resposta do cliente:', e)
  }

  revalidatePath(`/portal/chamados/${ticketId}`)
}

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

  const [{ data: ticketRaw }, { data: interactionsRaw }] = await Promise.all([
    supabase.from('tickets').select('*, ticket_categories(name)').eq('id', id).single(),
    supabase.from('ticket_interactions')
      .select('*, profiles(full_name), contacts(full_name)')
      .eq('ticket_id', id)
      .order('created_at'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ticket = ticketRaw as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interactions = interactionsRaw as any[]

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

      {ticket.status !== 'fechado' && (
        <form action={sendPortalReplyAction} className="space-y-3">
          <input type="hidden" name="ticket_id" value={id} />
          <Label htmlFor="content">Responder</Label>
          <Textarea id="content" name="content" rows={3} required />
          <Button type="submit">Enviar</Button>
        </form>
      )}

      {ticket.status === 'fechado' && ticket.closed_at && (
        <ReopenDialog ticketId={id} closedAt={ticket.closed_at} />
      )}
    </div>
  )
}
