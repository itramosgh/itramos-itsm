'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { kbArticleSchema } from '@/lib/validations/kb-article'

export async function createArticleAction(_prevState: unknown, formData: FormData) {
  const tags = (formData.get('tags') as string)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  const parsed = kbArticleSchema.safeParse({
    title: formData.get('title'),
    problem_description: formData.get('problem_description') || undefined,
    solution: formData.get('solution') || undefined,
    category_id: formData.get('category_id') || null,
    tags,
    is_active: formData.get('is_active') !== 'false',
    origin_ticket_id: formData.get('origin_ticket_id') || null,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('kb_articles').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never)

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  return { success: true }
}

export async function updateArticleAction(id: string, _prevState: unknown, formData: FormData) {
  const tags = (formData.get('tags') as string)
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)

  const parsed = kbArticleSchema.safeParse({
    title: formData.get('title'),
    problem_description: formData.get('problem_description') || undefined,
    solution: formData.get('solution') || undefined,
    category_id: formData.get('category_id') || null,
    tags,
    is_active: formData.get('is_active') !== 'false',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('kb_articles')
    .update(parsed.data as never)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  revalidatePath(`/conhecimento/artigos/${id}`)
  return { success: true }
}

export async function toggleArticleActiveAction(id: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('kb_articles').update({ is_active: isActive } as never).eq('id', id)
  revalidatePath('/conhecimento')
}

export async function createArticleFromTicketAction(
  ticketId: string,
  title: string,
  problemDescription: string | null,
  solution: string,
  categoryId: string | null,
  createdBy: string
) {
  const supabase = await createServiceClient()
  await supabase.from('kb_articles').insert({
    title,
    problem_description: problemDescription ?? undefined,
    solution,
    category_id: categoryId ?? null,
    origin_ticket_id: ticketId,
    is_active: true,
    created_by: createdBy,
  } as never)
}
