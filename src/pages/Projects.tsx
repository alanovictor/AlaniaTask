import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CalendarClock, Check, ChevronDown, FolderKanban, Link2, Lock, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { useData, type ProjectDraft } from '../lib/data'
import { formatDate, today } from '../lib/dates'
import { isOutOfOrder, levels, openBlockers } from '../lib/projects'
import { useSettings } from '../lib/settings'
import { AREA_COLORS, CLOSED, PRIORITY_RANK, PROJECT_STATUSES, STATUS_COLOR, type Project, type Task } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { TaskCard } from '../components/TaskCard'
import { useEditor } from '../components/TaskEditor'
import { ColorPicker, EmptyState, Field, Modal, Segmented, StatusPill } from '../components/ui'

const isClosed = (x: Task) => CLOSED.includes(x.status)
const byPriority = (a: Task, b: Task) =>
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.created_at.localeCompare(b.created_at)

function daysUntil(date: string): number {
  return Math.round((Date.parse(date) - Date.parse(today())) / 86_400_000)
}

/** Resumo de um projeto, usado na lista e no cabeçalho. */
function useProjectStats(projectId: string | undefined) {
  // inclui as tarefas em stand by: contam no progresso e nas dependências
  const { allTasks: tasks, depIndex, taskById } = useData()
  return useMemo(() => {
    const list = tasks.filter((x) => x.project_id === projectId)
    const closed = list.filter(isClosed).length
    const alerts = list.filter((x) => isOutOfOrder(x, depIndex, taskById))
    const blocked = list.filter((x) => !isClosed(x) && !isOutOfOrder(x, depIndex, taskById) && openBlockers(x.id, depIndex, taskById).length > 0)
    return { list, closed, total: list.length, pct: list.length ? Math.round((closed / list.length) * 100) : 0, alerts, blocked }
  }, [tasks, depIndex, taskById, projectId])
}

