import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ticketSchema } from '@/lib/validations/ticket'
import { calculateTicketSLAForCompany } from '@/lib/ticket-sla'
import { NovoChamadoPortalForm } from './NovoChamadoPortalForm'

async function createPortalTicketAction(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id')
    .eq('user_id', user.id)
    .single() as { data: any }

  if (!contact) return { error: 'Contato não encontrado.' }

  const parsed = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description') || undefined,
    category_id: formData.get('category_id') || undefined,
    priority: formData.get('priority') ?? 'media',
    channel: 'portal',
    company_id: contact.company_id,
    contact_id: contact.id,
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  // Usa service client para bypassar RLS no insert
  const serviceSupabase = await createServiceClient()

  const { data: ticket, error: insertError } = await serviceSupabase
    .from('tickets')
    .insert(parsed.data as never)
    .select('id')
    .single<{ id: string }>()

  if (insertError || !ticket) {
    console.error('Erro ao criar chamado portal:', insertError)
    return { error: 'Erro ao abrir o chamado. Tente novamente.' }
  }

  try {
    const sla = await calculateTicketSLAForCompany(serviceSupabase, {
      companyId: contact.company_id,
      priority: parsed.data.priority,
      createdAt: new Date(),
    })
    if (sla) {
      await serviceSupabase
        .from('tickets')
        .update({ sla_deadline: sla.sla_deadline, sla_starts_at: sla.sla_starts_at } as never)
        .eq('id', ticket.id)
    }
  } catch {
    // SLA calc failure doesn't block ticket creation
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
