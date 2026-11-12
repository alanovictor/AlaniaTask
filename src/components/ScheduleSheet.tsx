import { useState } from 'react'
import { CalendarX2, Pencil } from 'lucide-react'
import { useData } from '../lib/data'
import { addDays, formatDate, today } from '../lib/dates'
import { useSettings } from '../lib/settings'
import { PRIORITY_COLOR, type Task } from '../lib/types'
import { useEditor } from './TaskEditor'
import { Field, Modal } from './ui'

/** Escolher o dia (e horário opcional) de uma tarefa com toques — pensado para o celular. */
export function ScheduleSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t, locale } = useSettings()
  const { patchTask } = useData()
  const { openEdit } = useEditor()
  const [date, setDate] = useState(task.date ?? '')
  const [time, setTime] = useState(task.time ? task.time.slice(0, 5) : '')

  const ref = today()
  const quick = Array.from({ length: 7 }, (_, i) => addDays(ref, i))

  const apply = (d: string | null, tm: string | null = time || null) => {
    patchTask(task.id, { date: d, time: d ? tm : null }).catch(() => {})
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.schedule}
      footer={
        <>
          {task.date && (
            <button className="btn btn-ghost text-danger" onClick={() => apply(null)}>
              <CalendarX2 size={18} />
              <span className="hidden sm:inline">{t.remove_date}</span>
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={() => {
              onClose()
              openEdit(task)
            }}
          >
            <Pencil size={16} />
            <span className="hidden sm:inline">{t.edit_details}</span>
          </button>
          <div className="flex-1" />
          <button className="btn btn-primary" onClick={() => apply(date || null)} disabled={!date}>
            {t.apply}
          </button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2.5">
        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PRIORITY_COLOR[task.priority] }} />
        <p className="font-medium">{task.title}</p>
      </div>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {quick.map((d, i) => {
          const active = d === date
          return (
            <button
              key={d}
              onClick={() => apply(d)}
              className={`flex flex-col items-center rounded-xl border px-1 py-2 transition-colors ${active ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2'}`}
            >
              <span className="text-[11px] font-semibold uppercase">
                {i === 0 ? t.today_btn : i === 1 ? t.tomorrow : formatDate(d, locale, { weekday: 'short' }).replace('.', '')}
              </span>
              <span className="text-lg leading-tight font-bold">{Number(d.slice(8))}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 pb-2">
        <Field label={t.pick_date}>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t.time_optional}>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}
