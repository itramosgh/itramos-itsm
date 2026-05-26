'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userSchema } from '@/lib/validations/user'

export async function createUserAction(formData: FormData) {
  // Auth check first
  const callerClient = await createClient()
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single() as { data: any }
  const callerRole = callerProfile?.role as string
  if (!['admin', 'gestor'].includes(callerRole)) return { error: 'Permissão insuficiente.' }

  const raw = {
    ...Object.fromEntries(formData.entries()),
    notify_new_tickets: formData.get('notify_new_tickets') === 'on',
  }
  const parsed = userSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createServiceClient()

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: parsed.data.email,
    email_confirm: true,
    app_metadata: { role: parsed.data.role },
  })

  if (authError) return { error: authError.message }

  // as never: supabase-js generic constraint quirk with custom Insert type
  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    full_name: parsed.data.full_name,
    role: parsed.data.role,
    notify_new_tickets: parsed.data.notify_new_tickets,
  } as never)

  if (profileError) return { error: profileError.message }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function updateUserAction(id: string, formData: FormData) {
  // Auth check first
  const callerClient = await createClient()
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single() as { data: any }
  const callerRole = callerProfile?.role as string
  if (!['admin', 'gestor'].includes(callerRole)) return { error: 'Permissão insuficiente.' }

  const raw = {
    ...Object.fromEntries(formData.entries()),
    notify_new_tickets: formData.get('notify_new_tickets') === 'on',
  }
  const parsed = userSchema.partial().safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createServiceClient()

  if (parsed.data.role) {
    await supabase.auth.admin.updateUserById(id, {
      app_metadata: { role: parsed.data.role },
    })
  }

  // as never: supabase-js generic constraint quirk with custom Update type
  const { error } = await supabase
    .from('profiles')
    .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function deactivateUserAction(id: string): Promise<{ error?: string } | void> {
  // Auth check first
  const callerClient = await createClient()
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return { error: 'Não autorizado.' }
  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single() as { data: any }
  const callerRole = callerProfile?.role as string
  if (!['admin', 'gestor'].includes(callerRole)) return { error: 'Permissão insuficiente.' }

  const supabase = await createServiceClient()
  // as never: supabase-js generic constraint quirk with custom Update type
  const { error } = await supabase.from('profiles').update({ is_active: false } as never).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/usuarios')
}
