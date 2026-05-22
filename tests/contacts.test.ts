import { describe, it, expect } from 'vitest'
import { contactSchema } from '@/lib/validations/contact'

describe('contactSchema', () => {
  it('rejeita e-mail inválido', () => {
    const result = contactSchema.safeParse({
      company_id: 'uuid-ok',
      full_name: 'Maria',
      email: 'nao-email',
    })
    expect(result.success).toBe(false)
  })

  it('aceita contato válido sem campos opcionais', () => {
    const result = contactSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      full_name: 'Maria Silva',
      email: 'maria@empresa.com.br',
    })
    expect(result.success).toBe(true)
  })

  it('aceita telefone como WhatsApp', () => {
    const result = contactSchema.safeParse({
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      full_name: 'Maria Silva',
      email: 'maria@empresa.com.br',
      phone: '11999999999',
      is_whatsapp: true,
    })
    expect(result.success).toBe(true)
    expect(result.data?.is_whatsapp).toBe(true)
  })
})
