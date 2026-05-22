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

  const payload: SettingsUpdate = {
    ...parsed.data,
    id: 1,
    updated_by: user!.id,
    updated_at: new Date().toISOString(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase
    .from('platform_settings')
    .upsert(payload as any)

  if (error) return { error: 'Erro ao salvar configurações.' }

  revalidatePath('/configuracoes')
  return { success: true }
}
