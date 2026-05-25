import { describe, it, expect } from 'vitest'
import { changeRequestSchema, costSchema, reversalSchema } from '@/lib/validations/change-request'

describe('changeRequestSchema', () => {
  const base = {
    title: 'Atualização do servidor DB',
    description: 'Aplicar patches de segurança',
    impacted_systems: 'Banco de dados principal',
    impacted_users: 'Todos os usuários',
    maintenance_start: '2026-06-01T22:00:00Z',
    maintenance_end: '2026-06-02T02:00:00Z',
    rollback_plan: 'Restaurar snapshot anterior',
    risk_level: 'medio' as const,
    responsible_id: '123e4567-e89b-12d3-a456-426614174000',
  }

  it('aceita GMUD válida', () => {
    expect(changeRequestSchema.safeParse(base).success).toBe(true)
  })

  it('rejeita título vazio', () => {
    expect(changeRequestSchema.safeParse({ ...base, title: '' }).success).toBe(false)
  })

  it('rejeita nível de risco inválido', () => {
    expect(changeRequestSchema.safeParse({ ...base, risk_level: 'extremo' }).success).toBe(false)
  })

  it('rejeita quando fim < início', () => {
    const result = changeRequestSchema.safeParse({
      ...base,
      maintenance_start: '2026-06-02T02:00:00Z',
      maintenance_end: '2026-06-01T22:00:00Z',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('maintenance_end')
    }
  })
})

describe('costSchema', () => {
  it('aceita campos zerados', () => {
    const result = costSchema.safeParse({ toll_amount: 0, parking_amount: 0, travel_discount_minutes: 0 })
    expect(result.success).toBe(true)
    expect(result.data?.toll_amount).toBe(0)
  })

  it('aceita km_traveled opcional', () => {
    expect(costSchema.safeParse({ toll_amount: 0, parking_amount: 0 }).success).toBe(true)
  })

  it('rejeita valores negativos', () => {
    expect(costSchema.safeParse({ toll_amount: -1, parking_amount: 0 }).success).toBe(false)
  })
})

describe('reversalSchema', () => {
  it('rejeita motivo vazio', () => {
    expect(reversalSchema.safeParse({ reversal_reason: '' }).success).toBe(false)
  })

  it('aceita motivo preenchido', () => {
    expect(reversalSchema.safeParse({ reversal_reason: 'Erro crítico detectado' }).success).toBe(true)
  })
})
