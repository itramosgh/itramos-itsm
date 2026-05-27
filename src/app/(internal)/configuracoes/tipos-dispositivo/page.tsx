import { createClient } from '@/lib/supabase/server'
import { DeviceTypeManager } from '@/components/settings/DeviceTypeManager'

export default async function TiposDispositivoPage() {
  const supabase = await createClient()
  const { data: deviceTypes } = await supabase
    .from('device_types')
    .select('id, name, is_active')
    .order('name')
    .limit(500)

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-semibold">Tipos de Dispositivo</h1>
      <DeviceTypeManager deviceTypes={deviceTypes ?? []} />
    </div>
  )
}
