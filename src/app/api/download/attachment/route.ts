// src/app/api/download/attachment/route.ts
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { INTERNAL_ROLES } from '@/lib/auth'

// Buckets que usuários internos podem acessar
const INTERNAL_BUCKETS = ['announcements', 'gmud-attachments', 'meeting-attachments', 'task-attachments', 'kb-article-attachments']

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

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  if (bucket === 'ticket-attachments') {
    // ticketId é o primeiro segmento do path: "{ticketId}/sem_interacao/{filename}"
    const ticketId = storagePath.split('/')[0]
    if (!UUID_RE.test(ticketId)) {
      return NextResponse.json({ error: 'Path inválido' }, { status: 400 })
    }
    const { data: profile } = await serviceSupabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !INTERNAL_ROLES.includes((profile as any).role)) {
      // Usuário de portal: verificar que o ticket pertence à sua empresa
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [contactResult, ticketResult] = await Promise.all([
        serviceSupabase.from('contacts').select('company_id').eq('user_id', user.id).single(),
        serviceSupabase.from('tickets').select('company_id').eq('id', ticketId).single(),
      ])
      const contact = contactResult.data as any
      const ticket = ticketResult.data as any
      if (!contact?.company_id || !ticket?.company_id || contact.company_id !== ticket.company_id) {
        return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
      }
    }
    // Usuário interno: acesso liberado
  } else if (INTERNAL_BUCKETS.includes(bucket)) {
    const { data: profile } = await serviceSupabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!profile || !INTERNAL_ROLES.includes((profile as any).role)) return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
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
