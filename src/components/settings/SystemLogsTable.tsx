'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Database } from '@/types/database'

type Log = Database['public']['Tables']['system_logs']['Row']

interface Props {
  logs: Log[]
}

const CATEGORIES = ['email_sent', 'email_received', 'webhook_received', 'url_monitoring', 'cron_job', 'approval', 'auth'] as const

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString('pt-BR')
}

export function SystemLogsTable({ logs }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.push(`?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <div>
          <label className="text-sm font-medium mr-2">Categoria</label>
          <select
            value={searchParams.get('category') ?? ''}
            onChange={(e) => handleFilter('category', e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">Todas</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium mr-2">Status</label>
          <select
            value={searchParams.get('status') ?? ''}
            onChange={(e) => handleFilter('status', e.target.value)}
            className="border rounded-md px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            <option value="success">Sucesso</option>
            <option value="failure">Falha</option>
          </select>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Data/Hora</th>
              <th className="text-left px-4 py-2 font-medium">Categoria</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Descrição</th>
              <th className="text-left px-4 py-2 font-medium">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum log encontrado.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <LogRow key={log.id} log={log} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LogRow({ log }: { log: Log }) {
  return (
    <tr className="border-t hover:bg-muted/50">
      <td className="px-4 py-2 whitespace-nowrap">{formatDate(log.created_at)}</td>
      <td className="px-4 py-2">
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {log.category}
        </span>
      </td>
      <td className="px-4 py-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
          log.status === 'success'
            ? 'bg-green-100 text-green-800'
            : 'bg-red-100 text-red-800'
        }`}>
          {log.status === 'success' ? 'Sucesso' : 'Falha'}
        </span>
      </td>
      <td className="px-4 py-2">{log.description}</td>
      <td className="px-4 py-2">
        {log.details && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Ver detalhes
            </summary>
            <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-w-xs">
              {JSON.stringify(log.details, null, 2)}
            </pre>
          </details>
        )}
      </td>
    </tr>
  )
}
