'use server'
import { createServiceClient } from '@/lib/supabase/server'

export async function getStorageStats() {
  const supabase = await createServiceClient()
  const [tickets, announcements, kb, logos] = await Promise.all([
    supabase.storage.from('ticket-attachments').list('', { limit: 1000 }),
    supabase.storage.from('announcement-attachments').list('', { limit: 1000 }),
    supabase.storage.from('kb-documents').list('', { limit: 1000 }),
    supabase.storage.from('logos').list('', { limit: 100 }),
  ])
  const sumBytes = (files: { metadata?: { size?: number } | null }[] | null) =>
    (files ?? []).reduce((acc, f) => acc + (f.metadata?.size ?? 0), 0)
  return {
    ticketAttachments: { count: tickets.data?.length ?? 0, bytes: sumBytes(tickets.data) },
    announcements: { count: announcements.data?.length ?? 0, bytes: sumBytes(announcements.data) },
    kbDocuments: { count: kb.data?.length ?? 0, bytes: sumBytes(kb.data) },
    logos: { count: logos.data?.length ?? 0, bytes: sumBytes(logos.data) },
  }
}

export async function previewCleanup(monthsOld: number, companyId?: string) {
  const supabase = await createServiceClient()
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('ticket_attachments')
    .select('id, storage_path, size_bytes, tickets!inner(closed_at, company_id)')
    .eq('is_deleted', false)
    .lt('tickets.closed_at', cutoffDate.toISOString())

  if (companyId) query = query.eq('tickets.company_id', companyId)

  const { data: attachments } = await query

  const fileCount = (attachments as any[])?.length ?? 0
  const totalBytes = (attachments as any[])?.reduce((sum: number, a: any) => sum + (a.size_bytes ?? 0), 0) ?? 0

  return { fileCount, totalBytes }
}

export async function executeCleanupAction(monthsOld: number, companyId?: string) {
  const supabase = await createServiceClient()
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - monthsOld)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('ticket_attachments')
    .select('id, storage_path, tickets!inner(closed_at, company_id)')
    .eq('is_deleted', false)
    .lt('tickets.closed_at', cutoffDate.toISOString())

  if (companyId) query = query.eq('tickets.company_id', companyId)

  const { data: attachments } = await query
  if (!attachments || (attachments as any[]).length === 0) return { deleted: 0 }

  const paths = (attachments as any[]).map((a: any) => a.storage_path)

  // Deletar do storage em lotes de 100
  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from('ticket-attachments').remove(paths.slice(i, i + 100))
  }

  // Marcar como deletado no banco
  await supabase
    .from('ticket_attachments')
    .update({ is_deleted: true } as never)
    .in('id', (attachments as any[]).map((a: any) => a.id))

  return { deleted: (attachments as any[]).length }
}
