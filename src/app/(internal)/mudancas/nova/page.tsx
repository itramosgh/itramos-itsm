import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ChangeRequestForm } from '@/components/mudancas/ChangeRequestForm'

export default async function NovaMudancaPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket_id?: string; ticket_title?: string }>
}) {
  const { ticket_id, ticket_title } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: analysts }, { data: contacts }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('contacts').select('id, full_name, email').eq('is_active', true).order('full_name'),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nova GMUD</h1>
      <ChangeRequestForm
        analysts={(analysts as any[]) ?? []}
        allContacts={(contacts as any[]) ?? []}
        originTicketId={ticket_id}
        originTicketTitle={ticket_title ? decodeURIComponent(ticket_title) : undefined}
      />
    </div>
  )
}
