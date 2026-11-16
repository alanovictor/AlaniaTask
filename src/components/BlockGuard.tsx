import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useData } from '../lib/data'
import { ACTIVE_STATUSES, openBlockers } from '../lib/projects'
import { useSettings } from '../lib/settings'
import type { Status, Task } from '../lib/types'
import { Modal, StatusPill } from './ui'

interface GuardCtx {
  /** Pergunta antes de iniciar/concluir uma tarefa com dependências abertas. true = pode seguir. */
  confirmStart: (prev: Status | null, next: Status, blockers: Task[]) => Promise<boolean>
  /** Troca o status passando pelo aviso de dependências. */
  setStatus: (task: Task, next: Status) => void
}

const Ctx = createContext<GuardCtx | null>(null)

export function BlockGuardProvider({ children }: { children: ReactNode }) {
  const { t } = useSettings()
  const { patchTask, depIndex, taskById } = useData()
  const [ask, setAsk] = useState<Task[] | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirmStart = useCallback<GuardCtx['confirmStart']>((prev, next, blockers) => {
    // só avisa ao passar de "não fazendo" para "fazendo"
    const starting = ACTIVE_STATUSES.includes(next) && !(prev && ACTIVE_STATUSES.includes(prev))
    if (!starting || blockers.length === 0) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setAsk(blockers)
    })
  }, [])

  const answer = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setAsk(null)
  }

  const setStatus = useCallback<GuardCtx['setStatus']>(
    (task, next) => {
      confirmStart(task.status, next, openBlockers(task.id, depIndex, taskById)).then((ok) => {
        if (ok) patchTask(task.id, { status: next }).catch(() => {})
      })
    },
    [confirmStart, depIndex, taskById, patchTask],
  )

  return (
    <Ctx.Provider value={{ confirmStart, setStatus }}>
      {children}
      {ask && (
        <Modal
          open
          onClose={() => answer(false)}
          title={t.block_title}
          footer={
            <>
              <div className="flex-1" />
              <button className="btn btn-ghost" onClick={() => answer(false)}>
                {t.cancel}
              </button>
              <button className="btn btn-primary" onClick={() => answer(true)}>
                {t.block_proceed}
              </button>
            </>
          }
        >
          <div className="space-y-3 pb-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Lock size={16} className="shrink-0 text-accent" />
              {t.block_text}
            </p>
            <ul className="space-y-1.5">
              {ask.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{x.title}</span>
                  <StatusPill s={x.status} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t.block_alert_note}</p>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

export function useBlockGuard(): GuardCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useBlockGuard fora do BlockGuardProvider')
  return v
}
