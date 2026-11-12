// Alania Task — Edge Function "notify" (Deno).
// Publicada com Verify JWT LIGADO: chamar com Authorization: Bearer <chave anon legada (pública)>.
// Ações (POST JSON { action }):
//   vapid -> { publicKey }   chave pública para o navegador se inscrever
//   test  -> envia uma notificação de teste aos aparelhos do usuário logado (exige x-user-token: <JWT da sessão>)
//   tick  -> chamado a cada 5 min pelo pg_cron: resumo da manhã, lembretes e atrasadas
// As chaves VAPID são geradas na primeira execução e guardadas em public.app_secrets (só acessível por aqui).
import { createClient } from 'npm:@supabase/supabase-js@2'
import * as webpush from 'jsr:@negrel/webpush@0.5.0'

// chave de serviço: formato antigo (SUPABASE_SERVICE_ROLE_KEY) ou novo (SUPABASE_SECRET_KEYS, JSON)
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

const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
  auth: { persistSession: false },
})

const APP_URL = 'https://alanovictor.github.io/AlaniaTask/'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ---------- chaves VAPID ----------
let appServerPromise: Promise<{ server: webpush.ApplicationServer; publicKey: string }> | null = null

async function loadKeys(): Promise<webpush.ExportedVapidKeys> {
  const { data } = await db.from('app_secrets').select('value').eq('name', 'vapid').maybeSingle()
  if (data) return data.value as webpush.ExportedVapidKeys
  const generated = await webpush.exportVapidKeys(await webpush.generateVapidKeys({ extractable: true }))
  // se outra execução criou ao mesmo tempo, fica a que chegou primeiro
  await db.from('app_secrets').upsert({ name: 'vapid', value: generated }, { onConflict: 'name', ignoreDuplicates: true })
  const { data: again } = await db.from('app_secrets').select('value').eq('name', 'vapid').single()
  return again!.value as webpush.ExportedVapidKeys
}

function appServer() {
  appServerPromise ??= (async () => {
    const vapidKeys = await webpush.importVapidKeys(await loadKeys(), { extractable: true })
    const server = await webpush.ApplicationServer.new({ contactInformation: APP_URL, vapidKeys })
    const publicKey = await webpush.exportApplicationServerKey(vapidKeys)
    return { server, publicKey }
  })()
  return appServerPromise
}

// ---------- envio ----------
interface Payload {
  title: string
  body: string
  url?: string
  tag?: string
}

async function sendToUser(userId: string, payload: Payload): Promise<number> {
  const { server } = await appServer()
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
  let sent = 0
  for (const s of subs ?? []) {
    try {
      await server
        .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(JSON.stringify({ url: APP_URL, ...payload }), { ttl: 3600 } as webpush.PushMessageOptions)
      sent++
    } catch (e) {
      // inscrição expirada/removida: apaga
      const status = (e as { response?: Response })?.response?.status
      if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      else console.error('push falhou', status, String(e))
    }
  }
  return sent
}

/** Marca como enviado; devolve false se já tinha sido enviado. */
async function claim(userId: string, kind: string, ref: string): Promise<boolean> {
  const { error } = await db.from('notification_log').insert({ user_id: userId, kind, ref })
  return !error
}

// ---------- textos ----------
const T = {
  pt: {
    morningTitle: (n: number) => (n === 1 ? 'Bom dia! 1 tarefa para hoje' : `Bom dia! ${n} tarefas para hoje`),
    morningEmpty: 'Bom dia! Nada planejado para hoje ainda.',
    overdueSuffix: (n: number) => (n === 1 ? ' · 1 atrasada' : ` · ${n} atrasadas`),
    reminder: (time: string) => `⏰ ${time}`,
    overdueTitle: (n: number) => (n === 1 ? '1 tarefa atrasada' : `${n} tarefas atrasadas`),
    overdueBody: 'Conclua ou remarque no Planejamento.',
    testTitle: 'Alania Task',
    testBody: 'Notificações ativadas neste aparelho ✅',
  },
  en: {
    morningTitle: (n: number) => (n === 1 ? 'Good morning! 1 task for today' : `Good morning! ${n} tasks for today`),
    morningEmpty: 'Good morning! Nothing planned for today yet.',
    overdueSuffix: (n: number) => (n === 1 ? ' · 1 overdue' : ` · ${n} overdue`),
    reminder: (time: string) => `⏰ ${time}`,
    overdueTitle: (n: number) => (n === 1 ? '1 overdue task' : `${n} overdue tasks`),
    overdueBody: 'Finish or reschedule them in Planning.',
    testTitle: 'Alania Task',
    testBody: 'Notifications are on for this device ✅',
  },
}

