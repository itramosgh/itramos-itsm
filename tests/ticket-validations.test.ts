import { describe, it, expect } from 'vitest'
import { ticketSchema, interactionSchema, scheduleSchema } from '@/lib/validations/ticket'
import { templateSchema } from '@/lib/validations/template'

describe('ticketSchema', () => {
  it('rejeita chamado sem título', () => {
    const result = ticketSchema.safeParse({
      title: '',
      priority: 'alta',
      channel: 'portal',
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      contact_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita prioridade inválida', () => {
    const result = ticketSchema.safeParse({
      title: 'Problema',
      priority: 'urgente',
      channel: 'portal',
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      contact_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(false)
  })

  it('aceita chamado válido mínimo', () => {
    const result = ticketSchema.safeParse({
      title: 'VPN não conecta',
      priority: 'alta',
      channel: 'portal',
      company_id: '123e4567-e89b-12d3-a456-426614174000',
      contact_id: '123e4567-e89b-12d3-a456-426614174001',
    })
    expect(result.success).toBe(true)
  })
})

describe('scheduleSchema', () => {
  it('rejeita agendamento sem data', () => {
    expect(scheduleSchema.safeParse({ scheduled_at: '' }).success).toBe(false)
  })

  it('rejeita agendamento no passado', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(scheduleSchema.safeParse({ scheduled_at: past }).success).toBe(false)
  })

  it('aceita agendamento futuro', () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    expect(scheduleSchema.safeParse({ scheduled_at: future }).success).toBe(true)
  })
})

describe('templateSchema', () => {
  it('rejeita template sem nome', () => {
    expect(templateSchema.safeParse({ name: '', body: 'Olá {{nome_cliente}}' }).success).toBe(false)
  })

  it('aceita template válido', () => {
    const result = templateSchema.safeParse({
      name: 'Acesso VPN',
      body: 'Olá {{nome_cliente}}, seu acesso foi liberado.',
      variables: [{ key: 'nome_cliente', label: 'Nome do Cliente', auto_filled: true }],
    })
    expect(result.success).toBe(true)
  })
})
