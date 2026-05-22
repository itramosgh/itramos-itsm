import { createClient } from '@/lib/supabase/server'
import { UserList } from '@/components/users/UserList'
import { CreateUserDialog } from '@/components/users/CreateUserDialog'

export default async function UsuariosPage() {
  const supabase = await createClient()
  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .eq('is_active', true)
    .order('full_name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuários Internos</h1>
        <CreateUserDialog />
      </div>
      <UserList users={users ?? []} />
    </div>
  )
}
