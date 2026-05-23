'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Template {
  id: string
  name: string
  category: string | null
  body: string
  variables: { key: string; label: string; auto_filled: boolean }[]
}

interface Props {
  templates: Template[]
  autoValues: Record<string, string>
  onApply: (text: string) => void
}

export function TemplateSelector({ templates, autoValues, onApply }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Template | null>(null)
  const [manualValues, setManualValues] = useState<Record<string, string>>({})

  function applyTemplate() {
    if (!selected) return
    let body = selected.body
    for (const v of selected.variables) {
      const value = v.auto_filled ? (autoValues[v.key] ?? '') : (manualValues[v.key] ?? '')
      body = body.replaceAll(`{{${v.key}}}`, value)
    }
    onApply(body)
    setOpen(false)
    setSelected(null)
    setManualValues({})
  }

  const manualVars = selected?.variables.filter(v => !v.auto_filled) ?? []

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Usar template
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecionar template</DialogTitle>
          </DialogHeader>
          {!selected ? (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map(t => (
                <button key={t.id} type="button"
                  onClick={() => setSelected(t)}
                  className="w-full text-left p-3 border rounded-md hover:bg-muted transition-colors">
                  <p className="font-medium text-sm">{t.name}</p>
                  {t.category && <p className="text-xs text-muted-foreground">{t.category}</p>}
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {manualVars.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Preencher variáveis</p>
                  {manualVars.map(v => (
                    <div key={v.key}>
                      <Label>{v.label}</Label>
                      <Input
                        value={manualValues[v.key] ?? ''}
                        onChange={e => setManualValues({ ...manualValues, [v.key]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button type="button" onClick={applyTemplate}>Aplicar</Button>
                <Button type="button" variant="outline" onClick={() => setSelected(null)}>Voltar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
