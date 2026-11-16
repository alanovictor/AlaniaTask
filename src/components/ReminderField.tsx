import { Bell, BellOff } from 'lucide-react'
import { useSettings } from '../lib/settings'

export const REMINDER_OPTIONS = [0, 5, 10, 15, 30, 60, 120, 1440]

/** "Avisar": quando a notificação desta tarefa chega. null = não avisar. Exige horário. */
export function ReminderField({ value, onChange, enabled }: { value: number | null; onChange: (v: number | null) => void; enabled: boolean }) {
  const { t } = useSettings()
  const on = enabled && value !== null
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5 ${enabled ? '' : 'opacity-60'}`}>
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${on ? 'bg-accent-soft text-accent' : 'bg-surface text-muted'}`}>{on ? <Bell size={18} /> : <BellOff size={18} />}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{t.notify_label}</div>
        <div className="text-xs text-muted">{enabled ? t.notify_hint : t.reminder_needs_time}</div>
      </div>
      <select
        className="input w-auto py-1.5"
        disabled={!enabled}
        value={value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        aria-label={t.notify_label}
      >
        <option value="">{t.notify_none}</option>
        {REMINDER_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {t.notify_before(m)}
          </option>
        ))}
      </select>
    </div>
  )
}
