// Alania Task — sincronização com o Google Tasks (lista padrão "Minhas tarefas").
// Regras (combinadas com o usuário):
//   - Tarefas do Hoje (abertas, com data até hoje) são criadas no Google: título (com "HH:MM · " se tiver horário),
//     descrição nas notas e a data.
//   - Concluir no app → conclui no Google. Concluir no Google → conclui no app (só tarefas criadas pelo app).
//     Desmarcar no Google reabre no app; reabrir no app desmarca no Google.
//   - Sair do Hoje no app (sem data, outra data, excluída) → apaga do Google.
//   - Tarefas criadas direto no Google são ignoradas.
// Ações (POST JSON { action }), com a chave anon no Authorization:
//   status | auth-url | exchange | sync | disconnect  → exigem x-user-token (sessão do usuário)
//   tick                                              → pg_cron, a cada 5 min, sincroniza todos
// Segredos (Edge Function secrets): GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2'

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (legacy) return legacy
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? ''
  } catch {
    return ''
  }
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } })
const CLIENT_ID = (Deno.env.get('GOOGLE_CLIENT_ID') ?? '').trim()
const CLIENT_SECRET = (Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '').trim()
const REDIRECT_URI = 'https://alanovictor.github.io/AlaniaTask/google.html'
const SCOPE = 'https://www.googleapis.com/auth/tasks'
const API = 'https://tasks.googleapis.com/tasks/v1'
const CLOSED = ['done', 'validated']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------- utilidades ----------
function localToday(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  }
}

interface AppTask {
  id: string
  user_id: string
  title: string
  description: string | null
  status: string
  date: string | null
  time: string | null
}

interface MapRow {
  task_id: string
  user_id: string
  google_id: string | null
  day: string
  synced_status: 'open' | 'done'
  synced_hash: string
}

function payload(t: AppTask) {
  const title = (t.time ? `${t.time.slice(0, 5)} · ` : '') + t.title
  return { title, notes: t.description ?? '', due: t.date ? `${t.date}T00:00:00.000Z` : undefined }
}
const hashOf = (p: ReturnType<typeof payload>) => JSON.stringify([p.title, p.notes, p.due ?? ''])

class GoogleRevoked extends Error {}

async function accessToken(refresh: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: refresh, grant_type: 'refresh_token' }),
  })
  const body = await res.json()
  if (!res.ok) {
    if (body.error === 'invalid_grant') throw new GoogleRevoked('revoked')
    throw new Error(`token ${res.status}: ${body.error ?? ''}`)
  }
  return body.access_token as string
}

async function gapi(token: string, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok && res.status !== 404 && res.status !== 410) throw new Error(`google ${method} ${res.status}: ${data?.error?.message ?? ''}`)
  return { status: res.status, data }
}

