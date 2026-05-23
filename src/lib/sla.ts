export interface BusinessHoursSettings {
  start: string
  end: string
  days: number[] // 1=Seg ... 7=Dom (ISO)
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number)
  return { hours: h, minutes: m }
}

function toISOWeekday(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

export function isBusinessDay(
  date: Date,
  settings: BusinessHoursSettings,
  holidays: string[]
): boolean {
  const isoDay = toISOWeekday(date.getDay())
  if (!settings.days.includes(isoDay)) return false
  const dateStr = date.toISOString().slice(0, 10)
  return !holidays.includes(dateStr)
}

function nextBusinessDayStart(
  date: Date,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + 1)
  next.setHours(0, 0, 0, 0)

  while (!isBusinessDay(next, settings, holidays)) {
    next.setDate(next.getDate() + 1)
  }

  const { hours, minutes } = parseTime(settings.start)
  next.setHours(hours, minutes, 0, 0)
  return next
}

export function addBusinessHours(
  start: Date,
  hours: number,
  settings: BusinessHoursSettings,
  holidays: string[]
): Date {
  let remainingMinutes = hours * 60
  let current = new Date(start)

  const startTime = parseTime(settings.start)
  const endTime = parseTime(settings.end)
  const startMins = startTime.hours * 60 + startTime.minutes
  const endMins = endTime.hours * 60 + endTime.minutes

  while (remainingMinutes > 0) {
    if (!isBusinessDay(current, settings, holidays)) {
      current = nextBusinessDayStart(current, settings, holidays)
      continue
    }

    const currentMins = current.getHours() * 60 + current.getMinutes()

    if (currentMins < startMins) {
      current = new Date(current)
      current.setHours(startTime.hours, startTime.minutes, 0, 0)
    }

    const refreshedMins = current.getHours() * 60 + current.getMinutes()

    if (refreshedMins >= endMins) {
      current = nextBusinessDayStart(current, settings, holidays)
      continue
    }

    const minutesAvailable = endMins - refreshedMins

    if (remainingMinutes <= minutesAvailable) {
      return new Date(current.getTime() + remainingMinutes * 60_000)
    }

    remainingMinutes -= minutesAvailable
    current = nextBusinessDayStart(current, settings, holidays)
  }

  return current
}

export function calculateDeadline(params: {
  createdAt: Date
  responseHours: number
  is24x7: boolean
  settings: BusinessHoursSettings
  holidays: string[]
}): Date {
  const { createdAt, responseHours, is24x7, settings, holidays } = params

  if (is24x7) {
    return new Date(createdAt.getTime() + responseHours * 60 * 60_000)
  }

  return addBusinessHours(createdAt, responseHours, settings, holidays)
}

export function getSLARemainingMinutes(
  deadline: Date,
  pausedAt: Date | null
): number {
  const now = new Date()
  const currentPauseMs = pausedAt ? now.getTime() - pausedAt.getTime() : 0
  return Math.floor((deadline.getTime() - now.getTime() + currentPauseMs) / 60_000)
}

export function getSLAPercentUsed(
  createdAt: Date,
  deadline: Date,
  pausedAt: Date | null
): number {
  const totalMs = deadline.getTime() - createdAt.getTime()
  const remainingMs = getSLARemainingMinutes(deadline, pausedAt) * 60_000
  if (totalMs <= 0) return 100
  return Math.max(0, Math.min(100, Math.round(((totalMs - remainingMs) / totalMs) * 100)))
}
