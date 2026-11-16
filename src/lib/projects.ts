import { CLOSED, type Status, type Task, type TaskDep } from './types'

/** Status que contam como "estar fazendo" a tarefa. */
export const ACTIVE_STATUSES: Status[] = ['in_progress', 'done', 'validated']

export interface DepIndex {
  /** tarefa → tarefas de que ela depende */
  before: Map<string, string[]>
  /** tarefa → tarefas que dependem dela */
  after: Map<string, string[]>
}

export function indexDeps(deps: TaskDep[]): DepIndex {
  const before = new Map<string, string[]>()
  const after = new Map<string, string[]>()
  for (const d of deps) {
    before.set(d.task_id, [...(before.get(d.task_id) ?? []), d.depends_on])
    after.set(d.depends_on, [...(after.get(d.depends_on) ?? []), d.task_id])
  }
  return { before, after }
}

/** Tarefas de que `id` depende e que ainda não estão concluídas. */
export function openBlockers(id: string, idx: DepIndex, byId: Map<string, Task>): Task[] {
  return (idx.before.get(id) ?? []).map((x) => byId.get(x)).filter((x): x is Task => !!x && !CLOSED.includes(x.status))
}

/** Feita (ou iniciada) antes das tarefas de que depende: gera alerta no projeto. */
export function isOutOfOrder(task: Task, idx: DepIndex, byId: Map<string, Task>): boolean {
  return ACTIVE_STATUSES.includes(task.status) && openBlockers(task.id, idx, byId).length > 0
}

/** Todas as tarefas que dependem (direta ou indiretamente) de `id`; não podem virar dependência dela. */
export function descendants(id: string, idx: DepIndex): Set<string> {
  const seen = new Set<string>()
  const stack = [...(idx.after.get(id) ?? [])]
  while (stack.length) {
    const x = stack.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    stack.push(...(idx.after.get(x) ?? []))
  }
  return seen
}

/** Etapa de cada tarefa no fluxograma: 0 se não depende de nada, senão 1 + maior etapa das dependências. */
export function levels(ids: string[], idx: DepIndex): Map<string, number> {
  const inSet = new Set(ids)
  const memo = new Map<string, number>()
  const visit = (id: string, guard: Set<string>): number => {
    const known = memo.get(id)
    if (known !== undefined) return known
    if (guard.has(id)) return 0
    guard.add(id)
    const parents = (idx.before.get(id) ?? []).filter((p) => inSet.has(p))
    const lv = parents.length ? 1 + Math.max(...parents.map((p) => visit(p, guard))) : 0
    guard.delete(id)
    memo.set(id, lv)
    return lv
  }
  for (const id of ids) visit(id, new Set())
  return memo
}
