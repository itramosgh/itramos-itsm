'use server'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { announcementSchema, announcementSettingsSchema } from '@/lib/validations/announcement'

export async function createAnnouncementAction(formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries())
  if (!raw.scheduled_at) delete raw.scheduled_at
  const depts = formData.getAll('recipient_departments')
  if (depts.length > 0) raw.recipient_departments = depts

  const parsed = announcementSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      ...parsed.data,
      status: parsed.data.scheduled_at ? 'agendado' : 'rascunho',
      created_by: user!.id,
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (error) return { error: error.message }

  revalidatePath('/comunicados')
  return { success: true, id: announcement!.id }
}

export async function updateAnnouncementAction(id: string, formData: FormData) {
  const raw: Record<string, unknown> = Object.fromEntries(formData.entries())
  if (!raw.scheduled_at) delete raw.scheduled_at
  const depts = formData.getAll('recipient_departments')
  if (depts.length > 0) raw.recipient_departments = depts
  const contactIds = formData.getAll('recipient_contact_ids') as string[]

  const parsed = announcementSettingsSchema.safeParse(raw)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({
      ...parsed.data,
      status: parsed.data.scheduled_at ? 'agendado' : 'rascunho',
    } as never)
    .eq('id', id)

  if (error) return { error: error.message }

  if (parsed.data.recipient_type === 'manual') {
    await supabase.from('announcement_recipients' as never).delete().eq('announcement_id' as never, id)
    if (contactIds.length > 0) {
      await supabase.from('announcement_recipients' as never).insert(
        contactIds.map(contactId => ({ announcement_id: id, contact_id: contactId })) as never
      )
    }
  }

  revalidatePath('/comunicados')
  revalidatePath(`/comunicados/${id}`)
  return { success: true }
}

export async function saveBodyAction(id: string, bodyHtml: string, bodyRichText: object) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ body_html: bodyHtml, body_rich_text: bodyRichText } as never)
    .eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

export async function cancelAnnouncementAction(id: string) {
  const supabase = await createClient()
  await supabase.from('announcements').update({ status: 'cancelado' } as never).eq('id', id)
  revalidatePath('/comunicados')
}

export async function deleteAnnouncementAction(id: string) {
  const supabase = await createClient()
  await supabase.from('announcements').delete().eq('id', id)
  revalidatePath('/comunicados')
}

async function resolveAnnouncementRecipients(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ann: any
): Promise<Array<{ id: string; email: string; full_name: string }>> {
  if (ann.recipient_type === 'all') {
    const { data } = await supabase.from('contacts').select('id, email, full_name').eq('is_active', true)
    return data ?? []
  }
  if (ann.recipient_type === 'company') {
    const { data } = await supabase.from('contacts').select('id, email, full_name')
      .eq('company_id', ann.recipient_company_id).eq('is_active', true)
    return data ?? []
  }
  if (ann.recipient_type === 'department') {
    const { data } = await supabase.from('contacts').select('id, email, full_name')
      .in('department', ann.recipient_departments ?? []).eq('is_active', true)
    return data ?? []
  }
  // manual
  const { data } = await supabase.from('announcement_recipients')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select('contacts(id, email, full_name)').eq('announcement_id', ann.id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.contacts).filter(Boolean)
}

export async function sendAnnouncementAction(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Não autenticado' }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'gestor'].includes((profile as any)?.role)) {
    return { error: 'Sem permissão para enviar comunicados' }
  }

  const serviceSupabase = await createServiceClient()

  const { data: ann } = (await supabase.from('announcements').select('*').eq('id', id).single()) as { data: any }
  if (!ann) return { error: 'Comunicado não encontrado' }
  if (!['rascunho', 'agendado'].includes(ann.status)) return { error: 'Comunicado já enviado ou cancelado' }
  if (!ann.body_html) return { error: 'Conteúdo do comunicado está vazio' }

  const recipients = await resolveAnnouncementRecipients(serviceSupabase, ann)
  if (recipients.length === 0) return { error: 'Nenhum destinatário encontrado' }

  const { data: settings } = (await (serviceSupabase as any)
    .from('platform_settings')
    .select('email_from_name, email_from_address, logo_light_url, company_name')
    .single()) as { data: any }

  const { wrapEmailHtml } = await import('@/lib/email-template-sender')
  const { sendEmail, buildFromAddress } = await import('@/lib/email')

  // Buscar e baixar anexos do Storage
  const { data: attachments } = (await (serviceSupabase as any)
    .from('announcement_attachments')
    .select('filename, storage_path, mime_type')
    .eq('announcement_id', id)) as { data: any[] | null }

  const emailAttachments: Array<{ filename: string; content: Buffer; contentType?: string }> = []
  for (const att of attachments ?? []) {
    const { data: fileData } = await (serviceSupabase as any).storage
      .from('announcements').download(att.storage_path)
    if (fileData) {
      emailAttachments.push({
        filename: att.filename,
        content: Buffer.from(await (fileData as Blob).arrayBuffer()),
        contentType: att.mime_type ?? undefined,
      })
    }
  }

  const wrappedHtml = wrapEmailHtml(ann.body_html, {
    logoUrl: settings?.logo_light_url ?? null,
    companyName: settings?.company_name ?? null,
  })
  const from = buildFromAddress(settings?.email_from_name ?? null, settings?.email_from_address ?? null)

  let sent = 0
  for (const recipient of recipients) {
    try {
      await sendEmail({
        to: recipient.email,
        subject: ann.subject,
        html: wrappedHtml,
        from,
        ...(emailAttachments.length > 0 ? { attachments: emailAttachments } : {}),
      })
      sent++
    } catch (e) {
      console.error(`Erro ao enviar comunicado para ${recipient.email}:`, e)
    }
  }

  await supabase
    .from('announcements')
    .update({ status: 'enviado', sent_at: new Date().toISOString(), recipient_count: sent } as never)
    .eq('id', id)

  await (serviceSupabase as any).from('system_logs').insert({
    category: 'email_sent',
    status: 'success',
    description: `Comunicado "${ann.subject}" enviado para ${sent} destinatários`,
  } as never)

  revalidatePath('/comunicados')
  return { success: true, sent }
}
