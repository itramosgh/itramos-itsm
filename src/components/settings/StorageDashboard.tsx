import { StorageCleanupDialog } from './StorageCleanupDialog'

type BucketStats = { count: number; bytes: number }

type Stats = {
  ticketAttachments: BucketStats
  announcements: BucketStats
  kbDocuments: BucketStats
  logos: BucketStats
  taskAttachments: BucketStats
  meetingAttachments: BucketStats
  gmudAttachments: BucketStats
  kbArticleAttachments: BucketStats
}

type DbTable = { table_name: string; row_count: number; total_bytes: number }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const bucketLabels: { key: keyof Stats; label: string }[] = [
  { key: 'ticketAttachments',    label: 'Anexos de Chamados' },
  { key: 'gmudAttachments',      label: 'Anexos de GMUD' },
  { key: 'meetingAttachments',   label: 'Anexos de Reuniões' },
  { key: 'taskAttachments',      label: 'Anexos de Tarefas' },
  { key: 'announcements',        label: 'Anexos de Comunicados' },
  { key: 'kbDocuments',          label: 'Documentos Base de Conhecimento' },
  { key: 'kbArticleAttachments', label: 'Anexos de Artigos KB' },
  { key: 'logos',                label: 'Logos' },
]

interface Props {
  stats: Stats
  dbTables: DbTable[]
}

export function StorageDashboard({ stats, dbTables }: Props) {
  const totalStorageBytes = Object.values(stats).reduce((acc, s) => acc + s.bytes, 0)
  const totalDbBytes = dbTables.reduce((acc, t) => acc + t.total_bytes, 0)

  return (
    <div className="space-y-8">

      {/* Storage por bucket */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Storage por bucket</h2>
          <span className="text-sm text-muted-foreground">Total: {formatBytes(totalStorageBytes)}</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {bucketLabels.map(({ key, label }) => (
            <div key={key} className="rounded-lg border p-4 space-y-1">
              <p className="text-xs text-muted-foreground leading-tight">{label}</p>
              <p className="text-2xl font-semibold">{stats[key].count}</p>
              <p className="text-xs text-muted-foreground">{formatBytes(stats[key].bytes)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tamanho das tabelas do banco */}
      {dbTables.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">Tabelas do banco de dados</h2>
            <span className="text-sm text-muted-foreground">Total: {formatBytes(totalDbBytes)}</span>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2 font-medium">Tabela</th>
                  <th className="text-right px-4 py-2 font-medium">Linhas</th>
                  <th className="text-right px-4 py-2 font-medium">Tamanho total</th>
                </tr>
              </thead>
              <tbody>
                {dbTables.map(t => (
                  <tr key={t.table_name} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{t.table_name}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{t.row_count.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{formatBytes(t.total_bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Limpeza */}
      <section className="space-y-3">
        <h2 className="text-base font-medium">Limpeza de arquivos</h2>
        <StorageCleanupDialog />
      </section>

    </div>
  )
}
