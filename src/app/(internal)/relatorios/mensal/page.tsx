import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPreviousMonthRange } from '@/lib/report-utils'
import { downloadReport, sendReportByEmail } from './actions'
import { ReportFormClient } from './ReportFormClient'

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

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-semibold">Relatório Mensal</h1>
      <p className="text-sm text-muted-foreground">
        Gere o relatório mensal em PDF para um cliente e período. Você pode baixar o arquivo ou
        enviar por e-mail diretamente ao(s) responsável(eis) do contrato.
      </p>

      <ReportFormClient
        companies={companies ?? []}
        defaultFrom={fromDate}
        defaultTo={toDate}
        defaultCompanyId={company_id ?? ''}
        downloadAction={downloadReport}
        sendEmailAction={sendReportByEmail}
      />
    </div>
  )
}
