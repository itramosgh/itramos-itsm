import { z } from 'zod'

export const kbArticleSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  problem_description: z.string().optional(),
  solution: z.string().optional(),
  category_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  is_active: z.boolean().default(true),
  origin_ticket_id: z.string().uuid().optional().nullable(),
})

export type KbArticleInput = z.infer<typeof kbArticleSchema>
