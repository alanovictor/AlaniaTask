// Alania Task — backup criptografado e "ping" para o Supabase gratuito não pausar.
// Chamado pelos workflows do GitHub Actions (ping diário, backup semanal) com a chave anon pública.
// O backup sai criptografado: AES-256-GCM com chave aleatória, e essa chave é cifrada com a
// chave PÚBLICA RSA abaixo. Só quem tem a chave privada (guardada fora do repositório) consegue abrir.
// Por isso a resposta pode ser pública sem expor dados.
import { createClient } from 'npm:@supabase/supabase-js@2'

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAl13K2vDIM5DSrpwHsljP
rOickc8T2g+ynBZd5IXcXFjjyybIfpSc645PXA5BektpsabDIXJFT88nFEZuDlRO
S2aP1Mv5i3uHhwbSWYwn3K72m3CBYPgIDMXZv6HRUoKJpGF5C4sK9MA3loD/Ef90
L7fgieKkgn4Mm/apkYlde4+PLCiEllq0jejORxjgR6mJPOmfK++IQrysH4yrBHKE
N3DGGNcBofyWRR4RTyKU12nWLv/UYlWuuYD+kjDkRj0IZndlTR9PcYg5U73YPpDl
vxNTywaQECF0hNxDbUVBwqr+Ccr/INfIfqHEdkGNRsol7EdSLUtEMH3gkpHaIgFY
uBS/Q7rgJGIeyfw5RLBhQRIjg2LpuHVdn4bzAF3FHqLl1ww1+kAR0YZYl5dklqU9
mf5Pds10n0Z6HuLEBAkbSj8utacKMNSHOj6jpbj4E5G7JBazm06KLR82TJKejXZ+
6hgFuxU9yeliUTLUMugp1X6Wl8QaNFlpK6uVXzHFnAknQoNnrmuWXlHpJnj7+VQz
EbWqjfhidyUSRIDlxp//i7LuKXQXzTBsPJ9GZ/wVWm6uYcppp6AGePPPg1/JGqvl
mYnsqSdXpr4DWQNV2Hn/9GfNBBcMiS9O36epPRZYgqig7U3au0AMH3/a8a5o9ugo
fWamCvZn+Yb5fM/cofsj/hsCAwEAAQ==
-----END PUBLIC KEY-----`

const TABLES = ['user_settings', 'areas', 'tags', 'projects', 'tasks', 'subtasks', 'task_tags', 'task_deps', 'recurrences']

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

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

async function dumpTable(name: string): Promise<unknown[]> {
  const out: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(name).select('*').range(from, from + 999)
    if (error) throw new Error(`${name}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function encrypt(plain: Uint8Array) {
  const der = Uint8Array.from(atob(PUBLIC_KEY_PEM.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0))
  const rsa = await crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
  const aesRaw = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aes = await crypto.subtle.importKey('raw', aesRaw, 'AES-GCM', false, ['encrypt'])
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, plain)
  const key = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, aesRaw)
  return { key: b64(key), iv: b64(iv), data: b64(data) }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let action = ''
  try {
    action = ((await req.json()) as { action?: string }).action ?? ''
  } catch {
    /* corpo vazio */
  }

  if (action === 'ping') {
    // uma consulta real ao banco conta como atividade do projeto
    const { count, error } = await db.from('tasks').select('id', { count: 'exact', head: true })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true, tasks: count, at: new Date().toISOString() })
  }

  if (action === 'backup') {
    try {
      const tables: Record<string, unknown[]> = {}
      for (const t of TABLES) tables[t] = await dumpTable(t)
      const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]))
      const plain = await gzip(JSON.stringify({ app: 'alania-task', version: 1, created_at: new Date().toISOString(), tables }))
      return json({ format: 'alania-backup-v1', alg: 'RSA-OAEP-256+AES-256-GCM', gzip: true, created_at: new Date().toISOString(), counts, ...(await encrypt(plain)) })
    } catch (e) {
      return json({ error: String(e) }, 500)
    }
  }

  return json({ error: 'action' }, 400)
})
