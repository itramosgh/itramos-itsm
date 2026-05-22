'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { platformSettingsSchema } from '@/lib/validations/settings'
import type { Database } from '@/types/database'

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

  const role = user.app_metadata?.role as string
  if (role !== 'admin') return { error: 'Apenas administradores podem alterar configurações.' }

  const logoLightUrl = formData.get('logo_light_url') as string | null
  const logoDarkUrl = formData.get('logo_dark_url') as string | null

  const payload: SettingsUpdate = {
    ...parsed.data,
    id: 1,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
    ...(logoLightUrl ? { logo_light_url: logoLightUrl } : {}),
    ...(logoDarkUrl ? { logo_dark_url: logoDarkUrl } : {}),
  }

  // as never: supabase-js generic constraint quirk with custom Upsert type
  const { error } = await supabase
    .from('platform_settings')
    .upsert(payload as never)

  if (error) return { error: 'Erro ao salvar configurações.' }

  revalidatePath('/configuracoes')
  return { success: true }
}
