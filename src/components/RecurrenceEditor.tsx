import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useData, type RecurrenceDraft } from '../lib/data'
import { formatDate, today } from '../lib/dates'
import { nextOccurrences, weekdayOf, type Freq, type Recurrence } from '../lib/recurrence'
import { useSettings } from '../lib/settings'
import { PRIORITIES, PRIORITY_COLOR } from '../lib/types'
import { Field, Modal, Segmented, Toggle } from './ui'

export function emptyRecurrence(): RecurrenceDraft {
  const start = today()
  return {
    title: '',
    description: '',
    area_id: null,
    priority: 'medium',
    time: null,
    requires_validation: false,
    freq: 'weekly',
    every_n: 1,
    weekdays: [weekdayOf(start)],
    month_mode: 'day',
    month_day: Number(start.slice(8)),
    nth: Math.min(4, Math.floor((Number(start.slice(8)) - 1) / 7) + 1),
    nth_weekday: weekdayOf(start),
    start_date: start,
    end_type: 'never',
    until_date: null,
    max_count: 10,
    active: true,
  }
}

export function draftFromRecurrence(r: Recurrence): RecurrenceDraft {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    area_id: r.area_id,
    priority: r.priority,
    time: r.time ? r.time.slice(0, 5) : null,
    requires_validation: r.requires_validation,
    freq: r.freq,
    every_n: r.every_n,
    weekdays: r.weekdays,
    month_mode: r.month_mode,
    month_day: r.month_day,
    nth: r.nth,
    nth_weekday: r.nth_weekday,
    start_date: r.start_date,
    end_type: r.end_type,
    until_date: r.until_date,
    max_count: r.max_count ?? 10,
    active: r.active,
  }
}

