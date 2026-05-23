import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ticketSchema } from '@/lib/validations/ticket'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

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

  await supabase.from('tickets').insert(parsed.data as never)
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
    <div className="p-6 space-y-4 max-w-xl">
      <h1 className="text-2xl font-semibold">Abrir novo chamado</h1>
      <form action={createPortalTicketAction} className="space-y-4">
        <div>
          <Label htmlFor="title">Título *</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Textarea id="description" name="description" rows={4} />
        </div>
        <div>
          <Label htmlFor="priority">Prioridade</Label>
          <select id="priority" name="priority" defaultValue="media" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
        <div>
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Selecionar (opcional)</option>
            {categories?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Button type="submit">Abrir chamado</Button>
      </form>
    </div>
  )
}
