import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useSettings } from '../lib/settings'
import { AREA_COLORS, PRIORITY_COLOR, STATUS_COLOR, STATUSES, type Priority, type Status } from '../lib/types'

export function PriorityFlag({ p, withLabel = false }: { p: Priority; withLabel?: boolean }) {
  const { t } = useSettings()
  const color = PRIORITY_COLOR[p]
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color }} title={t[`p_${p}`]}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      {withLabel && t[`p_${p}`]}
    </span>
  )
}

export function StatusPill({ s }: { s: Status }) {
  const { t } = useSettings()
  const color = STATUS_COLOR[s]
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ color, background: `${color}22` }}
    >
      {t[`s_${s}`]}
    </span>
  )
}

/** Select de status estilizado como pill; troca rápida sem abrir o editor. */
export function StatusSelect({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const { t } = useSettings()
  const color = STATUS_COLOR[value]
  return (
    <select
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value as Status)}
      className="cursor-pointer appearance-none rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none"
      style={{ color, background: `${color}22` }}
      aria-label={t.status}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s} style={{ color: 'initial' }}>
          {t[`s_${s}`]}
        </option>
      ))}
    </select>
  )
}

export function AreaChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs text-muted">
      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
      <span className="truncate">{name}</span>
    </span>
  )
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-line bg-surface shadow-2xl sm:max-w-xl sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn btn-ghost -mr-2 p-2" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="flex items-center gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; color?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${active ? 'bg-surface text-fg shadow-sm' : 'text-muted hover:text-fg'}`}
          >
            {o.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {AREA_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full transition-transform ${value === c ? 'scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
