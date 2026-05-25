import type { Database } from '@/types/database'
import type { BusinessHoursSettings } from '@/lib/sla'

type MonitoringIntegration = Database['public']['Tables']['monitoring_integrations']['Row']

// Returns date parts in São Paulo timezone (server runs in UTC on Vercel)
function getSaoPauloDateParts(date: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]))
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const jsDay = weekdayMap[parts.weekday] ?? 0
  const isoDay = jsDay === 0 ? 7 : jsDay
  const hours = parseInt(parts.hour === '24' ? '0' : parts.hour, 10)
  const minutes = parseInt(parts.minute, 10)
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`
  return { isoDay, hours, minutes, dateStr }
}

function parseTime(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function isWithinMonitoringWindow(
  integration: MonitoringIntegration,
  now: Date,
  holidays: string[],
  platformHours: BusinessHoursSettings
): boolean {
  if (integration.window_type === '24x7') return true

  const { isoDay, hours, minutes, dateStr } = getSaoPauloDateParts(now)
  const currentMins = hours * 60 + minutes

  if (integration.window_type === 'horario_comercial') {
    if (!platformHours.days.includes(isoDay)) return false
    if (holidays.includes(dateStr)) return false
    const startMins = parseTime(platformHours.start)
    const endMins = parseTime(platformHours.end)
    return currentMins >= startMins && currentMins < endMins
  }

  // personalizado
  if (!integration.window_custom_days || !integration.window_custom_start || !integration.window_custom_end) {
    return false
  }
  if (!integration.window_custom_days.includes(isoDay)) return false
  const startMins = parseTime(integration.window_custom_start)
  const endMins = parseTime(integration.window_custom_end)
  return currentMins >= startMins && currentMins < endMins
}

export function mapZabbixSeverity(severity: string): 'critica' | 'alta' | 'media' | 'baixa' {
  switch (severity) {
    case 'Disaster':
    case 'High':
      return 'critica'
    case 'Average':
      return 'alta'
    case 'Warning':
      return 'media'
    case 'Information':
    case 'Not classified':
    default:
      return 'baixa'
  }
}

export function mapAzureMonitorSeverity(severity: string): 'critica' | 'alta' | 'media' | 'baixa' {
  switch (severity) {
    case 'Sev0':
    case 'Critical':
      return 'critica'
    case 'Sev1':
    case 'Error':
      return 'alta'
    case 'Sev2':
    case 'Warning':
      return 'media'
    case 'Sev3':
    case 'Informational':
    default:
      return 'baixa'
  }
}
