'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { changeRequestSchema } from '@/lib/validations/change-request'

export async function createChangeRequestAction(_prevState: unknown, formData: FormData) {
  const contactsRaw = formData.get('notification_contacts')
  let notificationContacts: Array<{ contact_id?: string; external_email?: string; external_name?: string }> = []
  try {
    notificationContacts = JSON.parse(contactsRaw as string ?? '[]')
  } catch {
    return { error: 'Contatos de notificação inválidos' }
  }

  const isPreApproved = formData.get('is_pre_approved') === 'on'
  const preApprovalEmail = (formData.get('pre_approval_email') as string) || undefined

  const parsed = changeRequestSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    impacted_systems: formData.get('impacted_systems'),
    impacted_users: formData.get('impacted_users'),
    maintenance_start: formData.get('maintenance_start'),
    maintenance_end: formData.get('maintenance_end'),
    rollback_plan: formData.get('rollback_plan'),
    risk_level: formData.get('risk_level'),
    responsible_id: formData.get('responsible_id'),
    company_id: formData.get('company_id') || undefined,
    origin_ticket_id: formData.get('origin_ticket_id') || undefined,
    is_pre_approved: isPreApproved,
    pre_approval_email: preApprovalEmail,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Guard: only admin/gestor may pre-approve
  if (parsed.data.is_pre_approved) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user!.id)
      .single() as { data: any }
    if (!['admin', 'gestor'].includes(profile?.role)) {
      return { error: 'Sem permissão para pré-aprovar mudanças' }
    }
  }

  const insertStatus = parsed.data.is_pre_approved ? 'aprovada' : 'rascunho'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cr, error } = await supabase
    .from('change_requests')
    .insert({
      ...parsed.data as any,
      created_by: user!.id,
      status: insertStatus,
    })
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

  // Pré-aprovação: registrar em change_approvals sem enviar e-mail
  if (parsed.data.is_pre_approved && parsed.data.pre_approval_email) {
    const serviceSupabase = await createServiceClient()
    const { error: approvalError } = await serviceSupabase.from('change_approvals').insert({
      change_request_id: cr!.id,
      approver_email: parsed.data.pre_approval_email,
      status: 'aprovado',
      responded_at: new Date().toISOString(),
    } as never)
    if (approvalError) return { error: approvalError.message }
  }

  if (notificationContacts.length > 0) {
    const contactRows = notificationContacts.map((c) => ({
      change_request_id: cr!.id,
      contact_id: c.contact_id ?? null,
      external_email: c.external_email ?? null,
      external_name: c.external_name ?? null,
    }))
    await supabase.from('change_request_contacts').insert(contactRows as never)
  }

  if (parsed.data.origin_ticket_id) {
    const serviceSupabase = await createServiceClient()
    await serviceSupabase.from('tickets').update({ status: 'em_mudanca' } as never)
      .eq('id', parsed.data.origin_ticket_id)
    await serviceSupabase.from('ticket_interactions').insert({
      ticket_id: parsed.data.origin_ticket_id,
      type: 'system',
      content: `GMUD criada: "${parsed.data.title}". Chamado aguardando conclusão da mudança.`,
      is_system: true,
    } as never)
    revalidatePath(`/chamados/${parsed.data.origin_ticket_id}`)
  }

  revalidatePath('/mudancas')
  return { success: true, id: cr!.id }
}

export async function deleteChangeRequestAction(id: string) {
  const supabase = await createClient()
  await supabase.from('change_requests').delete().eq('id', id).eq('status', 'rascunho')
  revalidatePath('/mudancas')
}
