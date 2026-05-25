'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { teamsWebhookSchema } from '@/lib/validations/teams'

export async function createTeamsWebhookAction(formData: FormData) {
  const raw = {
    name: formData.get('name'),
    webhook_url: formData.get('webhook_url'),
    is_active: formData.get('is_active') !== 'false',
    notify_new_tickets: formData.get('notify_new_tickets') === 'on',
    notify_sla_warning: formData.get('notify_sla_warning') === 'on',
    notify_sla_breach: formData.get('notify_sla_breach') === 'on',
    notify_url_down: formData.get('notify_url_down') === 'on',
    notify_url_up: formData.get('notify_url_up') === 'on',
    notify_monitoring_alert: formData.get('notify_monitoring_alert') === 'on',
    notify_ticket_reopened: formData.get('notify_ticket_reopened') === 'on',
  }
  const parsed = teamsWebhookSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('teams_webhook_configs').insert({
    ...parsed.data,
    created_by: user!.id,
  } as any)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes/teams')
  return { success: true }
}

export async function updateTeamsWebhookAction(id: string, formData: FormData) {
  const raw = {
    name: formData.get('name'),
    webhook_url: formData.get('webhook_url'),
    is_active: formData.get('is_active') === 'on',
    notify_new_tickets: formData.get('notify_new_tickets') === 'on',
    notify_sla_warning: formData.get('notify_sla_warning') === 'on',
    notify_sla_breach: formData.get('notify_sla_breach') === 'on',
    notify_url_down: formData.get('notify_url_down') === 'on',
    notify_url_up: formData.get('notify_url_up') === 'on',
    notify_monitoring_alert: formData.get('notify_monitoring_alert') === 'on',
    notify_ticket_reopened: formData.get('notify_ticket_reopened') === 'on',
  }
  const parsed = teamsWebhookSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await (supabase as any)
    .from('teams_webhook_configs')
    .update(parsed.data)
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/configuracoes/teams')
  return { success: true }
}

export async function deleteTeamsWebhookAction(id: string) {
  const supabase = await createClient()
  await supabase.from('teams_webhook_configs').delete().eq('id', id)
  revalidatePath('/configuracoes/teams')
}
