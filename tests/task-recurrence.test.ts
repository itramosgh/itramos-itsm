import { describe, it, expect } from 'vitest'
import { nextOccurrenceDate } from '../src/lib/task-recurrence'

describe('nextOccurrenceDate — casos existentes', () => {
  it('diaria adiciona 1 dia', () => {
    expect(nextOccurrenceDate('2026-06-01', 'diaria')).toBe('2026-06-02')
  })
  it('semanal adiciona 7 dias', () => {
    expect(nextOccurrenceDate('2026-06-01', 'semanal')).toBe('2026-06-08')
  })
  it('mensal adiciona 1 mês', () => {
    expect(nextOccurrenceDate('2026-06-01', 'mensal')).toBe('2026-07-01')
  })
  it('anual adiciona 1 ano', () => {
    expect(nextOccurrenceDate('2026-06-01', 'anual')).toBe('2027-06-01')
  })
})

describe('nextOccurrenceDate — casos novos', () => {
  it('quinzenal adiciona 14 dias', () => {
    expect(nextOccurrenceDate('2026-06-01', 'quinzenal')).toBe('2026-06-15')
  })
  it('personalizado adiciona interval_days', () => {
    expect(nextOccurrenceDate('2026-06-01', 'personalizado', 10)).toBe('2026-06-11')
  })
  it('personalizado usa 1 dia quando intervalDays não informado', () => {
    expect(nextOccurrenceDate('2026-06-01', 'personalizado')).toBe('2026-06-02')
  })
})
