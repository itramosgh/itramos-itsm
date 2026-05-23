'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Variable { key: string; label: string; auto_filled: boolean }

interface Props {
  action: (formData: FormData) => Promise<{ error?: string; success?: boolean }>
  initial?: { name: string; category?: string; body: string; variables: Variable[] }
}

export function ResponseTemplateForm({ action, initial }: Props) {
  const [variables, setVariables] = useState<Variable[]>(initial?.variables ?? [])
  const [newVar, setNewVar] = useState({ key: '', label: '', auto_filled: false })
  const [error, setError] = useState('')

  const AUTO_VARS = ['nome_cliente', 'numero_chamado', 'nome_analista', 'data_hoje']

  async function handleSubmit(formData: FormData) {
    formData.set('variables_json', JSON.stringify(variables))
    const result = await action(formData)
    if (result.error) setError(result.error)
  }

  function addVariable() {
    if (!newVar.key || !newVar.label) return
    setVariables([...variables, newVar])
    setNewVar({ key: '', label: '', auto_filled: false })
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="name">Nome do template</Label>
        <Input id="name" name="name" defaultValue={initial?.name} required />
      </div>
      <div>
        <Label htmlFor="category">Categoria</Label>
        <Input id="category" name="category" defaultValue={initial?.category} placeholder="Ex: Acesso, Senha Temporária" />
      </div>
      <div>
        <Label htmlFor="body">Corpo</Label>
        <Textarea id="body" name="body" defaultValue={initial?.body} rows={6}
          placeholder="Olá {{nome_cliente}}, ..." required />
        <p className="text-xs text-muted-foreground mt-1">
          Variáveis automáticas: {AUTO_VARS.map(v => `{{${v}}}`).join(', ')}
        </p>
      </div>
      <div className="border rounded-md p-3 space-y-2">
        <p className="text-sm font-medium">Variáveis manuais</p>
        {variables.map((v, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="font-mono bg-muted px-1 rounded">{`{{${v.key}}}`}</span>
            <span>{v.label}</span>
            <Button type="button" variant="ghost" size="sm"
              onClick={() => setVariables(variables.filter((_, j) => j !== i))}>
              ×
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input placeholder="chave" value={newVar.key} onChange={e => setNewVar({ ...newVar, key: e.target.value })} className="w-32" />
          <Input placeholder="rótulo" value={newVar.label} onChange={e => setNewVar({ ...newVar, label: e.target.value })} />
          <Button type="button" variant="outline" size="sm" onClick={addVariable}>Adicionar</Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Salvar template</Button>
    </form>
  )
}
