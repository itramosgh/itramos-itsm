import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { completeTaskAction, stopRecurrenceAction } from '@/app/(internal)/tarefas/actions'

type Task = {
  id: string
  title: string
  due_date: string
  priority: string | null
  status: string
  is_recurring: boolean
  recurrence_active: boolean
  profiles: { full_name: string } | null
  companies: { name: string } | null
}

const statusColors: Record<string, 'default' | 'destructive' | 'outline'> = {
  pendente: 'outline',
  concluida: 'default',
  vencida: 'destructive',
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Título</th>
            <th className="text-left px-4 py-3 font-medium">Responsável</th>
            <th className="text-left px-4 py-3 font-medium">Vencimento</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const isOverdue = t.status === 'pendente' && t.due_date < today
            return (
              <tr key={t.id} className={`border-b last:border-0 ${isOverdue ? 'bg-red-50' : 'hover:bg-muted/30'}`}>
                <td className="px-4 py-3">
                  <span className="font-medium">{t.title}</span>
                  {t.is_recurring && (
                    <span className="ml-2 text-xs text-muted-foreground">↻ recorrente</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.profiles?.full_name}</td>
                <td className={`px-4 py-3 ${isOverdue ? 'text-destructive font-medium' : ''}`}>
                  {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={statusColors[t.status] ?? 'outline'}>{t.status}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-2 justify-end">
                    {t.status === 'pendente' && (
                      <form action={async () => { await completeTaskAction(t.id) }}>
                        <Button variant="ghost" size="sm" type="submit">Concluir</Button>
                      </form>
                    )}
                    {t.is_recurring && t.recurrence_active && (
                      <form action={async () => { await stopRecurrenceAction(t.id) }}>
                        <Button variant="ghost" size="sm" type="submit">Parar recorrência</Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
