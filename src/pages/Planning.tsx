import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { ChevronLeft, ChevronRight, Inbox, Plus, AlertTriangle, Repeat } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { nextOccurrences, type Recurrence } from '../lib/recurrence'
import { useData } from '../lib/data'
import { addDays, addMonths, formatDate, isOpen, isOverdue, monthGrid, startOfMonth, startOfWeek, today } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { PRIORITY_COLOR, PRIORITY_RANK, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { useEditor } from '../components/TaskEditor'
import { ScheduleSheet } from '../components/ScheduleSheet'
import { Segmented } from '../components/ui'

type View = 'week' | 'month'
const VIEW_KEY = 'alania.planningView'
const DRAG_TYPE = 'application/x-alania-task'

const byTimeThenPriority = (a: Task, b: Task) =>
  (a.time ?? '99').localeCompare(b.time ?? '99') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title)

export function Planning() {
  const { t, locale } = useSettings()
  const { tasks, recurrences, areaById, patchTask } = useData()
  const navigate = useNavigate()
  const { openNew } = useEditor()
  const ref = today()

  const [view, setView] = useState<View>(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as View) || 'week'
    } catch {
      return 'week'
    }
  })
  const [anchor, setAnchor] = useState(ref)
  const [mobileTab, setMobileTab] = useState<'calendar' | 'unscheduled'>('calendar')
  const [selectedDay, setSelectedDay] = useState(ref)
  const [sheet, setSheet] = useState<Task | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* ignora */
    }
  }, [view])

  const days = useMemo(() => (view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)) : monthGrid(anchor)), [view, anchor])

  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const x of tasks) {
      if (!x.date) continue
      const list = m.get(x.date) ?? []
      list.push(x)
      m.set(x.date, list)
    }
    for (const list of m.values()) list.sort((a, b) => Number(!isOpen(a)) - Number(!isOpen(b)) || byTimeThenPriority(a, b))
    return m
  }, [tasks])

  // prévia das recorrentes nos dias futuros (ainda não viraram tarefa)
  const ghosts = useMemo(() => {
    const m = new Map<string, Recurrence[]>()
    const end = days[days.length - 1]
    const tomorrow = addDays(ref, 1)
    for (const rec of recurrences) {
      if (!rec.active) continue
      const from = rec.last_generated && rec.last_generated >= tomorrow ? addDays(rec.last_generated, 1) : tomorrow
      if (from > end) continue
      for (const d of nextOccurrences(rec, from, 62, 430)) {
        if (d > end) break
        m.set(d, [...(m.get(d) ?? []), rec])
      }
    }
    return m
  }, [recurrences, days, ref])

  const ghostChip = (rec: Recurrence, compact = false) => (
    <button
      key={rec.id}
      onClick={() => navigate('/recurring')}
      title={rec.title}
      className={`flex w-full items-center gap-1.5 rounded-lg border border-dashed border-line text-left text-muted transition-colors hover:border-accent/50 hover:text-fg ${compact ? 'px-2 py-1 text-[11px]' : 'px-2.5 py-1.5 text-xs'}`}
    >
      <Repeat size={12} className="shrink-0 text-accent" />
      <span className="truncate">
        {rec.time && <span className="mr-1 tabular-nums">{rec.time.slice(0, 5)}</span>}
        {rec.title}
      </span>
    </button>
  )

  const unscheduled = tasks.filter((x) => isOpen(x) && !x.date).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.created_at.localeCompare(a.created_at))
  const overdue = tasks.filter((x) => isOverdue(x, ref)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))

  const move = (dir: -1 | 1) => setAnchor(view === 'week' ? addDays(anchor, 7 * dir) : addMonths(startOfMonth(anchor), dir))
  const goToday = () => {
    setAnchor(ref)
    setSelectedDay(ref)
  }

  const title =
    view === 'week'
      ? `${formatDate(days[0], locale, { day: 'numeric', month: 'short' })} – ${formatDate(days[6], locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : formatDate(startOfMonth(anchor), locale, { month: 'long', year: 'numeric' })

  // ---------- arrastar e soltar (PC) ----------
  const onDragStart = (e: DragEvent, task: Task) => {
    e.dataTransfer.setData(DRAG_TYPE, task.id)
    e.dataTransfer.setData('text/plain', task.title)
    e.dataTransfer.effectAllowed = 'move'
  }
  const dropProps = (target: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropTarget !== target) setDropTarget(target)
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDropTarget(null)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDropTarget(null)
      const id = e.dataTransfer.getData(DRAG_TYPE)
      const task = tasks.find((x) => x.id === id)
      if (!task) return
      if (target === 'none') {
        if (task.date) patchTask(id, { date: null, time: null }).catch(() => {})
      } else if (task.date !== target) {
        patchTask(id, { date: target }).catch(() => {})
      }
    },
  })

  const chip = (x: Task, compact = false) => {
    const area = x.area_id ? areaById.get(x.area_id) : undefined
    const closed = !isOpen(x)
    const late = isOverdue(x, ref)
    return (
      <button
        key={x.id}
        draggable
        onDragStart={(e) => onDragStart(e, x)}
        onClick={() => setSheet(x)}
        className={`group relative flex w-full cursor-grab items-start gap-2 overflow-hidden rounded-lg border border-line bg-surface text-left transition-colors hover:border-accent/50 active:cursor-grabbing ${compact ? 'px-2 py-1' : 'px-2.5 py-2'} ${closed ? 'opacity-50' : ''}`}
        title={x.title}
      >
        <span className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: PRIORITY_COLOR[x.priority] }} />
        <span className="min-w-0 flex-1">
          <span className={`block ${compact ? 'truncate text-xs' : 'line-clamp-2 text-[13px] leading-snug break-words'} font-medium ${closed ? 'line-through' : ''} ${late ? 'text-danger' : ''}`}>
            {x.time && <span className="mr-1 text-muted tabular-nums">{x.time.slice(0, 5)}</span>}
            {x.title}
          </span>
          {!compact && area && (
            <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted">
              <span className="h-1.5 w-1.5 shrink-0 rounded-[2px]" style={{ background: area.color }} />
              {area.name}
            </span>
          )}
        </span>
      </button>
    )
  }

  const dayHeader = (d: string, big = false) => {
    const isToday = d === ref
    return (
      <div className="flex items-center justify-between gap-1">
        <span className={`flex items-baseline gap-1.5 ${big ? 'text-sm' : 'text-xs'}`}>
          <span className="font-semibold text-muted uppercase">{formatDate(d, locale, { weekday: 'short' }).replace('.', '')}</span>
          <span className={`grid place-items-center rounded-full font-bold tabular-nums ${big ? 'h-7 min-w-7 text-base' : 'h-6 min-w-6 text-sm'} ${isToday ? 'bg-accent px-1.5 text-on-accent' : ''}`}>
            {Number(d.slice(8))}
          </span>
        </span>
        <button onClick={() => openNew({ date: d })} className="rounded-md p-1 text-muted opacity-60 hover:bg-surface-2 hover:text-fg hover:opacity-100" title={t.add_on_day} aria-label={t.add_on_day}>
          <Plus size={15} />
        </button>
      </div>
    )
  }

  // ---------- painel "Sem data" ----------
  const unscheduledPanel = (
    <div {...dropProps('none')} className={`flex flex-col rounded-2xl border bg-surface p-3 transition-colors ${dropTarget === 'none' ? 'border-accent bg-accent-soft' : 'border-line'}`}>
      <div className="mb-3 flex items-center gap-2 px-1">
        <Inbox size={18} className="text-muted" />
        <h2 className="font-semibold">{t.unscheduled}</h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{unscheduled.length}</span>
        <div className="flex-1" />
        <button onClick={() => openNew({ date: null })} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" title={t.new_task} aria-label={t.new_task}>
          <Plus size={16} />
        </button>
      </div>
      <p className="mb-3 hidden px-1 text-xs text-muted lg:block">{t.drag_hint}</p>

      {overdue.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold text-danger uppercase">
            <AlertTriangle size={13} />
            {t.doing_overdue} · {overdue.length}
          </div>
          <div className="space-y-1.5">{overdue.map((x) => chip(x))}</div>
        </div>
      )}

      {unscheduled.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">{t.unscheduled_empty}</p>
      ) : (
        <div className="scrollbar-thin space-y-1.5 lg:max-h-[calc(100dvh-260px)] lg:overflow-y-auto lg:pr-1">{unscheduled.map((x) => chip(x))}</div>
      )}
    </div>
  )

  // ---------- calendário ----------
  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button className="btn btn-outline p-2" onClick={() => move(-1)} aria-label={t.prev}>
          <ChevronLeft size={18} />
        </button>
        <button className="btn btn-outline px-3 py-2 text-sm" onClick={goToday}>
          {t.today_btn}
        </button>
        <button className="btn btn-outline p-2" onClick={() => move(1)} aria-label={t.next}>
          <ChevronRight size={18} />
        </button>
      </div>
      <h2 className="min-w-0 flex-1 truncate text-lg font-semibold first-letter:uppercase">{title}</h2>
      <div className="w-full sm:w-52">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'week', label: t.week },
            { value: 'month', label: t.month },
          ]}
        />
      </div>
    </div>
  )

  const weekView = (
    <>
      {/* PC: 7 colunas */}
      <div className="hidden grid-cols-7 gap-2 lg:grid">
        {days.map((d) => (
          <div
            key={d}
            {...dropProps(d)}
            className={`flex min-h-[420px] flex-col gap-2 rounded-2xl border p-2 transition-colors ${dropTarget === d ? 'border-accent bg-accent-soft' : d === ref ? 'border-accent/40 bg-surface' : 'border-line bg-surface/60'}`}
          >
            {dayHeader(d)}
            <div className="flex flex-col gap-1.5">
              {(byDate.get(d) ?? []).map((x) => chip(x))}
              {(ghosts.get(d) ?? []).map((g) => ghostChip(g))}
            </div>
          </div>
        ))}
      </div>
      {/* Celular: lista de dias */}
      <div className="space-y-3 lg:hidden">
        {days.map((d) => {
          const list = byDate.get(d) ?? []
          const gl = ghosts.get(d) ?? []
          return (
            <div key={d} className={`rounded-2xl border p-3 ${d === ref ? 'border-accent/40 bg-surface' : 'border-line bg-surface/60'}`}>
              {dayHeader(d, true)}
              {list.length + gl.length > 0 ? (
                <div className="mt-2 space-y-1.5">
                  {list.map((x) => chip(x))}
                  {gl.map((g) => ghostChip(g))}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted">{t.no_tasks_day}</p>
              )}
            </div>
          )
        })}
      </div>
    </>
  )

  const month = startOfMonth(anchor).slice(0, 7)
  const weekdayLabels = days.slice(0, 7).map((d) => formatDate(d, locale, { weekday: 'short' }).replace('.', ''))
  const selectedList = byDate.get(selectedDay) ?? []
  const selectedGhosts = ghosts.get(selectedDay) ?? []

  const monthView = (
    <>
      <div className="mb-1 grid grid-cols-7 gap-1 lg:gap-2">
        {weekdayLabels.map((w) => (
          <div key={w} className="px-1 text-center text-[11px] font-semibold text-muted uppercase lg:text-left">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 lg:gap-2">
        {days.map((d) => {
          const list = byDate.get(d) ?? []
          const gl = ghosts.get(d) ?? []
          const inMonth = d.startsWith(month)
          const isToday = d === ref
          const selected = d === selectedDay
          return (
            <div
              key={d}
              {...dropProps(d)}
              onClick={() => setSelectedDay(d)}
              className={`flex min-h-[64px] cursor-pointer flex-col rounded-xl border p-1 transition-colors lg:min-h-[120px] lg:cursor-default lg:p-1.5 ${
                dropTarget === d ? 'border-accent bg-accent-soft' : selected ? 'border-accent/60 bg-surface' : 'border-line bg-surface/60'
              } ${inMonth ? '' : 'opacity-40'}`}
            >
              {/* Celular: número + pontinhos */}
              <div className="flex flex-col items-center lg:hidden">
                <span className={`grid h-6 min-w-6 place-items-center rounded-full text-sm font-semibold tabular-nums ${isToday ? 'bg-accent px-1 text-on-accent' : ''}`}>{Number(d.slice(8))}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                  {gl.slice(0, 2).map((g) => (
                    <span key={g.id} className="h-1.5 w-1.5 rounded-full border border-dashed border-muted" />
                  ))}
                  {list.slice(0, 4).map((x) => (
                    <span key={x.id} className={`h-1.5 w-1.5 rounded-full ${isOpen(x) ? '' : 'opacity-40'}`} style={{ background: PRIORITY_COLOR[x.priority] }} />
                  ))}
                </div>
              </div>
              {/* PC: cabeçalho + cartõezinhos */}
              <div className="hidden lg:block">{dayHeader(d)}</div>
              <div className="mt-1 hidden flex-col gap-1 lg:flex">
                {list.slice(0, 3).map((x) => chip(x, true))}
                {gl.slice(0, Math.max(0, 3 - list.length)).map((g) => ghostChip(g, true))}
                {list.length + gl.length > 3 && (
                  <button
                    onClick={() => {
                      setView('week')
                      setAnchor(d)
                    }}
                    className="px-1 text-left text-[11px] font-medium text-muted hover:text-fg"
                  >
                    {t.more_n(list.length + gl.length - 3)}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {/* Celular: tarefas do dia tocado */}
      <div className="mt-4 rounded-2xl border border-line bg-surface p-3 lg:hidden">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold first-letter:uppercase">{formatDate(selectedDay, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          <button onClick={() => openNew({ date: selectedDay })} className="btn btn-ghost p-1.5" aria-label={t.add_on_day}>
            <Plus size={18} />
          </button>
        </div>
        {selectedList.length + selectedGhosts.length ? (
          <div className="space-y-1.5">
            {selectedList.map((x) => chip(x))}
            {selectedGhosts.map((g) => ghostChip(g))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t.no_tasks_day}</p>
        )}
      </div>
    </>
  )

  return (
    <>
      <PageHeader title={t.nav_planning} />

      {/* Celular: alterna entre calendário e "Sem data" */}
      <div className="mb-4 lg:hidden">
        <Segmented
          value={mobileTab}
          onChange={setMobileTab}
          options={[
            { value: 'calendar', label: t.calendar },
            { value: 'unscheduled', label: `${t.unscheduled} · ${unscheduled.length + overdue.length}` },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
        <aside className={`lg:sticky lg:top-10 ${mobileTab === 'unscheduled' ? '' : 'hidden lg:block'}`}>{unscheduledPanel}</aside>
        <section className={mobileTab === 'calendar' ? '' : 'hidden lg:block'}>
          {toolbar}
          {view === 'week' ? weekView : monthView}
        </section>
      </div>

      {sheet && <ScheduleSheet key={sheet.id} task={tasks.find((x) => x.id === sheet.id) ?? sheet} onClose={() => setSheet(null)} />}
    </>
  )
}
