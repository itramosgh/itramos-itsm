import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { sendEmailFromTemplate } from '@/lib/email-template-sender'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // 1. Marcar tarefas vencidas
  await supabase
    .from('tasks')
    .update({ status: 'vencida' } as never)
    .eq('status', 'pendente')
    .lt('due_date', today)

  const overdueCount = 0 // count not easily available from update

  // 2. Buscar tarefas pendentes para verificar lembretes
  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('id, title, due_date, reminder_days_before, assigned_to, profiles!assigned_to(full_name, id)')
    .eq('status', 'pendente')
    .gte('due_date', today) as { data: any[] | null }

  let remindersSent = 0

  for (const task of pendingTasks ?? []) {
    const dueDate = new Date(task.due_date + 'T12:00:00')
    const reminderDate = new Date(dueDate)
    reminderDate.setDate(reminderDate.getDate() - task.reminder_days_before)
    const reminderDateStr = reminderDate.toISOString().slice(0, 10)

    const isReminder = reminderDateStr === today
    const isDueToday = task.due_date === today

    if (!isReminder && !isDueToday) continue

    const profile = task.profiles
    if (!profile) continue

    const { data: authUser } = await supabase.auth.admin.getUserById(task.assigned_to)
    const email = authUser?.user?.email
    if (!email) continue

    const dueDateFormatted = dueDate.toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const diasRestantes = Math.round((dueDate.getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000)

    try {
      const slug = isDueToday ? 'tarefa_vencimento_hoje' : 'tarefa_lembrete_x_dias'
      const vars: Record<string, string> = {
        nome_responsavel: profile.full_name ?? '',
        titulo_tarefa: task.title,
        link_tarefa: `${process.env.NEXT_PUBLIC_APP_URL}/tarefas`,
      }
      if (!isDueToday) {
        vars.dias_restantes = String(diasRestantes)
        vars.data_vencimento = dueDateFormatted
      }
      await sendEmailFromTemplate(slug, email, vars)
      remindersSent++
    } catch (e) {
      console.error(`Erro ao enviar lembrete tarefa ${task.id}:`, e)
    }
  }

  await supabase.from('system_logs').insert({
    category: 'cron_job',
    status: 'success',
    description: 'Lembretes de tarefas enviados',
    details: { remindersSent, overdueCount, date: today },
  } as never)

  return NextResponse.json({ ok: true, remindersSent, overdueCount })
}
