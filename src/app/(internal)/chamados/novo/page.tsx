import { createClient } from '@/lib/supabase/server'
import { TicketForm } from '@/components/tickets/TicketForm'
import { createTicketAction } from '../actions'

export default async function NovoChamadoPage() {
  const supabase = await createClient()
  const [
    { data: companies },
    { data: contacts },
    { data: contracts },
    { data: analysts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name'),
    supabase.from('contracts').select('id, company_id, status'),
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name'),
  ])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Novo Chamado</h1>
      <TicketForm
        action={createTicketAction}
        companies={companies ?? []}
        contacts={contacts ?? []}
        contracts={contracts ?? []}
        analysts={analysts ?? []}
        categories={categories ?? []}
      />
    </div>
  )
}
