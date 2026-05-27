import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ticketSchema } from '@/lib/validations/ticket'
import { NovoChamadoPortalForm } from './NovoChamadoPortalForm'

async function createPortalTicketAction(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user.id)
    .single() as { data: any }

  if (!contact) return

  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    category_id: formData.get('category_id') || undefined,
    priority: formData.get('priority') ?? 'media',
    channel: 'portal',
    company_id: contact.company_id,
    contact_id: contact.id,
  })
  if (!parsed.success) return

  const { data: ticket } = await supabase
    .from('tickets')
    .insert(parsed.data as never)
    .select('id')
    .single<{ id: string }>()

  if (ticket) {
    const { calculateTicketSLAForCompany } = await import('@/lib/ticket-sla')
    const sla = await calculateTicketSLAForCompany(supabase, {
      companyId: contact.company_id,
      priority: parsed.data.priority,
      createdAt: new Date(),
    })
    if (sla) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('tickets') as any)
        .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at })
        .eq('id', ticket.id)
    }
  }

  redirect('/portal/chamados')
}

export default async function NovoChamadoPortalPage() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: categories } = await supabase
    .from('ticket_categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name') as { data: any[] | null }

  return (
    <div className="p-6 space-y-4 max-w-4xl">
      <h1 className="text-2xl font-semibold">Abrir novo chamado</h1>
      <NovoChamadoPortalForm
        categories={categories ?? []}
        createAction={createPortalTicketAction}
      />
    </div>
  )
}
