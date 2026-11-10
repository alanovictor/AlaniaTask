import { createClient, type SupportedStorage } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  throw new Error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env')
}

const REMEMBER_KEY = 'alania.remember'

function safe(get: () => Storage): Storage | null {
  try {
    return get()
  } catch {
    return null
  }
}

/** "Manter conectado": true (padrão) guarda a sessão no navegador; false só até fechar a aba. */
export function getRemember(): boolean {
  return safe(() => localStorage)?.getItem(REMEMBER_KEY) !== '0'
}

export function setRemember(v: boolean) {
  safe(() => localStorage)?.setItem(REMEMBER_KEY, v ? '1' : '0')
}

// Lê das duas e grava só na escolhida, para a sessão sobreviver (ou não) ao fechar o navegador.
const authStorage: SupportedStorage = {
  getItem: (k) => safe(() => localStorage)?.getItem(k) ?? safe(() => sessionStorage)?.getItem(k) ?? null,
  setItem: (k, v) => {
    const remember = getRemember()
    const target = safe(() => (remember ? localStorage : sessionStorage))
    const other = safe(() => (remember ? sessionStorage : localStorage))
    target?.setItem(k, v)
    other?.removeItem(k)
  },
  removeItem: (k) => {
    safe(() => localStorage)?.removeItem(k)
    safe(() => sessionStorage)?.removeItem(k)
  },
}

// PKCE: links de recuperação de senha voltam com ?code= na query,
// sem conflitar com o HashRouter (que usa o #).
export const supabase = createClient(url, key, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: authStorage },
})
