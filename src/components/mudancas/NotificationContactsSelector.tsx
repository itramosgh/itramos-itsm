'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X } from 'lucide-react'

type ContactEntry =
  | { type: 'db'; contact_id: string; name: string; email: string }
  | { type: 'external'; external_email: string; external_name: string }

interface Props {
  dbContacts: Array<{ id: string; full_name: string; email: string }>
}

export function NotificationContactsSelector({ dbContacts }: Props) {
  const [selected, setSelected] = useState<ContactEntry[]>([])
  const [extEmail, setExtEmail] = useState('')
  const [extName, setExtName] = useState('')

  function addDbContact(contactId: string) {
    const c = dbContacts.find((c) => c.id === contactId)
    if (!c || selected.some((s) => s.type === 'db' && s.contact_id === contactId)) return
    setSelected((prev) => [...prev, { type: 'db', contact_id: c.id, name: c.full_name, email: c.email }])
  }

  function addExternal() {
    if (!extEmail || !extName) return
    setSelected((prev) => [...prev, { type: 'external', external_email: extEmail, external_name: extName }])
    setExtEmail('')
    setExtName('')
  }

  function remove(idx: number) {
    setSelected((prev) => prev.filter((_, i) => i !== idx))
  }

  const serialized = JSON.stringify(
    selected.map((s) =>
      s.type === 'db'
        ? { contact_id: s.contact_id }
        : { external_email: s.external_email, external_name: s.external_name }
    )
  )

  return (
    <div className="space-y-3">
      <input type="hidden" name="notification_contacts" value={serialized} />

      <div className="flex gap-2">
        <select
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          onChange={(e) => { if (e.target.value) addDbContact(e.target.value) }}
          value=""
        >
          <option value="">Selecionar contato cadastrado…</option>
          {dbContacts.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name} ({c.email})</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="E-mail externo"
          value={extEmail}
          onChange={(e) => setExtEmail(e.target.value)}
          type="email"
        />
        <Input
          placeholder="Nome"
          value={extName}
          onChange={(e) => setExtName(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={addExternal}>Adicionar</Button>
      </div>

      {selected.length > 0 && (
        <ul className="space-y-1">
          {selected.map((s, i) => (
            <li key={i} className="flex items-center justify-between text-sm border rounded-md px-3 py-2">
              <span>
                {s.type === 'db'
                  ? `${s.name} (${s.email})`
                  : `${s.external_name} (${s.external_email})`}
              </span>
              <button type="button" onClick={() => remove(i)}>
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
