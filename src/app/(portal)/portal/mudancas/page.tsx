import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'

const RISK_LABELS: Record<string, string> = {
  baixo: 'Baixo', medio: 'Médio', alto: 'Alto', critico: 'Crítico',
}
const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho', aguardando_aprovacao: 'Ag. aprovação',
  aprovada: 'Aprovada', em_execucao: 'Em execução', concluida: 'Concluída', cancelada: 'Cancelada',
}
const RISK_VARIANTS: Record<string, 'default' | 'outline' | 'destructive'> = {
  baixo: 'outline', medio: 'outline', alto: 'destructive', critico: 'destructive',
}

export default async function PortalMudancasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const { data: contact } = await supabase
    .from('contacts')
    .select('company_id')
    .eq('user_id', user.id)
    .single() as { data: { company_id: string } | null }

  if (!contact) notFound()

  const { data: changes } = await supabase
    .from('change_requests')
    .select('id, title, status, risk_level, maintenance_start, maintenance_end')
    .eq('company_id', contact.company_id)
    .order('maintenance_start', { ascending: false }) as { data: any[] | null }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Gestão de Mudanças</h1>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Título</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">Risco</th>
              <th className="text-left px-4 py-3 font-medium">Janela de manutenção</th>
            </tr>
          </thead>
          <tbody>
            {(changes ?? []).map(c => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.title}</td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{STATUS_LABELS[c.status] ?? c.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={RISK_VARIANTS[c.risk_level] ?? 'outline'}>
                    {RISK_LABELS[c.risk_level] ?? c.risk_level}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {c.maintenance_start
                    ? new Date(c.maintenance_start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'}
                  {c.maintenance_end && ` → ${new Date(c.maintenance_end).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                </td>
              </tr>
            ))}
            {(changes ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma mudança registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
