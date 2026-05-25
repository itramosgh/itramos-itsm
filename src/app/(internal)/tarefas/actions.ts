'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { taskSchema, taskUpdateSchema } from '@/lib/validations/task'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

export async function createTaskAction(_prevState: unknown, formData: FormData) {
  const parsed = taskSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    company_id: formData.get('company_id') || null,
    assigned_to: formData.get('assigned_to'),
    due_date: formData.get('due_date'),
    priority: formData.get('priority') || null,
    reminder_days_before: formData.get('reminder_days_before') ?? '3',
    is_recurring: formData.get('is_recurring') === 'on',
    recurrence_type: formData.get('recurrence_type') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('tasks').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never)

  if (error) return { error: error.message }
  revalidatePath('/tarefas')
  return { success: true }
}

export async function updateTaskAction(id: string, _prevState: unknown, formData: FormData) {
  const parsed = taskUpdateSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    company_id: formData.get('company_id') || null,
    assigned_to: formData.get('assigned_to'),
    due_date: formData.get('due_date'),
    priority: formData.get('priority') || null,
    reminder_days_before: formData.get('reminder_days_before') ?? '3',
    is_recurring: formData.get('is_recurring') === 'on',
    recurrence_type: formData.get('recurrence_type') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update(parsed.data as never)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/tarefas')
  return { success: true }
}

export async function completeTaskAction(id: string) {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: task } = await supabase
    .from('tasks')
    .select('due_date, is_recurring, recurrence_type, recurrence_active, company_id, assigned_to, title, reminder_days_before, created_by')
    .eq('id', id)
    .single() as { data: any }

  if (!task) return { error: 'Tarefa não encontrada' }

  await supabase.from('tasks').update({
    status: 'concluida',
    completed_at: new Date().toISOString(),
  } as never).eq('id', id)

  if (task.is_recurring && task.recurrence_active && task.recurrence_type) {
    const nextDueDate = nextOccurrenceDate(task.due_date, task.recurrence_type)
    await supabase.from('tasks').insert({
      title: task.title,
      company_id: task.company_id,
      assigned_to: task.assigned_to,
      due_date: nextDueDate,
      is_recurring: true,
      recurrence_type: task.recurrence_type,
      recurrence_active: true,
      reminder_days_before: task.reminder_days_before,
      parent_task_id: id,
      created_by: task.created_by,
    } as never)
  }

  revalidatePath('/tarefas')
  return { success: true }
}

export async function stopRecurrenceAction(id: string) {
  const supabase = await createClient()
  await supabase.from('tasks').update({ recurrence_active: false } as never).eq('id', id)
  revalidatePath('/tarefas')
}
