import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { redirect } from 'next/navigation'

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

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user!.id)
    .single() as { data: any }

  const now = new Date().toISOString()
  const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
  const next14Days = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString()

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

  const [
    { data: overdueTasks },
    { data: upcomingMeetings },
    { data: upcomingGmuds },
    { data: pendingBilling },
  ] = await Promise.all([
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
              .gte('scheduled_at', now)
              .lte('scheduled_at', nextWeek)
              .in('id', participantMeetingIds)
              .order('scheduled_at')
              .limit(5)
          : Promise.resolve({ data: [] }))
      : supabase.from('meetings')
          .select('id, title, scheduled_at, companies(name)')
          .eq('status', 'agendada')
          .gte('scheduled_at', now)
          .lte('scheduled_at', nextWeek)
          .order('scheduled_at')
          .limit(5),
    supabase
      .from('change_requests')
      .select('id, title, status, risk_level, maintenance_start, maintenance_end, profiles!responsible_id(full_name)')
      .in('status', ['aprovada', 'em_execucao', 'aguardando_aprovacao'])
      .gte('maintenance_start', now)
      .lte('maintenance_start', next14Days)
      .order('maintenance_start')
      .limit(5),
    (!isAnalista
      ? supabase
          .from('tickets')
          .select('id, number, title, companies(name)')
          .eq('billing_status', 'pendente')
          .eq('status', 'fechado')
          .order('closed_at')
          .limit(10)
      : Promise.resolve({ data: [] })),
  ]) as [
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
    { data: any[] | null },
  ]

  const tasks = overdueTasks ?? []
  const meetings = upcomingMeetings ?? []
  const gmuds = upcomingGmuds ?? []
  const billing = pendingBilling ?? []
  const isEmpty = tasks.length === 0 && meetings.length === 0 && gmuds.length === 0 && billing.length === 0

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

          {/* GMUDs próximas */}
          {gmuds.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">Mudanças Programadas (próximos 14 dias)</h2>
              <div className="divide-y rounded-lg border">
                {(gmuds as any[]).map((gmud: any) => (
                  <a
                    key={gmud.id}
                    href={`/mudancas/${gmud.id}`}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">{gmud.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(gmud.maintenance_start).toLocaleString('pt-BR')} →{' '}
                        {new Date(gmud.maintenance_end).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <Badge variant={gmud.status === 'em_execucao' ? 'default' : 'secondary'} className="shrink-0">
                      {gmud.status === 'em_execucao' ? 'Em Execução' : gmud.status === 'aprovada' ? 'Aprovada' : 'Ag. Aprovação'}
                    </Badge>
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Cobrança pendente (admin/gestor) */}
          {!isAnalista && billing.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-yellow-500 mr-2" />
                Cobrança Pendente ({billing.length})
              </h2>
              <div className="divide-y rounded-lg border border-yellow-200 bg-yellow-50">
                {(billing as any[]).map((t: any) => (
                  <a
                    key={t.id}
                    href={`/chamados/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 gap-4 hover:bg-yellow-100"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">#{t.number} — {t.title}</p>
                      <p className="text-xs text-muted-foreground">{(t.companies as any)?.name ?? '—'}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">Pendente</Badge>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
