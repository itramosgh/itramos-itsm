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

export async function previewCleanup(_monthsOld: number, _companyId?: string) {
  // Full implementation in sub-spec 2 when ticket-attachments table is defined
  return { fileCount: 0, totalBytes: 0 }
}
