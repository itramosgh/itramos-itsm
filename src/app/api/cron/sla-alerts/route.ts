import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmail, slaAlertHtml, buildFromAddress } from '@/lib/email'
import { notifyTeams } from '@/lib/teams'
import { insertLog } from '@/lib/log'

const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const nowMs = now.getTime()

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

    const pausedMs = ticket.sla_paused_at ? nowMs - new Date(ticket.sla_paused_at).getTime() : 0
    const effectiveNowMs = nowMs - pausedMs
    const remainingMs = deadlineMs - effectiveNowMs

    const isBreached = effectiveNowMs > deadlineMs
    // Alerta apenas quando faltam até 2h para o vencimento
    const isNearBreach = !isBreached && remainingMs <= TWO_HOURS_MS

    if (!isBreached && !isNearBreach) continue

    // Deduplicação: sla_warning enviado apenas 1x por chamado
    if (isNearBreach) {
      const { data: existing } = await supabase
        .from('system_logs')
        .select('id')
        .eq('category', 'email_sent')
        .contains('details', { ticket_id: ticket.id, alert_type: 'sla_warning' })
        .limit(1)
        .maybeSingle()
      if (existing) continue
    }

    // Deduplicação: sla_breach enviado no máximo 1x por dia por chamado
    if (isBreached) {
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)
      const { data: existing } = await supabase
        .from('system_logs')
        .select('id')
        .eq('category', 'email_sent')
        .contains('details', { ticket_id: ticket.id, alert_type: 'sla_breach' })
        .gte('created_at', todayStart.toISOString())
        .limit(1)
        .maybeSingle()
      if (existing) continue
    }

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
        timeRemaining: isBreached ? 'SLA violado' : `${Math.round(remainingMs / 60000)} min`,
        breachTime: isBreached ? `${Math.round((effectiveNowMs - deadlineMs) / 60000)} min` : '',
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
