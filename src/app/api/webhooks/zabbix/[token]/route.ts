import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isWithinMonitoringWindow, mapZabbixSeverity } from '@/lib/monitoring'
import { insertLog } from '@/lib/log'
import { notifyTeams } from '@/lib/teams'
import { isValidTransition } from '@/lib/ticket-transitions'

interface ZabbixPayload {
  problem_type?: string
  recovery?: string
  r_eventid?: string
  event_id?: string
  trigger_name?: string
  trigger_description?: string
  host_name?: string
  severity?: string
  problem_name?: string
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createServiceClient()

  // 1. Validate token
  const { data: integrationRaw, error: intError } = await supabase
    .from('monitoring_integrations')
    .select('*, companies!inner(id, name, is_blocked)')
    .eq('webhook_token', token)
    .eq('connector_type', 'zabbix')
    .eq('is_active', true)
    .single()

  if (intError || !integrationRaw) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const integration = integrationRaw as any
  const company = integration.companies

  // 2. Check if company is blocked
  if (company.is_blocked) {
    return NextResponse.json({ ok: true, action: 'ignored_blocked_company' })
  }

  let payload: ZabbixPayload = {}
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const isRecovery = payload.problem_type === 'RECOVERY'
    || payload.recovery === '1'
    || !!payload.r_eventid

  const externalAlertId = payload.event_id ?? payload.r_eventid ?? null

  // 3. Recovery — close existing ticket
  if (isRecovery) {
    if (externalAlertId) {
      const { data: existingTicketRaw } = await supabase
        .from('tickets')
        .select('id, status')
        .eq('external_alert_id', externalAlertId)
        .not('status', 'in', '("fechado","resolvido")')
        .maybeSingle()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingTicket = existingTicketRaw as any
      if (existingTicket) {
        if (isValidTransition(existingTicket.status, 'resolvido')) {
          await (supabase.from('tickets') as any).update({
            status: 'resolvido',
            resolution: 'Resolvido automaticamente via Zabbix',
          }).eq('id', existingTicket.id)

          await supabase.from('ticket_interactions').insert({
            ticket_id: existingTicket.id,
            type: 'system',
            content: 'Resolvido automaticamente via Zabbix',
            is_system: true,
          } as any)
        } else {
          await insertLog(supabase, 'webhook_received', 'success',
            `Zabbix recovery: status '${existingTicket.status}' não permite transição para resolvido — ignorado`,
            { ticket_id: existingTicket.id })
        }
      }

      // Clean up pending alerts for this external event
      await (supabase.from('pending_monitoring_alerts') as any)
        .delete()
        .eq('external_alert_id', externalAlertId)
        .eq('monitoring_integration_id', integration.id)
    }
    await insertLog(supabase, 'webhook_received', 'success', `Zabbix recovery recebido: ${payload.trigger_name ?? 'sem nome'}`, { external_alert_id: externalAlertId })
    return NextResponse.json({ ok: true, action: 'recovery_processed' })
  }

  // 4. Check monitoring window
  const now = new Date()
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days')
    .single()
  const settings = settingsRaw as any

  const platformHours = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
  const { data: holidayRows } = await supabase
    .from('holidays')
    .select('date')
    .eq('date', todayStr)
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  const withinWindow = isWithinMonitoringWindow(integration as any, now, holidays, platformHours)

  if (!withinWindow) {
    if ((integration as any).out_of_window_behavior === 'aguardar_e_abrir') {
      await supabase.from('pending_monitoring_alerts').insert({
        monitoring_integration_id: integration.id,
        external_alert_id: externalAlertId,
        alert_title: payload.trigger_name ?? 'Alerta Zabbix sem nome',
        alert_description: payload.trigger_description ?? payload.host_name ?? null,
        priority: mapZabbixSeverity(payload.severity ?? ''),
        raw_payload: payload as any,
        event_at: now.toISOString(),
      } as any)
      await insertLog(supabase, 'webhook_received', 'success', 'Zabbix alerta enfileirado (fora da janela)', { external_alert_id: externalAlertId })
    } else {
      await insertLog(supabase, 'webhook_received', 'success', 'Zabbix alerta descartado (fora da janela)', { external_alert_id: externalAlertId })
    }
    return NextResponse.json({ ok: true, action: 'out_of_window' })
  }

  // 5. Check for duplicate
  if (externalAlertId) {
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('external_alert_id', externalAlertId)
      .not('status', 'in', '("fechado","resolvido")')
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, action: 'duplicate_ignored' })
    }
  }

  // 6. Get first active contact
  const { data: contactRaw } = await supabase
    .from('contacts')
    .select('id')
    .eq('company_id', integration.company_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contact = contactRaw as any
  if (!contact) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Zabbix: nenhum contato ativo no cliente — chamado não criado', { company_id: integration.company_id })
    return NextResponse.json({ ok: true, action: 'no_contact_skipped' })
  }

  // 7. Get "Incidente" category
  const { data: category } = await supabase
    .from('ticket_categories')
    .select('id')
    .eq('slug', 'incidente')
    .maybeSingle()

  const priority = mapZabbixSeverity(payload.severity ?? '')
  const title = `[Zabbix] ${payload.trigger_name ?? 'Alerta sem nome'}${payload.host_name ? ` — ${payload.host_name}` : ''}`
  const description = [
    payload.trigger_description,
    payload.host_name ? `Host: ${payload.host_name}` : null,
    payload.severity ? `Severidade: ${payload.severity}` : null,
  ].filter(Boolean).join('\n')

  // 8. Create ticket
  const { data: newTicket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      title,
      description,
      company_id: integration.company_id,
      contact_id: contact.id,
      category_id: (category as any)?.id ?? null,
      priority,
      channel: 'zabbix',
      external_alert_id: externalAlertId,
    } as any)
    .select('id, number')
    .single()

  if (ticketError || !newTicket) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Zabbix: erro ao criar chamado', { error: ticketError?.message })
    return NextResponse.json({ error: 'Erro ao criar chamado' }, { status: 500 })
  }

  await supabase.from('ticket_interactions').insert({
    ticket_id: (newTicket as any).id,
    type: 'system',
    content: `Chamado criado automaticamente via Zabbix.\nHost: ${payload.host_name ?? 'N/A'}\nSeveridade: ${payload.severity ?? 'N/A'}`,
    is_system: true,
  } as any)

  await insertLog(supabase, 'webhook_received', 'success', `Zabbix: chamado #${(newTicket as any).number} criado`, { ticket_id: (newTicket as any).id, external_alert_id: externalAlertId })

  // 9. Notify Teams (non-blocking)
  try {
    await notifyTeams(supabase, 'monitoring_alert', {
      source: 'Zabbix',
      resource: payload.host_name ?? 'N/A',
      severity: payload.severity ?? 'N/A',
      description: payload.trigger_name ?? 'Alerta sem nome',
      ticketNumber: String((newTicket as any).number),
      ticketId: (newTicket as any).id,
      companyName: company.name,
    })
  } catch {
    await insertLog(supabase, 'webhook_received', 'failure', 'Falha ao enviar notificação Teams (não crítico)', {})
  }

  return NextResponse.json({ ok: true, action: 'ticket_created', ticket_number: (newTicket as any).number })
}
