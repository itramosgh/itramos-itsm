'use client'
import { useState } from 'react'
import { previewCleanup } from '@/app/(internal)/configuracoes/storage/actions'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function StorageCleanupDialog() {
  const [open, setOpen] = useState(false)
  const [monthsOld, setMonthsOld] = useState(12)
  const [preview, setPreview] = useState<{ fileCount: number; totalBytes: number } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)

  async function handlePreview() {
    setLoading(true)
    const result = await previewCleanup(monthsOld)
    setPreview(result)
    setLoading(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border rounded-md px-4 py-2 text-sm hover:bg-muted"
      >
        Limpeza de Armazenamento
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold">Limpeza de Armazenamento</h2>
            <p className="text-sm text-muted-foreground">
              Remove anexos de chamados fechados há mais tempo que o período selecionado.
              A limpeza efetiva será disponibilizada em versão futura.
            </p>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Chamados fechados há mais de (meses)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={monthsOld}
                onChange={(e) => setMonthsOld(Number(e.target.value))}
                className="block w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handlePreview}
              disabled={loading}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50"
            >
              {loading ? 'Calculando...' : 'Calcular'}
            </button>

            {preview && (
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{preview.fileCount}</span> arquivo(s) seriam removidos
                </p>
                <p className="text-sm">
                  <span className="font-medium">{formatBytes(preview.totalBytes)}</span> liberados
                </p>
              </div>
            )}

            {preview && preview.fileCount > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-destructive font-medium">
                  Digite &quot;CONFIRMAR&quot; para executar a limpeza:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="block w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="CONFIRMAR"
                />
                <button
                  type="button"
                  disabled={confirmText !== 'CONFIRMAR'}
                  className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50 w-full"
                >
                  Confirmar limpeza
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => { setOpen(false); setPreview(null); setConfirmText('') }}
              className="w-full border rounded-md px-4 py-2 text-sm hover:bg-muted"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  )
}