// ---------- sincronização de um usuário ----------
async function syncUser(userId: string): Promise<{ created: number; completedHere: number; completedThere: number; removed: number }> {
  // trava simples para o "Sincronizar agora" e o agendamento não rodarem juntos
  const lockUntil = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: locked } = await db
    .from('google_links')
    .update({ sync_lock: new Date().toISOString() })
    .eq('user_id', userId)
    .or(`sync_lock.is.null,sync_lock.lt."${lockUntil}"`)
    .select('refresh_token, list_id')
  const link = locked?.[0]
  if (!link) return { created: 0, completedHere: 0, completedThere: 0, removed: 0 }

  const stats = { created: 0, completedHere: 0, completedThere: 0, removed: 0 }
  try {
    const token = await accessToken(link.refresh_token)
    const list = encodeURIComponent(link.list_id)
    const { data: st } = await db.from('user_settings').select('timezone').eq('user_id', userId).maybeSingle()
    const today = localToday(st?.timezone ?? 'America/Sao_Paulo')

    const { data: maps } = await db.from('gtask_map').select('*').eq('user_id', userId)
    const mapRows = (maps ?? []) as MapRow[]
    const mapped = new Map(mapRows.map((m) => [m.task_id, m]))

    const cols = 'id, user_id, title, description, status, date, time'
    const { data: doing } = await db.from('tasks').select(cols).eq('user_id', userId).not('status', 'in', '(done,validated)').lte('date', today)
    const ids = mapRows.map((m) => m.task_id)
    const { data: mappedTasks } = ids.length ? await db.from('tasks').select(cols).in('id', ids) : { data: [] }
    const byId = new Map<string, AppTask>()
    for (const t of [...(doing ?? []), ...(mappedTasks ?? [])] as AppTask[]) byId.set(t.id, t)

    const dropMap = (taskId: string) => db.from('gtask_map').delete().eq('task_id', taskId)
    const saveMap = (row: Partial<MapRow> & { task_id: string }) => db.from('gtask_map').update({ ...row, synced_at: new Date().toISOString() }).eq('task_id', row.task_id)

    // 1) tarefas já vinculadas
    for (const m of mapRows) {
      const t = byId.get(m.task_id)

      // apagada no Google pelo usuário: não recria no mesmo dia
      if (!m.google_id) {
        if (m.day !== today || !t) await dropMap(m.task_id)
        continue
      }

      // excluída no app → apaga no Google
      if (!t) {
        await gapi(token, 'DELETE', `/lists/${list}/tasks/${m.google_id}`)
        await dropMap(m.task_id)
        stats.removed++
        continue
      }

      const g = await gapi(token, 'GET', `/lists/${list}/tasks/${m.google_id}`)
      if (g.status === 404 || g.status === 410 || g.data?.deleted) {
        await saveMap({ task_id: m.task_id, google_id: null, day: today })
        continue
      }

      let appDone = CLOSED.includes(t.status)
      const googleDone = g.data.status === 'completed'

      // puxa do Google: o que mudou lá desde a última sincronização
      if (googleDone && m.synced_status === 'open') {
        if (!appDone) {
          await db.from('tasks').update({ status: 'done' }).eq('id', t.id)
          stats.completedHere++
        }
        appDone = true
        m.synced_status = 'done'
        await saveMap({ task_id: m.task_id, synced_status: 'done' })
      } else if (!googleDone && m.synced_status === 'done') {
        if (appDone) {
          await db.from('tasks').update({ status: 'todo' }).eq('id', t.id)
          t.status = 'todo'
        }
        appDone = false
        m.synced_status = 'open'
        await saveMap({ task_id: m.task_id, synced_status: 'open' })
      }

      const inDoing = !appDone && !!t.date && t.date <= today

      // saiu do Hoje no app → apaga do Google
      if (!appDone && !inDoing) {
        await gapi(token, 'DELETE', `/lists/${list}/tasks/${m.google_id}`)
        await dropMap(m.task_id)
        stats.removed++
        continue
      }

      // envia para o Google: conclusão/reabertura e mudanças de título, notas e data
      const p = payload(t)
      const h = hashOf(p)
      const wantDone = appDone
      const patch: Record<string, unknown> = {}
      if (wantDone && !googleDone) Object.assign(patch, { status: 'completed' })
      if (!wantDone && googleDone) Object.assign(patch, { status: 'needsAction', completed: null })
      if (h !== m.synced_hash) Object.assign(patch, { title: p.title, notes: p.notes, ...(p.due ? { due: p.due } : {}) })
      if (Object.keys(patch).length) {
        await gapi(token, 'PATCH', `/lists/${list}/tasks/${m.google_id}`, patch)
        if (wantDone && !googleDone) stats.completedThere++
      }
      const nextStatus = wantDone ? 'done' : 'open'
      if (Object.keys(patch).length || nextStatus !== m.synced_status) await saveMap({ task_id: m.task_id, synced_status: nextStatus, synced_hash: h })

      // concluídas de dias anteriores deixam de ser acompanhadas (ficam concluídas no Google)
      if (wantDone && m.day < today) await dropMap(m.task_id)
    }

    // 2) tarefas do Hoje ainda não enviadas
    for (const t of (doing ?? []) as AppTask[]) {
      if (mapped.has(t.id)) continue
      const p = payload(t)
      const { data: g } = await gapi(token, 'POST', `/lists/${list}/tasks`, p)
      await db.from('gtask_map').upsert({ task_id: t.id, user_id: userId, google_id: g.id, day: today, synced_status: 'open', synced_hash: hashOf(p) })
      stats.created++
    }

    await db.from('google_links').update({ last_sync_at: new Date().toISOString(), last_error: null, sync_lock: null }).eq('user_id', userId)
    return stats
  } catch (e) {
    const msg = e instanceof GoogleRevoked ? 'revoked' : String(e instanceof Error ? e.message : e).slice(0, 300)
    await db.from('google_links').update({ last_error: msg, sync_lock: null }).eq('user_id', userId)
    throw e
  }
}

