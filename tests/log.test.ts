import { describe, it, expect } from 'vitest'
import { buildLogEntry } from '@/lib/log'

describe('buildLogEntry', () => {
  it('constrói entrada de log de sucesso', () => {
    const entry = buildLogEntry('email_sent', 'success', 'E-mail enviado para joao@test.com')
    expect(entry.category).toBe('email_sent')
    expect(entry.status).toBe('success')
    expect(entry.details).toBeNull()
  })

  it('inclui details em caso de falha', () => {
    const entry = buildLogEntry('cron_job', 'failure', 'Falhou', { error: 'timeout' })
    expect(entry.details).toEqual({ error: 'timeout' })
  })
})
