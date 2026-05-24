import { describe, it, expect } from 'vitest'
import { saveTemplateSchema } from '@/lib/validations/email-template'

describe('saveTemplateSchema', () => {
  it('rejeita assunto vazio', () => {
    const result = saveTemplateSchema.safeParse({
      subject: '',
      body_rich_text: { type: 'doc', content: [] },
      body_html: '<p>teste</p>',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe('Assunto é obrigatório')
  })

  it('rejeita body_html vazio', () => {
    const result = saveTemplateSchema.safeParse({
      subject: 'Assunto válido',
      body_rich_text: { type: 'doc', content: [] },
      body_html: '',
    })
    expect(result.success).toBe(false)
  })

  it('aceita dados válidos', () => {
    const result = saveTemplateSchema.safeParse({
      subject: 'Chamado #{{numero_chamado}} aberto',
      body_rich_text: { type: 'doc', content: [{ type: 'paragraph' }] },
      body_html: '<p>Olá {{nome_cliente}}</p>',
    })
    expect(result.success).toBe(true)
  })
})
