import type { Task } from './types'
import { CLOSED } from './types'

const pad = (n: number) => String(n).padStart(2, '0')

/** Data local no formato YYYY-MM-DD (sem fuso UTC). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function today(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISODate(new Date(y, m - 1, d + days))
}

export function isOpen(t: Task): boolean {
  return !CLOSED.includes(t.status)
}

/** Atrasada: tem data anterior a hoje e ainda está aberta. */
export function isOverdue(t: Task, ref = today()): boolean {
  return isOpen(t) && !!t.date && t.date < ref
}

/** No Doing: aberta e com data até hoje (atrasadas continuam aparecendo). */
export function isInDoing(t: Task, ref = today()): boolean {
  return isOpen(t) && !!t.date && t.date <= ref
}

export function daysLate(t: Task, ref = today()): number {
  if (!t.date) return 0
  const [y1, m1, d1] = t.date.split('-').map(Number)
  const [y2, m2, d2] = ref.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function formatDate(iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, opts).format(new Date(y, m - 1, d))
}

/** Segunda-feira da semana de `iso`. */
export function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dow = (date.getDay() + 6) % 7
  return addDays(iso, -dow)
}
