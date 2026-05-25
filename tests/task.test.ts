import { describe, it, expect } from 'vitest'
import { taskSchema } from '@/lib/validations/task'
import { nextOccurrenceDate } from '@/lib/task-recurrence'

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
