'use client'
import { useState } from 'react'
import { Label } from '@/components/ui/label'

const DEPARTMENTS = ['TI', 'Financeiro', 'RH', 'Operações', 'Comercial', 'Jurídico', 'Diretoria']

interface Company { id: string; name: string }

export function RecipientSelector({ companies, initialType = 'all', initialCompanyId = '', initialDepartments = [] }: {
  companies: Company[]
  initialType?: string
  initialCompanyId?: string
  initialDepartments?: string[]
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
    </div>
  )
}
