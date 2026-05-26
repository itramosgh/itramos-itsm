'use server'

import { createElement } from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { MonthlyReportPDF } from '@/components/reports/MonthlyReportPDF'
import type { ReportTicket, ReportMeeting, ReportGmud, ReportMonitoringChannel } from '@/components/reports/MonthlyReportPDF'
import { sendEmail, buildFromAddress } from '@/lib/email'
import { getPreviousMonthRange } from '@/lib/report-utils'
import { insertLog } from '@/lib/log'

async function buildReportData(companyId: string, from: string, to: string) {
  const supabase = await createServiceClient()
  const [
    { data: companyData },
    { data: settingsData },
    { data: ticketsRaw },
    { data: meetingsRaw },
    { data: gmudsRaw },
    { data: monitoringRaw },
  ] = await Promise.all([
    supabase.from('companies').select('name').eq('id', companyId).single(),
    supabase.from('platform_settings').select('logo_light_url, email_from_name, email_from_address, company_name, app_name').single(),
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
      .select('channel, status, closed_at, created_at')
      .eq('company_id', companyId)
      .in('channel', ['zabbix', 'azure_monitor', 'url_monitoring'])
      .gte('created_at', `${from}T00:00:00Z`)
      .lte('created_at', `${to}T23:59:59Z`),
  ]) as [{ data: any }, { data: any }, { data: any[] | null }, { data: any[] | null }, { data: any[] | null }, { data: any[] | null }]

  const companyName: string = companyData?.name ?? 'Cliente'
  const providerName: string | null = (settingsData as any)?.app_name || (settingsData as any)?.company_name || null
  const logoUrl: string | null = (settingsData as any)?.logo_light_url ?? null
  const emailFrom = buildFromAddress((settingsData as any)?.email_from_name ?? null, (settingsData as any)?.email_from_address ?? null)

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

  const fromDate = new Date(`${from}T00:00:00Z`)
  const period = fromDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .replace(/^\w/, c => c.toUpperCase())

  const pdfBuffer = await renderToBuffer(
    createElement(MonthlyReportPDF, { companyName, providerName, period, logoUrl, tickets, meetings, gmuds, monitoring }) as any
  )

  return { companyName, period, pdfBuffer, emailFrom, supabase }
}

export async function downloadReport(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const companyId = formData.get('company_id') as string
  const from = formData.get('from') as string
  const to = formData.get('to') as string
  if (!companyId || !from || !to) return

  // Redirect to the API route which will stream the PDF download
  redirect(`/api/reports/monthly?companyId=${companyId}&from=${from}&to=${to}`)
}

export async function sendReportByEmail(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const companyId = formData.get('company_id') as string
  const from = formData.get('from') as string
  const to = formData.get('to') as string
  if (!companyId || !from || !to) return { ok: false, error: 'Dados incompletos.' }

  const serviceClient = await createServiceClient()

  // Get contacts who are contract responsible
  const { data: contacts } = await serviceClient
    .from('contacts')
    .select('email, full_name')
    .eq('company_id', companyId)
    .eq('is_contract_responsible', true)
    .eq('is_active', true) as { data: any[] | null }

  if (!contacts || contacts.length === 0) {
    return { ok: false, error: 'Nenhum responsável de contrato cadastrado para este cliente.' }
  }

  try {
    const { companyName, period, pdfBuffer, emailFrom } = await buildReportData(companyId, from, to)

    for (const contact of contacts) {
      await sendEmail({
        to: contact.email,
        subject: `Relatório Mensal ITRAMOS — ${period}`,
        from: emailFrom,
        html: `<p>Olá ${contact.full_name ?? ''},</p><p>Segue em anexo o relatório mensal de ${period} referente à empresa <strong>${companyName}</strong>.</p><p>Qualquer dúvida, entre em contato com nossa equipe.</p>`,
        attachments: [{
          filename: `relatorio_${period.replace(/\//g, '_').toLowerCase()}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      })
    }

    await insertLog(serviceClient, 'email_sent', 'success',
      `Relatório mensal enviado para ${contacts.length} responsável(eis) de ${companyName}`,
      { companyId, from, to, recipients: contacts.map((c: any) => c.email) }
    )

    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erro ao gerar ou enviar o relatório.' }
  }
}
