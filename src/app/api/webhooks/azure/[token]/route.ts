import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isWithinMonitoringWindow, mapAzureMonitorSeverity } from '@/lib/monitoring'
import { insertLog } from '@/lib/log'
import { notifyTeams } from '@/lib/teams'
import { isValidTransition } from '@/lib/ticket-transitions'
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'

interface AzurePayload {
  schemaId?: string
  data?: {
    status?: string
    context?: {
      id?: string
      name?: string
      description?: string
      severity?: string
      resourceName?: string
      resourceType?: string
    }
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = await createServiceClient()

  const { data: integration, error: intError } = await supabase
    .from('monitoring_integrations')
    .select('*, companies!inner(id, name, is_blocked)')
    .eq('webhook_token', token)
    .eq('connector_type', 'azure_monitor')
    .eq('is_active', true)
    .single()

  if (intError || !integration) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const integrationData = integration as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const company = integrationData.companies

  if (company.is_blocked) {
    return NextResponse.json({ ok: true, action: 'ignored_blocked_company' })
  }

  let payload: AzurePayload = {}
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const status = payload.data?.status
  const externalAlertId = payload.data?.context?.id ?? null
  const isResolved = status === 'Resolved'

  // 3. Recovery — close existing ticket
  if (isResolved) {
    if (externalAlertId) {
      const { data: existingTicket } = await supabase
        .from('tickets')
        .select('id')
        .eq('external_alert_id', externalAlertId)
        .not('status', 'in', '("fechado","resolvido")')
        .maybeSingle()

      if (existingTicket) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ticketId = (existingTicket as any).id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const currentStatus = (existingTicket as any).status
        if (isValidTransition(currentStatus, 'resolvido')) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase.from('tickets') as any).update({
            status: 'resolvido',
            resolution: 'Resolvido automaticamente via Azure Monitor',
          }).eq('id', ticketId)

          await supabase.from('ticket_interactions').insert({
            ticket_id: ticketId,
            type: 'system',
            content: 'Resolvido automaticamente via Azure Monitor',
            is_system: true,
          } as any)
        } else {
          await insertLog(supabase, 'webhook_received', 'success',
            `Azure Monitor recovery: status '${currentStatus}' não permite transição para resolvido — ignorado`,
            { ticket_id: ticketId })
        }
      }

