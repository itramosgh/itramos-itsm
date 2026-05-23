'use client'
import { useState, useTransition } from 'react'
import { requestApprovalAction } from '@/app/(internal)/chamados/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'

interface Contact { id: string; full_name: string; email: string }

interface Props {
  ticketId: string
  contacts: Contact[]
}

export function ApprovalDialog({ ticketId, contacts }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [contactId, setContactId] = useState('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleContactChange(id: string) {
    setContactId(id)
    const contact = contacts.find(c => c.id === id)
    if (contact) setEmail(contact.email)
  }

  function handleSubmit() {
    startTransition(async () => {
      const fd = new FormData()
      fd.set('approver_email', email)
      if (contactId) fd.set('approver_contact_id', contactId)
      const result = await requestApprovalAction(ticketId, fd)
      if (result?.error) { setError(result.error); return }
      setOpen(false)
    })
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        🔐 Solicitar aprovação
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar aprovação</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Aprovador (contato cadastrado)</Label>
              <select
                value={contactId}
                onChange={e => handleContactChange(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              >
                <option value="">Selecionar ou digitar e-mail abaixo</option>
                {contacts.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name} — {c.email}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="approver_email">E-mail do aprovador</Label>
              <Input
                id="approver_email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="aprovador@empresa.com"
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={isPending || !email}>
              {isPending ? 'Enviando...' : 'Solicitar aprovação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
