import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendHolidayNoticesForHoliday } from '@/lib/holiday-notice'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date()

  const { data: settings } = await supabase
    .from('platform_settings').select('holiday_notice_days').single()
  const noticeDays = (settings as any)?.holiday_notice_days ?? 7

  const windowStart = now.toISOString().slice(0, 10)
  const windowEnd = new Date(now.getTime() + noticeDays * 24 * 3_600_000)
    .toISOString().slice(0, 10)

  const { data: upcomingHolidays } = await supabase
    .from('holidays')
    .select('id')
    .gte('date', windowStart)
    .lte('date', windowEnd)

  if (!upcomingHolidays?.length) {
    return NextResponse.json({ ok: true, noticesSent: 0 })
  }

  let noticesSent = 0
  for (const holiday of upcomingHolidays as any[]) {
    const result = await sendHolidayNoticesForHoliday(holiday.id, 'pending', supabase, 'cron')
    noticesSent += result.sent
  }

  return NextResponse.json({ ok: true, noticesSent })
}
