// Regras de repetição — espelho em TypeScript de public.recurrence_matches (0003_recurring.sql).
// Usado para mostrar as próximas datas e as ocorrências futuras no Planejamento.
import { addDays, startOfWeek, today } from './dates'
import type { Priority } from './types'

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly'
export type EndType = 'never' | 'until' | 'count'

export interface Recurrence {
  id: string
  title: string
  description: string | null
  area_id: string | null
  priority: Priority
  time: string | null
  requires_validation: boolean
  freq: Freq
  every_n: number
  weekdays: number[] // 0 = segunda … 6 = domingo
  month_mode: 'day' | 'nth'
  month_day: number | null // -1 = último dia
  nth: number | null // 1..4, -1 = última
  nth_weekday: number | null
  start_date: string
  end_type: EndType
  until_date: string | null
  max_count: number | null
  active: boolean
  last_generated: string | null
  generated_count: number
  created_at: string
}

export type RecurrenceRule = Pick<
  Recurrence,
  'freq' | 'every_n' | 'weekdays' | 'month_mode' | 'month_day' | 'nth' | 'nth_weekday' | 'start_date' | 'end_type' | 'until_date' | 'max_count'
>

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number]
/** 0 = segunda … 6 = domingo */
export const weekdayOf = (iso: string) => {
  const [y, m, d] = parts(iso)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}
const lastDayOfMonth = (y: number, m: number) => new Date(y, m, 0).getDate()
const daysBetween = (a: string, b: string) => {
  const [y1, m1, d1] = parts(a)
  const [y2, m2, d2] = parts(b)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function matches(r: RecurrenceRule, iso: string): boolean {
  if (iso < r.start_date) return false
  if (r.end_type === 'until' && r.until_date && iso > r.until_date) return false
  const [y, m, d] = parts(iso)
  const [ys, ms, ds] = parts(r.start_date)
  const wd = weekdayOf(iso)
  const last = lastDayOfMonth(y, m)
  const n = Math.max(1, r.every_n || 1)

  switch (r.freq) {
    case 'daily':
      return daysBetween(r.start_date, iso) % n === 0
    case 'weekly': {
      if (r.weekdays.length === 0 ? wd !== weekdayOf(r.start_date) : !r.weekdays.includes(wd)) return false
      return (daysBetween(startOfWeek(r.start_date), startOfWeek(iso)) / 7) % n === 0
    }
    case 'monthly': {
      const months = y * 12 + m - (ys * 12 + ms)
      if (months < 0 || months % n !== 0) return false
      if (r.month_mode === 'nth') {
        if (wd !== (r.nth_weekday ?? weekdayOf(r.start_date))) return false
        const nth = r.nth ?? 1
        return nth === -1 ? d + 7 > last : Math.floor((d - 1) / 7) + 1 === nth
      }
      let target = r.month_day ?? ds
      if (target === -1 || target > last) target = last
      return d === target
    }
    case 'yearly': {
      if ((y - ys) % n !== 0 || m !== ms) return false
      return d === Math.min(ds, last)
    }
  }
}

/** Próximas `count` ocorrências a partir de `from` (inclusive), respeitando o limite de vezes. */
export function nextOccurrences(r: RecurrenceRule & { generated_count?: number; last_generated?: string | null }, from = today(), count = 5, maxDays = 800): string[] {
  const out: string[] = []
  let generated = r.generated_count ?? 0
  // ocorrências entre o último gerado e `from` também contam no limite
  let d = r.start_date > from ? r.start_date : from
  if (r.end_type === 'count' && r.last_generated && r.last_generated >= d) d = addDays(r.last_generated, 1)
  for (let i = 0; i < maxDays && out.length < count; i++, d = addDays(d, 1)) {
    if (r.end_type === 'count' && generated >= (r.max_count ?? 0)) break
    if (r.end_type === 'until' && r.until_date && d > r.until_date) break
    if (matches(r, d)) {
      out.push(d)
      generated++
    }
  }
  return out
}
