'use client'

import { useState, useTransition } from 'react'

interface Company { id: string; name: string }

interface Props {
  companies: Company[]
  defaultFrom: string
  defaultTo: string
  defaultCompanyId: string
  downloadAction: (fd: FormData) => Promise<void>
  sendEmailAction: (fd: FormData) => Promise<{ ok: boolean; error?: string }>
}

export function ReportFormClient({
  companies, defaultFrom, defaultTo, defaultCompanyId,
  downloadAction, sendEmailAction,
}: Props) {
  const [companyId, setCompanyId] = useState(defaultCompanyId)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function buildFormData() {
    const fd = new FormData()
    fd.set('company_id', companyId)
    fd.set('from', from)
    fd.set('to', to)
    return fd
  }

  function handleDownload() {
    startTransition(async () => {
      setMessage(null)
      await downloadAction(buildFormData())
    })
  }

  function handleSendEmail() {
    startTransition(async () => {
      setMessage(null)
      const result = await sendEmailAction(buildFormData())
      setMessage(result.ok
        ? { type: 'ok', text: 'Relatório enviado com sucesso por e-mail.' }
        : { type: 'error', text: result.error ?? 'Erro ao enviar.' }
      )
    })
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">Empresa</label>
          <select
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="">Selecione uma empresa…</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">De</label>
            <input
              type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Até</label>
            <input
              type="date" value={to} onChange={e => setTo(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={!companyId || isPending}
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm disabled:opacity-50"
          >
            {isPending ? 'Gerando…' : 'Baixar PDF'}
          </button>
          <button
            type="button"
            onClick={handleSendEmail}
            disabled={!companyId || isPending}
            className="border px-4 py-2 rounded-md text-sm disabled:opacity-50 hover:bg-muted"
          >
            {isPending ? 'Enviando…' : 'Enviar por e-mail'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`rounded-md px-4 py-3 text-sm ${
          message.type === 'ok'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