function DeadlineLabel({ deadline, done }: { deadline: string; done: boolean }) {
  const { t, locale } = useSettings()
  const n = daysUntil(deadline)
  const late = n < 0 && !done
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${late ? 'font-semibold text-danger' : 'text-muted'}`}>
      <CalendarClock size={13} />
      {formatDate(deadline, locale)}
      {!done && <span>· {t.days_left(n)}</span>}
    </span>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/* ------------------------------------------------------------------ lista */

export function Projects() {
  const { t } = useSettings()
  const { projects } = useData()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [showDone, setShowDone] = useState(false)
  const navigate = useNavigate()

  const active = projects.filter((p) => p.status === 'active')
  const paused = projects.filter((p) => p.status === 'paused')
  const done = projects.filter((p) => p.status === 'done')

  return (
    <>
      <PageHeader
        title={t.nav_projects}
        subtitle={t.projects_subtitle}
        actions={
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Plus size={18} />
            {t.new_project}
          </button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={28} />}
          title={t.projects_empty_title}
          text={t.projects_empty_text}
          action={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Plus size={18} />
              {t.new_project}
            </button>
          }
        />
      ) : (
        <div className="space-y-8">
          {active.length > 0 && <ProjectGrid title={t.projects_active} items={active} />}
          {paused.length > 0 && <ProjectGrid title={t.projects_paused} items={paused} />}
          {done.length > 0 && (
            <section>
              <button onClick={() => setShowDone(!showDone)} className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg">
                <ChevronDown size={16} className={`transition-transform ${showDone ? '' : '-rotate-90'}`} />
                {t.projects_done} · {done.length}
              </button>
              {showDone && (
                <div className="grid grid-cols-1 gap-3 opacity-75 sm:grid-cols-2">
                  {done.map((p) => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {editing && <ProjectModal project={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onCreated={(id) => navigate(`/projects/${id}`)} />}
    </>
  )
}

function ProjectGrid({ title, items }: { title: string; items: Project[] }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted uppercase">
        {title}
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs">{items.length}</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </section>
  )
}

function ProjectCard({ project: p }: { project: Project }) {
  const { t } = useSettings()
  const s = useProjectStats(p.id)
  return (
    <Link to={`/projects/${p.id}`} className="group relative block min-w-0 overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-accent/40">
      <span className="absolute top-0 left-0 h-full w-1" style={{ background: p.color }} />
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-semibold break-words">{p.name}</h3>
        {s.alerts.length > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
            <AlertTriangle size={12} />
            {s.alerts.length}
          </span>
        )}
      </div>
      {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {s.closed}/{s.total}
        </span>
        <span>{s.pct}%</span>
      </div>
      <div className="mt-1">
        <ProgressBar pct={s.pct} color={p.color} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        {p.deadline && <DeadlineLabel deadline={p.deadline} done={p.status === 'done'} />}
        {s.blocked.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            <Lock size={12} />
            {t.blocked_n(s.blocked.length)}
          </span>
        )}
      </div>
    </Link>
  )
}

/* --------------------------------------------------------- criar / editar */

function ProjectModal({ project, onClose, onCreated }: { project: Project | null; onClose: () => void; onCreated?: (id: string) => void }) {
  const { t } = useSettings()
  const { projects, saveProject, deleteProject } = useData()
  const navigate = useNavigate()
  const [d, setD] = useState<ProjectDraft>(
    project
      ? { id: project.id, name: project.name, color: project.color, description: project.description ?? '', deadline: project.deadline, status: project.status }
      : { name: '', color: AREA_COLORS[projects.length % AREA_COLORS.length], description: '', deadline: null, status: 'active' },
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const set = <K extends keyof ProjectDraft>(k: K, v: ProjectDraft[K]) => setD((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!d.name.trim()) return
    setBusy(true)
    setErr(false)
    try {
      const id = await saveProject(d)
      onClose()
      if (!project) onCreated?.(id)
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!project || !confirm(t.confirm_delete_project)) return
    setBusy(true)
    try {
      await deleteProject(project.id)
      onClose()
      navigate('/projects')
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={project ? t.edit_project : t.new_project}
      footer={
        <>
          {project && (
            <button className="btn btn-ghost text-danger" onClick={remove} disabled={busy}>
              <Trash2 size={18} />
              <span className="hidden sm:inline">{t.delete}</span>
            </button>
          )}
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !d.name.trim()}>
            {t.save}
          </button>
        </>
      }
    >
      <form
        className="space-y-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          autoFocus
          className="w-full border-0 bg-transparent text-xl font-semibold outline-none placeholder:text-muted/60"
          placeholder={t.project_name_ph}
          value={d.name}
          maxLength={80}
          onChange={(e) => set('name', e.target.value)}
        />
        <ColorPicker value={d.color} onChange={(c) => set('color', c)} />
        <Field label={t.description}>
          <textarea className="input min-h-[72px] resize-y" placeholder={t.description_ph} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={t.deadline}>
          <input type="date" className="input" value={d.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || null)} />
        </Field>
        {project && (
          <Field label={t.status}>
            <Segmented value={d.status} onChange={(v) => set('status', v)} options={PROJECT_STATUSES.map((s) => ({ value: s, label: t[`ps_${s}`] }))} />
          </Field>
        )}
        {err && <p className="text-sm text-danger">{t.error_generic}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}

/* ---------------------------------------------------------------- detalhe */

type View = 'available' | 'all' | 'flow'
const VIEW_KEY = 'alania.projectView'

export function ProjectDetail() {
  const { id } = useParams()
  const { t } = useSettings()
  const { projectById, depIndex, taskById } = useData()
  const { openNew, openEdit } = useEditor()
  const project = id ? projectById.get(id) : undefined
  const s = useProjectStats(id)
  const [editing, setEditing] = useState(false)
  const [linking, setLinking] = useState(false)
  const [showClosed, setShowClosed] = useState(false)
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      return v === 'all' || v === 'flow' ? v : 'available'
    } catch {
      return 'available'
    }
  })
  const setView = (v: View) => {
    setViewState(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* ignora */
    }
  }

  if (!project)
    return (
      <EmptyState
        icon={<FolderKanban size={28} />}
        title={t.project_not_found}
        text=""
        action={
          <Link to="/projects" className="btn btn-primary">
            {t.back_to_projects}
          </Link>
        }
      />
    )

  const open = s.list.filter((x) => !isClosed(x))
  const closed = s.list.filter(isClosed).sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
  // disponível = sem pendências, ou já iniciada mesmo assim (aparece com o alerta)
  const available = open.filter((x) => !x.standby).filter((x) => openBlockers(x.id, depIndex, taskById).length === 0 || isOutOfOrder(x, depIndex, taskById)).sort(byPriority)
  const hiddenCount = open.length - available.length
  const lv = levels(open.map((x) => x.id), depIndex)
  const openByStep = [...open].sort((a, b) => (lv.get(a.id) ?? 0) - (lv.get(b.id) ?? 0) || byPriority(a, b))

  return (
    <>
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft size={16} />
        {t.back_to_projects}
      </Link>

      <div className="mb-6 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: project.color }} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{project.name}</h1>
            {project.description && <p className="mt-1 text-sm whitespace-pre-line text-muted">{project.description}</p>}
          </div>
          <button className="btn btn-ghost -mr-1 p-2" onClick={() => setEditing(true)} aria-label={t.edit_project} title={t.edit_project}>
            <Pencil size={18} />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
          {project.status !== 'active' && <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold">{t[`ps_${project.status}`]}</span>}
          {project.deadline && <DeadlineLabel deadline={project.deadline} done={project.status === 'done'} />}
          <span>
            {s.closed}/{s.total} · {s.pct}%
          </span>
        </div>
        <div className="mt-2">
          <ProgressBar pct={s.pct} color={project.color} />
        </div>
      </div>

      {s.alerts.length > 0 && (
        <div className="mb-6 rounded-2xl border border-danger/40 bg-danger/10 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle size={16} />
            {t.alerts} · {s.alerts.length}
          </h2>
          <ul className="space-y-1.5 text-sm">
            {s.alerts.map((x) => (
              <li key={x.id}>
                <button className="text-left hover:underline" onClick={() => openEdit(x)}>
                  <span className="font-semibold">{x.title}</span> {t.alert_line}:{' '}
                  <span className="text-muted">
                    {openBlockers(x.id, depIndex, taskById)
                      .map((b) => b.title)
                      .join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'available', label: t.view_available },
              { value: 'all', label: t.view_all },
              { value: 'flow', label: t.view_flow },
            ]}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-outline px-3 text-sm" onClick={() => setLinking(true)}>
            <Link2 size={17} />
            <span className="hidden sm:inline">{t.link_tasks}</span>
          </button>
          <button className="btn btn-primary px-3 text-sm" onClick={() => openNew({ project_id: project.id })}>
            <Plus size={17} />
            {t.new_task}
          </button>
        </div>
      </div>

      {s.total === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">{t.project_no_tasks}</p>
      ) : view === 'flow' ? (
        <Flowchart tasks={s.list} />
      ) : (
        <div className="space-y-6">
          {view === 'available' ? (
            <>
              {available.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {available.map((x) => (
                    <TaskCard key={x.id} task={x} showDoingToggle hideProject />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                  {open.length === 0 ? t.project_all_done : t.available_empty}
                </p>
              )}
              {hiddenCount > 0 && (
                <button className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg" onClick={() => setView('all')}>
                  <Lock size={14} />
                  {t.available_hidden(hiddenCount)}
                </button>
              )}
            </>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {openByStep.map((x) => (
                <TaskCard key={x.id} task={x} showDoingToggle hideProject />
              ))}
              {open.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{t.project_all_done}</p>}
            </div>
          )}

          {closed.length > 0 && (
            <section>
              <button onClick={() => setShowClosed(!showClosed)} className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted hover:text-fg">
                <ChevronDown size={16} className={`transition-transform ${showClosed ? '' : '-rotate-90'}`} />
                {t.closed_n(closed.length)}
              </button>
              {showClosed && (
                <div className="grid grid-cols-1 gap-2.5 opacity-75">
                  {closed.map((x) => (
                    <TaskCard key={x.id} task={x} hideProject />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {editing && <ProjectModal project={project} onClose={() => setEditing(false)} />}
      {linking && <LinkTasksModal projectId={project.id} onClose={() => setLinking(false)} />}
    </>
  )
}

/* ---------------------------------------------------- vincular existentes */

function LinkTasksModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const { t } = useSettings()
  const { allTasks: tasks, areaById, linkTasks } = useData()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const candidates = tasks
    .filter((x) => !x.project_id && x.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || byPriority(a, b))

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const submit = async () => {
    setBusy(true)
    setErr(false)
    try {
      await linkTasks(projectId, [...picked])
      onClose()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.link_tasks}
      footer={
        <>
          {err && <span className="text-sm text-danger">{t.error_generic}</span>}
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || picked.size === 0}>
            {t.link_n(picked.size)}
          </button>
        </>
      }
    >
      <div className="space-y-3 pb-2">
        <p className="text-xs text-muted">{t.link_tasks_hint}</p>
        <div className="relative">
          <Search size={17} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder={t.search} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t.link_none}</p>
        ) : (
          <ul className="space-y-1">
            {candidates.map((x) => {
              const on = picked.has(x.id)
              const area = x.area_id ? areaById.get(x.area_id) : undefined
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    onClick={() => toggle(x.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors ${on ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
                  >
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}>
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${isClosed(x) ? 'text-muted line-through' : ''}`}>{x.title}</span>
                    {area && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: area.color }} title={area.name} />}
                    <StatusPill s={x.status} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------- fluxograma */

