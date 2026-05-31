import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPreviousMonthRange } from '@/lib/report-utils'
import { downloadReport, sendReportByEmail } from './actions'
import { ReportFormClient } from './ReportFormClient'
import { TicketTimelineChart } from '@/components/relatorios/TicketTimelineChart'

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export default async function RelatorioMensalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; company_id?: string }>
}) {
  const { from, to, company_id } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const prev = getPreviousMonthRange(new Date())
  const fromDate = from ?? prev.from
  const toDate = to ?? prev.to

  // Last 12 months window (1st of the month 11 months ago → now)
  const now = new Date()
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [{ data: companies }, timelineResult] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    (async () => {
      let q = (supabase as any)
        .from('tickets')
        .select('created_at')
        .gte('created_at', windowStart.toISOString())
      if (company_id) q = q.eq('company_id', company_id)
      return q as Promise<{ data: { created_at: string }[] | null }>
    })(),
  ])

  // Group by month
  const counts: Record<string, number> = {}
  for (const t of (timelineResult as any).data ?? []) {
    const m = (t.created_at as string).slice(0, 7)
    counts[m] = (counts[m] ?? 0) + 1
  }

  // Build complete 12-month series (fill zeros for missing months)
  const timelineData = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
    return { month, label, count: counts[month] ?? 0 }
  })

  const totalInWindow = timelineData.reduce((s, d) => s + d.count, 0)
  const average = totalInWindow / 12

  const selectedCompanyName = company_id
    ? (companies as any[])?.find((c: any) => c.id === company_id)?.name
    : null

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold">Relatório Mensal</h1>

      {/* Timeline */}
      <div className="border rounded-lg p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium">
            Chamados abertos — últimos 12 meses
            {selectedCompanyName && (
              <span className="ml-1.5 text-muted-foreground font-normal">· {selectedCompanyName}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground shrink-0">
            {totalInWindow} total · média {average % 1 === 0 ? average : average.toFixed(1)}/mês
          </p>
        </div>
        <TicketTimelineChart
          data={timelineData}
          average={average}
          currentMonth={currentMonth}
        />
        <p className="text-xs text-muted-foreground">
          Barra escura = mês atual. Linha pontilhada = média mensal do período.
          {!company_id && ' Filtre por cliente abaixo para ver o volume específico.'}
        </p>
      </div>

      <p className="text-sm text-muted-foreground">
        Gere o relatório mensal em PDF para um cliente e período. Você pode baixar o arquivo ou
        enviar por e-mail diretamente ao(s) responsável(eis) do contrato.
      </p>

      <ReportFormClient
        companies={(companies as any[]) ?? []}
        defaultFrom={fromDate}
        defaultTo={toDate}
        defaultCompanyId={company_id ?? ''}
        downloadAction={downloadReport}
        sendEmailAction={sendReportByEmail}
      />
    </div>
  )
}
