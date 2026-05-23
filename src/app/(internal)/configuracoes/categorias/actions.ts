'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const categorySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  slug: z.string().min(1, 'Slug é obrigatório').regex(/^[a-z0-9_]+$/, 'Slug: apenas letras minúsculas, números e _'),
  requires_approval: z.boolean().default(false),
})

export async function createCategoryAction(formData: FormData) {
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    requires_approval: formData.get('requires_approval') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('ticket_categories').insert(parsed.data as never)
  if (error?.code === '23505') return { error: 'Já existe uma categoria com este slug.' }
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/categorias')
  return { success: true }
}

export async function updateCategoryAction(id: string, formData: FormData) {
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    requires_approval: formData.get('requires_approval') === 'on',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('ticket_categories').update(parsed.data as never).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/categorias')
  return { success: true }
}

export async function toggleCategoryAction(id: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('ticket_categories').update({ is_active: isActive } as never).eq('id', id)
  revalidatePath('/configuracoes/categorias')
}
