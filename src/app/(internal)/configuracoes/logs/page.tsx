import { createClient } from '@/lib/supabase/server'
import { SystemLogsTable } from '@/components/settings/SystemLogsTable'

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string }>
}) {
  const { category, status } = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('system_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (category) query = query.eq('category', category as 'email_sent')
  if (status) query = query.eq('status', status as 'success')

  const { data: logs } = await query

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Logs do Sistema</h1>
      <SystemLogsTable logs={logs ?? []} />
    </div>
  )
}
