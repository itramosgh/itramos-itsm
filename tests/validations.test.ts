import { describe, it, expect } from 'vitest'
import { loginSchema } from '@/lib/validations/auth'
import { platformSettingsSchema } from '@/lib/validations/settings'
import { userSchema } from '@/lib/validations/user'
import { monitoringIntegrationSchema, monitoredUrlSchema } from '@/lib/validations/monitoring'
import { teamsWebhookSchema } from '@/lib/validations/teams'

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

describe('monitoringIntegrationSchema', () => {
  it('aceita integração Zabbix com janela 24x7', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'zabbix',
      window_type: '24x7',
      out_of_window_behavior: 'descartar',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita personalizado sem window_custom_days', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'azure_monitor',
      window_type: 'personalizado',
      out_of_window_behavior: 'aguardar_e_abrir',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toContain('dias')
  })

  it('aceita personalizado com todos os campos', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'zabbix',
      window_type: 'personalizado',
      window_custom_days: [1, 2, 3, 4, 5],
      window_custom_start: '08:00',
      window_custom_end: '20:00',
      out_of_window_behavior: 'descartar',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita connector_type inválido', () => {
    const result = monitoringIntegrationSchema.safeParse({
      connector_type: 'grafana',
      window_type: '24x7',
      out_of_window_behavior: 'descartar',
    })
    expect(result.success).toBe(false)
  })
})

describe('monitoredUrlSchema', () => {
  it('aceita URL válida com campos mínimos', () => {
    const result = monitoredUrlSchema.safeParse({
      url: 'https://empresa.com.br',
      name: 'Portal principal',
      check_interval_minutes: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejeita URL sem protocolo', () => {
    const result = monitoredUrlSchema.safeParse({
      url: 'empresa.com.br',
      name: 'Portal',
      check_interval_minutes: 5,
    })
    expect(result.success).toBe(false)
  })

  it('rejeita intervalo não permitido', () => {
    const result = monitoredUrlSchema.safeParse({
      url: 'https://empresa.com.br',
      name: 'Portal',
      check_interval_minutes: 7,
    })
    expect(result.success).toBe(false)
  })
})

describe('teamsWebhookSchema', () => {
  it('aceita webhook válido', () => {
    const result = teamsWebhookSchema.safeParse({
      name: 'Canal Chamados',
      webhook_url: 'https://outlook.office.com/webhook/abc123',
    })
    expect(result.success).toBe(true)
  })

  it('rejeita nome vazio', () => {
    const result = teamsWebhookSchema.safeParse({
      name: '',
      webhook_url: 'https://outlook.office.com/webhook/abc123',
    })
    expect(result.success).toBe(false)
  })

  it('rejeita URL inválida', () => {
    const result = teamsWebhookSchema.safeParse({
      name: 'Canal',
      webhook_url: 'nao-eh-url',
    })
    expect(result.success).toBe(false)
  })
})
