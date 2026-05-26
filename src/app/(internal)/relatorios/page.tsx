import Link from 'next/link'
import { LineChart, GitMerge, Monitor, FileText, BarChart2, SlidersHorizontal } from 'lucide-react'

const sections = [
  { href: '/relatorios/operacional', label: 'Dashboard Operacional', description: 'Visão geral de chamados, SLA e desempenho da equipe', icon: LineChart },
  { href: '/relatorios/mudancas', label: 'Dashboard de Mudanças', description: 'Acompanhamento de GMUDs e aprovações', icon: GitMerge },
  { href: '/relatorios/monitoramento', label: 'Dashboard de Monitoramento', description: 'Status de alertas, URLs e integrações', icon: Monitor },
  { href: '/relatorios/mensal', label: 'Relatório Mensal', description: 'Resumo mensal de atendimentos e indicadores', icon: FileText },
  { href: '/relatorios/custos', label: 'Relatório de Custos', description: 'Horas e deslocamentos faturáveis por cliente', icon: BarChart2 },
  { href: '/relatorios/personalizado', label: 'Relatório Personalizado', description: 'Filtros por período, cliente, analista, prioridade e mais — exportável em CSV', icon: SlidersHorizontal },
]

export default function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground mt-1">Selecione um relatório ou dashboard</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {sections.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/60 hover:border-primary/40"
          >
            <Icon className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
