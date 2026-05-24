import { describe, it, expect } from 'vitest'
import { announcementSchema } from '@/lib/validations/announcement'

describe('announcementSchema', () => {
  it('rejeita assunto vazio', () => {
    const result = announcementSchema.safeParse({
      subject: '',
      body_html: '<p>teste</p>',
      recipient_type: 'all',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita recipient_type inválido', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado',
      body_html: '<p>teste</p>',
      recipient_type: 'todos',
    })
    expect(result.success).toBe(false)
  })

  it('aceita comunicado válido para todos', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado Dezembro',
      body_html: '<p>Olá</p>',
      recipient_type: 'all',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita tipo company sem recipient_company_id', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado',
      body_html: '<p>Olá</p>',
      recipient_type: 'company',
    })
    expect(result.success).toBe(false)
  })

  it('aceita comunicado agendado com data válida', () => {
    const result = announcementSchema.safeParse({
      subject: 'Comunicado',
      body_html: '<p>Olá</p>',
      recipient_type: 'company',
      recipient_company_id: '123e4567-e89b-12d3-a456-426614174000',
      scheduled_at: '2026-12-25T09:00:00.000Z',
    })
    expect(result.success).toBe(true)
  })
})
