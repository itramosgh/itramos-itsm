import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [logsResult, historyResult] = await Promise.all([
    supabase.from('system_logs').delete({ count: 'exact' }).lt('created_at', cutoff),
    supabase.from('url_check_history').delete({ count: 'exact' }).lt('checked_at', cutoff),
  ])

  if (logsResult.error) return NextResponse.json({ error: logsResult.error.message }, { status: 500 })
  if (historyResult.error) return NextResponse.json({ error: historyResult.error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    system_logs_deleted: logsResult.count ?? 0,
    url_check_history_deleted: historyResult.count ?? 0,
  })
}
