import { getStorageStats } from './actions'
import { StorageDashboard } from '@/components/settings/StorageDashboard'

export default async function StoragePage() {
  const stats = await getStorageStats()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Armazenamento</h1>
      <StorageDashboard stats={stats} />
    </div>
  )
}
