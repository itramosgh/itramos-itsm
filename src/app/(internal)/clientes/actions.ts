'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { companySchema, emailDomainSchema } from '@/lib/validations/company'

async function requireAdminOrGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', supabase: null }
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  const role = profileData?.role as string
  if (!['admin', 'gestor'].includes(role)) return { error: 'Permissão insuficiente.', supabase: null }
  return { error: null, supabase }
}

export async function createCompanyAction(formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const parsed = companySchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // as never: supabase-js generic constraint quirk with custom Insert type
  const { error } = await supabase.from('companies').insert(parsed.data as never)
  if (error) return { error: error.message }

  revalidatePath('/clientes')
  return { success: true }
}

export async function updateCompanyAction(id: string, formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const parsed = companySchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // as never: supabase-js generic constraint quirk with custom Update type
  const { error } = await supabase.from('companies').update(parsed.data as never).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${id}`)
  return { success: true }
}

export async function toggleBlockCompanyAction(id: string, block: boolean) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  // as never: supabase-js generic constraint quirk
  const { error } = await supabase.from('companies').update({ is_blocked: block } as never).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${id}`)
  return { success: true }
}

export async function addEmailDomainAction(companyId: string, formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const parsed = emailDomainSchema.safeParse({ domain: formData.get('domain') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // as never: supabase-js generic constraint quirk
  const { error } = await supabase
    .from('company_email_domains')
    .insert({ company_id: companyId, domain: parsed.data.domain } as never)

  if (error?.code === '23505') return { error: 'Este domínio já está cadastrado.' }
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${companyId}`)
  return { success: true }
}

export async function removeEmailDomainAction(domainId: string, companyId: string) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const { error } = await supabase.from('company_email_domains').delete().eq('id', domainId)
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${companyId}`)
  return { success: true }
}
