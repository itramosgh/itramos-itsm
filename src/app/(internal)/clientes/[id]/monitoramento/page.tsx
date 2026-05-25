import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MonitoringIntegrationList } from '@/components/monitoring/MonitoringIntegrationList'
import { MonitoredUrlList } from '@/components/monitoring/MonitoredUrlList'

export default async function MonitoramentoClientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: companyId } = await params
  const supabase = await createClient()

  const { data: company } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', companyId)
    .single() as { data: { id: string; name: string } | null; error: unknown }

  if (!company) notFound()

  const [{ data: integrations }, { data: urls }] = await Promise.all([
    supabase
      .from('monitoring_integrations')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('monitored_urls')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Monitoramento — {company.name}</h1>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Integrações (Zabbix / Azure Monitor)</h2>
        <MonitoringIntegrationList
          integrations={(integrations ?? []) as any[]}
          companyId={companyId}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">URLs Monitoradas</h2>
        <MonitoredUrlList
          urls={(urls ?? []) as any[]}
          companyId={companyId}
        />
      </section>
    </div>
  )
}
