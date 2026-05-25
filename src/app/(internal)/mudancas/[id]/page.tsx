import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangeRequestDetail } from '@/components/mudancas/ChangeRequestDetail'

export default async function MudancaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }

  const { data: cr } = await supabase
    .from('change_requests')
    .select(`
      *, profiles!responsible_id(full_name),
      origin_ticket:origin_ticket_id(number, title),
      change_request_contacts(id, external_email, external_name, contacts(full_name, email))
    `)
    .eq('id', id)
    .single() as { data: any }

  if (!cr) notFound()

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name')

  return (
    <ChangeRequestDetail
      cr={cr}
      companyContacts={(contacts as any[]) ?? []}
    />
  )
}
