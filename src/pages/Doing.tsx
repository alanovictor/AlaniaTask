import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, Sun } from 'lucide-react'
import { useData } from '../lib/data'
import { formatDate, isInDoing, isOverdue, toISODate, today } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { CLOSED, PRIORITY_RANK, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { EmptyState } from '../components/ui'

const byPriorityThenTime = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.time ?? '99').localeCompare(b.time ?? '99') || a.created_at.localeCompare(b.created_at)

export function Doing() {
  const { t, locale } = useSettings()
  const { tasks } = useData()
  const [showDone, setShowDone] = useState(false)
  const ref = today()

  const doing = tasks.filter((x) => isInDoing(x, ref))
  const overdue = doing.filter((x) => isOverdue(x, ref)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || byPriorityThenTime(a, b))
  const todays = doing.filter((x) => !isOverdue(x, ref)).sort(byPriorityThenTime)
  const doneToday = tasks.filter((x) => CLOSED.includes(x.status) && !!x.completed_at && toISODate(new Date(x.completed_at)) === ref)

  const total = doing.length + doneToday.length
  const pct = total ? Math.round((doneToday.length / total) * 100) : 0
  const dateTitle = formatDate(ref, locale, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <>
      <PageHeader title={t.doing_title} subtitle={<span className="inline-block first-letter:uppercase">{dateTitle}</span>} />

      {total > 0 && (
        <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold">
              {doneToday.length} {t.of} {total}
            </span>
            <span className="text-muted">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {doing.length === 0 && doneToday.length === 0 ? (
        <EmptyState
          icon={<Sun size={28} />}
          title={t.doing_empty_title}
          text={t.doing_empty_text}
          action={
            <Link to="/tasks" className="btn btn-primary">
              {t.go_to_tasks}
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          {overdue.length > 0 && (
            <Section title={t.doing_overdue} count={overdue.length} danger>
              {overdue.map((x) => (
                <TaskCard key={x.id} task={x} showDoingToggle />
              ))}
            </Section>
          )}
          {todays.length > 0 && (
            <Section title={t.doing_today} count={todays.length}>
              {todays.map((x) => (
                <TaskCard key={x.id} task={x} showDoingToggle />
              ))}
            </Section>
          )}
          {doneToday.length > 0 && (
            <div>
              <button onClick={() => setShowDone(!showDone)} className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg">
                <ChevronDown size={16} className={`transition-transform ${showDone ? '' : '-rotate-90'}`} />
                {t.doing_done_today} · {doneToday.length}
              </button>
              {showDone && (
                <div className="grid gap-2.5 opacity-75">
                  {doneToday.map((x) => (
                    <TaskCard key={x.id} task={x} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

function Section({ title, count, danger = false, children }: { title: string; count: number; danger?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide uppercase ${danger ? 'text-danger' : 'text-muted'}`}>
        {title}
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{count}</span>
      </h2>
      <div className="grid gap-2.5">{children}</div>
    </section>
  )
}
