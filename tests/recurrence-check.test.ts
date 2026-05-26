import { describe, it, expect } from 'vitest'
import { shouldAlert } from '@/lib/recurrence-check'

describe('shouldAlert', () => {
  it('retorna false quando count é zero', () => {
    expect(shouldAlert(0, 3)).toBe(false)
  })

  it('retorna false quando abaixo do mínimo', () => {
    expect(shouldAlert(2, 3)).toBe(false)
  })

  it('retorna true no mínimo exato', () => {
    expect(shouldAlert(3, 3)).toBe(true)
  })

  it('retorna true acima do mínimo', () => {
    expect(shouldAlert(5, 3)).toBe(true)
  })

  it('respeita configuração de mínimo diferente', () => {
    expect(shouldAlert(2, 2)).toBe(true)
    expect(shouldAlert(1, 2)).toBe(false)
  })
})
