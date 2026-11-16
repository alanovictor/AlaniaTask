import { supabase } from './supabase'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gtasks`
const ANON_JWT = import.meta.env.VITE_SUPABASE_ANON_JWT as string

export interface GStatus {
  configured: boolean
  connected: boolean
  connected_at?: string
  last_sync_at?: string | null
  last_error?: string | null
}

async function call<T>(action: string, extra: Record<string, string> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_JWT}`, 'x-user-token': data.session?.access_token ?? '' },
    body: JSON.stringify({ action, ...extra }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `gtasks ${action}: ${res.status}`)
  return body as T
}

export const gStatus = () => call<GStatus>('status')
export const gSync = () => call<{ ok: boolean }>('sync')
export const gDisconnect = () => call<{ connected: boolean }>('disconnect')
export const gExchange = (code: string, state: string) => call<{ connected: boolean }>('exchange', { code, state })
export async function gConnect() {
  const { url } = await call<{ url: string }>('auth-url')
  window.location.href = url
}
