'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  updateCompanyAction,
  toggleBlockCompanyAction,
  addEmailDomainAction,
  removeEmailDomainAction,
} from '@/app/(internal)/clientes/actions'
import { CompanyForm } from './CompanyForm'
import type { Database } from '@/types/database'

type Company = Database['public']['Tables']['companies']['Row'] & {
  company_email_domains: Database['public']['Tables']['company_email_domains']['Row'][]
}

interface Props {
  company: Company
}

export function CompanyDetails({ company }: Props) {
  const [editing, setEditing] = useState(false)
  const [domainInput, setDomainInput] = useState('')
  const [domainError, setDomainError] = useState('')

  // form action wrappers — must return void for <form action={...}>
  const toggleBlockAction = async () => { await toggleBlockCompanyAction(company.id, !company.is_blocked) }
  const removeEmailDomain = (domainId: string) => async () => { await removeEmailDomainAction(domainId, company.id) }

  async function handleAddDomain(e: React.FormEvent) {
    e.preventDefault()
    const fd = new FormData()
    fd.append('domain', domainInput)
    const result = await addEmailDomainAction(company.id, fd)
    if (result?.error) setDomainError(result.error)
    else { setDomainInput(''); setDomainError('') }
  }

  return (
    <div className="space-y-6">
      {/* Edit / View */}
      {editing ? (
        <div className="rounded-lg border p-4 space-y-4">
          <CompanyForm
            onSubmit={(fd) => updateCompanyAction(company.id, fd)}
            defaultValues={{ name: company.name, cnpj: company.cnpj ?? '', segment: company.segment ?? '', address: company.address ?? '' }}
            submitLabel="Salvar"
          />
          <button type="button" onClick={() => setEditing(false)}
            className="text-sm text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
        </div>
      ) : (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              {company.cnpj && <p className="text-sm"><span className="font-medium">CNPJ:</span> {company.cnpj}</p>}
              {company.segment && <p className="text-sm"><span className="font-medium">Segmento:</span> {company.segment}</p>}
              {company.address && <p className="text-sm"><span className="font-medium">Endereço:</span> {company.address}</p>}
            </div>
            <button type="button" onClick={() => setEditing(true)}
              className="text-sm hover:underline">
              Editar
            </button>
          </div>
        </div>
      )}

      {/* Block/Unblock */}
      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Status da Empresa</p>
            <p className="text-sm text-muted-foreground">
              {company.is_blocked ? 'Empresa bloqueada — não pode acessar o portal.' : 'Empresa ativa.'}
            </p>
          </div>
          <form action={toggleBlockAction}>
            <button type="submit"
              className={`px-4 py-2 rounded-md text-sm ${company.is_blocked
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-red-600 text-white hover:bg-red-700'}`}>
              {company.is_blocked ? 'Desbloquear' : 'Bloquear'}
            </button>
          </form>
        </div>
      </div>

      {/* Email Domains */}
      <div className="rounded-lg border p-4 space-y-3">
        <h2 className="font-medium">Domínios de E-mail</h2>
        <div className="space-y-2">
          {company.company_email_domains.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-sm">
              <span className="font-mono">{d.domain}</span>
              <form action={removeEmailDomain(d.id)}>
                <button type="submit" className="text-destructive hover:underline text-xs">Remover</button>
              </form>
            </div>
          ))}
          {company.company_email_domains.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum domínio cadastrado.</p>
          )}
        </div>
        <form onSubmit={handleAddDomain} className="flex gap-2">
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="empresa.com.br"
            className="flex-1 border rounded-md px-3 py-1.5 text-sm"
          />
          <button type="submit"
            className="bg-primary text-primary-foreground px-3 py-1.5 rounded-md text-sm">
            Adicionar
          </button>
        </form>
        {domainError && <p className="text-sm text-destructive">{domainError}</p>}
      </div>

      {/* Navigation to Contacts/Contracts */}
      <div className="flex gap-4">
        <Link href={`/clientes/${company.id}/contatos`}
          className="flex-1 rounded-lg border p-4 hover:bg-muted text-center">
          <p className="font-medium">Contatos</p>
          <p className="text-sm text-muted-foreground">Gerenciar contatos desta empresa</p>
        </Link>
        <Link href={`/clientes/${company.id}/contratos`}
          className="flex-1 rounded-lg border p-4 hover:bg-muted text-center">
          <p className="font-medium">Contratos</p>
          <p className="text-sm text-muted-foreground">Gerenciar contratos desta empresa</p>
        </Link>
      </div>
    </div>
  )
}
