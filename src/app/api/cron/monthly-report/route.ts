import { NextResponse } from 'next/server'
import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { createServiceClient } from '@/lib/supabase/server'
import { MonthlyReportPDF } from '@/components/reports/MonthlyReportPDF'
import type { ReportTicket, ReportMeeting, ReportGmud, ReportMonitoringChannel, MonthTrend } from '@/components/reports/MonthlyReportPDF'
import { sendEmail, buildFromAddress } from '@/lib/email'
import { isFirstBusinessDayOfMonth, getPreviousMonthRange } from '@/lib/report-utils'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date()

  // Check if today is the first business day of the month
  const { data: holidaysRaw } = await supabase
    .from('holidays')
    .select('date')
    .gte('date', today.toISOString().slice(0, 7) + '-01') // current month
    .lte('date', today.toISOString().slice(0, 10))

  const holidays = (holidaysRaw ?? []).map((h: any) => h.date as string)

  if (!isFirstBusinessDayOfMonth(today, holidays)) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not_first_business_day' })
  }

  const { from, to } = getPreviousMonthRange(today)

  const MONTH_LABELS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const toDateObj = new Date(`${to}T00:00:00Z`)
  const trendEnd = new Date(Date.UTC(toDateObj.getUTCFullYear(), toDateObj.getUTCMonth() + 1, 0, 23, 59, 59))
  const trendStart = new Date(Date.UTC(toDateObj.getUTCFullYear(), toDateObj.getUTCMonth() - 11, 1))
  const reportedMonth = `${toDateObj.getUTCFullYear()}-${String(toDateObj.getUTCMonth() + 1).padStart(2, '0')}`

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('logo_light_url, email_from_name, email_from_address, company_name')
    .single() as { data: any }

  const logoUrl: string | null = settings?.logo_light_url ?? null
  const providerName: string | null = settings?.company_name || null
  const emailFrom = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  // Get all active companies that have at least one active contract
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, contracts!inner(id)')
    .eq('is_active', true)
    .eq('contracts.status', 'ativo') as { data: any[] | null }

  let sent = 0
  let failed = 0
  const errors: string[] = []

  for (const company of (companies ?? [])) {
    try {
      // Get contacts who are contract responsible
      const { data: contacts } = await supabase
        .from('contacts')
        .select('email, full_name')
        .eq('company_id', company.id)
        .eq('is_contract_responsible', true)
        .eq('is_active', true) as { data: any[] | null }

      if (!contacts || contacts.length === 0) continue

      // Fetch report data
      const [
        { data: ticketsRaw },
        { data: meetingsRaw },
        { data: gmudsRaw },
        { data: monitoringRaw },
        { data: trendRaw },
      ] = await Promise.all([
        supabase
          .from('tickets')
          .select('number, title, status, priority, created_at, closed_at, assigned_to, category_id')
          .eq('company_id', company.id)
          .gte('created_at', `${from}T00:00:00Z`)
          .lte('created_at', `${to}T23:59:59Z`)
          .order('created_at'),
        supabase
          .from('meetings')
          .select('title, scheduled_at, meeting_action_items(description)')
          .eq('company_id', company.id)
          .gte('scheduled_at', `${from}T00:00:00Z`)
          .lte('scheduled_at', `${to}T23:59:59Z`)
          .order('scheduled_at'),
        supabase
          .from('change_requests')
          .select('title, status, maintenance_start')
          .eq('company_id', company.id)
          .gte('created_at', `${from}T00:00:00Z`)
          .lte('created_at', `${to}T23:59:59Z`)
          .order('created_at'),
        supabase
          .from('tickets')
          .select('channel, status, closed_at, created_at')
          .eq('company_id', company.id)
          .in('channel', ['zabbix', 'azure_monitor', 'url_monitoring'])
          .gte('created_at', `${from}T00:00:00Z`)
          .lte('created_at', `${to}T23:59:59Z`),
        supabase
          .from('tickets')
          .select('created_at')
          .eq('company_id', company.id)
          .gte('created_at', trendStart.toISOString())
          .lte('created_at', trendEnd.toISOString()),
      ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any[] | null }, { data: any[] | null }, { data: any[] | null }]

      const analystIds = [...new Set((ticketsRaw ?? []).map((t: any) => t.assigned_to).filter(Boolean))]
      const categoryIds = [...new Set((ticketsRaw ?? []).map((t: any) => t.category_id).filter(Boolean))]
      const [{ data: analysts }, { data: cats }] = await Promise.all([
        analystIds.length > 0
          ? supabase.from('profiles').select('id, full_name').in('id', analystIds)
          : Promise.resolve({ data: [] as any[] }),
        categoryIds.length > 0
          ? supabase.from('ticket_categories').select('id, name').in('id', categoryIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const analystMap: Record<string, string> = Object.fromEntries(((analysts as any[]) ?? []).map((a: any) => [a.id, a.full_name]))
      const categoryMap: Record<string, string> = Object.fromEntries(((cats as any[]) ?? []).map((c: any) => [c.id, c.name]))

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
        action_items: ((m.meeting_action_items as any[]) ?? []).map((ai: any) => ai.description).join('; ') || null,
      }))

      const gmuds: ReportGmud[] = (gmudsRaw ?? []).map((g: any) => ({
        title: g.title,
        status: g.status,
        maintenance_start: g.maintenance_start ?? null,
      }))

      const monMap: Record<string, { total: number; resolved: number; totalMs: number; resolvedCount: number }> = {}
      for (const t of (monitoringRaw ?? [])) {
        const ch: string = (t as any).channel
        if (!monMap[ch]) monMap[ch] = { total: 0, resolved: 0, totalMs: 0, resolvedCount: 0 }
        monMap[ch].total++
        const isResolved = (t as any).status === 'resolvido' || (t as any).status === 'fechado'
        if (isResolved) {
          monMap[ch].resolved++
          if ((t as any).closed_at) {
            monMap[ch].totalMs += new Date((t as any).closed_at).getTime() - new Date((t as any).created_at).getTime()
            monMap[ch].resolvedCount++
          }
        }
      }
      const monitoring: ReportMonitoringChannel[] = Object.entries(monMap).map(([channel, d]) => ({
        channel,
        total: d.total,
        resolved: d.resolved,
        mttr_hours: d.resolvedCount > 0 ? parseFloat((d.totalMs / d.resolvedCount / 3_600_000).toFixed(1)) : null,
      }))

      const trendCounts: Record<string, number> = {}
      for (const t of trendRaw ?? []) {
        const m = (t.created_at as string).slice(0, 7)
        trendCounts[m] = (trendCounts[m] ?? 0) + 1
      }
      const monthlyTrend: MonthTrend[] = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(Date.UTC(toDateObj.getUTCFullYear(), toDateObj.getUTCMonth() - 11 + i, 1))
        const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        return { month, label: `${MONTH_LABELS_PT[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`, count: trendCounts[month] ?? 0 }
      })

      const fromDate = new Date(`${from}T00:00:00Z`)
      const period = fromDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
        .replace(/^\w/, c => c.toUpperCase())

      const pdfBuffer = await renderToBuffer(
        createElement(MonthlyReportPDF, {
          companyName: company.name,
          providerName,
          period,
          logoUrl,
          tickets,
          meetings,
          gmuds,
          monitoring,
          monthlyTrend,
          reportedMonth,
        }) as any
      )

      const pdfAttachment = [{
        filename: `relatorio_${company.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${from}_${to}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }]

      for (const contact of contacts) {
        await sendEmail({
          to: contact.email,
          subject: `Relatório Mensal ITRAMOS — ${period}`,
          from: emailFrom,
          html: `<p>Olá ${contact.full_name ?? ''},</p><p>Segue em anexo o relatório mensal de ${period} referente à empresa <strong>${company.name}</strong>.</p><p>Qualquer dúvida, entre em contato com nossa equipe.</p>`,
          attachments: pdfAttachment,
        })
      }

      // Cópia interna
      await sendEmail({
        to: 'chamados@itramos.com.br',
        subject: `[Cópia] Relatório Mensal — ${company.name} — ${period}`,
        from: emailFrom,
        html: `<p>Cópia do relatório mensal de ${period} enviado para <strong>${company.name}</strong>.</p>`,
        attachments: pdfAttachment,
      })

      sent++
    } catch (err: any) {
      failed++
      errors.push(`${company.name}: ${err?.message ?? 'unknown'}`)
    }
  }

  await insertLog(supabase, 'cron_job', failed === 0 ? 'success' : 'failure',
    `Relatório mensal automático: ${sent} enviado(s), ${failed} falha(s)`,
    { sent, failed, period: from.slice(0, 7), errors }
  )

  return NextResponse.json({ ok: true, sent, failed, errors })
}
