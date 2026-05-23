import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, schedulingReminderHtml, buildFromAddress } from '@/lib/email'

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
    .select('email_from_address, email_from_name')
    .single()
  const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)

  let actions = 0

  const { data: scheduledTickets } = await supabase
    .from('tickets')
    .select('id, number, title, scheduled_at, assigned_to, contact_id, contacts(email)')
    .eq('status', 'agendado')
    .not('scheduled_at', 'is', null)

  for (const ticket of (scheduledTickets ?? []) as any[]) {
    const scheduledAt = new Date(ticket.scheduled_at!)
    const diffMs = scheduledAt.getTime() - now.getTime()
    const diffMin = diffMs / 60_000

    // Lembrete 15min antes (janela: entre 15 e 20 minutos)
    if (diffMin >= 15 && diffMin < 20) {
      const recipients: string[] = []
      if (ticket.assigned_to) {
        const { data: au } = await supabase.auth.admin.getUserById(ticket.assigned_to)
        if (au.user?.email) recipients.push(au.user.email)
      }
      if ((ticket.contacts as any)?.email) recipients.push((ticket.contacts as any).email)

      if (recipients.length > 0) {
        await sendEmail({
          to: [...new Set(recipients)],
          subject: `Lembrete: atendimento em 15 minutos — Chamado #${ticket.number}`,
          from,
          html: schedulingReminderHtml({
            ticketNumber: ticket.number,
            ticketTitle: ticket.title,
            scheduledAtStr: scheduledAt.toLocaleString('pt-BR'),
            appUrl,
          }),
        })
      }
      actions++
    }

    // Executar mudança de status no horário agendado (janela: passados 0-5 minutos)
    if (diffMin <= 0 && diffMin > -5) {
      await supabase.from('tickets').update({ status: 'em_andamento' } as never).eq('id', ticket.id)
      await supabase.from('ticket_interactions').insert({
        ticket_id: ticket.id,
        type: 'system',
        content: 'Atendimento iniciado automaticamente no horário agendado.',
        is_system: true,
      } as never)
      actions++
    }
  }

  return NextResponse.json({ ok: true, actions })
}
