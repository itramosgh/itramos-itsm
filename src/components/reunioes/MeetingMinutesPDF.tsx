import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  header: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 11, color: '#6b7280' },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: 'bold', marginBottom: 8, color: '#1f2937' },
  participant: { fontSize: 10, marginBottom: 2, color: '#374151' },
  notes: { fontSize: 10, color: '#374151', lineHeight: 1.5 },
  actionItem: {
    borderLeftWidth: 2,
    borderLeftColor: '#3b82f6',
    paddingLeft: 8,
    marginBottom: 8,
  },
  actionDesc: { fontSize: 10, fontWeight: 'bold' },
  actionMeta: { fontSize: 9, color: '#6b7280', marginTop: 2 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 9, color: '#9ca3af', textAlign: 'center' },
})

interface MeetingMinutesPDFProps {
  meeting: {
    title: string
    scheduled_at: string
    companies: { name: string } | null
    notes_html?: string | null
  }
  participants: Array<{
    profiles?: { full_name: string } | null
    contacts?: { full_name: string } | null
    external_name?: string | null
    external_email?: string | null
  }>
  actionItems: Array<{
    description: string
    status: string
    due_date: string | null
    profiles?: { full_name: string } | null
  }>
}

export function MeetingMinutesPDF({ meeting, participants, actionItems }: MeetingMinutesPDFProps) {
  const dateFormatted = new Date(meeting.scheduled_at).toLocaleString('pt-BR', {
    dateStyle: 'full', timeStyle: 'short',
  })

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Ata de Reunião</Text>
          <Text style={styles.subtitle}>ITRAMOS Tecnologia</Text>
        </View>

        <View>
          <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{meeting.title}</Text>
          <Text style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
            {meeting.companies?.name} · {dateFormatted}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Participantes</Text>
          {participants.map((p, i) => {
            const name = p.profiles?.full_name ?? p.contacts?.full_name ?? p.external_name ?? ''
            const extra = p.external_email ? ` (${p.external_email})` : ''
            return <Text key={i} style={styles.participant}>• {name}{extra}</Text>
          })}
        </View>

        {meeting.notes_html && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Anotações e Decisões</Text>
            <Text style={styles.notes}>
              {meeting.notes_html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
            </Text>
          </View>
        )}

        {actionItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Itens de Ação</Text>
            {actionItems.map((item, i) => (
              <View key={i} style={styles.actionItem}>
                <Text style={styles.actionDesc}>{item.description}</Text>
                <Text style={styles.actionMeta}>
                  {item.profiles?.full_name ? `Responsável: ${item.profiles.full_name}` : ''}
                  {item.due_date ? ` · Prazo: ${new Date(item.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                  {` · Status: ${item.status}`}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>Gerado por ITRAMOS ITSM em {new Date().toLocaleString('pt-BR')}</Text>
      </Page>
    </Document>
  )
}
