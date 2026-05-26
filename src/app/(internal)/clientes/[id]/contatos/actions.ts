'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { contactSchema } from '@/lib/validations/contact'
import { insertLog } from '@/lib/log'

async function requireAdminOrGestor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autorizado.', supabase: null }
  const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  const role = profileData?.role as string
  if (!['admin', 'gestor'].includes(role)) return { error: 'Permissão insuficiente.', supabase: null }
  return { error: null, supabase }
}

export async function createContactAction(companyId: string, formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const raw = {
    ...Object.fromEntries(formData.entries()),
    company_id: companyId,
    is_whatsapp: formData.get('is_whatsapp') === 'on',
    is_contract_responsible: formData.get('is_contract_responsible') === 'on',
    receives_ticket_cc: formData.get('receives_ticket_cc') === 'on',
  }
  const parsed = contactSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // as never: supabase-js generic constraint quirk with custom Insert type
  const { error } = await supabase.from('contacts').insert(parsed.data as never)
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${companyId}/contatos`)
  return { success: true }
}

export async function updateContactAction(contactId: string, companyId: string, formData: FormData) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  const raw = {
    ...Object.fromEntries(formData.entries()),
    company_id: companyId,
    is_whatsapp: formData.get('is_whatsapp') === 'on',
    is_contract_responsible: formData.get('is_contract_responsible') === 'on',
    receives_ticket_cc: formData.get('receives_ticket_cc') === 'on',
  }
  const parsed = contactSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const { error } = await supabase.from('contacts').update(parsed.data as never).eq('id', contactId)
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${companyId}/contatos`)
  return { success: true }
}

export async function updateContactFlagsAction(
  contactId: string,
  companyId: string,
  flags: { is_contract_responsible?: boolean; receives_ticket_cc?: boolean }
) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  // as never: supabase-js generic constraint quirk
  const { error } = await supabase.from('contacts').update(flags as never).eq('id', contactId)
  if (error) return { error: error.message }

  revalidatePath(`/clientes/${companyId}/contatos`)
  return { success: true }
}

export async function deleteContactAction(contactId: string, companyId: string) {
  const { error: authError, supabase } = await requireAdminOrGestor()
  if (authError || !supabase) return { error: authError ?? 'Não autorizado.' }

  // If contact has portal access, delete the auth user first
  const { data: contact } = await supabase
    .from('contacts')
    .select('user_id')
    .eq('id', contactId)
    .single() as { data: { user_id: string | null } | null; error: unknown }

  if (contact?.user_id) {
    const serviceSupabase = await createServiceClient()
    await serviceSupabase.auth.admin.deleteUser(contact.user_id)
  }

  const { error } = await supabase.from('contacts').delete().eq('id', contactId)
  if (error) {
    if (error.code === '23503') return { error: 'Contato possui chamados vinculados e não pode ser removido. Desative-o.' }
    return { error: error.message }
  }

  revalidatePath(`/clientes/${companyId}/contatos`)
  return { success: true }
}

export async function resendContactInviteAction(contactId: string, companyId: string): Promise<{ error?: string; success?: boolean }> {
  const { error: authError, supabase: callerClient } = await requireAdminOrGestor()
  if (authError || !callerClient) return { error: authError ?? 'Não autorizado.' }

  const { data: contact } = await callerClient
    .from('contacts')
    .select('email, full_name, user_id')
    .eq('id', contactId)
    .single() as { data: { email: string; full_name: string; user_id: string | null } | null; error: unknown }

  if (!contact) return { error: 'Contato não encontrado.' }
  if (!contact.user_id) return { error: 'Contato não possui acesso ao portal.' }

  const serviceSupabase = await createServiceClient()

  try {
    const { data: linkData, error: linkError } = await serviceSupabase.auth.admin.generateLink({
      type: 'recovery',
      email: contact.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/portal/redefinir-senha` },
    })
    if (linkError) throw new Error(linkError.message)
    const inviteLink = (linkData as any)?.properties?.action_link
    if (!inviteLink) throw new Error('Link não gerado.')

    const { sendEmailFromTemplate } = await import('@/lib/email-template-sender')
    await sendEmailFromTemplate('definicao_senha_link', contact.email, {
      nome_contato: contact.full_name,
      link_definir_senha: inviteLink,
    })
    await insertLog(serviceSupabase, 'email_sent', 'success', 'Reenvio de link de senha para contato do portal', { email: contact.email })
    return { success: true }
  } catch (err) {
    await insertLog(serviceSupabase, 'email_sent', 'failure', 'Erro ao reenviar link de senha para contato', { email: contact.email, error: String(err) }).catch(() => null)
    return { error: String(err) }
  }
}

export async function grantPortalAccessAction(contactId: string, companyId: string) {
  const { error: authError, supabase: callerClient } = await requireAdminOrGestor()
  if (authError || !callerClient) return { error: authError ?? 'Não autorizado.' }

  const { data: contact } = await callerClient
    .from('contacts')
    .select('email, full_name, user_id')
    .eq('id', contactId)
    .single() as { data: { email: string; full_name: string; user_id: string | null } | null; error: unknown }

  if (!contact) return { error: 'Contato não encontrado' }
  if (contact.user_id) return { error: 'Contato já tem acesso ao portal' }

  const serviceSupabase = await createServiceClient()
  const { data: authData, error: authUserError } = await serviceSupabase.auth.admin.createUser({
    email: contact.email,
    email_confirm: false,
    app_metadata: { role: 'cliente' },
  })

  if (authUserError) return { error: authUserError.message }

  // as never: supabase-js generic constraint quirk
  await callerClient.from('contacts').update({ user_id: authData.user.id } as never).eq('id', contactId)

  // E-mail de definição de senha — implementado no sub-spec 3 (E-mail)
  revalidatePath(`/clientes/${companyId}/contatos`)
  return { success: true }
}
