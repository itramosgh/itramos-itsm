import { createClient } from '@/lib/supabase/server'
import { MonitoringStatusPanel } from '@/components/monitoring/MonitoringStatusPanel'

export default async function MonitoramentoPage() {
  const supabase = await createClient()

  const [
    { data: urls },
    { data: activeAlerts },
  ] = await Promise.all([
    supabase
      .from('monitored_urls')
      .select('id, name, url, last_status, last_checked_at, is_active, company_id, companies(name)')
      .eq('is_active', true)
      .order('last_status', { ascending: false }),
    supabase
      .from('tickets')
      .select('id, number, title, priority, created_at, company_id, companies(name)')
      .in('channel', ['zabbix', 'azure_monitor'])
      .not('status', 'in', '("fechado","resolvido")')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const urlIds = (urls ?? []).map((u: any) => u.id)
  const { data: todayHistory } = urlIds.length
    ? await supabase
        .from('url_check_history')
        .select('monitored_url_id, status, checked_at')
        .in('monitored_url_id', urlIds)
        .gte('checked_at', `${today}T00:00:00`)
        .order('checked_at', { ascending: true })
    : { data: [] }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Painel de Monitoramento</h1>
      <MonitoringStatusPanel
        urls={(urls ?? []) as any[]}
        activeAlerts={(activeAlerts ?? []) as any[]}
        todayHistory={(todayHistory ?? []) as any[]}
      />
    </div>
  )
}
