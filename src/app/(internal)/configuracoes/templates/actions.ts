'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { templateSchema } from '@/lib/validations/template'

export async function createTemplateAction(formData: FormData) {
  const variablesRaw = formData.get('variables_json') as string
  const parsed = templateSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    body: formData.get('body'),
    variables: variablesRaw ? JSON.parse(variablesRaw) : [],
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('response_templates').insert({
    ...parsed.data,
    created_by: user!.id,
  } as never)
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/templates')
  return { success: true }
}

export async function updateTemplateAction(id: string, formData: FormData) {
  const variablesRaw = formData.get('variables_json') as string
  const parsed = templateSchema.safeParse({
    name: formData.get('name'),
    category: formData.get('category') || undefined,
    body: formData.get('body'),
    variables: variablesRaw ? JSON.parse(variablesRaw) : [],
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase.from('response_templates').update(parsed.data as never).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/templates')
  return { success: true }
}

export async function deactivateTemplateAction(id: string) {
  const supabase = await createClient()
  await supabase.from('response_templates').update({ is_active: false } as never).eq('id', id)
  revalidatePath('/configuracoes/templates')
}
