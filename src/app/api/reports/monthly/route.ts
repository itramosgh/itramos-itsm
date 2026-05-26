import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/supabase/server'
import { MonthlyReportPDF } from '@/components/reports/MonthlyReportPDF'
import type { ReportTicket, ReportMeeting, ReportGmud, ReportMonitoringChannel } from '@/components/reports/MonthlyReportPDF'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const companyId = searchParams.get('companyId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!companyId || !from || !to) {
    return NextResponse.json({ error: 'Missing companyId, from or to' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  const [
    { data: companyData },
    { data: settingsData },
    { data: ticketsRaw, error: ticketsError },
    { data: meetingsRaw },
    { data: gmudsRaw },
    { data: monitoringRaw },
  ] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('platform_settings').select('logo_light_url').single(),
    supabase
      .from('tickets')
      .select('number, title, status, priority, created_at, closed_at, assigned_to, category_id')
      .eq('company_id', companyId)
      .gte('created_at', `${from}T00:00:00Z`)
      .lte('created_at', `${to}T23:59:59Z`)
      .order('created_at'),
    supabase
      .from('meetings')
      .select('title, scheduled_at, meeting_action_items(description)')
      .eq('company_id', companyId)
      .gte('scheduled_at', `${from}T00:00:00Z`)
      .lte('scheduled_at', `${to}T23:59:59Z`)
      .order('scheduled_at'),
    supabase
      .from('change_requests')
      .select('title, status, maintenance_start')
      .eq('company_id', companyId)
      .gte('created_at', `${from}T00:00:00Z`)
      .lte('created_at', `${to}T23:59:59Z`)
      .order('created_at'),
    supabase
      .from('tickets')
      .select('channel, closed_at, created_at')
      .eq('company_id', companyId)
      .in('channel', ['zabbix', 'azure_monitor', 'url_monitoring'])
      .gte('created_at', `${from}T00:00:00Z`)
      .lte('created_at', `${to}T23:59:59Z`),
  ]) as any[]

  console.log('[monthly-report] tickets count:', ticketsRaw?.length ?? 0, '| error:', ticketsError?.message ?? 'none', '| monitoring count:', monitoringRaw?.length ?? 0, '| companyId:', companyId, '| range:', from, '-', to)

  const companyName: string = companyData?.name ?? 'Cliente'
  const logoUrl: string | null = (settingsData as any)?.logo_light_url ?? null

  const analystIds = [...new Set((ticketsRaw ?? []).map((t: any) => t.assigned_to).filter(Boolean))]
  const categoryIds = [...new Set((ticketsRaw ?? []).map((t: any) => t.category_id).filter(Boolean))]
  const [{ data: analysts }, { data: categories }] = await Promise.all([
    analystIds.length > 0
      ? supabase.from('profiles').select('id, full_name').in('id', analystIds)
      : Promise.resolve({ data: [] as any[] }),
    categoryIds.length > 0
      ? supabase.from('ticket_categories').select('id, name').in('id', categoryIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const analystMap: Record<string, string> = Object.fromEntries(((analysts as any[]) ?? []).map((a: any) => [a.id, a.full_name]))
  const categoryMap: Record<string, string> = Object.fromEntries(((categories as any[]) ?? []).map((c: any) => [c.id, c.name]))

  const tickets: ReportTicket[] = (ticketsRaw ?? []).map((t: any) => ({
    number: t.number,
    title: t.title,
    category: categoryMap[t.category_id] ?? 'Sem categoria',
    priority: t.priority,
    status: t.status,
    created_at: t.created_at,
    closed_at: t.closed_at ?? null,
    analyst_name: analystMap[t.assigned_to] ?? '—',
    reopened: t.status === 'reaberto',
  }))

  const meetings: ReportMeeting[] = (meetingsRaw ?? []).map((m: any) => ({
    title: m.title,
    date: m.scheduled_at,
    action_items: ((m.meeting_action_items as any[]) ?? [])
      .map((ai: any) => ai.description)
      .join('; ') || null,
  }))

  const gmuds: ReportGmud[] = (gmudsRaw ?? []).map((g: any) => ({
    title: g.title,
    status: g.status,
    maintenance_start: g.maintenance_start ?? null,
  }))

  // Group monitoring tickets by channel
  const monitoringMap: Record<string, { total: number; resolved: number; totalMs: number; resolvedCount: number }> = {}
  for (const t of (monitoringRaw ?? [])) {
    const ch: string = (t as any).channel
    if (!monitoringMap[ch]) monitoringMap[ch] = { total: 0, resolved: 0, totalMs: 0, resolvedCount: 0 }
    monitoringMap[ch].total++
    if ((t as any).closed_at) {
      monitoringMap[ch].resolved++
      monitoringMap[ch].totalMs += new Date((t as any).closed_at).getTime() - new Date((t as any).created_at).getTime()
      monitoringMap[ch].resolvedCount++
    }
  }
  const monitoring: ReportMonitoringChannel[] = Object.entries(monitoringMap).map(([channel, d]) => ({
    channel,
    total: d.total,
    resolved: d.resolved,
    mttr_hours: d.resolvedCount > 0 ? parseFloat((d.totalMs / d.resolvedCount / 3_600_000).toFixed(1)) : null,
  }))

  // Compute period label from from/to
  const fromDate = new Date(`${from}T00:00:00Z`)
  const period = fromDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .replace(/^\w/, c => c.toUpperCase())

  const pdfBuffer = await renderToBuffer(
    createElement(MonthlyReportPDF, {
      companyName,
      period,
      logoUrl,
      tickets,
      meetings,
      gmuds,
      monitoring,
    }) as any
  )

  const safeName = companyName.replace(/[^a-z0-9]/gi, '_').toLowerCase()
  return new Response(new Uint8Array(pdfBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="relatorio_${safeName}_${from}_${to}.pdf"`,
    },
  })
}
