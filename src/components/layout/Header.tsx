import { logoutAction } from '@/app/(auth)/login/actions'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { redirect } from 'next/navigation'
import type { Database } from '@/types/database'

type ProfileRow = Database['public']['Tables']['profiles']['Row']

export async function Header() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const profile = profileData as Pick<ProfileRow, 'full_name'> | null

  return (
    <header className="h-14 border-b flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground">{profile?.full_name}</span>
        <form action={logoutAction}>
          <Button variant="ghost" size="sm" type="submit">Sair</Button>
        </form>
      </div>
    </header>
  )
}
