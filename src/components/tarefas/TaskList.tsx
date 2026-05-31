'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { completeTaskAction, stopRecurrenceAction, deleteTaskAction } from '@/app/(internal)/tarefas/actions'

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

function TaskCard({ t, today }: { t: Task; today: string }) {
  const isOverdue = t.status === 'pendente' && t.due_date < today
  return (
    <div className={`border rounded-md p-3 space-y-2 ${isOverdue ? 'bg-red-50 border-red-200' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm leading-snug">
          {t.title}
          {t.is_recurring && <span className="ml-1 text-xs text-muted-foreground">↻</span>}
        </p>
        <Badge variant={statusColors[t.status] ?? 'outline'} className="shrink-0">{t.status}</Badge>
      </div>
      <div className="text-xs text-muted-foreground space-y-0.5">
        {t.companies?.name && <p>{t.companies.name}</p>}
        {t.profiles?.full_name && <p>{t.profiles.full_name}</p>}
        <p className={isOverdue ? 'text-destructive font-medium' : ''}>
          Vence {new Date(t.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {t.status === 'pendente' && (
          <form action={async () => { await completeTaskAction(t.id) }} className="flex-1">
            <Button variant="outline" size="sm" type="submit" className="w-full">Concluir</Button>
          </form>
        )}
        {t.is_recurring && t.recurrence_active && (
          <form action={async () => { await stopRecurrenceAction(t.id) }} className="flex-1">
            <Button variant="outline" size="sm" type="submit" className="w-full">Parar recorrência</Button>
          </form>
        )}
        <Link href={`/tarefas/${t.id}/editar`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full">Editar</Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 text-destructive hover:text-destructive"
          onClick={async () => {
            if (!confirm('Excluir esta tarefa?')) return
            await deleteTaskAction(t.id)
          }}
        >
          Excluir
        </Button>
      </div>
    </div>
  )
}

export function TaskList({ tasks }: { tasks: Task[] }) {
  const today = new Date().toISOString().slice(0, 10)

  if (tasks.length === 0) {
    return <p className="p-6 text-center text-muted-foreground text-sm">Nenhuma tarefa encontrada.</p>
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {tasks.map(t => <TaskCard key={t.id} t={t} today={today} />)}
      </div>

      {/* Desktop: tabela */}
      <div className="hidden md:block rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Título</th>
              <th className="text-left px-4 py-3 font-medium">Cliente</th>
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
                  <td className="px-4 py-3 text-muted-foreground">{t.companies?.name ?? '—'}</td>
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
                      <Link href={`/tarefas/${t.id}/editar`}>
                        <Button variant="ghost" size="sm">Editar</Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={async () => {
                          if (!confirm('Excluir esta tarefa?')) return
                          await deleteTaskAction(t.id)
                        }}
                      >
                        Excluir
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
