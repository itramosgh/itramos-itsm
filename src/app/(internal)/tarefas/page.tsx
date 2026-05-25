import { createClient } from '@/lib/supabase/server'
import { TaskList } from '@/components/tarefas/TaskList'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; company_id?: string }>
}) {
  const { status, company_id } = await searchParams
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('tasks')
    .select('id, title, due_date, priority, status, is_recurring, recurrence_active, profiles!assigned_to(full_name), companies(name)')
    .order('due_date')

  if (status) query = query.eq('status', status)
  if (company_id) query = query.eq('company_id', company_id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tasks } = await query as { data: any[] | null }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tarefas</h1>
        <Link href="/tarefas/nova" className={buttonVariants()}>Nova Tarefa</Link>
      </div>
      <div className="flex gap-2">
        {['pendente', 'concluida', 'vencida'].map(s => (
          <Link
            key={s}
            href={`/tarefas?status=${s}`}
            className={`px-3 py-1 rounded-full text-sm border ${status === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Link>
        ))}
        {status && (
          <Link href="/tarefas" className="px-3 py-1 rounded-full text-sm border hover:bg-muted">
            Todas
          </Link>
        )}
      </div>
      <TaskList tasks={tasks ?? []} />
    </div>
  )
}
