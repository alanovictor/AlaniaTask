import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Area, Priority, Project, Status, Subtask, Tag, Task, TaskDep } from './types'
import { indexDeps, type DepIndex } from './projects'
import type { Recurrence } from './recurrence'
import { addDays, today } from './dates'

export type RecurrenceDraft = Omit<Recurrence, 'id' | 'last_generated' | 'generated_count' | 'created_at'> & { id?: string }

export interface SubtaskDraft {
  id?: string
  title: string
  done: boolean
}

export interface TaskDraft {
  id?: string
  title: string
  description: string
  area_id: string | null
  project_id: string | null
  dependsOn: string[]
  priority: Priority
  status: Status
  date: string | null
  time: string | null
  requires_validation: boolean
  reminder_minutes: number | null
  standby: boolean
  subtasks: SubtaskDraft[]
  tagNames: string[]
}

interface DataCtx {
  loading: boolean
  error: string | null
  areas: Area[]
  tags: Tag[]
  /** tarefas fora do stand by (o que aparece nas telas normais) */
  tasks: Task[]
  /** todas, inclusive em stand by (projetos e dependências) */
  allTasks: Task[]
  standbyTasks: Task[]
  recurrences: Recurrence[]
  projects: Project[]
  deps: TaskDep[]
  depIndex: DepIndex
  taskById: Map<string, Task>
  projectById: Map<string, Project>
  areaById: Map<string, Area>
  tagById: Map<string, Tag>
  reload: () => Promise<void>
  saveTask: (d: TaskDraft) => Promise<void>
  patchTask: (id: string, patch: Partial<Pick<Task, 'status' | 'date' | 'time' | 'priority' | 'area_id' | 'standby' | 'standby_at'>>) => Promise<void>
  toggleSubtask: (s: Subtask) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  addArea: (name: string, color: string) => Promise<void>
  updateArea: (id: string, patch: Partial<Pick<Area, 'name' | 'color'>>) => Promise<void>
  deleteArea: (id: string) => Promise<void>
  saveRecurrence: (d: RecurrenceDraft) => Promise<void>
  setRecurrenceActive: (id: string, active: boolean) => Promise<void>
  deleteRecurrence: (id: string) => Promise<void>
  saveProject: (d: ProjectDraft) => Promise<string>
  deleteProject: (id: string) => Promise<void>
  linkTasks: (projectId: string, taskIds: string[]) => Promise<void>
}

export interface ProjectDraft {
  id?: string
  name: string
  color: string
  description: string
  deadline: string | null
  status: Project['status']
}

const Ctx = createContext<DataCtx | null>(null)

const TASK_SELECT = '*, subtasks(*), task_tags(tag_id)'

