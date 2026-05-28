'use client'
import { useState } from 'react'
import { previewCleanup, executeCleanupAction, CleanupType } from '@/app/(internal)/configuracoes/storage/actions'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

const TYPE_OPTIONS: { value: CleanupType; label: string; hint: string }[] = [
  { value: 'chamados',  label: 'Chamados',  hint: 'Anexos de chamados fechados há mais de X meses' },
  { value: 'gmud',      label: 'GMUDs',      hint: 'Anexos de mudanças concluídas/revertidas há mais de X meses' },
  { value: 'reunioes',  label: 'Reuniões',  hint: 'Anexos de reuniões realizadas/canceladas há mais de X meses' },
  { value: 'tarefas',   label: 'Tarefas',   hint: 'Anexos de tarefas concluídas há mais de X meses' },
]

export function StorageCleanupDialog() {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<CleanupType>('chamados')
  const [monthsOld, setMonthsOld] = useState(12)
  const [preview, setPreview] = useState<{ fileCount: number; totalBytes: number } | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ deleted: number } | null>(null)

  function handleClose() {
    setOpen(false)
    setPreview(null)
    setConfirmText('')
    setResult(null)
  }

  async function handlePreview() {
    setLoading(true)
    setPreview(null)
    setResult(null)
    setConfirmText('')
    const res = await previewCleanup(monthsOld, type)
    setPreview(res)
    setLoading(false)
  }

  async function handleExecute() {
    if (confirmText !== 'CONFIRMAR') return
    setLoading(true)
    const res = await executeCleanupAction(monthsOld, type)
    setResult(res)
    setPreview(null)
    setConfirmText('')
    setLoading(false)
  }

  const selectedType = TYPE_OPTIONS.find(o => o.value === type)!

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

            {/* Tipo */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipo de arquivo</label>
              <select
                className="block w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={type}
                onChange={e => { setType(e.target.value as CleanupType); setPreview(null); setResult(null) }}
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">{selectedType.hint}</p>
            </div>

            {/* Período */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Período (meses)</label>
              <input
                type="number"
                min={1}
                max={120}
                value={monthsOld}
                onChange={e => { setMonthsOld(Number(e.target.value)); setPreview(null); setResult(null) }}
                className="block w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={handlePreview}
              disabled={loading}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50 w-full"
            >
              {loading ? 'Calculando...' : 'Calcular impacto'}
            </button>

            {/* Preview */}
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

            {/* Confirmação de execução */}
            {preview && preview.fileCount > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-destructive font-medium">
                  Digite &quot;CONFIRMAR&quot; para executar a limpeza:
                </p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  className="block w-full border rounded-md px-3 py-2 text-sm"
                  placeholder="CONFIRMAR"
                />
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={confirmText !== 'CONFIRMAR' || loading}
                  className="bg-destructive text-destructive-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50 w-full"
                >
                  {loading ? 'Removendo...' : 'Confirmar limpeza'}
                </button>
              </div>
            )}

            {/* Resultado */}
            {result && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-700 font-medium">
                  {result.deleted} arquivo(s) removido(s) com sucesso.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleClose}
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
