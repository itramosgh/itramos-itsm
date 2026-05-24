import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendAnnouncementAction } from '@/app/(internal)/comunicados/actions'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const now = new Date().toISOString()

  const { data: scheduled } = (await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          lte: (col: string, val: string) => Promise<{ data: Array<{ id: string; subject: string }> | null }>
        }
      }
    }
  })
    .from('announcements')
    .select('id, subject')
    .eq('status', 'agendado')
    .lte('scheduled_at', now))

  let dispatched = 0
  for (const ann of scheduled ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (sendAnnouncementAction as any)(ann.id)
    if (result.success) dispatched++
    else console.error(`Falha ao despachar comunicado ${ann.id}:`, result.error)
  }

  return NextResponse.json({ ok: true, dispatched })
}
