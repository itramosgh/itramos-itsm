export function nextOccurrenceDate(
  currentDueDate: string,
  recurrenceType: string,
  intervalDays?: number | null
): string {
  // Use noon to avoid timezone issues in month/year changes
  const date = new Date(`${currentDueDate}T12:00:00`)

  switch (recurrenceType) {
    case 'diaria':
      date.setDate(date.getDate() + 1)
      break
    case 'semanal':
      date.setDate(date.getDate() + 7)
      break
    case 'quinzenal':
      date.setDate(date.getDate() + 14)
      break
    case 'mensal':
      date.setMonth(date.getMonth() + 1)
      break
    case 'anual':
      date.setFullYear(date.getFullYear() + 1)
      break
    case 'personalizado':
      date.setDate(date.getDate() + (intervalDays ?? 1))
      break
  }

  return date.toISOString().slice(0, 10)
}
