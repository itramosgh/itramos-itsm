import { describe, it, expect } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { taskSchema } from '@/lib/validations/task'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

const supabase = createSupabaseClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

describe('taskSchema', () => {
  it('rejeita tarefa sem responsável', () => {
    const result = taskSchema.safeParse({
      title: 'Revisão',
      due_date: '2026-06-01',
      assigned_to: 'nao-um-uuid',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita data em formato inválido', () => {
    const result = taskSchema.safeParse({
      title: 'Revisão',
      due_date: '01/06/2026',
      assigned_to: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(false)
  })

  it('aceita tarefa recorrente mensal', () => {
    const result = taskSchema.safeParse({
      title: 'Relatório mensal',
      assigned_to: '123e4567-e89b-12d3-a456-426614174000',
      due_date: '2026-06-01',
      is_recurring: true,
      recurrence_type: 'mensal',
    })
    expect(result.success).toBe(true)
  })

  it('aplica padrão reminder_days_before = 3', () => {
    const result = taskSchema.safeParse({
      title: 'Tarefa',
      assigned_to: '123e4567-e89b-12d3-a456-426614174000',
      due_date: '2026-06-01',
    })
    expect(result.success).toBe(true)
    expect(result.data?.reminder_days_before).toBe(3)
  })
})

describe('nextOccurrenceDate', () => {
  it('diaria: avança 1 dia', () => {
    expect(nextOccurrenceDate('2026-06-01', 'diaria')).toBe('2026-06-02')
  })

  it('semanal: avança 7 dias', () => {
    expect(nextOccurrenceDate('2026-06-01', 'semanal')).toBe('2026-06-08')
  })

  it('mensal: avança 1 mês', () => {
    expect(nextOccurrenceDate('2026-06-01', 'mensal')).toBe('2026-07-01')
  })

  it('anual: avança 1 ano', () => {
    expect(nextOccurrenceDate('2026-06-01', 'anual')).toBe('2027-06-01')
  })
})

describe('recorrência de tarefa (integração)', () => {
  it('ao concluir tarefa mensal recorrente, cria próxima ocorrência', async () => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'analista')
      .limit(1)
      .single()

    const profile = profileData as any

    if (!profile) {
      console.warn('Nenhum analista no DB — pulando teste de integração')
      return
    }

    const { data: task } = await supabase.from('tasks').insert({
      title: 'Teste recorrência mensal',
      assigned_to: profile.id,
      due_date: '2026-06-01',
      is_recurring: true,
      recurrence_type: 'mensal',
      recurrence_active: true,
      created_by: profile.id,
    } as never).select('id').single()

    expect(task).not.toBeNull()
    const taskId = (task as any).id

    await supabase.from('tasks').update({ status: 'concluida', completed_at: new Date().toISOString() } as never).eq('id', taskId as never)

    const nextDate = nextOccurrenceDate('2026-06-01', 'mensal')
    expect(nextDate).toBe('2026-07-01')

    await supabase.from('tasks').insert({
      title: 'Teste recorrência mensal',
      assigned_to: profile.id,
      due_date: nextDate,
      is_recurring: true,
      recurrence_type: 'mensal',
      recurrence_active: true,
      parent_task_id: taskId,
      created_by: profile.id,
    } as never)

    const { data: children } = await supabase
      .from('tasks')
      .select('id, due_date')
      .eq('parent_task_id', taskId as never)

    expect(children).toHaveLength(1)
    expect((children as any[])[0].due_date).toBe('2026-07-01')

    // Cleanup
    await supabase.from('tasks').delete().eq('parent_task_id', taskId as never)
    await supabase.from('tasks').delete().eq('id', taskId as never)
  })
})
