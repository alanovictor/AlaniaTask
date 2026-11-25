import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Columns3, ListChecks, Plus } from 'lucide-react'
import { useData } from '../lib/data'
import { formatDate, isOverdue, today } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { CLOSED, PRIORITY_COLOR, PRIORITY_RANK, STATUS_COLOR, STATUSES, type Status, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { useBlockGuard } from '../components/BlockGuard'
import { useEditor } from '../components/TaskEditor'
import { DepBadge, ProjectChip } from '../components/TaskCard'
import { AreaChip } from '../components/ui'

interface Filters {
  project: string // '' todos, 'none' sem projeto, ou id
  area: string // '' todas, 'none' sem área, ou id
  allClosed: boolean
}
const KEY = 'alania.kanban'
const CLOSED_DAYS = 14

function loadFilters(): Filters {
  try {
    return { project: '', area: '', allClosed: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { project: '', area: '', allClosed: false }
  }
}

const byPriority = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.created_at.localeCompare(b.created_at)
const byCompleted = (a: Task, b: Task) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')

interface Drag {
  task: Task
  x: number
  y: number
  dx: number
  dy: number
  w: number
  over: Status | null
}

export function Kanban() {
  const { t } = useSettings()
  const { tasks, areas, projects, areaById, projectById } = useData()
  const { setStatus } = useBlockGuard()
  const { openNew, openEdit } = useEditor()
  const [f, setF] = useState<Filters>(loadFilters)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const board = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(f))
    } catch {
      /* ignora */
    }
  }, [f])

  // filtro salvo apontando para projeto/área que não existe mais
  const project = f.project && f.project !== 'none' ? projectById.get(f.project) : undefined
  const area = f.area && f.area !== 'none' ? areaById.get(f.area) : undefined
  const projectFilter = f.project && f.project !== 'none' && !project ? '' : f.project
  const areaFilter = f.area && f.area !== 'none' && !area ? '' : f.area

  const columns = useMemo(() => {
    const since = new Date(Date.now() - CLOSED_DAYS * 86_400_000).toISOString()
    const visible = tasks.filter(
      (x) =>
        (projectFilter === '' || (projectFilter === 'none' ? !x.project_id : x.project_id === projectFilter)) &&
        (areaFilter === '' || (areaFilter === 'none' ? !x.area_id : x.area_id === areaFilter)),
    )
    const out = {} as Record<Status, { list: Task[]; hidden: number }>
    for (const s of STATUSES) {
      const all = visible.filter((x) => x.status === s)
      if (CLOSED.includes(s)) {
        const sorted = all.sort(byCompleted)
        const list = f.allClosed ? sorted : sorted.filter((x) => (x.completed_at ?? '') >= since)
        out[s] = { list, hidden: sorted.length - list.length }
      } else out[s] = { list: all.sort(byPriority), hidden: 0 }
    }
    return out
  }, [tasks, projectFilter, areaFilter, f.allClosed])

  const hiddenClosed = columns.done.hidden + columns.validated.hidden

  // ---------- arrastar (mouse e toque) ----------
  const statusAt = (x: number, y: number): Status | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-status]') as HTMLElement | null
    return (el?.dataset.status as Status) ?? null
  }

  const startPointer = (e: React.PointerEvent, task: Task) => {
    if (e.button !== 0) return
    const card = e.currentTarget as HTMLElement
    const rect = card.getBoundingClientRect()
    const touch = e.pointerType !== 'mouse'
    const sx = e.clientX
    const sy = e.clientY
    let started = false
    let last = { x: sx, y: sy }
    let timer: number | undefined
    let scrollTimer: number | undefined

    const begin = () => {
      started = true
      if (touch) navigator.vibrate?.(15)
      const d: Drag = { task, x: last.x, y: last.y, dx: sx - rect.left, dy: sy - rect.top, w: rect.width, over: task.status }
      dragRef.current = d
      setDrag(d)
      // perto da borda: rola o quadro na horizontal
      scrollTimer = window.setInterval(() => {
        const b = board.current
        if (!b || !dragRef.current) return
        const r = b.getBoundingClientRect()
        if (last.x < r.left + 40) b.scrollLeft -= 14
        else if (last.x > r.right - 40) b.scrollLeft += 14
      }, 16)
    }

    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY }
      if (!started) {
        const dist = Math.hypot(ev.clientX - sx, ev.clientY - sy)
        if (touch) {
          // no toque, mexer antes do toque longo é rolagem
          if (dist > 8) cleanup()
          return
        }
        if (dist > 5) begin()
        else return
      }
      const over = statusAt(ev.clientX, ev.clientY)
      const d = { ...dragRef.current!, x: ev.clientX, y: ev.clientY, over }
      dragRef.current = d
      setDrag(d)
    }

    const blockScroll = (ev: TouchEvent) => {
      if (started) ev.preventDefault()
    }

    const up = () => {
      const d = dragRef.current
      cleanup()
      if (!started || !d) return
      suppressClick.current = true
      setTimeout(() => (suppressClick.current = false), 50)
      if (d.over && d.over !== task.status) setStatus(task, d.over)
    }

    function cleanup() {
      window.clearTimeout(timer)
      window.clearInterval(scrollTimer)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('touchmove', blockScroll)
      dragRef.current = null
      setDrag(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    window.addEventListener('touchmove', blockScroll, { passive: false })
    if (touch) timer = window.setTimeout(begin, 350)
  }

  const newIn = (status: Status) =>
    openNew({
      status,
      ...(project ? { project_id: project.id } : {}),
      ...(area ? { area_id: area.id } : {}),
    })

  const total = STATUSES.reduce((n, s) => n + columns[s].list.length, 0)

  return (
    <>
      <PageHeader title={t.nav_kanban} subtitle={t.kanban_subtitle} />

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,16rem)_minmax(0,16rem)_auto] sm:items-center">
        <select className="input" value={projectFilter} onChange={(e) => setF((p) => ({ ...p, project: e.target.value }))} aria-label={t.project}>
          <option value="">{t.all_projects}</option>
          <option value="none">{t.no_project}</option>
          {projects
            .filter((p) => p.status !== 'done' || p.id === projectFilter)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <select className="input" value={areaFilter} onChange={(e) => setF((p) => ({ ...p, area: e.target.value }))} aria-label={t.area}>
          <option value="">{t.all_areas}</option>
          <option value="none">{t.no_area}</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        {(hiddenClosed > 0 || f.allClosed) && (
          <button className="btn btn-ghost justify-start px-2 text-sm sm:justify-center" onClick={() => setF((p) => ({ ...p, allClosed: !p.allClosed }))}>
            {f.allClosed ? t.kanban_recent_closed : t.kanban_all_closed(hiddenClosed)}
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-muted">{t.kanban_hint}</p>

      <div ref={board} className={`scrollbar-thin -mx-4 flex ${drag ? '' : 'snap-x snap-mandatory'} gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 xl:grid xl:snap-none xl:grid-cols-5 xl:overflow-visible`}>
        {STATUSES.map((s) => {
          const col = columns[s]
          const active = drag?.over === s && drag.task.status !== s
          return (
            <section
              key={s}
              data-status={s}
              className={`flex min-h-[60vh] w-[82vw] max-w-80 shrink-0 snap-start flex-col rounded-2xl border bg-surface/60 transition-colors sm:w-72 xl:w-auto xl:max-w-none ${
                active ? 'border-accent bg-accent-soft' : 'border-line'
              }`}
            >
              <header className="flex items-center gap-2 px-3 pt-3 pb-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                <h2 className="text-sm font-semibold">{t[`s_${s}`]}</h2>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">{col.list.length}</span>
                {!CLOSED.includes(s) && (
                  <button className="btn btn-ghost ml-auto p-1.5" onClick={() => newIn(s)} aria-label={t.new_task} title={t.new_task}>
                    <Plus size={16} />
                  </button>
                )}
              </header>
              <div className="flex min-h-24 flex-col gap-2 px-2 pb-2">
                {col.list.map((x) => (
                  <KanbanCard
                    key={x.id}
                    task={x}
                    dragging={drag?.task.id === x.id}
                    onPointerDown={(e) => startPointer(e, x)}
                    onOpen={() => !suppressClick.current && openEdit(x)}
                  />
                ))}
                {col.list.length === 0 && <p className="py-6 text-center text-xs text-muted">{t.kanban_empty}</p>}
              </div>
            </section>
          )
        })}
      </div>

      {total === 0 && (
        <div className="mt-2 flex items-center justify-center gap-2 text-sm text-muted">
          <Columns3 size={16} />
          {t.tasks_empty}
        </div>
      )}

      {drag && (
        <div className="pointer-events-none fixed z-[60] rotate-2 opacity-95" style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }}>
          <KanbanCard task={drag.task} ghost />
        </div>
      )}
    </>
  )
}

