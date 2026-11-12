import { supabase } from './supabase'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/notify`
// Chave anon legada (JWT público): a função fica com Verify JWT ligado.
const ANON_JWT = import.meta.env.VITE_SUPABASE_ANON_JWT as string

export type PushState = 'unsupported' | 'ios-needs-install' | 'default' | 'granted' | 'denied'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function pushState(): PushState {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  if (!pushSupported()) return ios && !standalone ? 'ios-needs-install' : 'unsupported'
  return Notification.permission as PushState
}

async function callFn(action: string, userToken?: string) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ANON_JWT}`,
      ...(userToken ? { 'x-user-token': userToken } : {}),
    },
    body: JSON.stringify({ action }),
  })
  if (!res.ok) throw new Error(`notify ${action}: ${res.status}`)
  return res.json()
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration() {
  return navigator.serviceWorker.ready
}

/** Este aparelho está inscrito? */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await registration()
  return reg.pushManager.getSubscription()
}

/** Pede permissão (se preciso), inscreve o aparelho e salva no banco. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return pushState()
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return perm as PushState

  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    const { publicKey } = await callFn('vapid')
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) })
  }
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint!, p256dh: j.keys!.p256dh, auth: j.keys!.auth, user_agent: navigator.userAgent.slice(0, 300) },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
  // guarda o fuso horário do aparelho para os horários das notificações
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { data: u } = await supabase.auth.getUser()
  if (u.user) await supabase.from('user_settings').upsert({ user_id: u.user.id, timezone }, { onConflict: 'user_id' })
  return 'granted'
}

/** Desinscreve este aparelho. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

export async function sendTest(): Promise<number> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('sem sessão')
  const r = await callFn('test', token)
  return r.sent ?? 0
}
