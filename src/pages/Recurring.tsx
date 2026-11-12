import { useState } from 'react'
import { Clock, Pause, Play, Plus, Repeat } from 'lucide-react'
import { useData, type RecurrenceDraft } from '../lib/data'
import { addDays, formatDate, today } from '../lib/dates'
import { nextOccurrences, type Recurrence } from '../lib/recurrence'
import { useSettings } from '../lib/settings'
import { PRIORITY_COLOR } from '../lib/types'
import type { Dict } from '../lib/i18n'
import { PageHeader } from '../components/Layout'
import { RecurrenceEditor, draftFromRecurrence, emptyRecurrence } from '../components/RecurrenceEditor'
import { AreaChip, EmptyState } from '../components/ui'

/** Texto da regra, ex.: "Toda semana: seg, qua, sex · até 30 de dez." */
export function describeRule(r: Recurrence, t: Dict, locale: string): string {
  const short = (i: number) => formatDate(`2024-01-0${i + 1}`, locale, { weekday: 'short' }).replace('.', '') // 01/01/2024 foi segunda
  let s: string
  switch (r.freq) {
    case 'daily':
      s = t.desc_daily(r.every_n)
      break
    case 'weekly':
      s = t.desc_weekly(r.every_n, [...r.weekdays].sort().map(short).join(', '))
      break
    case 'monthly':
      s = t.desc_monthly_day(
        r.every_n,
        r.month_mode === 'nth' ? t.desc_month_nth(t.nth_names[r.nth ?? 1], t.weekday_names[r.nth_weekday ?? 0]) : t.desc_month_day(r.month_day ?? Number(r.start_date.slice(8))),
      )
      break
    default:
      s = t.desc_yearly(r.every_n, formatDate(r.start_date, locale, { day: 'numeric', month: 'long' }))
  }
  if (r.end_type === 'until' && r.until_date) s += ` · ${t.desc_until(formatDate(r.until_date, locale, { day: 'numeric', month: 'short', year: 'numeric' }))}`
  if (r.end_type === 'count' && r.max_count) s += ` · ${t.desc_count(r.max_count)}`
  return s
}

export function Recurring() {
  const { t, locale } = useSettings()
  const { recurrences, areaById, setRecurrenceActive } = useData()
  const [editing, setEditing] = useState<{ draft: RecurrenceDraft; rec?: Recurrence } | null>(null)

  const sorted = [...recurrences].sort((a, b) => Number(b.active) - Number(a.active) || a.title.localeCompare(b.title))

  return (
    <>
      <PageHeader
        title={t.nav_recurring}
        subtitle={t.recurring_subtitle}
        actions={
          <button className="btn btn-primary" onClick={() => setEditing({ draft: emptyRecurrence() })}>
            <Plus size={18} />
            {t.new_recurring}
          </button>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState icon={<Repeat size={28} />} title={t.recurring_empty_title} text={t.recurring_empty_text} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sorted.map((r) => {
            const area = r.area_id ? areaById.get(r.area_id) : undefined
            const from = r.last_generated && r.last_generated >= today() ? addDays(r.last_generated, 1) : today()
            const next = r.active ? nextOccurrences(r, from, 1)[0] : undefined
            return (
              <div
                key={r.id}
                onClick={() => setEditing({ draft: draftFromRecurrence(r), rec: r })}
                className={`group relative cursor-pointer rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/40 ${r.active ? '' : 'opacity-60'}`}
              >
                <span className="absolute top-3.5 bottom-3.5 left-0 w-[3px] rounded-r-full" style={{ background: PRIORITY_COLOR[r.priority] }} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium leading-snug break-words">{r.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-accent">
                      <Repeat size={14} className="shrink-0" />
                      <span className="first-letter:uppercase">{describeRule(r, t, locale)}</span>
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setRecurrenceActive(r.id, !r.active).catch(() => alert(t.error_generic))
                    }}
                    className="btn btn-ghost shrink-0 p-2"
                    title={r.active ? t.pause : t.resume}
                    aria-label={r.active ? t.pause : t.resume}
                  >
                    {r.active ? <Pause size={18} /> : <Play size={18} />}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                  {!r.active && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold">{t.paused}</span>}
                  {next && (
                    <span className="first-letter:uppercase">
                      {t.next_on}: {formatDate(next, locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {r.time && (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {r.time.slice(0, 5)}
                    </span>
                  )}
                  {area && <AreaChip name={area.name} color={area.color} />}
                  <span>{t.generated_n(r.generated_count)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <RecurrenceEditor
          key={editing.rec?.id ?? 'new'}
          initial={editing.draft}
          generatedCount={editing.rec?.generated_count}
          lastGenerated={editing.rec?.last_generated}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
