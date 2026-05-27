import { createClient } from '@/lib/supabase/server'
import { TaskList } from '@/components/tarefas/TaskList'
import { buttonVariants } from '@/components/ui/button'
import Link from 'next/link'
import { AutoRefresh } from '@/components/ui/AutoRefresh'
import { Pagination } from '@/components/ui/Pagination'

const PAGE_SIZE = 50

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; company_id?: string; page?: string }>
}) {
  const { status, company_id, page: pageParam } = await searchParams
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const supabase = await createClient()

  let query: any = supabase
    .from('tasks')
    .select('id, title, due_date, priority, status, is_recurring, recurrence_active, profiles!assigned_to(full_name), companies(name)', { count: 'exact' })
    .order('due_date')
    .range(offset, offset + PAGE_SIZE - 1)

  if (status) query = query.eq('status', status)
  if (company_id) query = query.eq('company_id', company_id)

  const { data: tasks, count } = await query as { data: any[] | null; count: number | null }

  return (
    <div className="space-y-4">
      <AutoRefresh intervalSeconds={30} />
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
      <Pagination page={page} total={count ?? 0} perPage={PAGE_SIZE} searchParams={{ status, company_id }} />
    </div>
  )
}
