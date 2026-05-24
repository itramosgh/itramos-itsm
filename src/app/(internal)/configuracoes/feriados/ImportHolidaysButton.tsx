'use client'
import { useState } from 'react'
import { importHolidaysAction } from './actions'
import { Button } from '@/components/ui/button'

export function ImportHolidaysButton() {
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleImport() {
    setLoading(true)
    setMsg(null)
    const result = await (importHolidaysAction as () => Promise<any>)()
    setLoading(false)
    if (result.error) setMsg(`Erro: ${result.error}`)
    else setMsg(`${result.imported} importados, ${result.skipped} já existentes.`)
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" onClick={handleImport} disabled={loading}>
        {loading ? 'Importando...' : 'Importar feriados nacionais (BrasilAPI)'}
      </Button>
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
    </div>
  )
}
