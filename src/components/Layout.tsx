import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Sun, ListTodo, CalendarRange, ShieldCheck, Repeat, Settings, LogOut, PanelLeftClose, PanelLeftOpen, Menu, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings'
import { useData } from '../lib/data'
import { isInDoing } from '../lib/dates'
import { useEditor } from './TaskEditor'

const COLLAPSE_KEY = 'alania.sidebarCollapsed'

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--accent)" />
      <path d="M18 33l9 9 19-20" fill="none" stroke="var(--on-accent)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useSettings()
  const { tasks } = useData()
  const { openNew } = useEditor()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [drawer, setDrawer] = useState(false)

  useEffect(() => setDrawer(false), [location.pathname])
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* ignora */
    }
  }, [collapsed])

  // atalho: N abre nova tarefa (fora de campos de texto)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        e.preventDefault()
        openNew()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openNew])

  const doingCount = tasks.filter((x) => isInDoing(x)).length

  const items = [
    { to: '/', label: t.nav_doing, icon: Sun, badge: doingCount },
    { to: '/tasks', label: t.nav_tasks, icon: ListTodo },
    { to: '/planning', label: t.nav_planning, icon: CalendarRange },
    { to: '/validation', label: t.nav_validation, icon: ShieldCheck },
    { to: '/recurring', label: t.nav_recurring, icon: Repeat },
  ]

  const nav = (isCollapsed: boolean) => (
    <nav className="flex flex-1 flex-col gap-1">
      {items.map(({ to, label, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          title={isCollapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
            } ${isCollapsed ? 'justify-center px-0' : ''}`
          }
        >
          <Icon size={20} className="shrink-0" />
          {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
          {!isCollapsed && !!badge && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">{badge}</span>}
        </NavLink>
      ))}
      <div className="flex-1" />
      <NavLink
        to="/settings"
        title={isCollapsed ? t.nav_settings : undefined}
        className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
            isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
          } ${isCollapsed ? 'justify-center px-0' : ''}`
        }
      >
        <Settings size={20} className="shrink-0" />
        {!isCollapsed && <span>{t.nav_settings}</span>}
      </NavLink>
      <button
        onClick={() => supabase.auth.signOut()}
        title={isCollapsed ? t.logout : undefined}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg ${isCollapsed ? 'justify-center px-0' : ''}`}
      >
        <LogOut size={20} className="shrink-0" />
        {!isCollapsed && <span>{t.logout}</span>}
      </button>
    </nav>
  )

  return (
    <div className="flex min-h-full">
      {/* Sidebar desktop */}
      <aside className={`sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface p-3 transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px]' : 'w-64'}`}>
        <div className={`mb-6 flex items-center gap-2.5 px-1.5 pt-1 ${collapsed ? 'justify-center px-0' : ''}`}>
          <Logo />
          {!collapsed && <span className="text-lg font-bold tracking-tight">{t.appName}</span>}
        </div>
        <button onClick={() => openNew()} className={`btn btn-primary mb-4 ${collapsed ? 'px-0' : ''}`} title={t.new_task}>
          <Plus size={18} />
          {!collapsed && t.new_task}
        </button>
        {nav(collapsed)}
        <button onClick={() => setCollapsed(!collapsed)} className="btn btn-ghost mt-2 px-0" aria-label={collapsed ? t.expand : t.collapse} title={collapsed ? t.expand : t.collapse}>
          {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </button>
      </aside>

      {/* Gaveta mobile */}
      {drawer && (
        <div className="fixed inset-0 z-40 bg-black/55 lg:hidden" onClick={() => setDrawer(false)}>
          <aside className="flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-surface p-3 pt-[max(0.75rem,env(safe-area-inset-top))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between px-1.5 pt-1">
              <div className="flex items-center gap-2.5">
                <Logo />
                <span className="text-lg font-bold tracking-tight">{t.appName}</span>
              </div>
              <button className="btn btn-ghost p-2" onClick={() => setDrawer(false)} aria-label="Fechar">
                <X size={20} />
              </button>
            </div>
            {nav(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo mobile */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/85 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <button className="btn btn-ghost p-2" onClick={() => setDrawer(true)} aria-label={t.menu}>
            <Menu size={22} />
          </button>
          <Logo size={26} />
          <span className="font-bold tracking-tight">{t.appName}</span>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">{children}</main>
      </div>

      {/* Botão flutuante mobile */}
      <button
        onClick={() => openNew()}
        className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-xl shadow-black/30 transition-transform active:scale-95 lg:hidden"
        aria-label={t.new_task}
      >
        <Plus size={26} />
      </button>
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {actions}
    </div>
  )
}
