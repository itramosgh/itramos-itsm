import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TicketList } from '@/components/tickets/TicketList'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default async function ChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; assigned_to?: string; company_id?: string }>
}) {
  const { q, status, priority, assigned_to, company_id } = await searchParams
  const supabase = await createClient()

  const [{ data: allAnalysts }, { data: allCompanies }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('companies').select('id, name').eq('is_active', true).order('name'),
  ])

  let query = supabase
    .from('tickets')
    .select('id, number, title, status, priority, created_at, sla_deadline, sla_first_response_at, sla_met, sla_paused_at, scheduled_at, companies(name), contacts(full_name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status as never)
  if (priority) query = query.eq('priority', priority as never)
  if (assigned_to) query = query.eq('assigned_to', assigned_to)
  if (company_id) query = query.eq('company_id', company_id)
  if (q) {
    const numQ = parseInt(q, 10)
    if (!isNaN(numQ)) {
      query = query.eq('number', numQ)
    } else {
      query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
    }
  }

  const { data: tickets } = await query

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chamados</h1>
        <Link href="/chamados/novo" className={buttonVariants()}>+ Novo chamado</Link>
      </div>
      <form className="flex gap-2 flex-wrap">
        <Input name="q" defaultValue={q} placeholder="Buscar por título, número..." className="max-w-sm" />
        <select name="status" defaultValue={status ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">Todos os status</option>
          <option value="aberto">Aberto</option>
          <option value="em_andamento">Em Andamento</option>
          <option value="aguardando_cliente">Aguardando Cliente</option>
          <option value="aguardando_fornecedor">Aguardando Fornecedor</option>
          <option value="aguardando_aprovacao">Aguardando Aprovação</option>
          <option value="agendado">Agendado</option>
          <option value="em_mudanca">Em Mudança</option>
          <option value="resolvido">Resolvido</option>
          <option value="fechado">Fechado</option>
          <option value="reaberto">Reaberto</option>
        </select>
        <select name="priority" defaultValue={priority ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">Todas as prioridades</option>
          <option value="critica">Crítica</option>
          <option value="alta">Alta</option>
          <option value="media">Média</option>
          <option value="baixa">Baixa</option>
        </select>
        <select name="assigned_to" defaultValue={assigned_to ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">Todos os analistas</option>
          {(allAnalysts ?? []).map((a: any) => (
            <option key={a.id} value={a.id}>{a.full_name}</option>
          ))}
        </select>
        <select name="company_id" defaultValue={company_id ?? ''} className="border rounded-md px-3 py-2 text-sm bg-background">
          <option value="">Todas as empresas</option>
          {(allCompanies ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>
      <TicketList tickets={(tickets ?? []) as Parameters<typeof TicketList>[0]['tickets']} />
    </div>
  )
}
