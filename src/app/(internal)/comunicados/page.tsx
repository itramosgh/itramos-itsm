import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AnnouncementList } from '@/components/comunicados/AnnouncementList'
import { Button } from '@/components/ui/button'

export default async function ComunicadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const userRole = (profile as any)?.role ?? 'analista'
  const canManage = ['admin', 'gestor'].includes(userRole)

  const { data: announcements } = (await supabase
    .from('announcements')
    .select('id, subject, recipient_type, status, scheduled_at, sent_at, recipient_count')
    .order('created_at', { ascending: false })
    .limit(100)) as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Comunicados</h1>
        {canManage && (
          <Link href="/comunicados/novo"><Button>Novo Comunicado</Button></Link>
        )}
      </div>
      <AnnouncementList announcements={announcements ?? []} canManage={canManage} />
    </div>
  )
}
