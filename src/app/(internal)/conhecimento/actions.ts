'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { kbArticleSchema } from '@/lib/validations/kb-article'
import { kbDocumentSchema } from '@/lib/validations/kb-document'

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
  const { data: article, error } = await supabase.from('kb_articles').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never).select('id').single<{ id: string }>()

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  return { success: true, articleId: article!.id }
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

export async function createDocumentAction(formData: FormData) {
  const contentHtml = formData.get('content_html') as string
  const contentRichText = JSON.parse((formData.get('content_rich_text') as string) || 'null')

  const parsed = kbDocumentSchema.safeParse({
    company_id: formData.get('company_id'),
    title: formData.get('title'),
    content_html: contentHtml || undefined,
    content_rich_text: contentRichText,
    category: formData.get('category') || undefined,
    published_at: formData.get('published_at') || null,
    is_active: true,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('kb_documents').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never).select('id').single()

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  return { success: true, id: (data as any).id }
}

export async function updateDocumentAction(id: string, formData: FormData) {
  const contentHtml = formData.get('content_html') as string
  const contentRichText = JSON.parse((formData.get('content_rich_text') as string) || 'null')

  const parsed = kbDocumentSchema.safeParse({
    company_id: formData.get('company_id'),
    title: formData.get('title'),
    content_html: contentHtml || undefined,
    content_rich_text: contentRichText,
    category: formData.get('category') || undefined,
    published_at: formData.get('published_at') || null,
    is_active: formData.get('is_active') !== 'false',
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('kb_documents')
    .update(parsed.data as never)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/conhecimento')
  revalidatePath(`/conhecimento/documentos/${id}`)
  return { success: true }
}

export async function deleteDocumentAction(id: string) {
  const supabase = await createClient()
  const { data: attachments } = await supabase
    .from('kb_document_attachments')
    .select('storage_path')
    .eq('document_id', id)
  if (attachments?.length) {
    await supabase.storage.from('kb-documents').remove(attachments.map((a: any) => a.storage_path))
    await supabase.from('kb_document_attachments').delete().eq('document_id', id)
  }
  await supabase.from('kb_documents').delete().eq('id', id)
  revalidatePath('/conhecimento')
}

export async function deleteDocumentAttachmentAction(attachmentId: string, storagePath: string, documentId: string) {
  const supabase = await createClient()
  await supabase.storage.from('kb-documents').remove([storagePath])
  await supabase.from('kb_document_attachments').delete().eq('id', attachmentId)
  revalidatePath(`/conhecimento/documentos/${documentId}`)
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
