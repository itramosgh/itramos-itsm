import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getPreviousMonthRange } from '@/lib/report-utils'
import { portalDownloadReportAction } from './actions'

export default async function PortalRelatorioMensalPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const { from, to } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id, companies(name)')
    .eq('user_id', user.id)
    .single() as { data: { company_id: string; companies: { name: string } | null } | null }

  if (!contact) notFound()

  const prev = getPreviousMonthRange(new Date())
  const fromDate = from ?? prev.from
  const toDate = to ?? prev.to
  const companyName = contact.companies?.name ?? 'sua empresa'

  return (
    <div className="p-6 space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-semibold">Relatório Mensal</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Relatório em PDF de <strong>{companyName}</strong> para o período selecionado.
        </p>
      </div>
      <form action={portalDownloadReportAction} className="border rounded-lg p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">De</label>
            <input
              type="date"
              name="from"
              defaultValue={fromDate}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Até</label>
            <input
              type="date"
              name="to"
              defaultValue={toDate}
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            />
          </div>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm"
        >
          Baixar PDF
        </button>
      </form>
    </div>
  )
}
