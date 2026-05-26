'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const deviceTypeSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
})

async function requireAdminOrGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', supabase: null }
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  const role = profileData?.role as string
  if (!['admin', 'gestor'].includes(role)) return { error: 'Permissão insuficiente.', supabase: null }
  return { error: null, supabase }
}

export async function createDeviceTypeAction(formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const parsed = deviceTypeSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // as never: supabase-js generic constraint quirk
  const { error } = await supabase.from('device_types').insert(parsed.data as never)
  if (error?.code === '23505') return { error: 'Já existe um tipo com este nome.' }
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/tipos-dispositivo')
  return { success: true }
}

export async function deactivateDeviceTypeAction(id: string) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  // as never: supabase-js generic constraint quirk
  const { error } = await supabase.from('device_types').update({ is_active: false } as never).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath('/configuracoes/tipos-dispositivo')
  return { success: true }
}
