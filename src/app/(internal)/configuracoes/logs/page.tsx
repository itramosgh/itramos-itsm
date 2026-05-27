import { createClient } from '@/lib/supabase/server'
import { SystemLogsTable } from '@/components/settings/SystemLogsTable'

const PAGE_SIZE = 50

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; status?: string; page?: string }>
}) {
  const { category, status, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()

  let query = supabase
    .from('system_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (category) query = query.eq('category', category as 'email_sent')
  if (status) query = query.eq('status', status as 'success')

  const { data: logs, count } = await query

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Logs do Sistema</h1>
      <SystemLogsTable
        logs={logs ?? []}
        total={count ?? 0}
        page={page}
        perPage={PAGE_SIZE}
      />
    </div>
  )
}
