'use client'
import { useState } from 'react'
import { Label } from '@/components/ui/label'

const DEPARTMENTS = ['TI', 'Financeiro', 'RH', 'Operações', 'Comercial', 'Jurídico', 'Diretoria']

interface Company { id: string; name: string }
interface Contact { id: string; full_name: string; email: string }

export function RecipientSelector({
  companies,
  contacts = [],
  initialType = 'all',
  initialCompanyId = '',
  initialDepartments = [],
  initialContactIds = [],
}: {
  companies: Company[]
  contacts?: Contact[]
  initialType?: string
  initialCompanyId?: string
  initialDepartments?: string[]
  initialContactIds?: string[]
}) {
  const [type, setType] = useState(initialType)

  return (
    <div className="space-y-3">
      <Label>Destinatários</Label>
      <div className="grid grid-cols-2 gap-2">
        {(['all', 'company', 'department', 'manual'] as const).map(t => (
          <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="radio" name="recipient_type" value={t}
              defaultChecked={t === initialType} onChange={() => setType(t)} />
            {t === 'all' && 'Todos os contatos'}
            {t === 'company' && 'Por empresa'}
            {t === 'department' && 'Por departamento'}
            {t === 'manual' && 'Seleção manual'}
          </label>
        ))}
      </div>

      {type === 'company' && (
        <div>
          <Label>Empresa</Label>
          <select name="recipient_company_id" defaultValue={initialCompanyId}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
            <option value="">Selecione...</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {type === 'department' && (
        <div className="space-y-1">
          <Label>Departamentos</Label>
          <div className="grid grid-cols-2 gap-1">
            {DEPARTMENTS.map(dept => (
              <label key={dept} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recipient_departments" value={dept}
                  defaultChecked={initialDepartments.includes(dept)} />
                {dept}
              </label>
            ))}
          </div>
        </div>
      )}

      {type === 'manual' && (
        <div className="space-y-1">
          <Label>Contatos</Label>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum contato ativo encontrado.</p>
          ) : (
            <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
              {contacts.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm px-3 py-2 hover:bg-muted/50 cursor-pointer">
                  <input type="checkbox" name="recipient_contact_ids" value={c.id}
                    defaultChecked={initialContactIds.includes(c.id)} />
                  <span>{c.full_name}</span>
                  <span className="text-muted-foreground text-xs ml-auto">{c.email}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
