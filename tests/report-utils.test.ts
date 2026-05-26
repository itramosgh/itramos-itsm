import { describe, it, expect } from 'vitest'
import { isFirstBusinessDayOfMonth, formatMonthReference, getPreviousMonthRange } from '@/lib/report-utils'

describe('isFirstBusinessDayOfMonth', () => {
  it('returns true when the 1st is a weekday and not a holiday', () => {
    // 2026-06-01 is a Monday
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-01'), [])).toBe(true)
  })

  it('returns false when the 1st is a Saturday', () => {
    // 2026-08-01 is a Saturday
    expect(isFirstBusinessDayOfMonth(new Date('2026-08-01'), [])).toBe(false)
  })

  it('returns false when the 1st is a Sunday', () => {
    // 2026-11-01 is a Sunday
    expect(isFirstBusinessDayOfMonth(new Date('2026-11-01'), [])).toBe(false)
  })

  it('returns true when 2nd is first business day because 1st was a Sunday', () => {
    // 2026-11-01 is Sunday, so 2026-11-02 (Monday) is first business day
    expect(isFirstBusinessDayOfMonth(new Date('2026-11-02'), [])).toBe(true)
  })

  it('returns false when date is not the first business day', () => {
    // 2026-06-02 is not the first business day (2026-06-01 was)
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-02'), [])).toBe(false)
  })

  it('returns false when 1st is a weekday but is a holiday', () => {
    // 2026-06-01 would be first business day but it is a holiday
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-01'), ['2026-06-01'])).toBe(false)
  })

  it('returns true when 1st is holiday and 2nd is the first business day', () => {
    // Assume 2026-06-01 (Monday) is a holiday → 2026-06-02 (Tuesday) is first business day
    expect(isFirstBusinessDayOfMonth(new Date('2026-06-02'), ['2026-06-01'])).toBe(true)
  })

  it('skips multiple holidays to find first business day', () => {
    // Sat 1st, Sun 2nd, Mon 3rd is holiday → Tue 4th is first business day
    // Use Aug 2026: Sat 1, Sun 2, Mon 3 (holiday), Tue 4
    expect(isFirstBusinessDayOfMonth(new Date('2026-08-04'), ['2026-08-03'])).toBe(true)
  })
})

describe('formatMonthReference', () => {
  it('returns the previous month capitalized in pt-BR', () => {
    const result = formatMonthReference(new Date('2026-05-01'))
    expect(result).toMatch(/abril/i)
    expect(result).toContain('2026')
  })

  it('wraps correctly from January to December of previous year', () => {
    const result = formatMonthReference(new Date('2026-01-15'))
    expect(result).toMatch(/dezembro/i)
    expect(result).toContain('2025')
  })
})

describe('getPreviousMonthRange', () => {
  it('returns correct from/to for mid-year', () => {
    const { from, to } = getPreviousMonthRange(new Date('2026-05-10'))
    expect(from).toBe('2026-04-01')
    expect(to).toBe('2026-04-30')
  })

  it('returns correct from/to when current month is January', () => {
    const { from, to } = getPreviousMonthRange(new Date('2026-01-10'))
    expect(from).toBe('2025-12-01')
    expect(to).toBe('2025-12-31')
  })

  it('returns correct from/to for February (non-leap year)', () => {
    const { from, to } = getPreviousMonthRange(new Date('2026-03-01'))
    expect(from).toBe('2026-02-01')
    expect(to).toBe('2026-02-28')
  })
})
