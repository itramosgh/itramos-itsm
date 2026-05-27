import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const announcementId = formData.get('announcement_id') as string
  if (!file || !announcementId) {
    return NextResponse.json({ error: 'Arquivo e announcement_id são obrigatórios' }, { status: 400 })
  }

  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${announcementId}/${Date.now()}_${safeFilename}`
  const buffer = await file.arrayBuffer()

  const serviceSupabase = await createServiceClient()
  const { error: uploadError } = await serviceSupabase.storage
    .from('announcements')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: dbError } = await serviceSupabase.from('announcement_attachments').insert({
    announcement_id: announcementId,
    filename: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  } as never)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ success: true, path })
}
