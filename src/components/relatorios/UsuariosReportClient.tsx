'use client'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'

type Row = {
  id: string
  empresa: string
  nome: string
  email: string
  perfil: string
  ultimo_acesso: string | null
  ativo: boolean
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  analista: 'Analista',
  cliente: 'Cliente',
}

const PAGE_SIZE = 20

const now = Date.now()
const ACESSO_OPTIONS = [
  { value: '', label: 'Qualquer' },
  { value: 'nunca', label: 'Nunca fez login' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'mais30d', label: 'Mais de 30 dias' },
]

function fmtDateTime(iso: string | null) {
  if (!iso) return 'Nunca'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

function matchesAcesso(iso: string | null, filter: string): boolean {
  if (!filter) return true
  if (filter === 'nunca') return iso === null
  if (!iso) return false
  const diff = now - new Date(iso).getTime()
  const days = diff / 86_400_000
  if (filter === '7d') return days <= 7
  if (filter === '30d') return days <= 30
  if (filter === 'mais30d') return days > 30
  return true
}

function escapeCsv(value: string | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function UsuariosReportClient({ rows }: { rows: Row[] }) {
  const [filterEmpresa, setFilterEmpresa] = useState('')
  const [filterNome, setFilterNome] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [filterAcesso, setFilterAcesso] = useState('')
  const [filterAtivo, setFilterAtivo] = useState('')
  const [page, setPage] = useState(1)

  const empresas = useMemo(() => {
    const set = new Set(rows.map(r => r.empresa))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [rows])

  const filtered = useMemo(() => {
    const nome = filterNome.toLowerCase()
    const email = filterEmail.toLowerCase()
    return rows.filter(r => {
      if (filterEmpresa && r.empresa !== filterEmpresa) return false
      if (nome && !r.nome.toLowerCase().includes(nome)) return false
      if (email && !r.email.toLowerCase().includes(email)) return false
      if (!matchesAcesso(r.ultimo_acesso, filterAcesso)) return false
      if (filterAtivo === 'ativo' && !r.ativo) return false
      if (filterAtivo === 'inativo' && r.ativo) return false
      return true
    })
  }, [rows, filterEmpresa, filterNome, filterEmail, filterAcesso, filterAtivo])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function resetFilters() {
    setFilterEmpresa('')
    setFilterNome('')
    setFilterEmail('')
    setFilterAcesso('')
    setFilterAtivo('')
    setPage(1)
  }

  function handleFilter(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setter(e.target.value)
      setPage(1)
    }
  }

  function exportCsv() {
    const header = 'Empresa,Nome,E-mail,Perfil,Último acesso,Ativo'
    const lines = filtered.map(r => [
      escapeCsv(r.empresa),
      escapeCsv(r.nome),
      escapeCsv(r.email),
      escapeCsv(ROLE_LABELS[r.perfil] ?? r.perfil),
      escapeCsv(fmtDateTime(r.ultimo_acesso)),
      r.ativo ? 'Sim' : 'Não',
    ].join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasFilters = filterEmpresa || filterNome || filterEmail || filterAcesso || filterAtivo

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterEmpresa}
          onChange={handleFilter(setFilterEmpresa)}
        >
          <option value="">Todas as empresas</option>
          {empresas.map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <Input
          placeholder="Nome..."
          value={filterNome}
          onChange={handleFilter(setFilterNome)}
          className="text-sm"
        />

        <Input
          placeholder="E-mail..."
          value={filterEmail}
          onChange={handleFilter(setFilterEmail)}
          className="text-sm"
        />

        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterAcesso}
          onChange={handleFilter(setFilterAcesso)}
        >
          {ACESSO_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={filterAtivo}
          onChange={handleFilter(setFilterAtivo)}
        >
          <option value="">Ativo: todos</option>
          <option value="ativo">Somente ativos</option>
          <option value="inativo">Somente inativos</option>
        </select>
      </div>

      {/* Barra de ações */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
            {hasFilters && ` de ${rows.length}`}
          </p>
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      {/* Tabela */}
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Empresa</th>
              <th className="text-left px-4 py-3 font-medium">Nome</th>
              <th className="text-left px-4 py-3 font-medium">E-mail</th>
              <th className="text-left px-4 py-3 font-medium">Perfil</th>
              <th className="text-left px-4 py-3 font-medium">Último acesso</th>
              <th className="text-left px-4 py-3 font-medium">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{r.empresa}</td>
                <td className="px-4 py-3 font-medium">{r.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.email}</td>
                <td className="px-4 py-3">
                  <span className="text-xs border rounded-full px-2 py-0.5">
                    {ROLE_LABELS[r.perfil] ?? r.perfil}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{fmtDateTime(r.ultimo_acesso)}</td>
                <td className="px-4 py-3">
                  <span className={r.ativo ? 'text-green-600 font-medium' : 'text-muted-foreground'}>
                    {r.ativo ? 'Sim' : 'Não'}
                  </span>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Página {safePage} de {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
