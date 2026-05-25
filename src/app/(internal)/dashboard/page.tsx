import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single() as { data: any }

  const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  const role = profile?.role
  const isAnalista = role === 'analista'

  // For analista: pre-fetch meeting IDs where they are a participant
  let participantMeetingIds: string[] = []
  if (isAnalista) {
    const { data: participations } = await supabase
      .from('meeting_participants')
      .select('meeting_id')
      .eq('profile_id', user!.id) as { data: any[] | null }
    participantMeetingIds = (participations ?? []).map((p: any) => p.meeting_id)
  }

  const [{ data: overdueTasks }, { data: upcomingMeetings }] = await Promise.all([
    isAnalista
      ? supabase.from('tasks').select('id, title, due_date, companies(name)')
          .eq('status', 'vencida').eq('assigned_to', user!.id).order('due_date').limit(5)
      : supabase.from('tasks').select('id, title, due_date, companies(name), profiles!assigned_to(full_name)')
          .eq('status', 'vencida').order('due_date').limit(5),
    isAnalista
      ? (participantMeetingIds.length > 0
          ? supabase.from('meetings')
              .select('id, title, scheduled_at, companies(name)')
              .eq('status', 'agendada')
              .gte('scheduled_at', new Date().toISOString())
              .lte('scheduled_at', nextWeek)
              .in('id', participantMeetingIds)
              .order('scheduled_at')
              .limit(5)
          : Promise.resolve({ data: [] }))
      : supabase.from('meetings')
          .select('id, title, scheduled_at, companies(name)')
          .eq('status', 'agendada')
          .gte('scheduled_at', new Date().toISOString())
          .lte('scheduled_at', nextWeek)
          .order('scheduled_at')
          .limit(5),
  ]) as [{ data: any[] | null }, { data: any[] | null }]

  const tasks = overdueTasks ?? []
  const meetings = upcomingMeetings ?? []
  const isEmpty = tasks.length === 0 && meetings.length === 0

  function formatDate(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function formatDateTime(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      {isEmpty ? (
        <p className="text-muted-foreground text-sm">
          Nenhuma tarefa vencida ou reunião próxima.
        </p>
      ) : (
        <>
          {/* Tarefas vencidas */}
          {tasks.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3 flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                Tarefas vencidas
              </h2>
              <div className="divide-y rounded-lg border">
                {tasks.map((task: any) => (
                  <div key={task.id} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/tarefas"
                        className="font-medium text-sm hover:underline truncate block"
                      >
                        {task.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {(task.companies as any)?.name ?? '—'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {!isAnalista && (task.profiles as any)?.full_name && (
                        <span className="text-xs text-muted-foreground">
                          {(task.profiles as any).full_name}
                        </span>
                      )}
                      <Badge variant="destructive" className="whitespace-nowrap">
                        Vencida em {formatDate(task.due_date)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Próximas reuniões */}
          {meetings.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">
                Próximas reuniões (7 dias)
              </h2>
              <div className="divide-y rounded-lg border">
                {meetings.map((meeting: any) => (
                  <div key={meeting.id} className="flex items-center justify-between px-4 py-3 gap-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/reunioes/${meeting.id}`}
                        className="font-medium text-sm hover:underline truncate block"
                      >
                        {meeting.title}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {(meeting.companies as any)?.name ?? '—'}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(meeting.scheduled_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
