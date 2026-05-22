import { describe, it, expect } from 'vitest'
import { companySchema, emailDomainSchema } from '@/lib/validations/company'

describe('companySchema', () => {
  it('rejeita nome vazio', () => {
    expect(companySchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('aceita empresa com campos mínimos', () => {
    expect(companySchema.safeParse({ name: 'Empresa X' }).success).toBe(true)
  })
})

describe('emailDomainSchema', () => {
  it('rejeita domínio com @', () => {
    expect(emailDomainSchema.safeParse({ domain: '@empresa.com' }).success).toBe(false)
  })

  it('aceita domínio válido', () => {
    expect(emailDomainSchema.safeParse({ domain: 'empresa.com.br' }).success).toBe(true)
  })
})
