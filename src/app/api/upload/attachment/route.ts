import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File
  const ticketId = formData.get('ticket_id') as string
  const interactionId = formData.get('interaction_id') as string | null

  if (!file || !ticketId) {
    return NextResponse.json({ error: 'Arquivo e ticket_id são obrigatórios' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande. Limite máximo: 10 MB.' }, { status: 400 })
  }

  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = interactionId
    ? `${ticketId}/${interactionId}/${safeFilename}`
    : `${ticketId}/sem_interacao/${safeFilename}`

  const buffer = await file.arrayBuffer()

  const serviceSupabase = await createServiceClient()
  const { error: uploadError } = await serviceSupabase.storage
    .from('ticket-attachments')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await serviceSupabase.from('ticket_attachments').insert({
    ticket_id: ticketId,
    interaction_id: interactionId || null,
    filename: file.name,
    storage_path: path,
    size_bytes: file.size,
    mime_type: file.type,
  } as never)

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json({ success: true, path })
}
