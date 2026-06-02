import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { dispatchAnnouncement } from '@/app/(internal)/comunicados/actions'
import { insertLog } from '@/lib/log'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: scheduled } = await (supabase as any)
    .from('announcements')
    .select('id, subject')
    .eq('status', 'agendado')
    .lte('scheduled_at', now)

  let dispatched = 0
  const errors: string[] = []

  for (const ann of scheduled ?? []) {
    const result = await dispatchAnnouncement(supabase, ann.id)
    if ('success' in result) {
      dispatched++
    } else {
      errors.push(`${ann.id}: ${result.error}`)
      await insertLog(supabase, 'cron_job', 'failure', `Falha ao despachar comunicado "${ann.subject}"`, {
        announcement_id: ann.id,
        error: result.error,
      })
    }
  }

  await insertLog(supabase, 'cron_job', 'success', `Cron announcement-dispatch executado — ${dispatched} comunicado(s) despachado(s)`, {
    dispatched,
    errors_count: errors.length,
    ...(errors.length > 0 && { errors }),
  })

  return NextResponse.json({ ok: true, dispatched })
}
