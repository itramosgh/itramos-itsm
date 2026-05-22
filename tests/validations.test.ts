import { describe, it, expect } from 'vitest'
import { loginSchema } from '@/lib/validations/auth'

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
