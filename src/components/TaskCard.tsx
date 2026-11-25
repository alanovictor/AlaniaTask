import { PauseCircle, Check, CalendarDays, Clock, ListChecks, Sun, SunDim, AlertTriangle, ShieldCheck, Repeat, Bell, Lock, FolderKanban } from 'lucide-react'
import { isOutOfOrder, openBlockers } from '../lib/projects'
import { useBlockGuard } from './BlockGuard'
import { useData } from '../lib/data'
import { daysLate, formatDate, isInDoing, isOverdue, today } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { CLOSED, PRIORITY_COLOR, type Task } from '../lib/types'
import { useEditor } from './TaskEditor'
import { AreaChip, StatusSelect } from './ui'

/** Botão circular de concluir, com a cor da prioridade. */
export function DoneCheck({ task }: { task: Task }) {
  const { setStatus } = useBlockGuard()
  const done = CLOSED.includes(task.status)
  const color = PRIORITY_COLOR[task.priority]
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        setStatus(task, done ? 'todo' : 'done')
      }}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition-colors"
      style={{ borderColor: color, background: done ? color : 'transparent' }}
      aria-label={done ? 'Reabrir' : 'Concluir'}
    >
      {done && <Check size={14} strokeWidth={3} className="text-white" />}
    </button>
  )
}

export function DateLabel({ task }: { task: Task }) {
  const { t, locale } = useSettings()
  if (!task.date) return null
  const late = isOverdue(task)
  const isToday = task.date === today()
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${late ? 'font-semibold text-danger' : 'text-muted'}`}>
      <CalendarDays size={13} />
      {isToday ? t.date_today : formatDate(task.date, locale)}
      {task.time && (
        <>
          <Clock size={13} className="ml-1" />
          {task.time.slice(0, 5)}
          {task.reminder_minutes !== null && <Bell size={12} className="text-accent" aria-label={t.notify_label} />}
        </>
      )}
    </span>
  )
}

export function OverdueBadge({ task }: { task: Task }) {
  const { t } = useSettings()
  if (!isOverdue(task)) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">
      <AlertTriangle size={12} />
      {t.overdue_days(daysLate(task))}
    </span>
  )
}

/** Selo para tarefas de validação, ou ícone discreto quando a tarefa requer validação. */
export function ValidationBadge({ task }: { task: Task }) {
  const { t } = useSettings()
  if (task.validation_of)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#12a594]/15 px-2 py-0.5 text-xs font-semibold text-[#12a594]">
        <ShieldCheck size={12} />
        {t.validation_badge}
      </span>
    )
  if (task.requires_validation)
    return (
      <span className="inline-flex text-[#12a594]" title={t.needs_validation} aria-label={t.needs_validation}>
        <ShieldCheck size={14} />
      </span>
    )
  return null
}

export function RecurringBadge({ task }: { task: Task }) {
  const { t } = useSettings()
  if (!task.recurrence_id) return null
  return (
    <span className="inline-flex text-accent" title={t.recurring_badge} aria-label={t.recurring_badge}>
      <Repeat size={14} />
    </span>
  )
}

/** Cadeado quando há dependências abertas; alerta quando a tarefa foi iniciada mesmo assim. */
export function DepBadge({ task }: { task: Task }) {
  const { t } = useSettings()
  const { depIndex, taskById } = useData()
  const blockers = openBlockers(task.id, depIndex, taskById)
  if (!blockers.length) return null
  const tip = [t.block_text, ...blockers.map((x) => `• ${x.title}`)].join('\n')
  if (isOutOfOrder(task, depIndex, taskById))
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger" title={tip}>
        <AlertTriangle size={12} />
        {t.out_of_order}
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent" title={tip}>
      <Lock size={12} />
      {t.blocked_by_n(blockers.length)}
    </span>
  )
}

export function StandbyBadge({ task }: { task: Task }) {
  const { t } = useSettings()
  if (!task.standby) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#b38cff]/15 px-2 py-0.5 text-xs font-semibold text-[#b38cff]">
      <PauseCircle size={12} />
      {t.standby}
    </span>
  )
}

export function ProjectChip({ task }: { task: Task }) {
  const { projectById } = useData()
  const p = task.project_id ? projectById.get(task.project_id) : undefined
  if (!p) return null
  return (
    <span className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted">
      <FolderKanban size={13} className="shrink-0" style={{ color: p.color }} />
      <span className="truncate">{p.name}</span>
    </span>
  )
}

export function DoingToggle({ task, compact = false }: { task: Task; compact?: boolean }) {
  const { t } = useSettings()
  const { patchTask } = useData()
  if (CLOSED.includes(task.status)) return null
  const inDoing = isInDoing(task)
  const label = inDoing ? t.remove_from_doing : t.add_to_doing
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        patchTask(task.id, inDoing ? { date: null, time: null } : { date: today() }).catch(() => {})
      }}
      className={`btn ${compact ? 'p-1.5' : 'px-2.5 py-1.5 text-xs'} ${inDoing ? 'text-accent hover:bg-accent-soft' : 'btn-ghost'}`}
      title={label}
      aria-label={label}
    >
      {inDoing ? <Sun size={17} /> : <SunDim size={17} />}
      {!compact && <span>{label}</span>}
    </button>
  )
}

export function TaskCard({ task, showDoingToggle = false, hideProject = false }: { task: Task; showDoingToggle?: boolean; hideProject?: boolean }) {
  const { areaById, tagById } = useData()
  const { setStatus } = useBlockGuard()
  const { openEdit } = useEditor()
  const area = task.area_id ? areaById.get(task.area_id) : undefined
  const done = CLOSED.includes(task.status)
  const subDone = task.subtasks.filter((s) => s.done).length

  return (
    <div
      onClick={() => openEdit(task)}
      className="group relative flex cursor-pointer gap-3 rounded-2xl border border-line bg-surface p-3.5 transition-colors hover:border-accent/40"
    >
      <span className="absolute top-3 bottom-3 left-0 w-[3px] rounded-r-full" style={{ background: PRIORITY_COLOR[task.priority] }} />
      <div className="pt-0.5">
        <DoneCheck task={task} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`font-medium leading-snug break-words ${done ? 'text-muted line-through' : ''}`}>{task.title}</p>
          {showDoingToggle && <DoingToggle task={task} compact />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusSelect value={task.status} onChange={(status) => setStatus(task, status)} />
          <StandbyBadge task={task} />
          <DepBadge task={task} />
          <OverdueBadge task={task} />
          <ValidationBadge task={task} />
          <RecurringBadge task={task} />
          {!hideProject && <ProjectChip task={task} />}
          {area && <AreaChip name={area.name} color={area.color} />}
          <DateLabel task={task} />
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <ListChecks size={13} />
              {subDone}/{task.subtasks.length}
            </span>
          )}
          {task.task_tags.map((x) => {
            const tag = tagById.get(x.tag_id)
            return tag ? (
              <span key={x.tag_id} className="text-xs text-muted">
                #{tag.name}
              </span>
            ) : null
          })}
        </div>
      </div>
    </div>
  )
}
