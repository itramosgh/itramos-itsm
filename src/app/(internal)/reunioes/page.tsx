import { createClient } from '@/lib/supabase/server'
import { MeetingList } from '@/components/reunioes/MeetingList'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { Pagination } from '@/components/ui/Pagination'

const PAGE_SIZE = 50

export default async function ReunioesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  const { data: meetings, count } = await supabase
    .from('meetings')
    .select('id, title, scheduled_at, status, companies(name)', { count: 'exact' })
    .order('status')             // agendada → cancelada → realizada (alfabético ASC)
    .order('scheduled_at')       // dentro de cada grupo: mais próxima primeiro
    .range(offset, offset + PAGE_SIZE - 1) as { data: any[] | null; count: number | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reuniões</h1>
        <Link href="/reunioes/nova" className={buttonVariants()}>Nova Reunião</Link>
      </div>
      <MeetingList meetings={meetings ?? []} />
      <Pagination page={page} total={count ?? 0} perPage={PAGE_SIZE} searchParams={{}} />
    </div>
  )
}
