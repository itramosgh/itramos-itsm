export function isFirstBusinessDayOfMonth(date: Date, holidays: string[]): boolean {
  const dayOfMonth = date.getUTCDate()
  const dayOfWeek = date.getUTCDay()
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const iso = date.toISOString().slice(0, 10)

  if (dayOfWeek === 0 || dayOfWeek === 6) return false
  if (holidays.includes(iso)) return false

  // All days before this one in the month must be weekends or holidays
  for (let d = 1; d < dayOfMonth; d++) {
    const candidate = new Date(Date.UTC(year, month, d))
    const dow = candidate.getUTCDay()
    if (dow !== 0 && dow !== 6) {
      const candidateIso = candidate.toISOString().slice(0, 10)
      if (!holidays.includes(candidateIso)) return false
    }
  }

  return true
}

export function formatMonthReference(date: Date): string {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() // 0-indexed current month
  const prev = new Date(Date.UTC(year, month - 1, 1))
  return prev.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .replace(/^\w/, (c) => c.toUpperCase())
}

export function getPreviousMonthRange(date: Date): { from: string; to: string } {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() // 0-indexed current month
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10)
  const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) // last day of prev month
  return { from, to }
}
