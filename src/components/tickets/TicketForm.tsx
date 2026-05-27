'use client'
import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  action: (prevState: unknown, formData: FormData) => Promise<{ error?: string } | undefined>
  companies: { id: string; name: string }[]
  contacts: { id: string; full_name: string; company_id: string }[]
  contracts: { id: string; company_id: string; status: string }[]
  analysts: { id: string; full_name: string }[]
  categories: { id: string; name: string }[]
}

export function TicketForm({ action, companies, contacts, contracts, analysts, categories }: Props) {
  const [state, formAction, pending] = useActionState(action, null)
  const [selectedCompanyId, setSelectedCompanyId] = useState('')

  const filteredContacts = selectedCompanyId
    ? contacts.filter(c => c.company_id === selectedCompanyId)
    : []

  const filteredContracts = selectedCompanyId
    ? contracts.filter(c => c.company_id === selectedCompanyId && c.status === 'ativo')
    : contracts.filter(c => c.status === 'ativo')

  return (
    <form action={formAction} className="space-y-4 max-w-2xl">
      <input type="hidden" name="channel" value="portal" />
      <div>
        <Label htmlFor="title">Título *</Label>
        <Input id="title" name="title" required />
      </div>
      <div>
        <Label htmlFor="description">Descrição</Label>
        <Textarea id="description" name="description" rows={4} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="priority">Prioridade *</Label>
          <select id="priority" name="priority" required className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>
        <div>
          <Label htmlFor="category_id">Categoria</Label>
          <select id="category_id" name="category_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem categoria</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="company_id">Empresa *</Label>
          <select
            id="company_id"
            name="company_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            value={selectedCompanyId}
            onChange={e => setSelectedCompanyId(e.target.value)}
          >
            <option value="">Selecionar empresa</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <Label htmlFor="contact_id">Solicitante *</Label>
          <select
            id="contact_id"
            name="contact_id"
            required
            className="w-full border rounded-md px-3 py-2 text-sm bg-background"
            disabled={!selectedCompanyId}
          >
            <option value="">
              {selectedCompanyId ? 'Selecionar contato' : 'Selecione a empresa primeiro'}
            </option>
            {filteredContacts.map(c => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="contract_id">Contrato</Label>
          <select id="contract_id" name="contract_id" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Sem contrato</option>
            {filteredContracts.map(c => (
              <option key={c.id} value={c.id}>Contrato {c.id.slice(0, 8)}...</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="assigned_to">Analista responsável</Label>
          <select id="assigned_to" name="assigned_to" className="w-full border rounded-md px-3 py-2 text-sm bg-background">
            <option value="">Não atribuído</option>
            {analysts.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
          </select>
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? 'Criando...' : 'Criar chamado'}</Button>
    </form>
  )
}
