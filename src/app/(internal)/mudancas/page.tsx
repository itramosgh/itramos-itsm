import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { ChangeRequestList } from '@/components/mudancas/ChangeRequestList'
import { Pagination } from '@/components/ui/Pagination'

const PAGE_SIZE = 50

export default async function MudancasPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const { data: changeRequests, count } = await supabase
    .from('change_requests')
    .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)', { count: 'exact' })
    .order('maintenance_start', { ascending: true })
    .range(offset, offset + PAGE_SIZE - 1) as { data: any[] | null; count: number | null }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gestão de Mudanças (GMUD)</h1>
        <Link href="/mudancas/nova" className={buttonVariants()}>Nova GMUD</Link>
      </div>
      <ChangeRequestList changeRequests={changeRequests ?? []} />
      <Pagination page={page} total={count ?? 0} perPage={PAGE_SIZE} searchParams={{}} />
    </div>
  )
}
