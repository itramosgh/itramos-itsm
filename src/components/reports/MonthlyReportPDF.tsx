import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

export interface ReportTicket {
  number: number
  title: string
  category: string
  priority: string
  status: string
  created_at: string
  closed_at: string | null
  analyst_name: string
  reopened: boolean
}

export interface ReportMeeting {
  title: string
  date: string
  action_items: string | null
}

export interface ReportGmud {
  title: string
  status: string
  maintenance_start: string | null
}

export interface ReportMonitoringChannel {
  channel: string
  total: number
  resolved: number
  mttr_hours: number | null
}

export interface MonthTrend {
  month: string   // "2025-06"
  label: string   // "Jun/25"
  count: number
}

export interface MonthlyReportProps {
  companyName: string
  providerName?: string | null
  period: string
  logoUrl?: string | null
  tickets: ReportTicket[]
  meetings?: ReportMeeting[]
  gmuds?: ReportGmud[]
  monitoring?: ReportMonitoringChannel[]
  monthlyTrend?: MonthTrend[]
  reportedMonth?: string  // "2025-06"
}

const palette = {
  primary: '#1a56db',
  muted: '#6b7280',
  border: '#e5e7eb',
  bg: '#f9fafb',
  red: '#ef4444',
  green: '#22c55e',
  amber: '#f59e0b',
}

const s = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: '#111827', padding: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  logo: { width: 120, height: 32, objectFit: 'contain' },
  logoPlaceholder: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: palette.primary },
  headerRight: { alignItems: 'flex-end' },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111827' },
  period: { fontSize: 9, color: palette.muted, marginTop: 2 },
  divider: { height: 1, backgroundColor: palette.border, marginBottom: 20 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: palette.primary, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.border, paddingBottom: 4 },
  row4: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  card: { flex: 1, backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border, borderRadius: 4, padding: 8 },
  cardLabel: { fontSize: 8, color: palette.muted },
  cardValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  table: { borderWidth: 1, borderColor: palette.border, borderRadius: 4 },
  tableHeader: { flexDirection: 'row', backgroundColor: palette.bg, borderBottomWidth: 1, borderBottomColor: palette.border, padding: 6 },
  tableRow: { flexDirection: 'row', padding: 6, borderBottomWidth: 1, borderBottomColor: palette.border },
  tableRowAlt: { flexDirection: 'row', padding: 6, backgroundColor: '#fef3c7', borderBottomWidth: 1, borderBottomColor: palette.border },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: palette.muted },
  td: { fontSize: 8, color: '#374151' },
  barRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  barLabel: { width: 80, fontSize: 8, color: '#374151' },
  barTrack: { flex: 1, height: 8, backgroundColor: palette.border, borderRadius: 4 },
  barFill: { height: 8, backgroundColor: palette.primary, borderRadius: 4 },
  barCount: { width: 30, fontSize: 8, color: palette.muted, textAlign: 'right' },
  col2: { flexDirection: 'row', gap: 16 },
  col2item: { flex: 1 },
  smallLabel: { fontSize: 8, color: palette.muted, marginBottom: 4, fontFamily: 'Helvetica-Bold' },
  pill: { fontSize: 7, color: palette.muted, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 10, alignSelf: 'flex-start' },
  footer: { position: 'absolute', bottom: 24, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: palette.muted },
  // Timeline chart
  timelineWrap: { position: 'relative', height: 72 },
  timelineBars: { flexDirection: 'row', height: 72, alignItems: 'flex-end', gap: 2 },
  timelineBar: { flex: 1, alignItems: 'center', height: 72, justifyContent: 'flex-end' },
  timelineAvgLine: { position: 'absolute', left: 0, right: 0, height: 0.5, backgroundColor: '#6366f1' },
  timelineAvgLabel: { position: 'absolute', right: 2, fontSize: 6, color: '#6366f1' },
})

