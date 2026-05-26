import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge'
import { fmtDate } from '@/lib/format-date'
import { buttonVariants } from '@/components/ui/button'
import type { TicketStatus } from '@/types/database'

export default async function PortalChamadosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, company_id, full_name')
    .eq('user_id', user!.id)
    .single() as { data: any }

  if (!contact) return <p>Perfil não encontrado.</p>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tickets } = await supabase
    .from('tickets')
    .select('id, number, title, status, priority, created_at')
    .eq('company_id', contact.company_id)
    .order('created_at', { ascending: false }) as { data: any[] | null }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meus Chamados</h1>
        <Link href="/portal/chamados/novo" className={buttonVariants()}>+ Novo chamado</Link>
      </div>
      <div className="space-y-2">
        {tickets?.map(t => (
          <Link key={t.id} href={`/portal/chamados/${t.id}`}>
            <div className="border rounded-md p-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">#{t.number} — {t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(t.created_at)}
                  </p>
                </div>
                <TicketStatusBadge status={t.status as TicketStatus} />
              </div>
            </div>
          </Link>
        ))}
        {tickets?.length === 0 && (
          <p className="text-muted-foreground text-sm">Nenhum chamado aberto.</p>
        )}
      </div>
    </div>
  )
}