export function RecurrenceEditor({ initial, generatedCount = 0, lastGenerated = null, onClose }: { initial: RecurrenceDraft; generatedCount?: number; lastGenerated?: string | null; onClose: () => void }) {
  const { t, locale } = useSettings()
  const { areas, saveRecurrence, deleteRecurrence } = useData()
  const [d, setD] = useState<RecurrenceDraft>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)
  const set = <K extends keyof RecurrenceDraft>(k: K, v: RecurrenceDraft[K]) => setD((p) => ({ ...p, [k]: v }))

  const unit = (f: Freq, n: number) => ({ daily: t.unit_daily, weekly: t.unit_weekly, monthly: t.unit_monthly, yearly: t.unit_yearly })[f](n)
  const preview = useMemo(
    () => nextOccurrences({ ...d, generated_count: d.id ? generatedCount : 0, last_generated: d.id ? lastGenerated : null }, today(), 5),
    [d, generatedCount, lastGenerated],
  )
  const valid = d.title.trim() && (d.freq !== 'weekly' || d.weekdays.length > 0) && (d.end_type !== 'until' || !!d.until_date) && (d.end_type !== 'count' || (d.max_count ?? 0) >= 1)

  const submit = async () => {
    if (!valid) return
    setBusy(true)
    setErr(false)
    try {
      await saveRecurrence(d)
      onClose()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!d.id || !confirm(t.confirm_delete_recurring)) return
    setBusy(true)
    try {
      await deleteRecurrence(d.id)
      onClose()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  const startDay = Number(d.start_date.slice(8))

  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? t.edit_recurring : t.new_recurring}
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
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>
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

        {/* ---------- regra ---------- */}
        <div className="space-y-4 rounded-2xl bg-surface-2 p-3.5">
          <Field label={t.repeat}>
            <Segmented
              value={d.freq}
              onChange={(v) => set('freq', v)}
              options={(['daily', 'weekly', 'monthly', 'yearly'] as Freq[]).map((f) => ({ value: f, label: t[`f_${f}`] }))}
            />
          </Field>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t.every}</span>
            <input
              type="number"
              min={1}
              max={365}
              className="input w-20 py-1.5 text-center"
              value={d.every_n}
              onChange={(e) => set('every_n', Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
            />
            <span>{unit(d.freq, d.every_n)}</span>
          </div>

          {d.freq === 'weekly' && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">{t.on_days}</span>
              <div className="flex gap-1.5">
                {t.weekday_initials.map((label, i) => {
                  const on = d.weekdays.includes(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      title={t.weekday_names[i]}
                      onClick={() => set('weekdays', on ? d.weekdays.filter((x) => x !== i) : [...d.weekdays, i].sort())}
                      className={`grid h-10 flex-1 place-items-center rounded-xl text-sm font-bold transition-colors ${on ? 'bg-accent text-on-accent' : 'bg-surface text-muted hover:text-fg'}`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {d.freq === 'monthly' && (
            <div className="space-y-2.5 text-sm">
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" className="accent-[var(--accent)]" checked={d.month_mode === 'day'} onChange={() => set('month_mode', 'day')} />
                <span>{t.month_on_day}</span>
                <select className="input w-auto py-1.5" value={d.month_day ?? startDay} disabled={d.month_mode !== 'day'} onChange={(e) => set('month_day', Number(e.target.value))}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                  <option value={-1}>{t.last_day}</option>
                </select>
              </label>
              <label className="flex flex-wrap items-center gap-2">
                <input type="radio" className="accent-[var(--accent)]" checked={d.month_mode === 'nth'} onChange={() => set('month_mode', 'nth')} />
                <span>{t.month_on_nth}</span>
                <select className="input w-auto py-1.5" value={d.nth ?? 1} disabled={d.month_mode !== 'nth'} onChange={(e) => set('nth', Number(e.target.value))}>
                  {[1, 2, 3, 4, -1].map((n) => (
                    <option key={n} value={n}>
                      {t.nth_names[n]}
                    </option>
                  ))}
                </select>
                <select className="input w-auto py-1.5" value={d.nth_weekday ?? 0} disabled={d.month_mode !== 'nth'} onChange={(e) => set('nth_weekday', Number(e.target.value))}>
                  {t.weekday_names.map((w, i) => (
                    <option key={i} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {d.freq === 'yearly' && <p className="text-sm text-muted">{t.yearly_on(formatDate(d.start_date, locale, { day: 'numeric', month: 'long' }))}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t.starts}>
              <input type="date" className="input" value={d.start_date} onChange={(e) => e.target.value && set('start_date', e.target.value)} />
            </Field>
            <Field label={t.time_optional}>
              <input type="time" className="input" value={d.time ?? ''} onChange={(e) => set('time', e.target.value || null)} />
            </Field>
          </div>

          <Field label={t.ends}>
            <div className="space-y-2.5">
              <Segmented
                value={d.end_type}
                onChange={(v) => set('end_type', v)}
                options={[
                  { value: 'never', label: t.end_never },
                  { value: 'until', label: t.end_until },
                  { value: 'count', label: t.end_count },
                ]}
              />
              {d.end_type === 'until' && <input type="date" className="input" min={d.start_date} value={d.until_date ?? ''} onChange={(e) => set('until_date', e.target.value || null)} />}
              {d.end_type === 'count' && (
                <div className="flex items-center gap-2 text-sm">
                  <input type="number" min={1} max={9999} className="input w-24 py-1.5 text-center" value={d.max_count ?? 1} onChange={(e) => set('max_count', Math.max(1, Number(e.target.value) || 1))} />
                  <span>{t.times}</span>
                </div>
              )}
            </div>
          </Field>

          <div>
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase">{t.next_dates}</span>
            {preview.length ? (
              <div className="flex flex-wrap gap-1.5">
                {preview.map((p) => (
                  <span key={p} className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium first-letter:uppercase">
                    {formatDate(p, locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">{t.no_next}</p>
            )}
          </div>
        </div>

        {/* ---------- dados da tarefa ---------- */}
        <Field label={t.priority}>
          <Segmented
            value={d.priority}
            onChange={(v) => set('priority', v)}
            options={[...PRIORITIES].reverse().map((p) => ({ value: p, label: t[`p_${p}`], color: PRIORITY_COLOR[p] }))}
          />
        </Field>

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

        <Field label={t.description}>
          <textarea className="input min-h-[72px] resize-y" placeholder={t.description_ph} value={d.description ?? ''} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-2xl bg-surface-2 p-3.5">
          <div>
            <div className="text-sm font-medium">{t.requires_validation}</div>
            <div className="text-xs text-muted">{t.requires_validation_hint}</div>
          </div>
          <Toggle checked={d.requires_validation} onChange={(v) => set('requires_validation', v)} label={t.requires_validation} />
        </div>

        {err && <p className="text-sm text-danger">{t.error_generic}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
