'use server'
import { createServiceClient } from '@/lib/supabase/server'

// ─── Storage stats ────────────────────────────────────────────────────────────

export async function getStorageStats() {
  const supabase = await createServiceClient()
  const [tickets, announcements, kbDocs, logos, tasks, meetings, gmud, kbArticles] = await Promise.all([
    supabase.storage.from('ticket-attachments').list('', { limit: 2000 }),
    supabase.storage.from('announcement-attachments').list('', { limit: 2000 }),
    supabase.storage.from('kb-documents').list('', { limit: 2000 }),
    supabase.storage.from('logos').list('', { limit: 100 }),
    supabase.storage.from('task-attachments').list('', { limit: 2000 }),
    supabase.storage.from('meeting-attachments').list('', { limit: 2000 }),
    supabase.storage.from('gmud-attachments').list('', { limit: 2000 }),
    supabase.storage.from('kb-article-attachments').list('', { limit: 2000 }),
  ])
  const sumBytes = (files: { metadata?: { size?: number } | null }[] | null) =>
    (files ?? []).reduce((acc, f) => acc + (f.metadata?.size ?? 0), 0)
  return {
    ticketAttachments:  { count: tickets.data?.length ?? 0,      bytes: sumBytes(tickets.data) },
    announcements:      { count: announcements.data?.length ?? 0, bytes: sumBytes(announcements.data) },
    kbDocuments:        { count: kbDocs.data?.length ?? 0,        bytes: sumBytes(kbDocs.data) },
    logos:              { count: logos.data?.length ?? 0,          bytes: sumBytes(logos.data) },
    taskAttachments:    { count: tasks.data?.length ?? 0,          bytes: sumBytes(tasks.data) },
    meetingAttachments: { count: meetings.data?.length ?? 0,       bytes: sumBytes(meetings.data) },
    gmudAttachments:    { count: gmud.data?.length ?? 0,           bytes: sumBytes(gmud.data) },
    kbArticleAttachments: { count: kbArticles.data?.length ?? 0,  bytes: sumBytes(kbArticles.data) },
  }
}

// ─── DB table sizes ───────────────────────────────────────────────────────────

export async function getDbTableSizes(): Promise<{ table_name: string; row_count: number; total_bytes: number }[]> {
  const supabase = await createServiceClient()
  const { data, error } = await supabase.rpc('get_table_sizes') as { data: any; error: any }
  if (error) return []
  return (data ?? []).map((r: any) => ({
    table_name: r.table_name,
    row_count: Number(r.row_count),
    total_bytes: Number(r.total_bytes),
  }))
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export type CleanupType = 'chamados' | 'gmud' | 'reunioes' | 'tarefas'

async function fetchCleanupCandidates(supabase: any, type: CleanupType, cutoff: Date) {
  const iso = cutoff.toISOString()

  if (type === 'chamados') {
    const { data } = await supabase
      .from('ticket_attachments')
      .select('id, storage_path, size_bytes, tickets!inner(closed_at)')
      .eq('is_deleted', false)
      .lt('tickets.closed_at', iso)
    return (data ?? []) as any[]
  }

  if (type === 'gmud') {
    const { data } = await supabase
      .from('change_request_attachments')
      .select('id, storage_path, size_bytes, change_requests!inner(status, updated_at)')
      .in('change_requests.status', ['concluida', 'revertida', 'reprovada'])
      .lt('change_requests.updated_at', iso)
    return (data ?? []) as any[]
  }

  if (type === 'reunioes') {
    const { data } = await supabase
      .from('meeting_attachments')
      .select('id, storage_path, size_bytes, meetings!inner(status, scheduled_at)')
      .in('meetings.status', ['realizada', 'cancelada'])
      .lt('meetings.scheduled_at', iso)
    return (data ?? []) as any[]
  }

  if (type === 'tarefas') {
    const { data } = await supabase
      .from('task_attachments')
      .select('id, storage_path, size_bytes, tasks!inner(status, created_at)')
      .eq('tasks.status', 'concluida')
      .lt('tasks.created_at', iso)
    return (data ?? []) as any[]
  }

  return []
}

const BUCKET_MAP: Record<CleanupType, string> = {
  chamados: 'ticket-attachments',
  gmud: 'gmud-attachments',
  reunioes: 'meeting-attachments',
  tarefas: 'task-attachments',
}

export async function previewCleanup(monthsOld: number, type: CleanupType) {
  const supabase = await createServiceClient()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - monthsOld)

  const attachments = await fetchCleanupCandidates(supabase, type, cutoff)
  const fileCount = attachments.length
  const totalBytes = attachments.reduce((sum: number, a: any) => sum + (a.size_bytes ?? 0), 0)
  return { fileCount, totalBytes }
}

export async function executeCleanupAction(monthsOld: number, type: CleanupType) {
  const supabase = await createServiceClient()
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - monthsOld)

  const attachments = await fetchCleanupCandidates(supabase, type, cutoff)
  if (!attachments.length) return { deleted: 0 }

  const paths = attachments.map((a: any) => a.storage_path)
  const bucket = BUCKET_MAP[type]

  for (let i = 0; i < paths.length; i += 100) {
    await supabase.storage.from(bucket).remove(paths.slice(i, i + 100))
  }

  const ids = attachments.map((a: any) => a.id)

  if (type === 'chamados') {
    await supabase.from('ticket_attachments').update({ is_deleted: true } as never).in('id', ids)
  } else if (type === 'gmud') {
    await supabase.from('change_request_attachments').delete().in('id', ids)
  } else if (type === 'reunioes') {
    await supabase.from('meeting_attachments').delete().in('id', ids)
  } else if (type === 'tarefas') {
    await supabase.from('task_attachments').delete().in('id', ids)
  }

  return { deleted: attachments.length }
}
