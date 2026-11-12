import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { FolderKanban, Repeat } from 'lucide-react'
import { supabase } from './lib/supabase'
import { SettingsProvider, useSettings } from './lib/settings'
import { DataProvider, useData } from './lib/data'
import { EditorProvider } from './components/TaskEditor'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { Doing } from './pages/Doing'
import { Tasks } from './pages/Tasks'
import { Settings } from './pages/Settings'
import { Soon } from './pages/Soon'
import { Planning } from './pages/Planning'
import { Validation } from './pages/Validation'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // limpa ?code= da URL depois do retorno do link de senha
  useEffect(() => {
    if (session && window.location.search.includes('code=')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.hash)
    }
  }, [session])

  return (
    <SettingsProvider userId={session?.user.id ?? null}>
      {session === undefined ? (
        <Splash />
      ) : !session || recovery ? (
        <Login recovery={recovery} onRecovered={() => setRecovery(false)} />
      ) : (
        <DataProvider key={session.user.id}>
          <EditorProvider>
            <HashRouter>
              <Shell email={session.user.email ?? ''} />
            </HashRouter>
          </EditorProvider>
        </DataProvider>
      )}
    </SettingsProvider>
  )
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  )
}

function Shell({ email }: { email: string }) {
  const { t } = useSettings()
  const { loading, error, reload } = useData()

  if (loading) return <Splash />
  return (
    <Layout>
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm">
          <span>{t.error_generic}</span>
          <button className="btn btn-outline py-1.5 text-xs" onClick={reload}>
            ↻
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<Doing />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/projects" element={<Soon title={t.nav_projects} icon={<FolderKanban size={28} />} />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/recurring" element={<Soon title={t.nav_recurring} icon={<Repeat size={28} />} />} />
        <Route path="/settings" element={<Settings email={email} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
