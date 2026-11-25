import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Plus, Trash2, X, Check, Lock, PauseCircle } from 'lucide-react'
import { descendants } from '../lib/projects'
import { useBlockGuard } from './BlockGuard'
import { draftFromTask, emptyDraft, useData, type TaskDraft } from '../lib/data'
import { useSettings } from '../lib/settings'
import { CLOSED, PRIORITIES, PRIORITY_COLOR, STATUSES, STATUS_COLOR, type Task } from '../lib/types'
import { Field, Modal, Segmented, Toggle } from './ui'
import { ReminderField } from './ReminderField'

interface EditorCtx {
  openNew: (partial?: Partial<TaskDraft>) => void
  openEdit: (task: Task) => void
}

const Ctx = createContext<EditorCtx | null>(null)
const LAST_KEY = 'alania.lastNew'

function readLast(): Partial<TaskDraft> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function EditorProvider({ children }: { children: ReactNode }) {
  const { tagById, areaById, depIndex } = useData()
  const [draft, setDraft] = useState<TaskDraft | null>(null)

  const openNew = useCallback(
    (partial: Partial<TaskDraft> = {}) => {
      const last = readLast()
      // pré-seleciona a última área/prioridade usadas
      const area_id = last.area_id && areaById.has(last.area_id) ? last.area_id : null
      setDraft(emptyDraft({ area_id, priority: last.priority ?? 'medium', reminder_minutes: last.reminder_minutes ?? null, ...partial }))
    },
    [areaById],
  )
  const openEdit = useCallback((task: Task) => setDraft(draftFromTask(task, tagById, depIndex.before.get(task.id) ?? [])), [tagById, depIndex])

  return (
    <Ctx.Provider value={{ openNew, openEdit }}>
      {children}
      {draft && <TaskEditorModal key={draft.id ?? 'new'} initial={draft} onClose={() => setDraft(null)} />}
    </Ctx.Provider>
  )
}

export function useEditor(): EditorCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEditor fora do EditorProvider')
  return v
}

