'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { monitoringIntegrationSchema, monitoredUrlSchema } from '@/lib/validations/monitoring'

export async function createMonitoringIntegrationAction(companyId: string, _prevState: unknown, formData: FormData) {
  const raw = {
    connector_type: formData.get('connector_type'),
    window_type: formData.get('window_type'),
    window_custom_days: formData.getAll('window_custom_days').map(Number),
    window_custom_start: formData.get('window_custom_start') || undefined,
    window_custom_end: formData.get('window_custom_end') || undefined,
    out_of_window_behavior: formData.get('out_of_window_behavior'),
    is_active: formData.get('is_active') !== 'false',
  }
  const parsed = monitoringIntegrationSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('monitoring_integrations').insert({
    ...parsed.data,
    company_id: companyId,
    created_by: user!.id,
  } as never)

  if (error) return { error: error.message }
  revalidatePath(`/clientes/${companyId}/monitoramento`)
  return { success: true }
}

export async function toggleMonitoringIntegrationAction(id: string, companyId: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('monitoring_integrations').update({ is_active: isActive } as never).eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}

export async function deleteMonitoringIntegrationAction(id: string, companyId: string) {
  const supabase = await createClient()
  await supabase.from('monitoring_integrations').delete().eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}

export async function createMonitoredUrlAction(companyId: string, _prevState: unknown, formData: FormData) {
  const raw = {
    url: formData.get('url'),
    name: formData.get('name'),
    check_interval_minutes: formData.get('check_interval_minutes'),
  }
  const parsed = monitoredUrlSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('monitored_urls').insert({
    ...parsed.data,
    company_id: companyId,
    created_by: user!.id,
  } as never)

  if (error) return { error: error.message }
  revalidatePath(`/clientes/${companyId}/monitoramento`)
  return { success: true }
}

export async function toggleMonitoredUrlAction(id: string, companyId: string, isActive: boolean) {
  const supabase = await createClient()
  await supabase.from('monitored_urls').update({ is_active: isActive } as never).eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}

export async function deleteMonitoredUrlAction(id: string, companyId: string) {
  const supabase = await createClient()
  await supabase.from('monitored_urls').delete().eq('id', id)
  revalidatePath(`/clientes/${companyId}/monitoramento`)
}
