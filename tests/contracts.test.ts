import { describe, it, expect } from 'vitest'
import { contractSchema, slaRulesSchema } from '@/lib/validations/contract'

describe('contractSchema', () => {
  it('rejeita contrato sem data de início', () => {
    expect(contractSchema.safeParse({ company_id: 'uuid' }).success).toBe(false)
  })

  it('aceita contrato mínimo válido', () => {
    const result = contractSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      start_date: '2026-01-01',
    })
    expect(result.success).toBe(true)
  })
})

describe('slaRulesSchema', () => {
  it('rejeita prazo zero', () => {
    const result = slaRulesSchema.safeParse([
      { priority: 'critica', response_hours: 0 },
    ])
    expect(result.success).toBe(false)
  })

  it('aceita regras válidas para todas as prioridades', () => {
    const result = slaRulesSchema.safeParse([
      { priority: 'critica', response_hours: 2 },
      { priority: 'alta', response_hours: 4 },
      { priority: 'media', response_hours: 8 },
      { priority: 'baixa', response_hours: 24 },
    ])
    expect(result.success).toBe(true)
  })
})