interface Edge {
  key: string
  d: string
  done: boolean
}

function Flowchart({ tasks }: { tasks: Task[] }) {
  const { t } = useSettings()
  const { depIndex, taskById } = useData()
  const { openEdit } = useEditor()
  const wrap = useRef<HTMLDivElement>(null)
  const boxes = useRef(new Map<string, HTMLElement>())
  const [edges, setEdges] = useState<Edge[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })

  const rows = useMemo(() => {
    const lv = levels(
      tasks.map((x) => x.id),
      depIndex,
    )
    const out: Task[][] = []
    for (const x of tasks) {
      const l = lv.get(x.id) ?? 0
      ;(out[l] ??= []).push(x)
    }
    return out.filter(Boolean).map((r) => r.sort((a, b) => Number(isClosed(a)) - Number(isClosed(b)) || byPriority(a, b)))
  }, [tasks, depIndex])

  const measure = useCallback(() => {
    const root = wrap.current
    if (!root) return
    const base = root.getBoundingClientRect()
    const ids = new Set(tasks.map((x) => x.id))
    const next: Edge[] = []
    for (const x of tasks) {
      const to = boxes.current.get(x.id)
      if (!to) continue
      for (const p of depIndex.before.get(x.id) ?? []) {
        const from = ids.has(p) ? boxes.current.get(p) : undefined
        if (!from) continue
        const a = from.getBoundingClientRect()
        const b = to.getBoundingClientRect()
        const x1 = a.left + a.width / 2 - base.left
        const y1 = a.bottom - base.top
        const x2 = b.left + b.width / 2 - base.left
        const y2 = b.top - base.top - 6
        const dy = Math.max(24, (y2 - y1) / 2)
        next.push({ key: `${p}>${x.id}`, d: `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`, done: !!taskById.get(p) && isClosed(taskById.get(p)!) })
      }
    }
    setEdges(next)
    setSize({ w: root.offsetWidth, h: root.offsetHeight })
  }, [tasks, depIndex, taskById])

  useLayoutEffect(() => {
    measure()
    const ro = new ResizeObserver(measure)
    if (wrap.current) ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [measure])

  if (!tasks.length) return <p className="py-10 text-center text-sm text-muted">{t.flow_empty}</p>

  return (
    <div className="rounded-2xl border border-line bg-surface p-3 sm:p-5">
      <p className="mb-4 text-xs text-muted">{t.flow_hint}</p>
      <div ref={wrap} className="relative flex flex-col gap-12">
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width={size.w} height={size.h} aria-hidden>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
            </marker>
            <marker id="flow-arrow-done" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={STATUS_COLOR.done} />
            </marker>
          </defs>
          {edges.map((e) => (
            <path
              key={e.key}
              d={e.d}
              fill="none"
              stroke={e.done ? STATUS_COLOR.done : 'var(--accent)'}
              strokeOpacity={e.done ? 0.55 : 0.8}
              strokeWidth={1.75}
              markerEnd={`url(#${e.done ? 'flow-arrow-done' : 'flow-arrow'})`}
            />
          ))}
        </svg>
        {rows.map((row, i) => (
          <div key={i} className="relative flex flex-wrap justify-center gap-3">
            {row.map((x) => {
              const closed = isClosed(x)
              const alert = isOutOfOrder(x, depIndex, taskById)
              const locked = !closed && !alert && openBlockers(x.id, depIndex, taskById).length > 0
              const color = STATUS_COLOR[x.status]
              return (
                <button
                  key={x.id}
                  ref={(el) => {
                    if (el) boxes.current.set(x.id, el)
                    else boxes.current.delete(x.id)
                  }}
                  onClick={() => openEdit(x)}
                  className={`relative z-[1] w-[calc(50%-0.375rem)] rounded-xl border bg-surface-2 p-2.5 text-left transition-colors hover:border-accent/60 sm:w-48 ${alert ? 'border-danger/70' : 'border-line'}`}
                  style={{ borderTop: `3px solid ${color}` }}
                >
                  <span className={`line-clamp-3 text-sm leading-snug font-medium break-words ${closed ? 'text-muted line-through' : ''}`}>{x.title}</span>
                  <span className="mt-2 flex items-center justify-between gap-1.5">
                    <StatusPill s={x.status} />
                    {alert ? (
                      <AlertTriangle size={14} className="shrink-0 text-danger" aria-label={t.out_of_order} />
                    ) : locked ? (
                      <Lock size={14} className="shrink-0 text-accent" aria-label={t.blocked} />
                    ) : closed ? (
                      <Check size={14} className="shrink-0" style={{ color }} />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
