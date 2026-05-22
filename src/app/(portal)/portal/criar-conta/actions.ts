'use server'
import { createServiceClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { z } from 'zod'

const autoRegisterSchema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
})

type DomainRecord = {
  company_id: string
  companies: { is_active: boolean; is_blocked: boolean }
}

type ContactPartial = Pick<Database['public']['Tables']['contacts']['Row'], 'id' | 'user_id'>

export async function autoRegisterAction(
  prevState: { error?: string; showWhatsApp?: boolean; success?: boolean } | null,
  formData: FormData
) {
  const parsed = autoRegisterSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const domain = parsed.data.email.split('@')[1]
  const serviceSupabase = await createServiceClient()

  // Verify domain belongs to an active, unblocked company
  const { data: domainRecord } = await serviceSupabase
    .from('company_email_domains')
    .select('company_id, companies!inner(is_active, is_blocked)')
    .eq('domain', domain)
    .single() as { data: DomainRecord | null; error: unknown }

  if (!domainRecord) {
    return {
      error: 'Este e-mail não pertence a nenhuma empresa cadastrada. Entre em contato com a ITRAMOS.',
      showWhatsApp: true,
    }
  }

  const company = domainRecord.companies
  if (!company.is_active || company.is_blocked) {
    return { error: 'Empresa inativa ou bloqueada. Entre em contato com a ITRAMOS.', showWhatsApp: true }
  }

  // Check if email already has an account
  const { data: existing } = await serviceSupabase
    .from('contacts')
    .select('id, user_id')
    .eq('email', parsed.data.email)
    .single() as { data: ContactPartial | null; error: unknown }

  if (existing?.user_id) {
    return { error: 'Este e-mail já possui uma conta. Faça login.' }
  }

  // Create user in Supabase Auth
  const { data: authData, error: authError } = await serviceSupabase.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    app_metadata: { role: 'cliente' },
  })

  if (authError) return { error: authError.message }

  if (existing) {
    // Contact already exists (created via email) — link user_id
    // as never: supabase-js generic constraint quirk
    await serviceSupabase
      .from('contacts')
      .update({ user_id: authData.user.id } as never)
      .eq('id', existing.id)
  } else {
    // Create new contact
    // as never: supabase-js generic constraint quirk
    await serviceSupabase.from('contacts').insert({
      company_id: domainRecord.company_id,
      user_id: authData.user.id,
      full_name: parsed.data.full_name,
      email: parsed.data.email,
    } as never)
  }

  return { success: true }
}
