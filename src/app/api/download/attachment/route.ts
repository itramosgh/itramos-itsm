// src/app/api/download/attachment/route.ts
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Buckets que usuários internos podem acessar
const INTERNAL_BUCKETS = ['announcements', 'gmud-attachments', 'meeting-attachments', 'task-attachments']

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const bucket = searchParams.get('bucket')
  const storagePath = searchParams.get('path')
  if (!bucket || !storagePath) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 })
  }

  const serviceSupabase = await createServiceClient()

  if (bucket === 'ticket-attachments') {
    // ticketId é o primeiro segmento do path: "{ticketId}/sem_interacao/{filename}"
    const ticketId = storagePath.split('/')[0]
    const { data: profile } = await serviceSupabase
      .from('profiles').select('id').eq('id', user.id).single()
    if (!profile) {
      // Usuário de portal: verificar que o ticket pertence à sua empresa
      const [{ data: contact }, { data: ticket }] = await Promise.all([
        serviceSupabase.from('contacts').select('company_id').eq('user_id', user.id).single(),
        serviceSupabase.from('tickets').select('company_id').eq('id', ticketId).single(),
      ])
      if (!contact || !ticket || contact.company_id !== ticket.company_id) {
        return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
      }
    }
    // Usuário interno: acesso liberado
  } else if (INTERNAL_BUCKETS.includes(bucket)) {
    const { data: profile } = await serviceSupabase
      .from('profiles').select('id').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
  } else {
    return NextResponse.json({ error: 'Bucket inválido' }, { status: 400 })
  }

  const { data, error } = await serviceSupabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, 3600)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Erro ao gerar URL' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
