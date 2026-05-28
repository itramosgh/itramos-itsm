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
  priority: TicketPriority; created_at: string; sla_starts_at: string | null
  sla_deadline: string | null; sla_first_response_at: string | null
  sla_met: boolean | null; sla_paused_at: string | null; scheduled_at: string | null
  channel?: string | null
  companies: { name: string } | null
  contacts: { full_name: string } | null
  profiles: { full_name: string } | null
}

export function TicketList({ tickets }: { tickets: Ticket[] }) {
  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-3 py-2 text-left font-medium">#</th>
            <th className="px-3 py-2 text-left font-medium">Título</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Prioridade</th>
            <th className="px-3 py-2 text-left font-medium">Empresa</th>
            <th className="px-3 py-2 text-left font-medium">Analista</th>
            <th className="px-3 py-2 text-left font-medium">SLA</th>
            <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Aberto em</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id} className="border-b hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">#{t.number}</td>
              <td className="px-3 py-2 max-w-[260px]">
                <Link href={`/chamados/${t.id}`} className="hover:underline font-medium text-sm leading-snug line-clamp-2">{t.title}</Link>
                {t.channel === 'recorrente' && (
                  <span className="inline-flex items-center text-xs text-blue-600 font-medium mt-0.5">
                    🔁 Recorrente
                  </span>
                )}
                {t.scheduled_at && (
                  <p className="text-xs text-blue-600 mt-0.5">
                    📅 {fmtDateTimeShort(t.scheduled_at)}
                  </p>
                )}
              </td>
              <td className="px-3 py-2"><TicketStatusBadge status={t.status} /></td>
              <td className="px-3 py-2 whitespace-nowrap">{PRIORITY_LABELS[t.priority]}</td>
              <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{t.companies?.name ?? '—'}</td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                {t.profiles?.full_name ?? <span className="text-muted-foreground/50">—</span>}
              </td>
              <td className="px-3 py-2">
                <SLAIndicator createdAt={t.created_at} updatedAt={t.updated_at} slaStartsAt={t.sla_starts_at ?? null} slaDeadline={t.sla_deadline} slaFirstResponseAt={t.sla_first_response_at} slaMet={t.sla_met} slaPausedAt={t.sla_paused_at} status={t.status} />
              </td>
              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{fmtDateTimeShort(t.created_at)}</td>
            </tr>
          ))}
          {tickets.length === 0 && (
            <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum chamado encontrado.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
