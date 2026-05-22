import { StorageCleanupDialog } from './StorageCleanupDialog'

type Stats = {
  ticketAttachments: { count: number; bytes: number }
  announcements: { count: number; bytes: number }
  kbDocuments: { count: number; bytes: number }
  logos: { count: number; bytes: number }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

interface Props {
  stats: Stats
}

const bucketLabels: { key: keyof Stats; label: string }[] = [
  { key: 'ticketAttachments', label: 'Anexos de Chamados' },
  { key: 'announcements', label: 'Anexos de Anúncios' },
  { key: 'kbDocuments', label: 'Documentos da Base de Conhecimento' },
  { key: 'logos', label: 'Logos' },
]

export function StorageDashboard({ stats }: Props) {
  const totalBytes = Object.values(stats).reduce((acc, s) => acc + s.bytes, 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {bucketLabels.map(({ key, label }) => (
          <div key={key} className="rounded-lg border p-4 space-y-1">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{stats[key].count}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(stats[key].bytes)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Uso total</span>
          <span className="text-sm font-medium">{formatBytes(totalBytes)}</span>
        </div>
      </div>

      <StorageCleanupDialog />
    </div>
  )
}
