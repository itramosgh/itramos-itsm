import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementList } from '@/components/comunicados/AnnouncementList'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/Pagination'

const PAGE_SIZE = 50

export default async function ComunicadosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const userRole = (profile as any)?.role ?? 'analista'
  const canManage = ['admin', 'gestor'].includes(userRole)

  const { data: announcements, count } = await supabase
    .from('announcements')
    .select('id, subject, recipient_type, status, scheduled_at, sent_at, recipient_count', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1) as { data: any[] | null; count: number | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comunicados</h1>
        {canManage && (
          <Link href="/comunicados/novo"><Button>Novo Comunicado</Button></Link>
        )}
      </div>
      <AnnouncementList announcements={announcements ?? []} canManage={canManage} />
      <Pagination page={page} total={count ?? 0} perPage={PAGE_SIZE} searchParams={{}} />
    </div>
  )
}
