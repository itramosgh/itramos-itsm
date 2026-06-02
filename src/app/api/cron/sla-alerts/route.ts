import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, slaAlertHtml, buildFromAddress } from '@/lib/email'
import { notifyTeams } from '@/lib/teams'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('email_from_address, email_from_name')
    .single()

  const from = buildFromAddress((settings as any)?.email_from_name ?? null, (settings as any)?.email_from_address ?? null)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  const { data: alertProfiles } = await supabase
    .from('profiles')
    .select('id, role')
    .in('role', ['analista', 'gestor'])
    .eq('is_active', true)

  const { data: openTickets } = await supabase
    .from('tickets')
    .select('id, number, title, sla_deadline, assigned_to, created_at, sla_paused_at')
    .is('sla_first_response_at', null)
    .not('sla_deadline', 'is', null)
    .not('status', 'in', '("fechado","resolvido")')

  let alertsSent = 0

  for (const ticket of (openTickets ?? []) as any[]) {
    const deadline = new Date(ticket.sla_deadline!)
    const deadlineMs = deadline.getTime()
    const nowMs = now.getTime()

    const pausedMs = ticket.sla_paused_at ? nowMs - new Date(ticket.sla_paused_at).getTime() : 0
    const effectiveNowMs = nowMs - pausedMs

    const totalMs = deadlineMs - new Date(ticket.created_at).getTime()
    const remainingMs = deadlineMs - effectiveNowMs
    const pctUsed = 1 - remainingMs / totalMs

    const isBreached = effectiveNowMs > deadlineMs
    const isNearBreach = !isBreached && pctUsed >= 0.8

    if (!isBreached && !isNearBreach) continue

    const recipientIds = new Set<string>()
    if (ticket.assigned_to) recipientIds.add(ticket.assigned_to)
    for (const p of (alertProfiles ?? []) as any[]) {
      if (p.role === 'gestor') recipientIds.add(p.id)
    }

    for (const uid of recipientIds) {
      const { data: authUser } = await supabase.auth.admin.getUserById(uid)
      if (!authUser.user?.email) continue

      await sendEmail({
        to: authUser.user.email,
        subject: isBreached
          ? `🚨 SLA VIOLADO — Chamado #${ticket.number}`
          : `⚠️ SLA próximo de vencer — Chamado #${ticket.number}`,
        from,
        html: slaAlertHtml({
          ticketNumber: ticket.number,
          ticketTitle: ticket.title,
          deadlineStr: deadline.toLocaleString('pt-BR'),
          alertType: isBreached ? 'violado' : 'proximo',
          appUrl,
        }),
      })

      await insertLog(supabase, 'email_sent', 'success', `Alerta de SLA ${isBreached ? 'violado' : 'próximo de vencer'} enviado — Chamado #${ticket.number}`, {
        ticket_id: ticket.id,
        ticket_number: ticket.number,
        recipient: authUser.user.email,
        alert_type: isBreached ? 'sla_breach' : 'sla_warning',
      })

      alertsSent++
    }

    // Teams notification (once per ticket, not per recipient)
    try {
      const assignedProfile = ticket.assigned_to
        ? (await supabase.auth.admin.getUserById(ticket.assigned_to)).data.user
        : null
      await notifyTeams(supabase, isBreached ? 'sla_breach' : 'sla_warning', {
        ticketNumber: String(ticket.number),
        ticketId: ticket.id,
        title: ticket.title,
        timeRemaining: isBreached ? 'SLA violado' : `${Math.round((deadline.getTime() - effectiveNowMs) / 60000)} min`,
        breachTime: isBreached ? `${Math.round((effectiveNowMs - deadline.getTime()) / 60000)} min` : '',
        assignedTo: assignedProfile?.email ?? 'Não atribuído',
      })
    } catch {
      // Teams failure doesn't stop SLA alerts
    }
  }

  await insertLog(supabase, 'cron_job', 'success', `Cron sla-alerts executado — ${alertsSent} alerta(s) enviado(s)`, {
    alerts_sent: alertsSent,
  })

  return NextResponse.json({ ok: true, alertsSent })
}
