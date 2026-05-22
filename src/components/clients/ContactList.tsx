'use client'
import { useState } from 'react'
import { updateContactFlagsAction, grantPortalAccessAction } from '@/app/(internal)/clientes/[id]/contatos/actions'
import type { Database } from '@/types/database'

type Contact = Database['public']['Tables']['contacts']['Row']

interface Props {
  contacts: Contact[]
  companyId: string
}

export function ContactList({ contacts, companyId }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  async function handleToggleFlag(
    contactId: string,
    flag: 'is_contract_responsible' | 'receives_ticket_cc',
    current: boolean
  ) {
    const result = await updateContactFlagsAction(contactId, companyId, { [flag]: !current })
    if (result?.error) setErrors((prev) => ({ ...prev, [contactId]: result.error! }))
  }

  async function handleGrantAccess(contactId: string) {
    const result = await grantPortalAccessAction(contactId, companyId)
    if (result?.error) setErrors((prev) => ({ ...prev, [contactId]: result.error! }))
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
      )}
      {contacts.map((contact) => (
        <div key={contact.id} className="rounded-md border p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-medium">{contact.full_name}</p>
              <p className="text-sm text-muted-foreground">{contact.email}</p>
              {contact.department && <p className="text-xs text-muted-foreground">{contact.department}</p>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.is_whatsapp && <Badge>WhatsApp</Badge>}
              {contact.is_contract_responsible && <Badge variant="blue">Responsável</Badge>}
              {contact.receives_ticket_cc && <Badge variant="blue">Cópia</Badge>}
              {contact.user_id && <Badge variant="green">Portal</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <FlagButton
              active={contact.is_contract_responsible ?? false}
              onClick={() => handleToggleFlag(contact.id, 'is_contract_responsible', contact.is_contract_responsible ?? false)}
              label="Responsável"
            />
            <FlagButton
              active={contact.receives_ticket_cc ?? false}
              onClick={() => handleToggleFlag(contact.id, 'receives_ticket_cc', contact.receives_ticket_cc ?? false)}
              label="Cópia"
            />
            {!contact.user_id && (
              <button type="button" onClick={() => handleGrantAccess(contact.id)}
                className="text-xs border rounded px-2 py-1 hover:bg-muted">
                Dar acesso ao portal
              </button>
            )}
          </div>
          {errors[contact.id] && (
            <p className="text-xs text-destructive">{errors[contact.id]}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function Badge({ children, variant = 'gray' }: { children: React.ReactNode; variant?: 'gray' | 'blue' | 'green' }) {
  const cls = {
    gray: 'bg-gray-100 text-gray-700',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800',
  }[variant]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {children}
    </span>
  )
}

function FlagButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs border rounded px-2 py-1 transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
      }`}>
      {label}: {active ? 'Sim' : 'Não'}
    </button>
  )
}
