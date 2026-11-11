import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListTodo, Search, SlidersHorizontal, X } from 'lucide-react'
import { useData } from '../lib/data'
import { addDays, isOpen, isOverdue, today } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { PRIORITIES, PRIORITY_RANK, STATUSES, type Priority, type Status, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { DateLabel, DoingToggle, DoneCheck, OverdueBadge, TaskCard } from '../components/TaskCard'
import { useEditor } from '../components/TaskEditor'
import { AreaChip, EmptyState, PriorityFlag, StatusSelect } from '../components/ui'

type DateFilter = 'any' | 'today' | 'overdue' | 'week' | 'none' | 'with'
type StatusFilter = 'all' | 'open' | Status
type Sort = 'priority' | 'date' | 'created'

interface Filters {
  q: string
  area: string // '' = todas, 'none' = sem área
  priority: '' | Priority
  status: StatusFilter
  date: DateFilter
  sort: Sort
}

const DEFAULT: Filters = { q: '', area: '', priority: '', status: 'open', date: 'any', sort: 'priority' }
const KEY = 'alania.taskFilters'

function load(): Filters {
  try {
    return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? '{}'), q: '', area: '' }
  } catch {
    return DEFAULT
  }
}

export function Tasks() {
  const { t } = useSettings()
  const { tasks, areas, areaById, tagById, patchTask } = useData()
  const { openEdit } = useEditor()
  const [params, setParams] = useSearchParams()
  const [base, setF] = useState<Filters>(load)
  // a área vem da URL (links do menu lateral)
  const f: Filters = { ...base, area: params.get('area') ?? '' }
  const currentArea = f.area && f.area !== 'none' ? areaById.get(f.area) : undefined
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...base, area: '' }))
    } catch {
      /* ignora */
    }
  }, [base])

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => {
    if (k === 'area') setParams(v ? { area: String(v) } : {}, { replace: true })
    else setF((p) => ({ ...p, [k]: v }))
  }
  const activeCount = (f.area ? 1 : 0) + (f.priority ? 1 : 0) + (f.status !== DEFAULT.status ? 1 : 0) + (f.date !== 'any' ? 1 : 0)

  const list = useMemo(() => {
    const ref = today()
    const weekEnd = addDays(ref, 7)
    const q = f.q.trim().toLowerCase()
    const out = tasks.filter((x) => {
      if (q) {
        const tagText = x.task_tags.map((tt) => tagById.get(tt.tag_id)?.name ?? '').join(' ')
        if (!`${x.title} ${x.description ?? ''} ${tagText}`.toLowerCase().includes(q)) return false
      }
      if (f.area === 'none' ? x.area_id !== null : f.area && x.area_id !== f.area) return false
      if (f.priority && x.priority !== f.priority) return false
      if (f.status === 'open' ? !isOpen(x) : f.status !== 'all' && x.status !== f.status) return false
      switch (f.date) {
        case 'today':
          return x.date === ref
        case 'overdue':
          return isOverdue(x, ref)
        case 'week':
          return !!x.date && x.date >= ref && x.date <= weekEnd
        case 'none':
          return !x.date
        case 'with':
          return !!x.date
      }
      return true
    })
    const cmpDate = (a: Task, b: Task) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.time ?? '99').localeCompare(b.time ?? '99')
    out.sort((a, b) => {
      if (f.sort === 'priority') return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || cmpDate(a, b)
      if (f.sort === 'date') return cmpDate(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      return b.created_at.localeCompare(a.created_at)
    })
    return out
  }, [tasks, base, f.area, tagById]) // eslint-disable-line react-hooks/exhaustive-deps

  const filterControls = (
    <>
      <select className="input" value={f.area} onChange={(e) => set('area', e.target.value)} aria-label={t.area}>
        <option value="">{t.all_areas}</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
        <option value="none">{t.no_area}</option>
      </select>
      <select className="input" value={f.priority} onChange={(e) => set('priority', e.target.value as Filters['priority'])} aria-label={t.priority}>
        <option value="">{t.all_priorities}</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {t[`p_${p}`]}
          </option>
        ))}
      </select>
      <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as StatusFilter)} aria-label={t.status}>
        <option value="open">{t.open_statuses}</option>
        <option value="all">{t.all_statuses}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {t[`s_${s}`]}
          </option>
        ))}
      </select>
      <select className="input" value={f.date} onChange={(e) => set('date', e.target.value as DateFilter)} aria-label={t.date}>
        <option value="any">{t.date_any}</option>
        <option value="today">{t.date_today}</option>
        <option value="overdue">{t.date_overdue}</option>
        <option value="week">{t.date_week}</option>
        <option value="with">{t.date_with}</option>
        <option value="none">{t.date_none}</option>
      </select>
      <select className="input" value={f.sort} onChange={(e) => set('sort', e.target.value as Sort)} aria-label={t.sort_by}>
        <option value="priority">
          {t.sort_by}: {t.sort_priority}
        </option>
        <option value="date">
          {t.sort_by}: {t.sort_date}
        </option>
        <option value="created">
          {t.sort_by}: {t.sort_created}
        </option>
      </select>
    </>
  )

  return (
    <>
      <PageHeader
        title={currentArea ? currentArea.name : t.tasks_title}
        subtitle={
          <span className="inline-flex items-center gap-2">
            {currentArea && <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: currentArea.color }} />}
            {t.count_tasks(list.length)}
          </span>
        }
      />

      <div className="mb-5 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
            <input className="input pl-10" placeholder={t.search} value={f.q} onChange={(e) => set('q', e.target.value)} />
          </div>
          <button className={`btn btn-outline lg:hidden ${activeCount ? 'text-accent' : ''}`} onClick={() => setShowFilters(!showFilters)} aria-label={t.filters}>
            <SlidersHorizontal size={18} />
            {activeCount > 0 && <span className="text-xs">{activeCount}</span>}
          </button>
        </div>
        <div className={`grid grid-cols-2 gap-2 lg:grid lg:grid-cols-5 ${showFilters ? '' : 'hidden'}`}>{filterControls}</div>
        {activeCount > 0 && (
          <button className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg" onClick={() => {
              setF({ ...DEFAULT, q: f.q, sort: f.sort })
              setParams({}, { replace: true })
            }}>
            <X size={14} /> {t.clear_filters}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<ListTodo size={28} />} title={t.tasks_empty} text={t.areas_hint} />
      ) : (
        <>
          {/* Mobile: cartões */}
          <div className="grid gap-2.5 lg:hidden">
            {list.map((x) => (
              <TaskCard key={x.id} task={x} showDoingToggle />
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-semibold tracking-wide text-muted uppercase">
                  <th className="w-12 py-3 pl-4" />
                  <th className="py-3 pr-4">{t.title}</th>
                  <th className="w-44 py-3 pr-4">{t.area}</th>
                  <th className="w-28 py-3 pr-4">{t.priority}</th>
                  <th className="w-36 py-3 pr-4">{t.status}</th>
                  <th className="w-40 py-3 pr-4">{t.date}</th>
                  <th className="w-14 py-3 pr-3" />
                </tr>
              </thead>
              <tbody>
                {list.map((x) => {
                  const area = x.area_id ? areaById.get(x.area_id) : undefined
                  const closed = !isOpen(x)
                  return (
                    <tr key={x.id} onClick={() => openEdit(x)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-surface-2/60">
                      <td className="py-3 pl-4">
                        <DoneCheck task={x} />
                      </td>
                      <td className="py-3 pr-4">
                        <div className={`font-medium ${closed ? 'text-muted line-through' : ''}`}>{x.title}</div>
                        {(x.subtasks.length > 0 || x.task_tags.length > 0 || isOverdue(x)) && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <OverdueBadge task={x} />
                            {x.subtasks.length > 0 && (
                              <span>
                                {x.subtasks.filter((s) => s.done).length}/{x.subtasks.length}
                              </span>
                            )}
                            {x.task_tags.map((tt) => {
                              const tag = tagById.get(tt.tag_id)
                              return tag ? <span key={tt.tag_id}>#{tag.name}</span> : null
                            })}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4">{area ? <AreaChip name={area.name} color={area.color} /> : <span className="text-xs text-muted">—</span>}</td>
                      <td className="py-3 pr-4">
                        <PriorityFlag p={x.priority} withLabel />
                      </td>
                      <td className="py-3 pr-4">
                        <StatusSelect value={x.status} onChange={(status) => patchTask(x.id, { status }).catch(() => {})} />
                      </td>
                      <td className="py-3 pr-4">{x.date ? <DateLabel task={x} /> : <span className="text-xs text-muted">{t.no_date}</span>}</td>
                      <td className="py-3 pr-3 text-right">
                        <DoingToggle task={x} compact />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
