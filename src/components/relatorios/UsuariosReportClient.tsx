'use client'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

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

function fmtDateTime(iso: string | null) {
  if (!iso) return 'Nunca'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
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
  function exportCsv() {
    const header = 'Empresa,Nome,E-mail,Perfil,Último acesso,Ativo'
    const lines = rows.map(r => [
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

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
            {rows.map(r => (
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        {rows.length} usuário{rows.length !== 1 ? 's' : ''}
      </p>
    </div>
  )
}