function sortSubtasks(t: Task): Task {
  return { ...t, subtasks: [...(t.subtasks ?? [])].sort((a, b) => a.position - b.position) }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [recurrences, setRecurrences] = useState<Recurrence[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [deps, setDeps] = useState<TaskDep[]>([])

  const reload = useCallback(async () => {
    // cria as tarefas das recorrências até hoje (data local); falha aqui não impede o resto
    await supabase.rpc('generate_recurring_tasks', { p_today: today() }).then(() => undefined, () => undefined)
    const [a, g, k, rc, pj, dp] = await Promise.all([
      supabase.from('areas').select('*').order('position').order('created_at'),
      supabase.from('tags').select('*').order('name'),
      supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false }),
      supabase.from('recurrences').select('*').order('created_at'),
      supabase.from('projects').select('*').order('position').order('created_at'),
      supabase.from('task_deps').select('task_id, depends_on'),
    ])
    const err = a.error ?? g.error ?? k.error ?? rc.error ?? pj.error ?? dp.error
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setAreas(a.data as Area[])
      setTags(g.data as Tag[])
      setTasks((k.data as Task[]).map(sortSubtasks))
      setRecurrences(rc.data as Recurrence[])
      setProjects(pj.data as Project[])
      setDeps(dp.data as TaskDep[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    // recarrega ao voltar para o app (ex.: virou o dia com o app em segundo plano)
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [reload])

  const ensureTags = useCallback(
    async (names: string[]): Promise<string[]> => {
      const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
      const known = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]))
      const missing = clean.filter((n) => !known.has(n.toLowerCase()))
      if (missing.length) {
        const { data, error } = await supabase.from('tags').insert(missing.map((name) => ({ name }))).select()
        if (error) throw error
        for (const t of data as Tag[]) known.set(t.name.toLowerCase(), t.id)
      }
      return clean.map((n) => known.get(n.toLowerCase())!)
    },
    [tags],
  )

  const saveTask = useCallback(
    async (d: TaskDraft) => {
      const row = {
        title: d.title.trim(),
        description: d.description.trim() || null,
        area_id: d.area_id,
        project_id: d.project_id,
        priority: d.priority,
        status: d.status,
        date: d.date || null,
        time: d.date ? d.time || null : null,
        requires_validation: d.requires_validation,
        // o aviso precisa de data e horário
        reminder_minutes: d.date && d.time ? d.reminder_minutes : null,
        standby: d.standby,
        // guarda quando entrou no stand by (mantém a data se já estava)
        standby_at: d.standby ? (tasks.find((t) => t.id === d.id)?.standby_at ?? new Date().toISOString()) : null,
      }
      let taskId = d.id
      if (taskId) {
        const { error } = await supabase.from('tasks').update(row).eq('id', taskId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('tasks').insert(row).select('id').single()
        if (error) throw error
        taskId = data.id as string
      }

      // subtarefas: apaga as removidas, atualiza/insere as demais
      const current = tasks.find((t) => t.id === taskId)?.subtasks ?? []
      const keep = new Set(d.subtasks.filter((s) => s.id).map((s) => s.id))
      const removed = current.filter((s) => !keep.has(s.id)).map((s) => s.id)
      if (removed.length) {
        const { error } = await supabase.from('subtasks').delete().in('id', removed)
        if (error) throw error
      }
      const subs = d.subtasks
        .filter((s) => s.title.trim())
        .map((s, i) => ({ ...(s.id ? { id: s.id } : {}), task_id: taskId, title: s.title.trim(), done: s.done, position: i }))
      const existing = subs.filter((s) => 'id' in s)
      const fresh = subs.filter((s) => !('id' in s))
      if (existing.length) {
        const { error } = await supabase.from('subtasks').upsert(existing)
        if (error) throw error
      }
      if (fresh.length) {
        const { error } = await supabase.from('subtasks').insert(fresh)
        if (error) throw error
      }

      // dependências (o banco apaga as antigas sozinho se a tarefa trocou de projeto)
      const prevDeps = deps.filter((x) => x.task_id === taskId).map((x) => x.depends_on)
      const nextDeps = d.project_id ? [...new Set(d.dependsOn)] : []
      if (prevDeps.join() !== nextDeps.join()) {
        const { error } = await supabase.from('task_deps').delete().eq('task_id', taskId)
        if (error) throw error
        if (nextDeps.length) {
          const { error: insErr } = await supabase.from('task_deps').insert(nextDeps.map((depends_on) => ({ task_id: taskId, depends_on })))
          if (insErr) throw insErr
        }
      }

      // etiquetas
      const tagIds = await ensureTags(d.tagNames)
      const { error: delErr } = await supabase.from('task_tags').delete().eq('task_id', taskId)
      if (delErr) throw delErr
      if (tagIds.length) {
        const { error } = await supabase.from('task_tags').insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })))
        if (error) throw error
      }
      await reload()
    },
    [tasks, deps, ensureTags, reload],
  )

  const patchTask = useCallback<DataCtx['patchTask']>(
    async (id, patch) => {
      // otimista: atualiza a tela na hora
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      const { data, error } = await supabase.from('tasks').update(patch).eq('id', id).select(TASK_SELECT).single()
      if (error) {
        await reload()
        throw error
      }
      setTasks((prev) => prev.map((t) => (t.id === id ? sortSubtasks(data as Task) : t)))
      // mudança de status pode criar/alterar tarefas de validação no banco
      if (patch.status) await reload()
    },
    [reload],
  )

  const toggleSubtask = useCallback(
    async (s: Subtask) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === s.task_id ? { ...t, subtasks: t.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) } : t,
        ),
      )
      const { error } = await supabase.from('subtasks').update({ done: !s.done }).eq('id', s.id)
      if (error) await reload()
    },
    [reload],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id))
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) {
        await reload()
        throw error
      }
    },
    [reload],
  )

  const addArea = useCallback(
    async (name: string, color: string) => {
      const position = areas.length ? Math.max(...areas.map((a) => a.position)) + 1 : 0
      const { error } = await supabase.from('areas').insert({ name: name.trim(), color, position })
      if (error) throw error
      await reload()
    },
    [areas, reload],
  )

  const updateArea = useCallback<DataCtx['updateArea']>(
    async (id, patch) => {
      setAreas((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
      const { error } = await supabase.from('areas').update(patch).eq('id', id)
      if (error) {
        await reload()
        throw error
      }
    },
    [reload],
  )

  const deleteArea = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('areas').delete().eq('id', id)
      if (error) throw error
      await reload()
    },
    [reload],
  )

  const saveRecurrence = useCallback(
    async (d: RecurrenceDraft) => {
      const { id, ...row } = d
      const clean = {
        ...row,
        title: row.title.trim(),
        description: row.description?.trim() || null,
        time: row.time || null,
        reminder_minutes: row.time ? row.reminder_minutes : null,
        until_date: row.end_type === 'until' ? row.until_date : null,
        max_count: row.end_type === 'count' ? row.max_count : null,
        updated_at: new Date().toISOString(),
      }
      const { error } = id ? await supabase.from('recurrences').update(clean).eq('id', id) : await supabase.from('recurrences').insert(clean)
      if (error) throw error
      await reload()
    },
    [reload],
  )

  const setRecurrenceActive = useCallback(
    async (id: string, active: boolean) => {
      setRecurrences((prev) => prev.map((x) => (x.id === id ? { ...x, active } : x)))
      // ao reativar, não gera o que ficou para trás durante a pausa
      const startsLater = (recurrences.find((x) => x.id === id)?.start_date ?? '') > today()
      const patch = active ? { active, last_generated: startsLater ? null : addDays(today(), -1) } : { active }
      const { error } = await supabase.from('recurrences').update(patch).eq('id', id)
      if (error) {
        await reload()
        throw error
      }
      await reload()
    },
    [reload, recurrences],
  )

  const deleteRecurrence = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('recurrences').delete().eq('id', id)
      if (error) throw error
      await reload()
    },
    [reload],
  )

  const saveProject = useCallback(
    async (d: ProjectDraft) => {
      const row = { name: d.name.trim(), color: d.color, description: d.description.trim() || null, deadline: d.deadline || null, status: d.status }
      let id = d.id
      if (id) {
        const { error } = await supabase.from('projects').update(row).eq('id', id)
        if (error) throw error
      } else {
        const position = projects.length ? Math.max(...projects.map((p) => p.position)) + 1 : 0
        const { data, error } = await supabase.from('projects').insert({ ...row, position }).select('id').single()
        if (error) throw error
        id = data.id as string
      }
      await reload()
      return id
    },
    [projects, reload],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      // as tarefas continuam existindo, só ficam sem projeto
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
      await reload()
    },
    [reload],
  )

  const linkTasks = useCallback(
    async (projectId: string, taskIds: string[]) => {
      if (!taskIds.length) return
      const { error } = await supabase.from('tasks').update({ project_id: projectId }).in('id', taskIds)
      if (error) throw error
      await reload()
    },
    [reload],
  )

  const value = useMemo<DataCtx>(
    () => ({
      loading,
      error,
      areas,
      tags,
      tasks: tasks.filter((x) => !x.standby),
      allTasks: tasks,
      standbyTasks: tasks.filter((x) => x.standby),
      recurrences,
      projects,
      deps,
      depIndex: indexDeps(deps),
      taskById: new Map(tasks.map((x) => [x.id, x])),
      projectById: new Map(projects.map((p) => [p.id, p])),
      areaById: new Map(areas.map((a) => [a.id, a])),
      tagById: new Map(tags.map((t) => [t.id, t])),
      reload,
      saveTask,
      patchTask,
      toggleSubtask,
      deleteTask,
      addArea,
      updateArea,
      deleteArea,
      saveRecurrence,
      setRecurrenceActive,
      deleteRecurrence,
      saveProject,
      deleteProject,
      linkTasks,
    }),
    [loading, error, areas, tags, tasks, recurrences, projects, deps, saveProject, deleteProject, linkTasks, saveRecurrence, setRecurrenceActive, deleteRecurrence, reload, saveTask, patchTask, toggleSubtask, deleteTask, addArea, updateArea, deleteArea],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData fora do DataProvider')
  return v
}

export function emptyDraft(partial: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: '',
    description: '',
    area_id: null,
    project_id: null,
    dependsOn: [],
    priority: 'medium',
    status: 'todo',
    date: null,
    time: null,
    requires_validation: false,
    reminder_minutes: null,
    standby: false,
    subtasks: [],
    tagNames: [],
    ...partial,
  }
}

export function draftFromTask(t: Task, tagById: Map<string, Tag>, dependsOn: string[] = []): TaskDraft {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    area_id: t.area_id,
    project_id: t.project_id,
    dependsOn,
    priority: t.priority,
    status: t.status,
    date: t.date,
    time: t.time ? t.time.slice(0, 5) : null,
    requires_validation: t.requires_validation,
    reminder_minutes: t.reminder_minutes,
    standby: t.standby,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    tagNames: t.task_tags.map((x) => tagById.get(x.tag_id)?.name).filter((n): n is string => !!n),
  }
}
