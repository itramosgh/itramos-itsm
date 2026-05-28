'use server'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validations/auth'

export async function portalLoginAction(prevState: { error: string } | null, formData: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData.entries()))
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  // Ensure this is a client user (not internal)
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', data.user.id).single() as { data: any }
  const role = profileData?.role
  if (role && role !== 'cliente') {
    await supabase.auth.signOut()
    return { error: 'Use o painel interno para fazer login.' }
  }

  // Registrar último acesso do contato
  const serviceSupabase = await createServiceClient()
  await serviceSupabase
    .from('contacts')
    .update({ last_login_at: new Date().toISOString() } as never)
    .eq('user_id', data.user.id)

  redirect('/portal/chamados')
}