async function userFrom(req: Request): Promise<string | null> {
  const token = req.headers.get('x-user-token') ?? ''
  if (!token) return null
  const { data, error } = await db.auth.getUser(token)
  return error || !data.user ? null : data.user.id
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    /* vazio */
  }
  const action = body.action ?? ''
  const configured = !!CLIENT_ID && !!CLIENT_SECRET

  try {
    if (action === 'tick') {
      if (!configured) return json({ skipped: 'not configured' })
      // acesso revogado no Google: para de tentar até o usuário reconectar
      const { data: links } = await db.from('google_links').select('user_id').or('last_error.is.null,last_error.neq.revoked')
      const users = (links ?? []).map((x) => x.user_id as string)
      let ok = 0
      for (const u of users) {
        try {
          await syncUser(u)
          ok++
        } catch {
          /* erro fica em last_error */
        }
      }
      // limpa "states" antigos do login
      await db.from('google_oauth_states').delete().lt('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
      return json({ users: users.length, ok })
    }

    const userId = await userFrom(req)
    if (!userId) return json({ error: 'unauthorized' }, 401)

    if (action === 'status') {
      const { data } = await db.from('google_links').select('connected_at, last_sync_at, last_error').eq('user_id', userId).maybeSingle()
      return json({ configured, connected: !!data, ...(data ?? {}) })
    }

    if (!configured) return json({ error: 'not configured' }, 400)

    if (action === 'auth-url') {
      const state = crypto.randomUUID()
      await db.from('google_oauth_states').insert({ state, user_id: userId })
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      url.search = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPE,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      }).toString()
      return json({ url: url.toString() })
    }

    if (action === 'exchange') {
      const { data: st } = await db.from('google_oauth_states').select('user_id, created_at').eq('state', body.state ?? '').maybeSingle()
      await db.from('google_oauth_states').delete().eq('state', body.state ?? '')
      if (!st || st.user_id !== userId || Date.now() - Date.parse(st.created_at) > 15 * 60_000) {
        console.error('exchange: state inválido', { found: !!st, sameUser: st?.user_id === userId })
        return json({ error: 'state' }, 400)
      }
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: body.code ?? '', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
      })
      const tok = await res.json()
      if (!res.ok || !tok.refresh_token) {
        // só o código de erro do Google (nunca tokens)
        console.error('exchange: google recusou', res.status, tok.error ?? 'no refresh token', tok.error_description ?? '')
        return json({ error: 'exchange', detail: tok.error ?? 'no refresh token' }, 400)
      }
      // reconectar começa do zero (as tarefas antigas no Google não são mais acompanhadas)
      await db.from('gtask_map').delete().eq('user_id', userId)
      await db.from('google_links').upsert({ user_id: userId, refresh_token: tok.refresh_token, list_id: '@default', connected_at: new Date().toISOString(), last_error: null, last_sync_at: null, sync_lock: null })
      const stats = await syncUser(userId).catch(() => null)
      return json({ connected: true, stats })
    }

    if (action === 'sync') {
      const stats = await syncUser(userId)
      return json({ ok: true, stats })
    }

    if (action === 'disconnect') {
      const { data: link } = await db.from('google_links').select('refresh_token').eq('user_id', userId).maybeSingle()
      if (link) await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(link.refresh_token)}`, { method: 'POST' }).catch(() => {})
      await db.from('gtask_map').delete().eq('user_id', userId)
      await db.from('google_links').delete().eq('user_id', userId)
      return json({ connected: false })
    }

    return json({ error: 'action' }, 400)
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
