import { describe, it, expect } from 'vitest'
import { loginSchema } from '@/lib/validations/auth'
import { platformSettingsSchema } from '@/lib/validations/settings'
import { userSchema } from '@/lib/validations/user'

describe('loginSchema', () => {
  it('rejeita e-mail inválido', () => {
    const result = loginSchema.safeParse({ email: 'nao-email', password: '123456' })
    expect(result.success).toBe(false)
  })

  it('rejeita senha vazia', () => {
    const result = loginSchema.safeParse({ email: 'user@test.com', password: '' })
    expect(result.success).toBe(false)
  })

  it('aceita credenciais válidas', () => {
    const result = loginSchema.safeParse({ email: 'user@test.com', password: 'senha123' })
    expect(result.success).toBe(true)
  })
})

describe('userSchema', () => {
  it('rejeita papel inválido', () => {
    const result = userSchema.safeParse({
      full_name: 'João',
      email: 'joao@itramos.com.br',
      role: 'superadmin',
    })
    expect(result.success).toBe(false)
  })

  it('aceita usuário válido', () => {
    const result = userSchema.safeParse({
      full_name: 'João Silva',
      email: 'joao@itramos.com.br',
      role: 'analista',
    })
    expect(result.success).toBe(true)
  })
})

describe('platformSettingsSchema', () => {
  it('rejeita e-mail de remetente inválido', () => {
    const result = platformSettingsSchema.safeParse({
      email_from_address: 'nao-email',
      email_from_name: 'Test',
      holiday_notice_days: 7,
      recurrence_min_tickets: 3,
      recurrence_window_days: 30,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_hours_days: [1, 2, 3, 4, 5],
      billing_alert_days: 7,
    })
    expect(result.success).toBe(false)
  })

  it('aceita configurações válidas com campos opcionais ausentes', () => {
    const result = platformSettingsSchema.safeParse({
      email_from_address: 'suporte@itramos.com.br',
      email_from_name: 'ITRAMOS Suporte',
      holiday_notice_days: 7,
      recurrence_min_tickets: 3,
      recurrence_window_days: 30,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_hours_days: [1, 2, 3, 4, 5],
      billing_alert_days: 7,
    })
    expect(result.success).toBe(true)
  })
})
