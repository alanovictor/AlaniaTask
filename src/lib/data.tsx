import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import type { Area, Priority, Status, Subtask, Tag, Task } from './types'

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
  priority: Priority
  status: Status
  date: string | null
  time: string | null
  requires_validation: boolean
  subtasks: SubtaskDraft[]
  tagNames: string[]
}

interface DataCtx {
  loading: boolean
  error: string | null
  areas: Area[]
  tags: Tag[]
  tasks: Task[]
  areaById: Map<string, Area>
  tagById: Map<string, Tag>
  reload: () => Promise<void>
  saveTask: (d: TaskDraft) => Promise<void>
  patchTask: (id: string, patch: Partial<Pick<Task, 'status' | 'date' | 'time' | 'priority' | 'area_id'>>) => Promise<void>
  toggleSubtask: (s: Subtask) => Promise<void>
  deleteTask: (id: string) => Promise<void>
  addArea: (name: string, color: string) => Promise<void>
  updateArea: (id: string, patch: Partial<Pick<Area, 'name' | 'color'>>) => Promise<void>
  deleteArea: (id: string) => Promise<void>
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

  const reload = useCallback(async () => {
    const [a, g, k] = await Promise.all([
      supabase.from('areas').select('*').order('position').order('created_at'),
      supabase.from('tags').select('*').order('name'),
      supabase.from('tasks').select(TASK_SELECT).order('created_at', { ascending: false }),
    ])
    const err = a.error ?? g.error ?? k.error
    if (err) {
      setError(err.message)
    } else {
      setError(null)
      setAreas(a.data as Area[])
      setTags(g.data as Tag[])
      setTasks((k.data as Task[]).map(sortSubtasks))
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
        priority: d.priority,
        status: d.status,
        date: d.date || null,
        time: d.date ? d.time || null : null,
        requires_validation: d.requires_validation,
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
    [tasks, ensureTags, reload],
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

  const value = useMemo<DataCtx>(
    () => ({
      loading,
      error,
      areas,
      tags,
      tasks,
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
    }),
    [loading, error, areas, tags, tasks, reload, saveTask, patchTask, toggleSubtask, deleteTask, addArea, updateArea, deleteArea],
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
    priority: 'medium',
    status: 'todo',
    date: null,
    time: null,
    requires_validation: false,
    subtasks: [],
    tagNames: [],
    ...partial,
  }
}

export function draftFromTask(t: Task, tagById: Map<string, Tag>): TaskDraft {
  return {
    id: t.id,
    title: t.title,
    description: t.description ?? '',
    area_id: t.area_id,
    priority: t.priority,
    status: t.status,
    date: t.date,
    time: t.time ? t.time.slice(0, 5) : null,
    requires_validation: t.requires_validation,
    subtasks: t.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done })),
    tagNames: t.task_tags.map((x) => tagById.get(x.tag_id)?.name).filter((n): n is string => !!n),
  }
}
