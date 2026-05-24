import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, awaitingClientReminderHtml, buildFromAddress } from '@/lib/email'
import { resolveContactEmails } from '@/lib/email-notifications'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name, company_whatsapp')
    .single()
  const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)

  let actions = 0

  // ── AGUARDANDO CLIENTE ──────────────────────────────────────────────
  const { data: awaitingClientTickets } = await supabase
    .from('tickets')
    .select('id, number, title, updated_at, contact_id, company_id, contacts(email, full_name), assigned_to')
    .eq('status', 'aguardando_cliente')

  for (const ticket of (awaitingClientTickets ?? []) as any[]) {
    const lastUpdate = new Date(ticket.updated_at)
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / 3_600_000
    if (hoursSinceUpdate >= 48) {
      // Auto-fechar após 2 dias sem resposta
      await supabase.from('tickets').update({
        status: 'fechado',
        closed_at: now.toISOString(),
      } as never).eq('id', ticket.id)

      await supabase.from('ticket_interactions').insert({
        ticket_id: ticket.id,
        type: 'system',
        content: 'Chamado encerrado por falta de retorno do cliente após 2 dias de espera.',
        is_system: true,
      } as never)

      if (ticket.assigned_to) {
        const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
        if (authUser.user?.email) {
          await sendEmail({
            to: authUser.user.email,
            subject: `Chamado #${ticket.number} encerrado automaticamente`,
            from,
            html: `<p>O chamado <strong>#${ticket.number} — ${ticket.title}</strong> foi encerrado por ausência de retorno do cliente após 2 dias.</p>`,
          })
        }
      }
      actions++
      continue
    }

    if (hoursSinceUpdate >= 24) {
      // Lembrete a cada 24h
      const contactEmails = await resolveContactEmails(supabase, ticket.contact_id, ticket.company_id)
      if (contactEmails.length > 0) {
        await sendEmail({
          to: contactEmails,
          subject: `Aguardamos seu retorno — Chamado #${ticket.number}`,
          from,
          html: awaitingClientReminderHtml({
            ticketNumber: ticket.number,
            ticketTitle: ticket.title,
            portalUrl: appUrl,
          }),
        })

        await supabase.from('ticket_interactions').insert({
          ticket_id: ticket.id,
          type: 'system',
          content: 'Lembrete automático de retorno enviado ao solicitante.',
          is_system: true,
        } as never)
      }
      actions++
    }
  }

  // ── AGUARDANDO APROVAÇÃO ────────────────────────────────────────────
  const twoDaysAgo = new Date(now.getTime() - 48 * 3_600_000)

  const { data: pendingApprovals } = await supabase
    .from('ticket_approvals')
    .select('id, ticket_id, tickets(number, title, assigned_to, contact_id, contacts(email))')
    .eq('status', 'pendente')
    .lt('created_at', twoDaysAgo.toISOString())

  for (const approval of (pendingApprovals ?? []) as any[]) {
    const ticket = approval.tickets as any

    await supabase.from('ticket_approvals').update({ status: 'expirado' } as never).eq('id', approval.id)
    await supabase.from('tickets').update({
      status: 'fechado',
      closed_at: now.toISOString(),
    } as never).eq('id', approval.ticket_id)

    await supabase.from('ticket_interactions').insert({
      ticket_id: approval.ticket_id,
      type: 'system',
      content: 'Chamado encerrado por ausência de aprovação após 2 dias.',
      is_system: true,
    } as never)

    const recipients: string[] = []
    if (ticket.contacts?.email) recipients.push(ticket.contacts.email)
    if (ticket.assigned_to) {
      const { data: authUser } = await supabase.auth.admin.getUserById(ticket.assigned_to)
      if (authUser.user?.email) recipients.push(authUser.user.email)
    }
    const { data: gestores } = await supabase.from('profiles').select('id').eq('role', 'gestor').eq('is_active', true)
    for (const g of (gestores ?? []) as any[]) {
      const { data: au } = await supabase.auth.admin.getUserById(g.id)
      if (au.user?.email) recipients.push(au.user.email)
    }

    if (recipients.length > 0) {
      await sendEmail({
        to: [...new Set(recipients)],
        subject: `Chamado #${ticket.number} encerrado — ausência de aprovação`,
        from,
        html: `<p>O chamado <strong>#${ticket.number} — ${ticket.title}</strong> foi encerrado automaticamente por ausência de aprovação após 2 dias.</p>`,
      })
    }
    actions++
  }

  return NextResponse.json({ ok: true, actions })
}