function TaskEditorModal({ initial, onClose }: { initial: TaskDraft; onClose: () => void }) {
  const { t } = useSettings()
  const { areas, tags, allTasks: tasks, projects, taskById, depIndex, saveTask, deleteTask } = useData()
  const { confirmStart } = useBlockGuard()
  const [d, setD] = useState<TaskDraft>(initial)
  const [newSub, setNewSub] = useState('')
  const [newTag, setNewTag] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((p) => ({ ...p, [k]: v }))

  const addSub = () => {
    if (!newSub.trim()) return
    set('subtasks', [...d.subtasks, { title: newSub.trim(), done: false }])
    setNewSub('')
  }
  const addTag = (name = newTag) => {
    const n = name.trim()
    if (n && !d.tagNames.some((x) => x.toLowerCase() === n.toLowerCase())) set('tagNames', [...d.tagNames, n])
    setNewTag('')
  }

  const submit = async () => {
    if (!d.title.trim()) return
    const blockers = (d.project_id ? d.dependsOn : []).map((id) => taskById.get(id)).filter((x): x is Task => !!x && !CLOSED.includes(x.status))
    if (!(await confirmStart(initial.id ? initial.status : null, d.status, blockers))) return
    setBusy(true)
    setErr(null)
    try {
      await saveTask(newTag.trim() ? { ...d, tagNames: [...d.tagNames, newTag.trim()] } : d)
      if (!d.id) {
        try {
          localStorage.setItem(LAST_KEY, JSON.stringify({ area_id: d.area_id, priority: d.priority, reminder_minutes: d.reminder_minutes }))
        } catch {
          /* ignora */
        }
      }
      onClose()
    } catch {
      setErr(t.error_generic)
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!d.id || !confirm(t.confirm_delete)) return
    setBusy(true)
    try {
      await deleteTask(d.id)
      onClose()
    } catch {
      setErr(t.error_generic)
      setBusy(false)
    }
  }

  // dependências possíveis: mesmo projeto, sem a própria tarefa e sem quem já depende dela (evita ciclo)
  const banned = d.id ? descendants(d.id, depIndex) : new Set<string>()
  const depOptions = d.project_id
    ? tasks
        .filter((x) => x.project_id === d.project_id && x.id !== d.id && !banned.has(x.id) && !d.dependsOn.includes(x.id))
        .sort((a, b) => Number(CLOSED.includes(a.status)) - Number(CLOSED.includes(b.status)) || a.title.localeCompare(b.title))
    : []
  const projectOptions = projects.filter((p) => p.status !== 'done' || p.id === d.project_id)

  const suggestions = tags.filter((x) => !d.tagNames.includes(x.name) && x.name.toLowerCase().includes(newTag.toLowerCase())).slice(0, 6)

  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? t.edit_task : t.new_task}
      footer={
        <>
          {d.id && (
            <button className="btn btn-ghost text-danger" onClick={remove} disabled={busy}>
              <Trash2 size={18} />
              <span className="hidden sm:inline">{t.delete}</span>
            </button>
          )}
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !d.title.trim()}>
            {t.save}
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          autoFocus
          className="w-full border-0 bg-transparent text-xl font-semibold outline-none placeholder:text-muted/60"
          placeholder={t.title_ph}
          value={d.title}
          maxLength={200}
          onChange={(e) => set('title', e.target.value)}
        />

        <Field label={t.priority}>
          <Segmented
            value={d.priority}
            onChange={(v) => set('priority', v)}
            options={[...PRIORITIES].reverse().map((p) => ({ value: p, label: t[`p_${p}`], color: PRIORITY_COLOR[p] }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t.area}>
            <select className="input" value={d.area_id ?? ''} onChange={(e) => set('area_id', e.target.value || null)}>
              <option value="">{t.no_area}</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.status}>
            <select className="input" value={d.status} onChange={(e) => set('status', e.target.value as TaskDraft['status'])}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t[`s_${s}`]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.date}>
            <input type="date" className="input" value={d.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
          </Field>
          <Field label={t.time}>
            <input type="time" className="input" value={d.time ?? ''} disabled={!d.date} onChange={(e) => set('time', e.target.value || null)} />
          </Field>
        </div>

        <div className="space-y-3 rounded-2xl border border-line p-3.5">
          <Field label={t.project}>
            <select className="input" value={d.project_id ?? ''} onChange={(e) => setD((p) => ({ ...p, project_id: e.target.value || null, dependsOn: [] }))}>
              <option value="">{t.no_project}</option>
              {projectOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          {d.project_id && (
            <div>
              <span className="mb-1 block text-xs font-semibold tracking-wide text-muted uppercase">{t.depends_on}</span>
              <span className="mb-2 block text-xs text-muted">{t.depends_on_hint}</span>
              {d.dependsOn.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {d.dependsOn.map((id) => {
                    const x = taskById.get(id)
                    if (!x) return null
                    const closed = CLOSED.includes(x.status)
                    return (
                      <li key={id} className="flex items-center gap-2 rounded-lg bg-surface-2 py-1.5 pr-1.5 pl-2.5 text-sm">
                        {closed ? <Check size={14} className="shrink-0" style={{ color: STATUS_COLOR[x.status] }} /> : <Lock size={14} className="shrink-0 text-accent" />}
                        <span className={`min-w-0 flex-1 truncate ${closed ? 'text-muted line-through' : ''}`}>{x.title}</span>
                        <button type="button" className="p-1 text-muted hover:text-danger" onClick={() => set('dependsOn', d.dependsOn.filter((y) => y !== id))} aria-label={t.delete}>
                          <X size={15} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {depOptions.length > 0 ? (
                <select className="input" value="" onChange={(e) => e.target.value && set('dependsOn', [...d.dependsOn, e.target.value])}>
                  <option value="">{t.depends_add}</option>
                  {depOptions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {CLOSED.includes(x.status) ? '✓ ' : ''}
                      {x.title}
                    </option>
                  ))}
                </select>
              ) : (
                d.dependsOn.length === 0 && <p className="text-xs text-muted">{t.depends_none_left}</p>
              )}
            </div>
          )}
        </div>

        <ReminderField value={d.reminder_minutes} onChange={(v) => set('reminder_minutes', v)} enabled={!!d.date && !!d.time} />

        <Field label={t.description}>
          <textarea className="input min-h-[84px] resize-y" placeholder={t.description_ph} value={d.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">{t.subtasks}</span>
          <ul className="space-y-1">
            {d.subtasks.map((s, i) => (
              <li key={s.id ?? `n${i}`} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-surface-2">
                <button
                  type="button"
                  onClick={() => set('subtasks', d.subtasks.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${s.done ? 'border-accent bg-accent text-on-accent' : 'border-line'}`}
                  aria-label={s.title}
                >
                  {s.done && <Check size={14} strokeWidth={3} />}
                </button>
                <input
                  className={`flex-1 bg-transparent text-sm outline-none ${s.done ? 'text-muted line-through' : ''}`}
                  value={s.title}
                  onChange={(e) => set('subtasks', d.subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                />
                <button type="button" className="p-1 text-muted opacity-60 hover:text-danger hover:opacity-100" onClick={() => set('subtasks', d.subtasks.filter((_, j) => j !== i))} aria-label={t.delete}>
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-center gap-2 px-1">
            <Plus size={18} className="text-muted" />
            <input
              className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted"
              placeholder={t.add_subtask}
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSub()
                }
              }}
              onBlur={addSub}
            />
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">{t.tags}</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {d.tagNames.map((n) => (
              <span key={n} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pr-1.5 pl-2.5 text-xs font-medium">
                #{n}
                <button type="button" onClick={() => set('tagNames', d.tagNames.filter((x) => x !== n))} className="text-muted hover:text-fg" aria-label={t.delete}>
                  <X size={13} />
                </button>
              </span>
            ))}
            <input
              className="min-w-[140px] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted"
              placeholder={t.add_tag}
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  addTag()
                }
              }}
            />
          </div>
          {newTag && suggestions.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button key={s.id} type="button" className="rounded-full border border-line px-2.5 py-0.5 text-xs text-muted hover:text-fg" onClick={() => addTag(s.name)}>
                  #{s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 rounded-2xl bg-surface-2 p-3.5">
          <div>
            <div className="text-sm font-medium">{t.requires_validation}</div>
            <div className="text-xs text-muted">{t.requires_validation_hint}</div>
          </div>
          <Toggle checked={d.requires_validation} onChange={(v) => set('requires_validation', v)} label={t.requires_validation} />
        </div>

        <div className={`flex items-start justify-between gap-4 rounded-2xl p-3.5 ${d.standby ? 'bg-[#b38cff]/15' : 'bg-surface-2'}`}>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <PauseCircle size={15} className="text-[#b38cff]" />
              {t.standby}
            </div>
            <div className="text-xs text-muted">{t.standby_hint}</div>
          </div>
          <Toggle checked={d.standby} onChange={(v) => set('standby', v)} label={t.standby} />
        </div>

        {err && <p className="text-sm text-danger">{err}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
