import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { dispatchAnnouncement } from '@/app/(internal)/comunicados/actions'

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
  for (const ann of scheduled ?? []) {
    const result = await dispatchAnnouncement(supabase, ann.id)
    if ('success' in result) dispatched++
    else console.error(`Falha ao despachar comunicado ${ann.id}:`, result.error)
  }

  return NextResponse.json({ ok: true, dispatched })
}
