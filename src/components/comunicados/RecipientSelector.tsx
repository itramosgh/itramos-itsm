'use client'
import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
  initialExtraEmails = [],
}: {
  companies: Company[]
  contacts?: Contact[]
  initialType?: string
  initialCompanyId?: string
  initialDepartments?: string[]
  initialContactIds?: string[]
  initialExtraEmails?: string[]
}) {
  const [type, setType] = useState(initialType)
  const [extEmail, setExtEmail] = useState('')
  const [extraEmails, setExtraEmails] = useState<string[]>(initialExtraEmails)

  function addExtraEmail() {
    const email = extEmail.trim()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    if (extraEmails.includes(email)) return
    setExtraEmails(prev => [...prev, email])
    setExtEmail('')
  }

  function removeExtraEmail(email: string) {
    setExtraEmails(prev => prev.filter(e => e !== email))
  }

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
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Contatos do sistema</Label>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum contato ativo encontrado.</p>
            ) : (
              <div className="border rounded-md max-h-40 overflow-y-auto divide-y">
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

          <div className="space-y-2">
            <Label>E-mails externos</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="email@exemplo.com"
                value={extEmail}
                onChange={e => setExtEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExtraEmail() } }}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addExtraEmail}>
                Adicionar
              </Button>
            </div>
            {extraEmails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {extraEmails.map(email => (
                  <span key={email} className="flex items-center gap-1 bg-muted text-xs px-2 py-1 rounded-full">
                    {email}
                    <button type="button" onClick={() => removeExtraEmail(email)}
                      className="text-muted-foreground hover:text-foreground ml-0.5">×</button>
                    <input type="hidden" name="recipient_extra_emails" value={email} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
