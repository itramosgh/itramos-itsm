'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { saveTemplateSchema } from '@/lib/validations/email-template'

export async function saveTemplateAction(
  slug: string,
  data: { subject: string; body_html: string; body_rich_text: Record<string, unknown> }
) {
  const parsed = saveTemplateSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_templates')
    .update({
      subject: parsed.data.subject,
      body_html: parsed.data.body_html,
      body_rich_text: parsed.data.body_rich_text,
      is_customized: true,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('slug', slug)

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/email-templates')
  return { success: true }
}

export async function restoreDefaultAction(slug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: templateRow } = await supabase
    .from('email_templates')
    .select('default_subject, default_body_rich_text, default_body_html')
    .eq('slug', slug)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const template = templateRow as any

  if (!template) return { error: 'Template não encontrado' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('email_templates')
    .update({
      subject: template.default_subject,
      body_rich_text: template.default_body_rich_text,
      body_html: template.default_body_html,
      is_customized: false,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq('slug', slug)

  if (error) return { error: error.message }

  revalidatePath('/configuracoes/email-templates')
  return { success: true }
}
