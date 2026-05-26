'use client'
import { useState } from 'react'
import { updateContactAction, updateContactFlagsAction, grantPortalAccessAction } from '@/app/(internal)/clientes/[id]/contatos/actions'
import type { Database } from '@/types/database'

type Contact = Database['public']['Tables']['contacts']['Row']

interface Props {
  contacts: Contact[]
  companyId: string
}

interface EditValues {
  full_name: string
  email: string
  phone: string
  department: string
  is_whatsapp: boolean
}

export function ContactList({ contacts, companyId }: Props) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<EditValues>({ full_name: '', email: '', phone: '', department: '', is_whatsapp: false })

  function startEdit(contact: Contact) {
    setEditingId(contact.id)
    setEditValues({
      full_name: contact.full_name,
      email: contact.email,
      phone: contact.phone ?? '',
      department: contact.department ?? '',
      is_whatsapp: contact.is_whatsapp ?? false,
    })
    setErrors((prev) => ({ ...prev, [contact.id]: '' }))
  }

  async function handleUpdate(contact: Contact) {
    const fd = new FormData()
    fd.append('full_name', editValues.full_name)
    fd.append('email', editValues.email)
    if (editValues.phone) fd.append('phone', editValues.phone)
    if (editValues.department) fd.append('department', editValues.department)
    if (editValues.is_whatsapp) fd.append('is_whatsapp', 'on')
    if (contact.is_contract_responsible) fd.append('is_contract_responsible', 'on')
    if (contact.receives_ticket_cc) fd.append('receives_ticket_cc', 'on')
    const result = await updateContactAction(contact.id, companyId, fd)
    if (result?.error) setErrors((prev) => ({ ...prev, [contact.id]: result.error! }))
    else setEditingId(null)
  }

  async function handleToggleFlag(contactId: string, flag: 'is_contract_responsible' | 'receives_ticket_cc', current: boolean) {
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
        <div key={contact.id} className="rounded-md border p-4 space-y-3">
          {editingId === contact.id ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nome *</label>
                  <input autoFocus value={editValues.full_name}
                    onChange={e => setEditValues(v => ({ ...v, full_name: e.target.value }))}
                    className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">E-mail *</label>
                  <input type="email" value={editValues.email}
                    onChange={e => setEditValues(v => ({ ...v, email: e.target.value }))}
                    className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Telefone</label>
                  <input value={editValues.phone}
                    onChange={e => setEditValues(v => ({ ...v, phone: e.target.value }))}
                    className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Departamento</label>
                  <input value={editValues.department}
                    onChange={e => setEditValues(v => ({ ...v, department: e.target.value }))}
                    className="mt-1 block w-full border rounded-md px-2 py-1.5 text-sm" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={editValues.is_whatsapp}
                  onChange={e => setEditValues(v => ({ ...v, is_whatsapp: e.target.checked }))} />
                WhatsApp
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={() => handleUpdate(contact)}
                  disabled={!editValues.full_name.trim() || !editValues.email.trim()}
                  className="text-sm bg-primary text-primary-foreground px-3 py-1.5 rounded-md disabled:opacity-50">
                  Salvar
                </button>
                <button type="button" onClick={() => setEditingId(null)}
                  className="text-sm border px-3 py-1.5 rounded-md hover:bg-muted">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{contact.full_name}</p>
                  <p className="text-sm text-muted-foreground">{contact.email}</p>
                  {contact.phone && <p className="text-xs text-muted-foreground">{contact.phone}</p>}
                  {contact.department && <p className="text-xs text-muted-foreground">{contact.department}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-wrap gap-1.5">
                    {contact.is_whatsapp && <Badge>WhatsApp</Badge>}
                    {contact.is_contract_responsible && <Badge variant="blue">Responsável</Badge>}
                    {contact.receives_ticket_cc && <Badge variant="blue">Cópia</Badge>}
                    {contact.user_id && <Badge variant="green">Portal</Badge>}
                  </div>
                  <button type="button" onClick={() => startEdit(contact)}
                    className="text-sm hover:underline whitespace-nowrap">
                    Editar
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <FlagButton active={contact.is_contract_responsible ?? false}
                  onClick={() => handleToggleFlag(contact.id, 'is_contract_responsible', contact.is_contract_responsible ?? false)}
                  label="Responsável" />
                <FlagButton active={contact.receives_ticket_cc ?? false}
                  onClick={() => handleToggleFlag(contact.id, 'receives_ticket_cc', contact.receives_ticket_cc ?? false)}
                  label="Cópia" />
                {!contact.user_id && (
                  <button type="button" onClick={() => handleGrantAccess(contact.id)}
                    className="text-xs border rounded px-2 py-1 hover:bg-muted">
                    Dar acesso ao portal
                  </button>
                )}
              </div>
            </>
          )}
          {errors[contact.id] && (
            <p className="text-xs text-destructive">{errors[contact.id]}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function Badge({ children, variant = 'gray' }: { children: React.ReactNode; variant?: 'gray' | 'blue' | 'green' }) {
  const cls = { gray: 'bg-gray-100 text-gray-700', blue: 'bg-blue-100 text-blue-800', green: 'bg-green-100 text-green-800' }[variant]
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium ${cls}`}>{children}</span>
}

function FlagButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs border rounded px-2 py-1 transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
      {label}: {active ? 'Sim' : 'Não'}
    </button>
  )
}
