import { describe, it, expect } from 'vitest'
import { meetingSchema } from '@/lib/validations/meeting'

describe('meetingSchema', () => {
  it('rejeita reunião sem participantes', () => {
    const result = meetingSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Alinhamento',
      scheduled_at: '2026-06-01T10:00:00Z',
      participants: [],
    })
    expect(result.success).toBe(false)
  })

  it('aceita participante externo com e-mail válido', () => {
    const result = meetingSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Alinhamento',
      scheduled_at: '2026-06-01T10:00:00Z',
      participants: [{ type: 'external', external_email: 'c@empresa.com', external_name: 'João' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejeita participante externo com e-mail inválido', () => {
    const result = meetingSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      title: 'Reunião',
      scheduled_at: '2026-06-01T10:00:00Z',
      participants: [{ type: 'external', external_email: 'nao-email', external_name: 'João' }],
    })
    expect(result.success).toBe(false)
  })
})
