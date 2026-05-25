import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { isWithinMonitoringWindow } from '@/lib/monitoring'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: pendingAlerts } = await supabase
    .from('pending_monitoring_alerts')
    .select('*, monitoring_integrations!inner(*, companies!inner(id, name, is_blocked))')
    .order('event_at', { ascending: true })

  if (!pendingAlerts?.length) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

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

  let processed = 0

  for (const alert of pendingAlerts as any[]) {
    const integration = alert.monitoring_integrations
    const company = integration.companies

    if (!isWithinMonitoringWindow(integration, now, holidays, platformHours)) continue
    if (company.is_blocked) {
      await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
      continue
    }

    // Check for duplicate
    if (alert.external_alert_id) {
      const { data: existing } = await supabase
        .from('tickets')
        .select('id')
        .eq('external_alert_id', alert.external_alert_id)
        .not('status', 'in', '("fechado","resolvido")')
        .maybeSingle()
      if (existing) {
        await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
        continue
      }
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('company_id', integration.company_id)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!contact) {
      await insertLog(supabase, 'cron_job', 'failure', `process-pending-alerts: sem contato ativo na empresa ${integration.company_id}`, {})
      await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
      continue
    }

    const { data: category } = await supabase
      .from('ticket_categories')
      .select('id')
      .eq('slug', 'incidente')
      .maybeSingle()

    const channel = integration.connector_type === 'zabbix' ? 'zabbix' : 'azure_monitor'
    const description = [
      alert.alert_description,
      `Evento original em: ${new Date(alert.event_at).toLocaleString('pt-BR')} (fora da janela)`,
    ].filter(Boolean).join('\n')

    const { data: ticket } = await supabase
      .from('tickets')
      .insert({
        title: alert.alert_title,
        description,
        company_id: integration.company_id,
        contact_id: (contact as any).id,
        category_id: (category as any)?.id ?? null,
        priority: alert.priority,
        channel,
        external_alert_id: alert.external_alert_id,
      } as any)
      .select('id, number')
      .single()

    if (ticket) {
      await supabase.from('ticket_interactions').insert({
        ticket_id: (ticket as any).id,
        type: 'system',
        content: `Chamado criado automaticamente (aguardava janela de monitoramento). Evento original: ${new Date(alert.event_at).toLocaleString('pt-BR')}`,
        is_system: true,
      } as any)

      await insertLog(supabase, 'cron_job', 'success', `Alerta pendente processado: chamado #${(ticket as any).number}`, { alert_id: alert.id, ticket_id: (ticket as any).id })
      processed++
    }

    await supabase.from('pending_monitoring_alerts').delete().eq('id', alert.id)
  }

  return NextResponse.json({ ok: true, processed })
}
