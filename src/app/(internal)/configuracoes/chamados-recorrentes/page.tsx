import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecurringTicketForm } from '@/components/settings/RecurringTicketForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toggleRecurringTemplateAction, deleteRecurringTemplateAction } from './actions'

const FREQUENCY_LABELS: Record<string, string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  personalizado: 'Personalizado',
}

export default async function ChamadosRecorrentesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) redirect('/dashboard')

  const [
    { data: templates },
    { data: companies },
    { data: allContacts },
    { data: categories },
  ] = await Promise.all([
    supabase.from('recurring_ticket_templates')
      .select('*, companies(name), contacts(full_name), ticket_categories(name)')
      .order('created_at', { ascending: false }) as unknown as Promise<{ data: any[] | null }>,
    supabase.from('companies').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('contacts').select('id, full_name, company_id').eq('is_active', true).order('full_name') as unknown as Promise<{ data: any[] | null }>,
    supabase.from('ticket_categories').select('id, name').eq('is_active', true).order('name') as unknown as Promise<{ data: any[] | null }>,
  ])

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Chamados Recorrentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Templates criados automaticamente em intervalos definidos por cliente.
        </p>
      </div>

      {(templates ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-medium">Templates cadastrados</h2>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Cliente</th>
                  <th className="text-left px-4 py-2 font-medium">Título</th>
                  <th className="text-left px-4 py-2 font-medium">Frequência</th>
                  <th className="text-left px-4 py-2 font-medium">Próxima execução</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {(templates ?? []).map((t: any) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 text-muted-foreground">{t.companies?.name ?? '—'}</td>
                    <td className="px-4 py-2 font-medium">{t.title}</td>
                    <td className="px-4 py-2">
                      {t.frequency === 'personalizado'
                        ? `A cada ${t.interval_days} dias`
                        : FREQUENCY_LABELS[t.frequency] ?? t.frequency}
                    </td>
                    <td className="px-4 py-2">
                      {new Date(t.next_run_at + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={t.is_active ? 'default' : 'outline'}>
                        {t.is_active ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <form action={toggleRecurringTemplateAction.bind(null, t.id, !t.is_active) as unknown as (formData: FormData) => void | Promise<void>}>
                          <Button type="submit" variant="outline" size="sm">
                            {t.is_active ? 'Pausar' : 'Reativar'}
                          </Button>
                        </form>
                        <form action={deleteRecurringTemplateAction.bind(null, t.id) as unknown as (formData: FormData) => void | Promise<void>}>
                          <Button type="submit" variant="ghost" size="sm"
                            className="text-destructive hover:text-destructive">
                            Excluir
                          </Button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-medium">Novo template</h2>
        <RecurringTicketForm
          companies={companies ?? []}
          allContacts={allContacts ?? []}
          categories={categories ?? []}
        />
      </section>
    </div>
  )
}
