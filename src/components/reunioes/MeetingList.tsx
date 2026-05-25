import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

type Meeting = {
  id: string
  title: string
  scheduled_at: string
  status: string
  companies: { name: string } | null
}

const statusVariants: Record<string, 'default' | 'outline' | 'secondary'> = {
  agendada: 'secondary',
  realizada: 'default',
  cancelada: 'outline',
}

export function MeetingList({ meetings }: { meetings: Meeting[] }) {
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 font-medium">Pauta</th>
            <th className="text-left px-4 py-3 font-medium">Cliente</th>
            <th className="text-left px-4 py-3 font-medium">Data</th>
            <th className="text-left px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {meetings.map(m => (
            <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-3">
                <Link href={`/reunioes/${m.id}`} className="hover:underline font-medium">{m.title}</Link>
              </td>
              <td className="px-4 py-3 text-muted-foreground">{m.companies?.name}</td>
              <td className="px-4 py-3">
                {new Date(m.scheduled_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="px-4 py-3">
                <Badge variant={statusVariants[m.status] ?? 'outline'}>{m.status}</Badge>
              </td>
            </tr>
          ))}
          {meetings.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                Nenhuma reunião encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
