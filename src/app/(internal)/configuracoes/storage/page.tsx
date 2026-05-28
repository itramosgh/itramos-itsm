import { getStorageStats, getDbTableSizes } from './actions'
import { StorageDashboard } from '@/components/settings/StorageDashboard'

export default async function StoragePage() {
  const [stats, dbTables] = await Promise.all([
    getStorageStats(),
    getDbTableSizes(),
  ])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Armazenamento</h1>
      <StorageDashboard stats={stats} dbTables={dbTables} />
    </div>
  )
}
