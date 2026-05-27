import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TaskForm } from '@/components/tarefas/TaskForm'
import { updateTaskAction } from '@/app/(internal)/tarefas/actions'

export default async function EditarTarefaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: task }, { data: companies }, { data: profiles }, { data: profile }] = await Promise.all([
    supabase.from('tasks').select('id, title, description, company_id, assigned_to, due_date, priority, reminder_days_before, is_recurring, recurrence_type').eq('id', id).single() as unknown as Promise<{ data: any }>,
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('profiles').select('role').eq('id', user!.id).single() as unknown as Promise<{ data: any }>,
  ])

  if (!task) notFound()

  const isAnalista = profile?.role === 'analista'

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Editar Tarefa</h1>
      <TaskForm
        action={updateTaskAction.bind(null, id) as any}
        initialData={task}
        companies={companies ?? []}
        profiles={profiles ?? []}
        currentUserId={user!.id}
        isAnalista={isAnalista}
      />
    </div>
  )
}
