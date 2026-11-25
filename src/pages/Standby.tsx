import { useState } from 'react'
import { ChevronDown, PauseCircle, Play } from 'lucide-react'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { CLOSED, PRIORITY_RANK, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { EmptyState } from '../components/ui'

export function Standby() {
  const { t, locale } = useSettings()
  const { standbyTasks, patchTask } = useData()
  const [showClosed, setShowClosed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const open = standbyTasks
    .filter((x) => !CLOSED.includes(x.status))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (b.standby_at ?? '').localeCompare(a.standby_at ?? ''))
  const closed = standbyTasks.filter((x) => CLOSED.includes(x.status))

  const resume = async (x: Task) => {
    setBusy(x.id)
    await patchTask(x.id, { standby: false, standby_at: null }).catch(() => {})
    setBusy(null)
  }

  const since = (iso: string) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(new Date(iso))

  const item = (x: Task) => (
    <div key={x.id} className="space-y-1.5">
      <TaskCard task={x} />
      <div className="flex flex-wrap items-center gap-2 pl-3 text-xs text-muted">
        {x.standby_at && (
          <span className="inline-flex items-center gap-1.5">
            <PauseCircle size={13} />
            {t.standby_since} {since(x.standby_at)}
          </span>
        )}
        <button
          onClick={() => resume(x)}
          disabled={busy === x.id}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1 font-semibold text-accent hover:bg-accent/20 disabled:opacity-50"
        >
          <Play size={13} />
          {t.standby_resume}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <PageHeader title={t.standby} subtitle={t.standby_subtitle} />
      {standbyTasks.length === 0 ? (
        <EmptyState icon={<PauseCircle size={28} />} title={t.standby_empty_title} text={t.standby_empty_text} />
      ) : (
        <div className="space-y-8">
          {open.length > 0 && <div className="grid grid-cols-1 gap-4">{open.map(item)}</div>}
          {closed.length > 0 && (
            <section>
              <button onClick={() => setShowClosed(!showClosed)} className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg">
                <ChevronDown size={16} className={`transition-transform ${showClosed ? '' : '-rotate-90'}`} />
                {t.closed_n(closed.length)}
              </button>
              {showClosed && <div className="grid grid-cols-1 gap-4 opacity-75">{closed.map(item)}</div>}
            </section>
          )}
        </div>
      )}
    </>
  )
}