function BarChart({ data, total }: { data: { label: string; count: number }[]; total: number }) {
  return (
    <View>
      {data.map(({ label, count }) => {
        const pct = total > 0 ? count / total : 0
        return (
          <View key={label} style={s.barRow}>
            <Text style={s.barLabel}>{label.length > 12 ? label.slice(0, 11) + '…' : label}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <Text style={s.barCount}>{count}</Text>
          </View>
        )
      })}
    </View>
  )
}

const BAR_AREA_H = 60
const LABEL_H = 12

function TimelineBarChart({ data, average, reportedMonth }: {
  data: MonthTrend[]
  average: number
  reportedMonth: string
}) {
  const max = Math.max(...data.map(d => d.count), 1)
  const avgLineBottom = LABEL_H + (average / max) * BAR_AREA_H
  const avgLabel = average % 1 === 0 ? String(average) : average.toFixed(1)

  return (
    <View style={s.timelineWrap}>
      <View style={[s.timelineAvgLine, { bottom: avgLineBottom }]} />
      <Text style={[s.timelineAvgLabel, { bottom: avgLineBottom + 2 }]}>
        Média: {avgLabel}/mês
      </Text>
      <View style={s.timelineBars}>
        {data.map(d => {
          const barH = d.count > 0 ? Math.max((d.count / max) * BAR_AREA_H, 1.5) : 0
          const isReported = d.month === reportedMonth
          return (
            <View key={d.month} style={s.timelineBar}>
              <View style={{
                width: '82%',
                height: barH,
                backgroundColor: isReported ? '#1e40af' : '#bfdbfe',
                borderRadius: 1,
                marginBottom: LABEL_H,
              }} />
              <Text style={{
                position: 'absolute',
                bottom: 0,
                fontSize: 5.5,
                color: isReported ? '#1e40af' : '#9ca3af',
                textAlign: 'center',
              }}>
                {d.label}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa',
}
const STATUS_LABELS: Record<string, string> = {
  aberto: 'Aberto', em_andamento: 'Em andamento', aguardando_cliente: 'Ag. cliente',
  aguardando_fornecedor: 'Ag. fornecedor', resolvido: 'Resolvido', fechado: 'Fechado', reaberto: 'Reaberto',
}
const CHANNEL_LABELS: Record<string, string> = {
  zabbix: 'Zabbix', azure_monitor: 'Azure Monitor', url_monitoring: 'URL Monitoring',
}

export function MonthlyReportPDF({
  companyName, providerName, period, logoUrl, tickets, meetings = [], gmuds = [], monitoring = [],
  monthlyTrend, reportedMonth,
}: MonthlyReportProps) {
  const provider = providerName || 'ITRAMOS ITSM'
  const resolved = tickets.filter(t => t.status === 'resolvido').length
  const fechado = tickets.filter(t => t.status === 'fechado').length
  const closedTotal = resolved + fechado
  const slaMet = closedTotal
  const slaPerc = tickets.length > 0 ? Math.round((slaMet / tickets.length) * 100) : 0
  const reopened = tickets.filter(t => t.reopened).length
  const reopenRate = tickets.length > 0 ? Math.round((reopened / tickets.length) * 100) : 0

  const catMap: Record<string, number> = {}
  tickets.forEach(t => { catMap[t.category] = (catMap[t.category] ?? 0) + 1 })
  const catDist = Object.entries(catMap).sort(([, a], [, b]) => b - a).slice(0, 6)

  const prioMap: Record<string, number> = {}
  tickets.forEach(t => { prioMap[t.priority] = (prioMap[t.priority] ?? 0) + 1 })
  const prioDist = (['critica', 'alta', 'media', 'baixa'] as const)
    .map(p => ({ label: PRIORITY_LABELS[p], count: prioMap[p] ?? 0 }))

  const statusMap: Record<string, number> = {}
  tickets.forEach(t => { statusMap[t.status] = (statusMap[t.status] ?? 0) + 1 })
  const statusDist = Object.entries(statusMap).map(([k, v]) => ({ label: STATUS_LABELS[k] ?? k, count: v }))

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
  const trunc = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + '…' : s

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          {logoUrl
            ? <Image src={logoUrl} style={s.logo} />
            : <Text style={s.logoPlaceholder}>{provider}</Text>
          }
          <View style={s.headerRight}>
            <Text style={s.companyName}>{companyName}</Text>
            <Text style={s.period}>Relatório Mensal — {period}</Text>
          </View>
        </View>
        <View style={s.divider} />

        {/* Resumo executivo */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Resumo Executivo</Text>
          <View style={s.row4}>
            <View style={s.card}>
              <Text style={s.cardLabel}>Total de chamados</Text>
              <Text style={s.cardValue}>{tickets.length}</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Resolvidos/Fechados</Text>
              <Text style={[s.cardValue, { color: palette.green }]}>{closedTotal}</Text>
              <Text style={{ fontSize: 7, color: palette.muted, marginTop: 2 }}>{resolved} resolvidos · {fechado} fechados</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>SLA cumprido</Text>
              <Text style={[s.cardValue, { color: palette.primary }]}>{slaPerc}%</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardLabel}>Taxa de reabertura</Text>
              <Text style={[s.cardValue, { color: reopenRate > 10 ? palette.red : '#111827' }]}>{reopenRate}%</Text>
            </View>
          </View>
        </View>

        {/* Linha do tempo — últimos 12 meses */}
        {monthlyTrend && monthlyTrend.length > 0 && reportedMonth && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Evolução Mensal — últimos 12 meses</Text>
            <TimelineBarChart
              data={monthlyTrend}
              average={monthlyTrend.reduce((s, d) => s + d.count, 0) / monthlyTrend.length}
              reportedMonth={reportedMonth}
            />
            <Text style={{ fontSize: 7, color: palette.muted, marginTop: 6 }}>
              Barra azul escura = mês do relatório. Linha roxa = média mensal do período.
            </Text>
          </View>
        )}

        {/* Gráficos */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Distribuição</Text>
          <View style={s.col2}>
            <View style={s.col2item}>
              <Text style={s.smallLabel}>Por categoria</Text>
              <BarChart data={catDist.map(([l, c]) => ({ label: l, count: c }))} total={tickets.length} />
            </View>
            <View style={s.col2item}>
              <Text style={s.smallLabel}>Por prioridade</Text>
              <BarChart data={prioDist} total={tickets.length} />
              <Text style={[s.smallLabel, { marginTop: 12 }]}>Por status</Text>
              <BarChart data={statusDist} total={tickets.length} />
            </View>
          </View>
        </View>

        {/* Tabela de chamados */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Chamados do período</Text>
          <View style={s.table}>
            <View style={s.tableHeader}>
              <Text style={[s.th, { width: 30 }]}>#</Text>
              <Text style={[s.th, { flex: 3 }]}>Título</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Categoria</Text>
              <Text style={[s.th, { width: 45 }]}>Prior.</Text>
              <Text style={[s.th, { width: 50 }]}>Abertura</Text>
              <Text style={[s.th, { width: 50 }]}>Fechamento</Text>
              <Text style={[s.th, { flex: 1.5 }]}>Analista</Text>
              <Text style={[s.th, { width: 60 }]}>Status</Text>
            </View>
            {tickets.slice(0, 80).map((t, i) => (
              <View key={t.number} style={t.reopened ? s.tableRowAlt : i % 2 === 0 ? s.tableRow : [s.tableRow, { backgroundColor: palette.bg }]}>
                <Text style={[s.td, { width: 30 }]}>{t.number}</Text>
                <Text style={[s.td, { flex: 3 }]}>{trunc(t.title, 60)}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{trunc(t.category, 20)}</Text>
                <Text style={[s.td, { width: 45 }]}>{PRIORITY_LABELS[t.priority] ?? t.priority}</Text>
                <Text style={[s.td, { width: 50 }]}>{fmtDate(t.created_at)}</Text>
                <Text style={[s.td, { width: 50 }]}>{t.closed_at ? fmtDate(t.closed_at) : '—'}</Text>
                <Text style={[s.td, { flex: 1.5 }]}>{trunc(t.analyst_name, 20)}</Text>
                <Text style={[s.td, { width: 60 }]}>{STATUS_LABELS[t.status] ?? t.status}</Text>
              </View>
            ))}
          </View>
          {tickets.length > 80 && (
            <Text style={{ fontSize: 8, color: palette.muted, marginTop: 4 }}>
              Exibindo 80 de {tickets.length} chamados.
            </Text>
          )}
        </View>

        {/* Rodapé */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>{provider} — Relatório gerado automaticamente</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Página 2: reuniões, GMUDs, monitoramento */}
      {(meetings.length > 0 || gmuds.length > 0 || monitoring.length > 0) && (
        <Page size="A4" style={s.page}>
          <View style={s.header}>
            {logoUrl
              ? <Image src={logoUrl} style={s.logo} />
              : <Text style={s.logoPlaceholder}>{provider}</Text>
            }
            <View style={s.headerRight}>
              <Text style={s.companyName}>{companyName}</Text>
              <Text style={s.period}>Relatório Mensal — {period}</Text>
            </View>
          </View>
          <View style={s.divider} />

          {/* Reuniões */}
          {meetings.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Reuniões ({meetings.length})</Text>
              <View style={s.table}>
                <View style={s.tableHeader}>
                  <Text style={[s.th, { width: 60 }]}>Data</Text>
                  <Text style={[s.th, { flex: 2 }]}>Pauta</Text>
                  <Text style={[s.th, { flex: 3 }]}>Itens de ação</Text>
                </View>
                {meetings.map((m, i) => (
                  <View key={i} style={i % 2 === 0 ? s.tableRow : [s.tableRow, { backgroundColor: palette.bg }]}>
                    <Text style={[s.td, { width: 60 }]}>{fmtDate(m.date)}</Text>
                    <Text style={[s.td, { flex: 2 }]}>{trunc(m.title, 50)}</Text>
                    <Text style={[s.td, { flex: 3 }]}>{trunc(m.action_items ?? '—', 80)}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* GMUDs */}
          {gmuds.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Mudanças — GMUD ({gmuds.length})</Text>
              <View style={s.table}>
                <View style={s.tableHeader}>
                  <Text style={[s.th, { flex: 3 }]}>Título</Text>
                  <Text style={[s.th, { width: 70 }]}>Status</Text>
                  <Text style={[s.th, { width: 80 }]}>Janela de manutenção</Text>
                </View>
                {gmuds.map((g, i) => (
                  <View key={i} style={i % 2 === 0 ? s.tableRow : [s.tableRow, { backgroundColor: palette.bg }]}>
                    <Text style={[s.td, { flex: 3 }]}>{trunc(g.title, 60)}</Text>
                    <Text style={[s.td, { width: 70 }]}>{g.status}</Text>
                    <Text style={[s.td, { width: 80 }]}>{g.maintenance_start ? fmtDate(g.maintenance_start) : '—'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Monitoramento */}
          {monitoring.length > 0 && (
            <View style={s.section}>
              <Text style={s.sectionTitle}>Monitoramento</Text>
              <View style={s.table}>
                <View style={s.tableHeader}>
                  <Text style={[s.th, { flex: 2 }]}>Conector</Text>
                  <Text style={[s.th, { width: 60 }]}>Total alertas</Text>
                  <Text style={[s.th, { width: 70 }]}>Resolvidos</Text>
                  <Text style={[s.th, { width: 60 }]}>MTTR médio</Text>
                </View>
                {monitoring.map((m, i) => (
                  <View key={i} style={i % 2 === 0 ? s.tableRow : [s.tableRow, { backgroundColor: palette.bg }]}>
                    <Text style={[s.td, { flex: 2 }]}>{CHANNEL_LABELS[m.channel] ?? m.channel}</Text>
                    <Text style={[s.td, { width: 60 }]}>{m.total}</Text>
                    <Text style={[s.td, { width: 70 }]}>{m.resolved}</Text>
                    <Text style={[s.td, { width: 60 }]}>{m.mttr_hours !== null ? `${m.mttr_hours.toFixed(1)}h` : '—'}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={s.footer} fixed>
            <Text style={s.footerText}>{provider} — Relatório gerado automaticamente</Text>
            <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  )
}
