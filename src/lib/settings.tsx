import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { DICTS, LOCALE, type Dict } from './i18n'
import type { Lang, Theme } from './types'

interface SettingsCtx {
  theme: Theme
  lang: Lang
  t: Dict
  locale: string
  setTheme: (t: Theme) => void
  setLang: (l: Lang) => void
}

const Ctx = createContext<SettingsCtx | null>(null)
const CACHE_KEY = 'alania.settings'

function readCache(): { theme: Theme; lang: Lang } {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return { theme: 'system', lang: 'pt', ...JSON.parse(raw) }
  } catch {
    /* sem storage: usa padrão */
  }
  return { theme: 'system', lang: navigator.language.startsWith('pt') ? 'pt' : 'en' }
}

function writeCache(v: { theme: Theme; lang: Lang }) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(v))
  } catch {
    /* ignora */
  }
}

export function SettingsProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [state, setState] = useState(readCache)

  // aplica tema no <html>
  useEffect(() => {
    const root = document.documentElement
    if (state.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', state.theme)
    root.lang = LOCALE[state.lang]
    const dark = state.theme === 'dark' || (state.theme === 'system' && !matchMedia('(prefers-color-scheme: light)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#141413' : '#faf9f5')
    writeCache(state)
  }, [state])

  // carrega do banco ao entrar (sincroniza entre aparelhos)
  useEffect(() => {
    if (!userId) return
    supabase
      .from('user_settings')
      .select('theme, language')
      .maybeSingle()
      .then(({ data }) => {
        if (data) setState({ theme: data.theme as Theme, lang: data.language as Lang })
      })
  }, [userId])

  const persist = useCallback(
    (next: { theme: Theme; lang: Lang }) => {
      setState(next)
      if (userId) {
        supabase
          .from('user_settings')
          .upsert({ user_id: userId, theme: next.theme, language: next.lang, updated_at: new Date().toISOString() })
          .then()
      }
    },
    [userId],
  )

  const value: SettingsCtx = {
    theme: state.theme,
    lang: state.lang,
    t: DICTS[state.lang],
    locale: LOCALE[state.lang],
    setTheme: (theme) => persist({ ...state, theme }),
    setLang: (lang) => persist({ ...state, lang }),
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSettings(): SettingsCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSettings fora do SettingsProvider')
  return v
}
