import { z } from 'zod'

export const kbDocumentSchema = z.object({
  company_id: z.string().uuid('Empresa inválida'),
  title: z.string().min(1, 'Título é obrigatório'),
  content_html: z.string().optional(),
  content_rich_text: z.record(z.string(), z.unknown()).optional().nullable(),
  category: z.string().optional(),
  published_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
})

export type KbDocumentInput = z.infer<typeof kbDocumentSchema>
