import { describe, it, expect } from 'vitest'
import { kbArticleSchema } from '@/lib/validations/kb-article'

describe('kbArticleSchema', () => {
  it('rejeita título vazio', () => {
    expect(kbArticleSchema.safeParse({ title: '' }).success).toBe(false)
  })

  it('aceita artigo com campos mínimos', () => {
    const result = kbArticleSchema.safeParse({ title: 'Como resetar senha' })
    expect(result.success).toBe(true)
    expect(result.data?.tags).toEqual([])
    expect(result.data?.is_active).toBe(true)
  })

  it('aceita artigo com todos os campos preenchidos', () => {
    const result = kbArticleSchema.safeParse({
      title: 'Problema de impressora',
      problem_description: 'Impressora não imprime',
      solution: 'Reiniciar o spooler de impressão',
      tags: ['impressora', 'hardware'],
      is_active: true,
      origin_ticket_id: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(result.success).toBe(true)
    expect(result.data?.tags).toHaveLength(2)
  })
})
