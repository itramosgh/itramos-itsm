import { createClient } from '@/lib/supabase/server'
import { MeetingList } from '@/components/reunioes/MeetingList'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

export default async function ReunioesPage() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: meetings } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at, status, companies(name)')
    .order('scheduled_at', { ascending: false }) as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reuniões</h1>
        <Link href="/reunioes/nova" className={buttonVariants()}>Nova Reunião</Link>
      </div>
      <MeetingList meetings={meetings ?? []} />
    </div>
  )
}
