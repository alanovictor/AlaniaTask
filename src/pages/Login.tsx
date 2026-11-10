import { useState } from 'react'
import { getRemember, setRemember, supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings'
import { Logo } from '../components/Layout'

type Mode = 'login' | 'forgot' | 'recovery'

export function Login({ recovery = false, onRecovered }: { recovery?: boolean; onRecovered?: () => void }) {
  const { t, lang, setLang } = useSettings()
  const [mode, setMode] = useState<Mode>(recovery ? 'recovery' : 'login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [remember, setRememberState] = useState(getRemember)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'login') {
      setRemember(remember)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ kind: 'error', text: t.login_error })
    } else if (mode === 'forgot') {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname })
      setMsg({ kind: 'ok', text: t.reset_sent })
    } else {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setMsg({ kind: 'error', text: error.message })
      else {
        setMsg({ kind: 'ok', text: t.password_saved })
        onRecovered?.()
      }
    }
    setBusy(false)
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size={56} />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">{t.appName}</h1>
          <p className="mt-1 text-sm text-muted">{t.login_subtitle}</p>
        </div>

        <form onSubmit={submit} className="space-y-3 rounded-3xl border border-line bg-surface p-6 shadow-2xl shadow-black/20">
          {mode !== 'recovery' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{t.email}</span>
              <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">{mode === 'recovery' ? t.new_password : t.password}</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'recovery' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'recovery' ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}

          {mode === 'login' && (
            <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-sm select-none">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={remember} onChange={(e) => setRememberState(e.target.checked)} />
              {t.remember_me}
            </label>
          )}

          {msg && <p className={`text-sm ${msg.kind === 'error' ? 'text-danger' : 'text-muted'}`}>{msg.text}</p>}

          <button className="btn btn-primary w-full py-3" disabled={busy}>
            {mode === 'login' ? t.sign_in : mode === 'forgot' ? t.send_reset : t.save_password}
          </button>

          {mode === 'login' && (
            <button type="button" className="w-full pt-1 text-sm text-muted hover:text-fg" onClick={() => (setMode('forgot'), setMsg(null))}>
              {t.forgot}
            </button>
          )}
          {mode === 'forgot' && (
            <button type="button" className="w-full pt-1 text-sm text-muted hover:text-fg" onClick={() => (setMode('login'), setMsg(null))}>
              {t.back_to_login}
            </button>
          )}
        </form>

        <div className="mt-6 flex justify-center gap-1 text-xs">
          {(['pt', 'en'] as const).map((l) => (
            <button key={l} onClick={() => setLang(l)} className={`rounded-lg px-2.5 py-1 font-semibold ${lang === l ? 'bg-surface-2 text-fg' : 'text-muted'}`}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
