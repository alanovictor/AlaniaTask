import { useState } from 'react'
import { CalendarPlus, ChevronDown, CornerDownRight, ShieldCheck } from 'lucide-react'
import { useData } from '../lib/data'
import { isOpen } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { PRIORITY_RANK, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { ScheduleSheet } from '../components/ScheduleSheet'
import { EmptyState } from '../components/ui'

export function Validation() {
  const { t, locale } = useSettings()
  const { tasks } = useData()
  const [sheet, setSheet] = useState<Task | null>(null)
  const [showRecent, setShowRecent] = useState(false)

  const byId = new Map(tasks.map((x) => [x.id, x]))
  const validations = tasks.filter((x) => x.validation_of)
  const pending = validations.filter((x) => isOpen(x) && !x.date).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.created_at.localeCompare(b.created_at))
  const scheduled = validations.filter((x) => isOpen(x) && x.date).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time ?? '99').localeCompare(b.time ?? '99'))
  const recent = validations
    .filter((x) => !isOpen(x))
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 15)

  const item = (x: Task, withSchedule: boolean) => {
    const original = x.validation_of ? byId.get(x.validation_of) : undefined
    return (
      <div key={x.id} className="space-y-1.5">
        <TaskCard task={x} />
        <div className="flex flex-wrap items-center gap-2 pl-3 text-xs text-muted">
          {original && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CornerDownRight size={13} className="shrink-0" />
              <span className="shrink-0">{t.validation_of}:</span>
              <span className="truncate font-medium text-fg/80">{original.title}</span>
              {original.completed_at && <span className="shrink-0">· {new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(original.completed_at))}</span>}
            </span>
          )}
          {withSchedule && (
            <button onClick={() => setSheet(x)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 font-semibold text-accent hover:bg-accent/20">
              <CalendarPlus size={14} />
              {t.set_date}
            </button>
          )}
        </div>
      </div>
    )
  }

  const empty = pending.length === 0 && scheduled.length === 0 && recent.length === 0

  return (
    <>
      <PageHeader title={t.nav_validation} subtitle={t.validation_subtitle} />

      {empty ? (
        <EmptyState icon={<ShieldCheck size={28} />} title={t.validation_empty_title} text={t.validation_empty_text} />
      ) : (
        <div className="space-y-8">
          {pending.length === 0 && scheduled.length === 0 && (
            <EmptyState icon={<ShieldCheck size={28} />} title={t.validation_empty_title} text={t.validation_empty_text} />
          )}

          {pending.length > 0 && (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-accent uppercase">
                {t.validation_pending}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{pending.length}</span>
              </h2>
              <p className="mt-0.5 mb-3 text-xs text-muted">{t.validation_pending_hint}</p>
              <div className="grid gap-4">{pending.map((x) => item(x, true))}</div>
            </section>
          )}

          {scheduled.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
                {t.validation_scheduled}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{scheduled.length}</span>
              </h2>
              <div className="grid gap-4">{scheduled.map((x) => item(x, false))}</div>
            </section>
          )}

          {recent.length > 0 && (
            <section>
              <button onClick={() => setShowRecent(!showRecent)} className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg">
                <ChevronDown size={16} className={`transition-transform ${showRecent ? '' : '-rotate-90'}`} />
                {t.validation_recent} · {recent.length}
              </button>
              {showRecent && <div className="grid gap-4 opacity-75">{recent.map((x) => item(x, false))}</div>}
            </section>
          )}
        </div>
      )}

      {sheet && <ScheduleSheet key={sheet.id} task={tasks.find((x) => x.id === sheet.id) ?? sheet} onClose={() => setSheet(null)} />}
    </>
  )
}
