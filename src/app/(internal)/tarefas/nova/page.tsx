import { createClient } from '@/lib/supabase/server'
import { TaskForm } from '@/components/tarefas/TaskForm'
import { createTaskAction } from '../actions'

export default async function NovaTarefaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: companies }, { data: profiles }, { data: profile }] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('profiles').select('role').eq('id', user!.id).single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ]) as [{ data: any[] | null }, { data: any[] | null }, { data: any }]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isAnalista = (profile as any)?.role === 'analista'

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Nova Tarefa</h1>
      <TaskForm
        action={createTaskAction}
        companies={companies ?? []}
        profiles={profiles ?? []}
        currentUserId={user!.id}
        isAnalista={isAnalista}
      />
    </div>
  )
}
