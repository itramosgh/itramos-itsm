import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const BUCKET_MAP: Record<string, string> = {
  'kb-article': 'kb-article-attachments',
  'kb-document': 'kb-documents',
}

export async function POST(request: Request) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type') as string | null

  if (!file) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 })
  if (!type || !BUCKET_MAP[type]) return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Imagem muito grande. Limite: 5 MB.' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'Tipo não permitido. Use JPG, PNG, GIF ou WebP.' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `inline/${crypto.randomUUID()}.${ext}`
  const buffer = await file.arrayBuffer()
  const bucket = BUCKET_MAP[type]

  const serviceClient = await createServiceClient()
  const { error: uploadError } = await serviceClient.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: urlData } = serviceClient.storage.from(bucket).getPublicUrl(path)

  return NextResponse.json({ url: urlData.publicUrl })
}
