import { describe, it, expect } from 'vitest'
import { isValidTransition, VALID_TRANSITIONS } from '@/lib/ticket-transitions'

describe('isValidTransition', () => {
  it('aberto → em_andamento é válido', () => {
    expect(isValidTransition('aberto', 'em_andamento')).toBe(true)
  })

  it('aberto → agendado é válido', () => {
    expect(isValidTransition('aberto', 'agendado')).toBe(true)
  })

  it('fechado → em_andamento é inválido', () => {
    expect(isValidTransition('fechado', 'em_andamento')).toBe(false)
  })

  it('fechado → reaberto é válido', () => {
    expect(isValidTransition('fechado', 'reaberto')).toBe(true)
  })

  it('reaberto → fechado é inválido — precisa passar por estado de trabalho', () => {
    expect(isValidTransition('reaberto', 'fechado')).toBe(false)
  })

  it('aguardando_aprovacao → em_andamento é válido (aprovado)', () => {
    expect(isValidTransition('aguardando_aprovacao', 'em_andamento')).toBe(true)
  })

  it('aguardando_aprovacao → fechado é válido (reprovado ou timeout)', () => {
    expect(isValidTransition('aguardando_aprovacao', 'fechado')).toBe(true)
  })

  it('em_andamento → aguardando_aprovacao é válido', () => {
    expect(isValidTransition('em_andamento', 'aguardando_aprovacao')).toBe(true)
  })

  it('todos os status têm ao menos uma transição de saída exceto fechado', () => {
    const statuses = Object.keys(VALID_TRANSITIONS) as (keyof typeof VALID_TRANSITIONS)[]
    for (const status of statuses) {
      if (status === 'fechado') continue
      expect(VALID_TRANSITIONS[status].length).toBeGreaterThan(0)
    }
  })
})
