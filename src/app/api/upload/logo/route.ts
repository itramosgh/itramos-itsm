import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const role = user.app_metadata?.role as string
  if (!['admin', 'gestor'].includes(role)) {
    return NextResponse.json({ error: 'Apenas admin e gestor podem fazer upload' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const variant = formData.get('variant') as string

  if (!file || !['light', 'dark'].includes(variant)) {
    return NextResponse.json({ error: 'Arquivo ou variante inválidos' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()
  const path = `logo-${variant}.${ext}`
  const buffer = await file.arrayBuffer()

  const { error } = await supabase.storage
    .from('logos')
    .upload(path, buffer, { contentType: file.type, upsert: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = supabase.storage.from('logos').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
