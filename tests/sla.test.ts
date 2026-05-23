import { describe, it, expect } from 'vitest'
import { calculateDeadline, addBusinessHours, isBusinessDay } from '@/lib/sla'

const defaultSettings = {
  start: '09:00',
  end: '18:00',
  days: [1, 2, 3, 4, 5], // Seg-Sex
}

describe('isBusinessDay', () => {
  it('segunda-feira sem feriado é dia útil', () => {
    const monday = new Date('2026-06-01T10:00:00')
    expect(isBusinessDay(monday, defaultSettings, [])).toBe(true)
  })

  it('sábado não é dia útil', () => {
    const saturday = new Date('2026-06-06T10:00:00')
    expect(isBusinessDay(saturday, defaultSettings, [])).toBe(false)
  })

  it('feriado não é dia útil', () => {
    const holiday = new Date('2026-06-01T10:00:00')
    expect(isBusinessDay(holiday, defaultSettings, ['2026-06-01'])).toBe(false)
  })
})

describe('calculateDeadline — 24x7', () => {
  it('prazo 24x7 ignora horário comercial', () => {
    const created = new Date('2026-06-06T22:00:00Z')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 2,
      is24x7: true,
      settings: defaultSettings,
      holidays: [],
    })
    expect(deadline.getTime()).toBe(new Date('2026-06-07T00:00:00Z').getTime())
  })
})

describe('calculateDeadline — horário comercial', () => {
  it('prazo dentro do mesmo dia', () => {
    const created = new Date('2026-06-01T10:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T14:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que vira dia — segunda 16h + 4h → terça 11h', () => {
    const created = new Date('2026-06-01T16:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-02T11:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que pula fim de semana — sexta 16h + 4h → segunda 11h', () => {
    const created = new Date('2026-05-29T16:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T11:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('prazo que pula feriado na segunda — sexta 16h + 4h + feriado segunda → terça 11h', () => {
    const created = new Date('2026-05-29T16:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: ['2026-06-01'],
    })
    const expected = new Date('2026-06-02T11:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('abertura fora do horário comercial conta a partir do início do próximo dia útil', () => {
    const created = new Date('2026-05-30T10:00:00') // sábado
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T13:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })

  it('abertura antes do horário comercial conta a partir do início do dia', () => {
    const created = new Date('2026-06-01T07:00:00')
    const deadline = calculateDeadline({
      createdAt: created,
      responseHours: 4,
      is24x7: false,
      settings: defaultSettings,
      holidays: [],
    })
    const expected = new Date('2026-06-01T13:00:00')
    expect(deadline.getTime()).toBe(expected.getTime())
  })
})
