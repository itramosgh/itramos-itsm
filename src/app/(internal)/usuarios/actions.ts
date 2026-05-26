'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { userSchema } from '@/lib/validations/user'
import { insertLog } from '@/lib/log'

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

  // Generate invite link and send email
  try {
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email: parsed.data.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/redefinir-senha` },
    })
    if (linkError) throw new Error(`generateLink: ${linkError.message}`)
    const inviteLink = (linkData as any)?.properties?.action_link
    if (!inviteLink) {
      await insertLog(supabase, 'email_sent', 'failure', 'Convite de usuário: link de convite não gerado', { email: parsed.data.email, linkData: JSON.stringify(linkData) })
    } else {
      const roleLabels: Record<string, string> = { admin: 'Admin', gestor: 'Gestor', analista: 'Analista' }
      const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
      await sendEmailFromTemplate('usuario_interno_criado', parsed.data.email, {
        nome_usuario: parsed.data.full_name,
        perfil: roleLabels[parsed.data.role] ?? parsed.data.role,
        link_definir_senha: inviteLink,
        app_url: process.env.NEXT_PUBLIC_APP_URL ?? '',
      })
      await insertLog(supabase, 'email_sent', 'success', 'Convite de usuário enviado', { email: parsed.data.email })
    }
  } catch (err) {
    await insertLog(supabase, 'email_sent', 'failure', 'Erro ao enviar convite de usuário', { email: parsed.data.email, error: String(err) }).catch(() => null)
  }

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

  // email lives in auth.users, not profiles — exclude it from the update
  const { email: _email, ...profileFields } = parsed.data
  const { error } = await supabase
    .from('profiles')
    .update({ ...profileFields, updated_at: new Date().toISOString() } as never)
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function deleteUserAction(id: string): Promise<{ error?: string } | void> {
  const callerClient = await createClient()
  const { data: { user: caller } } = await callerClient.auth.getUser()
  if (!caller) return { error: 'Não autorizado.' }
  if (caller.id === id) return { error: 'Você não pode remover sua própria conta.' }
  const { data: callerProfile } = await callerClient.from('profiles').select('role').eq('id', caller.id).single() as { data: any }
  if (callerProfile?.role !== 'admin') return { error: 'Apenas administradores podem remover usuários.' }

  const supabase = await createServiceClient()
  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) return { error: error.message }
  revalidatePath('/usuarios')
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