      // Clean up pending alerts for this external event
      await (supabase.from('pending_monitoring_alerts') as any)
        .delete()
        .eq('external_alert_id', externalAlertId)
        .eq('monitoring_integration_id', (integrationData as any).id)
    }
    await insertLog(supabase, 'webhook_received', 'success', `Azure Monitor recovery: ${payload.data?.context?.name ?? 'sem nome'}`, { external_alert_id: externalAlertId })
    return NextResponse.json({ ok: true, action: 'recovery_processed' })
  }

  // 4. Check monitoring window
  const now = new Date()
  const { data: settingsRaw } = await supabase
    .from('platform_settings')
    .select('business_hours_start, business_hours_end, business_hours_days, monitoring_contact_id')
    .single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const settings = settingsRaw as any

  const platformHours = {
    start: settings?.business_hours_start ?? '09:00',
    end: settings?.business_hours_end ?? '18:00',
    days: settings?.business_hours_days ?? [1, 2, 3, 4, 5],
  }

  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
  const { data: holidayRows } = await supabase.from('holidays').select('date').eq('date', todayStr)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holidays = (holidayRows ?? []).map((h: any) => h.date)

  const withinWindow = isWithinMonitoringWindow(integrationData, now, holidays, platformHours)

  if (!withinWindow) {
    const behavior = integrationData.out_of_window_behavior
    if (behavior === 'abrir_imediatamente') {
      // Prossegue para criação do chamado; SLA snapa para o próximo expediente via getEffectiveSLAStart
    } else if (behavior === 'aguardar_e_abrir') {
      const ctx = payload.data?.context
      await supabase.from('pending_monitoring_alerts').insert({
        monitoring_integration_id: integrationData.id,
        external_alert_id: externalAlertId,
        alert_title: ctx?.name ?? 'Alerta Azure Monitor sem nome',
        alert_description: ctx?.description ?? ctx?.resourceName ?? null,
        priority: mapAzureMonitorSeverity(ctx?.severity ?? ''),
        raw_payload: payload as any,
        event_at: now.toISOString(),
      } as any)
      await insertLog(supabase, 'webhook_received', 'success', 'Azure Monitor alerta enfileirado (fora da janela)', { external_alert_id: externalAlertId })
      return NextResponse.json({ ok: true, action: 'out_of_window' })
    } else {
      await insertLog(supabase, 'webhook_received', 'success', 'Azure Monitor alerta descartado (fora da janela)', {})
      return NextResponse.json({ ok: true, action: 'out_of_window' })
    }
  }

  // 5. Check for duplicate
  if (externalAlertId) {
    const { data: existing } = await supabase
      .from('tickets')
      .select('id')
      .eq('external_alert_id', externalAlertId)
      .not('status', 'in', '("fechado","resolvido")')
      .maybeSingle()
    if (existing) return NextResponse.json({ ok: true, action: 'duplicate_ignored' })
  }

  // 6. Resolve contact: monitoring_contact_id from settings, or first active contact of the company
  let contactId: string | null = settings?.monitoring_contact_id ?? null

  if (!contactId) {
    const { data: contactRaw } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', integrationData.company_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contactId = (contactRaw as any)?.id ?? null
  }

  if (!contactId) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Azure Monitor: nenhum contato ativo — chamado não criado', { company_id: integrationData.company_id })
    return NextResponse.json({ ok: true, action: 'no_contact_skipped' })
  }

  // 7. Get "Incidente" category
  const { data: category } = await supabase
    .from('ticket_categories')
    .select('id')
    .eq('slug', 'incidente')
    .maybeSingle()

  const ctx = payload.data?.context
  const priority = mapAzureMonitorSeverity(ctx?.severity ?? '')
  const title = `[Azure Monitor] ${ctx?.name ?? 'Alerta sem nome'}${ctx?.resourceName ? ` — ${ctx.resourceName}` : ''}`
  const description = [
    ctx?.description,
    ctx?.resourceName ? `Recurso: ${ctx.resourceName}` : null,
    ctx?.severity ? `Severidade: ${ctx.severity}` : null,
  ].filter(Boolean).join('\n')

  // 8. Create ticket
  const { data: newTicket, error: ticketError } = await supabase
    .from('tickets')
    .insert({
      title,
      description,
      company_id: integrationData.company_id,
      contact_id: contactId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category_id: (category as any)?.id ?? null,
      priority,
      channel: 'azure_monitor',
      external_alert_id: externalAlertId,
    } as any)
    .select('id, number')
    .single()

  if (ticketError || !newTicket) {
    await insertLog(supabase, 'webhook_received', 'failure', 'Azure Monitor: erro ao criar chamado', { error: ticketError?.message })
    return NextResponse.json({ error: 'Erro ao criar chamado' }, { status: 500 })
  }

  // 8b. Calcular SLA (contrato ativo da empresa)
  try {
    const sla = await calculateTicketSLAForCompany(supabase, {
      companyId: integrationData.company_id,
      priority,
      createdAt: new Date(),
    })
    if (sla) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('tickets') as any).update({
        sla_deadline: sla.sla_deadline,
        sla_starts_at: sla.sla_starts_at,
      }).eq('id', (newTicket as any).id)
    }
  } catch {
    // SLA calc failure doesn't block ticket creation
  }

  await supabase.from('ticket_interactions').insert({
    ticket_id: (newTicket as any).id,
    type: 'system',
    content: `Chamado criado automaticamente via Azure Monitor.\nRecurso: ${ctx?.resourceName ?? 'N/A'}\nSeveridade: ${ctx?.severity ?? 'N/A'}`,
    is_system: true,
  } as any)

  await insertLog(supabase, 'webhook_received', 'success', `Azure Monitor: chamado #${(newTicket as any).number} criado`, { ticket_id: (newTicket as any).id })

  // 9. Notify Teams (non-blocking)
  try {
    await notifyTeams(supabase, 'monitoring_alert', {
      source: 'Azure Monitor',
      resource: ctx?.resourceName ?? 'N/A',
      severity: ctx?.severity ?? 'N/A',
      description: ctx?.name ?? 'Alerta sem nome',
      ticketNumber: String((newTicket as any).number),
      ticketId: (newTicket as any).id,
      companyName: company.name,
    })
  } catch {
    await insertLog(supabase, 'webhook_received', 'failure', 'Falha ao enviar notificação Teams (não crítico)', {})
  }

  return NextResponse.json({ ok: true, action: 'ticket_created', ticket_number: (newTicket as any).number })
}
