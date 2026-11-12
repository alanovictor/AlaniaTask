import { useEffect, useState } from 'react'
import { Bell, BellOff, BellRing, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings'
import { currentSubscription, disablePush, enablePush, pushState, sendTest, type PushState } from '../lib/push'
import { Toggle } from './ui'

interface Prefs {
  notify_morning: boolean
  morning_time: string
  notify_reminders: boolean
  reminder_minutes: number
  notify_overdue: boolean
  overdue_time: string
}

const DEFAULTS: Prefs = { notify_morning: true, morning_time: '08:00', notify_reminders: true, reminder_minutes: 15, notify_overdue: true, overdue_time: '18:00' }

export function NotificationsCard({ userId }: { userId: string }) {
  const { t } = useSettings()
  const [state, setState] = useState<PushState>(pushState)
  const [subscribed, setSubscribed] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    currentSubscription().then((s) => setSubscribed(!!s), () => {})
    supabase
      .from('user_settings')
      .select('notify_morning, morning_time, notify_reminders, reminder_minutes, notify_overdue, overdue_time')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setPrefs({ ...data, morning_time: String(data.morning_time).slice(0, 5), overdue_time: String(data.overdue_time).slice(0, 5) } as Prefs)
      })
  }, [])

  const save = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    supabase
      .from('user_settings')
      .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
      .then(({ error }) => error && setMsg(t.error_generic))
  }

  const enable = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const s = await enablePush()
      setState(s)
      setSubscribed(s === 'granted')
    } catch {
      setMsg(t.error_generic)
    }
    setBusy(false)
  }
  const disable = async () => {
    setBusy(true)
    try {
      await disablePush()
      setSubscribed(false)
    } catch {
      setMsg(t.error_generic)
    }
    setBusy(false)
  }
  const test = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const n = await sendTest()
      setMsg(n > 0 ? t.notif_test_sent : t.notif_test_none)
    } catch {
      setMsg(t.error_generic)
    }
    setBusy(false)
  }

  const active = state === 'granted' && subscribed

  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'}`}>
          {active ? <BellRing size={20} /> : state === 'denied' ? <BellOff size={20} /> : <Bell size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t.notifications}</h2>
          <p className="mt-0.5 text-sm text-muted">
            {active ? t.notif_on : state === 'denied' ? t.notif_denied : state === 'ios-needs-install' ? t.notif_ios : state === 'unsupported' ? t.notif_unsupported : t.notif_hint}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {!active && (state === 'default' || (state === 'granted' && !subscribed)) && (
          <button className="btn btn-primary" onClick={enable} disabled={busy}>
            <Bell size={18} />
            {t.notif_enable}
          </button>
        )}
        {active && (
          <>
            <button className="btn btn-outline" onClick={test} disabled={busy}>
              <Send size={16} />
              {t.notif_test}
            </button>
            <button className="btn btn-ghost" onClick={disable} disabled={busy}>
              {t.notif_disable}
            </button>
          </>
        )}
      </div>
      {state === 'denied' && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">{t.notif_unblock_steps}</p>}
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}

      <div className={`mt-5 space-y-3 ${active ? '' : 'pointer-events-none opacity-50'}`}>
        <Row label={t.notif_morning} hint={t.notif_morning_hint} on={prefs.notify_morning} onToggle={(v) => save({ notify_morning: v })}>
          <input type="time" className="input w-28 py-1.5" value={prefs.morning_time} onChange={(e) => e.target.value && save({ morning_time: e.target.value })} />
        </Row>
        <Row label={t.notif_reminders} hint={t.notif_reminders_hint} on={prefs.notify_reminders} onToggle={(v) => save({ notify_reminders: v })}>
          <select className="input w-28 py-1.5" value={prefs.reminder_minutes} onChange={(e) => save({ reminder_minutes: Number(e.target.value) })}>
            {[0, 5, 10, 15, 30, 60, 120].map((m) => (
              <option key={m} value={m}>
                {t.notif_minutes_before(m)}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t.notif_overdue} hint={t.notif_overdue_hint} on={prefs.notify_overdue} onToggle={(v) => save({ notify_overdue: v })}>
          <input type="time" className="input w-28 py-1.5" value={prefs.overdue_time} onChange={(e) => e.target.value && save({ overdue_time: e.target.value })} />
        </Row>
      </div>
    </section>
  )
}

function Row({ label, hint, on, onToggle, children }: { label: string; hint: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
      <Toggle checked={on} onChange={onToggle} label={label} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <div className={on ? '' : 'pointer-events-none opacity-50'}>{children}</div>
    </div>
  )
}
