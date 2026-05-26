import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function fmtDateCsv(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(new Date(iso))
}

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
}
const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando_cliente: 'Ag. cliente',
  aguardando_fornecedor: 'Ag. fornecedor', aguardando_aprovacao: 'Ag. aprovação',
  em_mudanca: 'Em mudança', agendado: 'Agendado', em_deslocamento: 'Em deslocamento',
  resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single() as { data: any }
  if (!['admin', 'gestor'].includes(profile?.role)) return NextResponse.json({ error: 'Permissão insuficiente' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const fromDate = searchParams.get('from') ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const toDate = searchParams.get('to') ?? new Date().toISOString().slice(0, 10)
  const companyId  = searchParams.get('company_id')
  const categoryId = searchParams.get('category_id')
  const assignedTo = searchParams.get('assigned_to')
  const priority   = searchParams.get('priority')
  const contactId  = searchParams.get('contact_id')

  let q = (supabase as any)
    .from('tickets')
    .select(`
      number, title, priority, status, sla_met, sla_deadline,
      created_at, closed_at,
      companies(name),
      contacts!contact_id(full_name),
      ticket_categories(name),
      profiles!assigned_to(full_name)
    `)
    .gte('created_at', `${fromDate}T00:00:00Z`)
    .lte('created_at', `${toDate}T23:59:59Z`)
    .order('created_at', { ascending: false })

  if (companyId)  q = q.eq('company_id', companyId)
  if (categoryId) q = q.eq('category_id', categoryId)
  if (assignedTo) q = q.eq('assigned_to', assignedTo)
  if (priority)   q = q.eq('priority', priority)
  if (contactId)  q = q.eq('contact_id', contactId)

  const { data: tickets } = await q
  const rows: any[] = tickets ?? []

  const header = ['#', 'Título', 'Cliente', 'Solicitante', 'Categoria', 'Analista', 'Prioridade', 'Status', 'SLA', 'Prazo SLA', 'Criado em', 'Fechado em']
  const lines = [
    header.map(escapeCsv).join(','),
    ...rows.map(t => [
      t.number,
      t.title,
      t.companies?.name ?? '',
      t.contacts?.full_name ?? '',
      t.ticket_categories?.name ?? '',
      t.profiles?.full_name ?? '',
      PRIORITY_LABELS[t.priority] ?? t.priority,
      STATUS_LABELS[t.status] ?? t.status,
      t.sla_met === null ? '' : t.sla_met ? 'Cumprido' : 'Violado',
      fmtDateCsv(t.sla_deadline),
      fmtDateCsv(t.created_at),
      fmtDateCsv(t.closed_at),
    ].map(escapeCsv).join(',')),
  ]

  const csv = '﻿' + lines.join('\r\n') // BOM for Excel UTF-8
  const filename = `relatorio_${fromDate}_${toDate}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