function KanbanCard({
  task,
  ghost = false,
  dragging = false,
  onPointerDown,
  onOpen,
}: {
  task: Task
  ghost?: boolean
  dragging?: boolean
  onPointerDown?: (e: React.PointerEvent) => void
  onOpen?: () => void
}) {
  const { t, locale } = useSettings()
  const { areaById } = useData()
  const area = task.area_id ? areaById.get(task.area_id) : undefined
  const closed = CLOSED.includes(task.status)
  const late = isOverdue(task)
  const subDone = task.subtasks.filter((s) => s.done).length
  return (
    <div
      onPointerDown={onPointerDown}
      onClick={onOpen}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative cursor-grab rounded-xl border border-line bg-surface p-2.5 pl-3.5 text-left select-none [-webkit-touch-callout:none] active:cursor-grabbing ${
        ghost ? 'shadow-2xl ring-2 ring-accent' : 'hover:border-accent/40'
      } ${dragging ? 'opacity-30' : ''}`}
    >
      <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r-full" style={{ background: PRIORITY_COLOR[task.priority] }} />
      <p className={`text-sm leading-snug font-medium break-words ${closed ? 'text-muted line-through' : ''}`}>{task.title}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <DepBadge task={task} />
        <ProjectChip task={task} />
        {area && <AreaChip name={area.name} color={area.color} />}
        {task.date && (
          <span className={`inline-flex items-center gap-1 text-xs ${late ? 'font-semibold text-danger' : 'text-muted'}`}>
            <CalendarDays size={12} />
            {task.date === today() ? t.date_today : formatDate(task.date, locale)}
            {task.time && ` ${task.time.slice(0, 5)}`}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <ListChecks size={12} />
            {subDone}/{task.subtasks.length}
          </span>
        )}
      </div>
    </div>
  )
}
