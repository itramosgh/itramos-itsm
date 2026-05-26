import Link from 'next/link'
import { TicketStatusBadge } from './TicketStatusBadge'
import { SLAIndicator } from './SLAIndicator'
import { fmtDate, fmtDateTimeShort } from '@/lib/format-date'
import type { TicketStatus, TicketPriority } from '@/types/database'

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  critica: '🔴 Crítica', alta: '🟠 Alta', media: '🟡 Média', baixa: '🟢 Baixa',
}

interface Ticket {
  id: string; number: number; title: string; status: TicketStatus
  priority: TicketPriority; created_at: string; sla_deadline: string | null
  sla_first_response_at: string | null; sla_met: boolean | null
  sla_paused_at: string | null; scheduled_at: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
}

export function TicketList({ tickets }: { tickets: Ticket[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-3 text-left">#</th>
            <th className="p-3 text-left">Título</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Prioridade</th>
            <th className="p-3 text-left">Empresa</th>
            <th className="p-3 text-left">SLA</th>
            <th className="p-3 text-left">Aberto em</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className="p-3 font-mono text-xs">#{t.number}</td>
              <td className="p-3">
                <Link href={`/chamados/${t.id}`} className="hover:underline font-medium">{t.title}</Link>
                {t.scheduled_at && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    📅 Agendado: {fmtDateTimeShort(t.scheduled_at)}
                  </p>
                )}
              </td>
              <td className="p-3"><TicketStatusBadge status={t.status} /></td>
              <td className="p-3 text-xs">{PRIORITY_LABELS[t.priority]}</td>
              <td className="p-3 text-xs">{t.companies?.name ?? '—'}</td>
              <td className="p-3">
                <SLAIndicator createdAt={t.created_at} slaDeadline={t.sla_deadline} slaFirstResponseAt={t.sla_first_response_at} slaMet={t.sla_met} slaPausedAt={t.sla_paused_at} />
              </td>
              <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(t.created_at)}</td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum chamado encontrado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
