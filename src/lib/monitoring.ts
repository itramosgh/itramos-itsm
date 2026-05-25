import type { Database } from '@/types/database'
import type { BusinessHoursSettings } from '@/lib/sla'

type MonitoringIntegration = Database['public']['Tables']['monitoring_integrations']['Row']

function toISOWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
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

  const isoDay = toISOWeekday(now.getDay())
  const dateStr = now.toISOString().slice(0, 10)
  const currentMins = now.getHours() * 60 + now.getMinutes()

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
