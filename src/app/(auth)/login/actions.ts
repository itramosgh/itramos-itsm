'use server'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validations/auth'

export async function loginAction(prevState: { error: string } | null, formData: FormData) {
  const raw = { email: formData.get('email'), password: formData.get('password') }
  const parsed = loginSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data: authData, error } = await supabase.auth.signInWithPassword(parsed.data)
  if (error) return { error: 'E-mail ou senha incorretos' }

  if (authData.user) {
    const serviceSupabase = await createServiceClient()
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    if (!profile) {
      // Usuário de portal (contato) — registrar last_login_at em contacts
      await serviceSupabase
        .from('contacts')
        .update({ last_login_at: new Date().toISOString() } as never)
        .eq('user_id', authData.user.id)
      redirect('/portal/chamados')
    }

    // Usuário interno — registrar last_login_at em profiles
    await serviceSupabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() } as never)
      .eq('id', authData.user.id)
  }

  redirect('/dashboard')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function loginWithMicrosoftAction() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile',
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  })
  if (error || !data.url) {
    return { error: 'Erro ao iniciar login com Microsoft. Tente novamente.' }
  }
  redirect(data.url)
}
