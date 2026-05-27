import { createClient } from '@/lib/supabase/server'
import { UserList } from '@/components/users/UserList'
import { CreateUserDialog } from '@/components/users/CreateUserDialog'
import { Pagination } from '@/components/ui/Pagination'

const PAGE_SIZE = 50

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  const { data: users, count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .order('full_name')
    .range(offset, offset + PAGE_SIZE - 1) as { data: any[] | null; count: number | null }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários Internos</h1>
        <CreateUserDialog />
      </div>
      <UserList users={users ?? []} />
      <Pagination page={page} total={count ?? 0} perPage={PAGE_SIZE} searchParams={{}} />
    </div>
  )
}
