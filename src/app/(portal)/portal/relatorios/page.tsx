import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export default async function PortalRelatoriosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Relatórios</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <Link href="/portal/relatorios/mensal" className="border rounded-lg p-6 hover:bg-muted/30 transition-colors space-y-2">
          <h2 className="font-semibold text-lg">Relatório Mensal</h2>
          <p className="text-sm text-muted-foreground">
            Gere o relatório mensal em PDF com chamados, reuniões, mudanças e monitoramento do período selecionado.
          </p>
        </Link>
        <Link href="/portal/relatorios/personalizado" className="border rounded-lg p-6 hover:bg-muted/30 transition-colors space-y-2">
          <h2 className="font-semibold text-lg">Relatório Personalizado</h2>
          <p className="text-sm text-muted-foreground">
            Filtre e visualize chamados por período, categoria e prioridade com KPIs detalhados.
          </p>
        </Link>
      </div>
    </div>
  )
}
