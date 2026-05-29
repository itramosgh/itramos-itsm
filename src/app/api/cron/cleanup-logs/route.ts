import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()
  const cutoff7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff2d = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const today = now.toISOString().slice(0, 10)

  const [logsResult, historyResult, pendingEmailsResult, pendingAlertsResult, holidayNoticesResult] = await Promise.all([
    supabase.from('system_logs').delete({ count: 'exact' }).lt('created_at', cutoff7d),
    supabase.from('url_check_history').delete({ count: 'exact' }).lt('checked_at', cutoff7d),
    supabase.from('pending_email_tickets' as never).delete({ count: 'exact' }).lt('created_at' as never, cutoff7d),
    supabase.from('pending_monitoring_alerts' as never).delete({ count: 'exact' }).lt('created_at' as never, cutoff2d),
    supabase.from('holiday_notice_sent' as never).delete({ count: 'exact' }).lt('holiday_date' as never, today),
  ])

  const errors = [logsResult, historyResult, pendingEmailsResult, pendingAlertsResult, holidayNoticesResult]
    .map(r => (r as any).error?.message)
    .filter(Boolean)

  if (errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 500 })

  return NextResponse.json({
    ok: true,
    system_logs_deleted: logsResult.count ?? 0,
    url_check_history_deleted: historyResult.count ?? 0,
    pending_email_tickets_deleted: (pendingEmailsResult as any).count ?? 0,
    pending_monitoring_alerts_deleted: (pendingAlertsResult as any).count ?? 0,
    holiday_notice_sent_deleted: (holidayNoticesResult as any).count ?? 0,
  })
}
