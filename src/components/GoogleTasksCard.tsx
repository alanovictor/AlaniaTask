import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Link2, RefreshCw, Unlink } from 'lucide-react'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { gConnect, gDisconnect, gExchange, gStatus, gSync, type GStatus } from '../lib/gtasks'

export function GoogleTasksCard() {
  const { t, locale } = useSettings()
  const { reload } = useData()
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<GStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const handled = useRef(false)

  const refresh = useCallback(() => gStatus().then(setStatus, () => setStatus(null)), [])

  useEffect(() => {
    // volta do login do Google (google.html repassa ?gcode=&gstate=)
    const code = params.get('gcode')
    const state = params.get('gstate')
    const gerror = params.get('gerror')
    if ((code || gerror) && !handled.current) {
      handled.current = true
      setParams({}, { replace: true })
      if (gerror || !code || !state) {
        setMsg({ text: t.gt_connect_failed, error: true })
        refresh()
        return
      }
      setBusy(true)
      gExchange(code, state)
        .then(() => {
          setMsg({ text: t.gt_connected_ok })
          return reload()
        })
        .catch(() => setMsg({ text: t.gt_connect_failed, error: true }))
        .finally(() => {
          setBusy(false)
          refresh()
        })
      return
    }
    refresh()
  }, [params, setParams, refresh, reload, t])

  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (okText) setMsg({ text: okText })
      await reload()
    } catch {
      setMsg({ text: t.gt_error, error: true })
    }
    setBusy(false)
    refresh()
  }

  const fmt = (iso: string) => new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-semibold">{t.gt_title}</h2>
      <p className="mt-0.5 text-sm text-muted">{t.gt_hint}</p>
      <div className="mt-4 space-y-3">
        {status === null ? (
          <div className="h-9 w-40 animate-pulse rounded-xl bg-surface-2" />
        ) : !status.configured ? (
          <p className="text-sm text-muted">{t.gt_not_configured}</p>
        ) : !status.connected || status.last_error === 'revoked' ? (
          <>
            {status.last_error === 'revoked' && <p className="text-sm text-danger">{t.gt_revoked}</p>}
            <button className="btn btn-primary" disabled={busy} onClick={() => run(gConnect)}>
              <Link2 size={18} />
              {t.gt_connect}
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#30a46c]">
                <CheckCircle2 size={16} />
                {t.gt_connected}
              </span>
              <span className="text-muted">
                {t.gt_last_sync}: {status.last_sync_at ? fmt(status.last_sync_at) : t.gt_never}
              </span>
            </div>
            {status.last_error && <p className="text-sm text-danger">{t.gt_error}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={busy} onClick={() => run(gSync, t.gt_synced)}>
                <RefreshCw size={18} className={busy ? 'animate-spin' : ''} />
                {t.gt_sync_now}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => confirm(t.gt_confirm_disconnect) && run(gDisconnect)}>
                <Unlink size={18} />
                {t.gt_disconnect}
              </button>
            </div>
          </>
        )}
        {msg && <p className={`text-sm ${msg.error ? 'text-danger' : 'text-muted'}`}>{msg.text}</p>}
      </div>
    </section>
  )
}
