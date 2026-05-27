import { describe, it, expect } from 'vitest'
import { changeRequestSchema } from '@/lib/validations/change-request'

const baseValid = {
  title: 'Deploy v2',
  description: 'Atualização de versão',
  impacted_systems: 'Servidor A',
  impacted_users: 'Todos os usuários',
  maintenance_start: '2026-06-01T22:00',
  maintenance_end: '2026-06-01T23:00',
  rollback_plan: 'Reverter para v1',
  risk_level: 'baixo' as const,
  responsible_id: '550e8400-e29b-41d4-a716-446655440000',
}

describe('changeRequestSchema — pré-aprovação', () => {
  it('aceita is_pre_approved false sem email (comportamento padrão)', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejeita is_pre_approved true sem email', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: true,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const paths = result.error.issues.map(i => i.path.join('.'))
      expect(paths).toContain('pre_approval_email')
    }
  })

  it('aceita is_pre_approved true com email válido', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: true,
      pre_approval_email: 'aprovador@empresa.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita is_pre_approved true com email inválido', () => {
    const result = changeRequestSchema.safeParse({
      ...baseValid,
      is_pre_approved: true,
      pre_approval_email: 'nao-e-um-email',
    })
    expect(result.success).toBe(false)
  })
})
