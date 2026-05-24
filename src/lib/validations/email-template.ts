import { z } from 'zod'

export const saveTemplateSchema = z.object({
  subject: z.string().min(1, 'Assunto é obrigatório'),
  body_rich_text: z.record(z.string(), z.unknown()),
  body_html: z.string().min(1, 'Conteúdo é obrigatório'),
})

export type SaveTemplateInput = z.infer<typeof saveTemplateSchema>
