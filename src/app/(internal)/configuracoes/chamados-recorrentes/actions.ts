'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['admin', 'gestor']

async function guardAdminGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado', supabase: null, userId: null }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!ALLOWED_ROLES.includes(profile?.role)) return { error: 'Sem permissão', supabase: null, userId: null }
  return { error: null, supabase, userId: user.id }
}

export async function createRecurringTemplateAction(formData: FormData) {
  const { error, supabase, userId } = await guardAdminGestor()
  if (error || !supabase) return { error }

  const frequency = formData.get('frequency') as string
  const intervalDaysRaw = formData.get('interval_days')

  const { error: dbError } = await supabase.from('recurring_ticket_templates').insert({
    company_id: formData.get('company_id'),
    contact_id: formData.get('contact_id'),
    title: formData.get('title'),
    description: (formData.get('description') as string) || null,
    priority: formData.get('priority'),
    category_id: (formData.get('category_id') as string) || null,
    frequency,
    interval_days: frequency === 'personalizado' && intervalDaysRaw ? Number(intervalDaysRaw) : null,
    next_run_at: formData.get('next_run_at'),
    created_by: userId,
  } as never)

  if (dbError) return { error: dbError.message }
  revalidatePath('/configuracoes/chamados-recorrentes')
  return { success: true }
}

export async function toggleRecurringTemplateAction(id: string, isActive: boolean) {
  const { error, supabase } = await guardAdminGestor()
  if (error || !supabase) return { error }
  await (supabase.from('recurring_ticket_templates') as any).update({ is_active: isActive }).eq('id', id)
  revalidatePath('/configuracoes/chamados-recorrentes')
}

export async function deleteRecurringTemplateAction(id: string) {
  const { error, supabase } = await guardAdminGestor()
  if (error || !supabase) return { error }
  await supabase.from('recurring_ticket_templates').delete().eq('id', id)
  revalidatePath('/configuracoes/chamados-recorrentes')
}
