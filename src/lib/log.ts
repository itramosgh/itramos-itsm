import type { Database, Json } from '@/types/database'
import type { createServiceClient } from '@/lib/supabase/server'

type LogInsert = Database['public']['Tables']['system_logs']['Insert']
type SupabaseServiceClient = Awaited<ReturnType<typeof createServiceClient>>

export function buildLogEntry(
  category: LogInsert['category'],
  status: LogInsert['status'],
  description: string,
  details?: Record<string, unknown> | null
): LogInsert {
  return { category, status, description, details: (details ?? null) as Json | null }
}

export async function insertLog(
  supabase: SupabaseServiceClient,
  category: LogInsert['category'],
  status: LogInsert['status'],
  description: string,
  details?: Record<string, unknown>
) {
  await supabase.from('system_logs').insert(buildLogEntry(category, status, description, details) as never)
}
