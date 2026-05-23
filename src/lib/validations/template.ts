import { z } from 'zod'

const templateVariableSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  auto_filled: z.boolean().default(false),
})

export const templateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  category: z.string().optional(),
  body: z.string().min(1, 'Corpo é obrigatório'),
  variables: z.array(templateVariableSchema).default([]),
})

export type TemplateInput = z.infer<typeof templateSchema>
