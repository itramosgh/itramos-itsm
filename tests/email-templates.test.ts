import { describe, it, expect } from 'vitest'
import { saveTemplateSchema } from '@/lib/validations/email-template'
import { substituteVariables, wrapEmailHtml } from '@/lib/email-template-sender'

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

describe('substituteVariables', () => {
  it('substitui todos os placeholders', () => {
    const html = '<p>Olá {{nome_cliente}}, chamado #{{numero_chamado}}</p>'
    const result = substituteVariables(html, {
      nome_cliente: 'João Silva',
      numero_chamado: '1234',
    })
    expect(result).toBe('<p>Olá João Silva, chamado #1234</p>')
  })

  it('mantém placeholder sem valor correspondente intacto', () => {
    const result = substituteVariables('<p>{{chave_inexistente}}</p>', {})
    expect(result).toBe('<p>{{chave_inexistente}}</p>')
  })
})

describe('wrapEmailHtml', () => {
  it('envolve o conteúdo com header e footer', () => {
    const result = wrapEmailHtml('<p>Olá</p>', { logoUrl: null, companyName: 'ITRAMOS' })
    expect(result).toContain('<p>Olá</p>')
    expect(result).toContain('ITRAMOS')
    expect(result).toContain('<!DOCTYPE html>')
  })
})
