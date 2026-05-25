import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { ChangeRequestList } from '@/components/mudancas/ChangeRequestList'

export default async function MudancasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: changeRequests } = await supabase
    .from('change_requests')
    .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
    .order('maintenance_start', { ascending: true }) as { data: any[] | null }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gestão de Mudanças (GMUD)</h1>
        <Link href="/mudancas/nova" className={buttonVariants()}>Nova GMUD</Link>
      </div>
      <ChangeRequestList changeRequests={changeRequests ?? []} />
    </div>
  )
}
