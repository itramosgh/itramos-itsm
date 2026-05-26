'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { platformSettingsSchema } from '@/lib/validations/settings'
import type { Database } from '@/types/database'
import { z } from 'zod'

type SettingsUpdate = Database['public']['Tables']['platform_settings']['Update']

export async function updateSettingsAction(formData: FormData) {
  const raw = Object.fromEntries(formData.entries())
  // business_hours_days comes as multiple values in FormData
  raw.business_hours_days = formData.getAll('business_hours_days') as unknown as string

  const parsed = platformSettingsSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }

  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  const role = profileData?.role as string
  if (role !== 'admin') return { error: 'Apenas administradores podem alterar configurações.' }

  const logoLightUrl = formData.get('logo_light_url') as string | null
  const logoDarkUrl = formData.get('logo_dark_url') as string | null
  const monitoringContactId = formData.get('monitoring_contact_id') as string | null

  const payload: SettingsUpdate = {
    ...parsed.data,
    id: 1,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
    ...(logoLightUrl ? { logo_light_url: logoLightUrl } : {}),
    ...(logoDarkUrl ? { logo_dark_url: logoDarkUrl } : {}),
    monitoring_contact_id: monitoringContactId || null,
  }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await adminClient
    .from('platform_settings')
    .upsert(payload)

  if (error) return { error: `Erro ao salvar: ${error.message}` }

  revalidatePath('/configuracoes')
  return { success: true }
}

const internalContactSchema = z.object({
  full_name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
})

export async function createInternalContactAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.' }
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (profileData?.role !== 'admin') return { error: 'Apenas administradores podem criar contatos internos.' }

  const parsed = internalContactSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: newContact, error } = await adminClient
    .from('contacts')
    .insert({ full_name: parsed.data.full_name, email: parsed.data.email, company_id: null, is_active: true } as never)
    .select('id, full_name, email')
    .single() as { data: { id: string; full_name: string; email: string } | null; error: any }

  if (error || !newContact) return { error: error?.message ?? 'Erro ao criar contato' }

  revalidatePath('/configuracoes/plataforma')
  return { success: true, contact: newContact }
}
