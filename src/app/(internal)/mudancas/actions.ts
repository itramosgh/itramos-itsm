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
    origin_ticket_id: formData.get('origin_ticket_id') || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cr, error } = await supabase
    .from('change_requests')
    .insert({ ...parsed.data as any, created_by: user!.id })
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

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