// ---------- hora local ----------
function localNow(tz: string): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

// ---------- rotina a cada 5 min ----------
async function tick() {
  const { data: subs } = await db.from('push_subscriptions').select('user_id')
  const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))]
  let total = 0

  for (const userId of userIds) {
    const { data: st } = await db.from('user_settings').select('*').eq('user_id', userId).maybeSingle()
    const s = {
      language: 'pt',
      timezone: 'America/Sao_Paulo',
      notify_morning: true,
      morning_time: '08:00',
      notify_reminders: true,
      reminder_minutes: 15,
      notify_overdue: true,
      overdue_time: '18:00',
      ...(st ?? {}),
    }
    const t = s.language === 'en' ? T.en : T.pt
    let now: { date: string; time: string }
    try {
      now = localNow(s.timezone)
    } catch {
      now = localNow('America/Sao_Paulo')
    }
    const nowMin = toMin(now.time)

    const { data: open } = await db
      .from('tasks')
      .select('id, title, priority, date, time')
      .eq('user_id', userId)
      .not('status', 'in', '(done,validated)')
      .not('date', 'is', null)
      .lte('date', now.date)
    const tasks = open ?? []
    const overdue = tasks.filter((x) => x.date < now.date)
    const todays = tasks.filter((x) => x.date === now.date)

    // resumo da manhã (janela de 3 h após o horário escolhido)
    const mMin = toMin(String(s.morning_time))
    if (s.notify_morning && nowMin >= mMin && nowMin < mMin + 180 && (await claim(userId, 'morning', now.date))) {
      const all = [...tasks].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || String(a.time ?? '99').localeCompare(String(b.time ?? '99')))
      const body = all.length
        ? all
            .slice(0, 4)
            .map((x) => `• ${x.time ? String(x.time).slice(0, 5) + ' ' : ''}${x.title}`)
            .join('\n') + (all.length > 4 ? '\n…' : '')
        : t.morningEmpty
      const title = all.length ? t.morningTitle(all.length) + (overdue.length ? t.overdueSuffix(overdue.length) : '') : 'Alania Task'
      total += await sendToUser(userId, { title, body, tag: `morning-${now.date}`, url: APP_URL })
    }

    // lembretes antes do horário (até 30 min depois do horário, caso o agendamento atrase)
    if (s.notify_reminders) {
      for (const x of todays) {
        if (!x.time) continue
        const at = toMin(String(x.time))
        const remindAt = at - Number(s.reminder_minutes)
        if (nowMin >= remindAt && nowMin <= at + 30 && (await claim(userId, 'reminder', `${x.id}:${now.date}`))) {
          total += await sendToUser(userId, { title: t.reminder(String(x.time).slice(0, 5)), body: x.title, tag: `task-${x.id}`, url: APP_URL })
        }
      }
    }

    // aviso de atrasadas (janela de 3 h após o horário escolhido)
    const oMin = toMin(String(s.overdue_time))
    if (s.notify_overdue && overdue.length && nowMin >= oMin && nowMin < oMin + 180 && (await claim(userId, 'overdue', now.date))) {
      const body = overdue
        .slice(0, 4)
        .map((x) => `• ${x.title}`)
        .join('\n') + (overdue.length > 4 ? '\n…' : '') + `\n${t.overdueBody}`
      total += await sendToUser(userId, { title: t.overdueTitle(overdue.length), body, tag: `overdue-${now.date}`, url: APP_URL + '#/planning' })
    }
  }
  return total
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { action } = await req.json().catch(() => ({ action: 'vapid' }))

    if (action === 'vapid') return json({ publicKey: (await appServer()).publicKey })

    if (action === 'test') {
      // o gateway exige a chave anon no Authorization; o login do usuário vem em x-user-token
      const token = req.headers.get('x-user-token') ?? ''
      const { data, error } = await db.auth.getUser(token)
      if (error || !data.user) return json({ error: 'unauthorized' }, 401)
      const { data: st } = await db.from('user_settings').select('language').eq('user_id', data.user.id).maybeSingle()
      const t = st?.language === 'en' ? T.en : T.pt
      const sent = await sendToUser(data.user.id, { title: t.testTitle, body: t.testBody, tag: 'test' })
      return json({ sent })
    }

    if (action === 'tick') return json({ sent: await tick() })

    return json({ error: 'unknown action' }, 400)
  } catch (e) {
    console.error(e)
    return json({ error: String(e) }, 500)
  }
})
