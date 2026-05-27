import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const serviceSupabase = await createServiceClient()
  const { data } = await serviceSupabase
    .from('task_attachments')
    .select('id, filename, storage_path, mime_type, size_bytes')
    .eq('task_id', id)
    .eq('is_deleted', false)
    .order('created_at')

  return NextResponse.json({ attachments: data ?? [] })
}
