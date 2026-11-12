import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Sun, ListTodo, FolderKanban, CalendarRange, ShieldCheck, Repeat, Settings, LogOut, PanelLeftClose, PanelLeftOpen, Menu, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSettings } from '../lib/settings'
import { useData } from '../lib/data'
import { isInDoing, isOpen } from '../lib/dates'
import { useEditor } from './TaskEditor'
import { NewAreaModal } from './AreaModal'

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
  const { tasks, areas } = useData()
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
  const [newArea, setNewArea] = useState(false)
  const activeArea = new URLSearchParams(location.search).get('area')

  useEffect(() => setDrawer(false), [location.pathname, location.search])

  // Gesto no celular: arrastar da borda esquerda abre o menu; arrastar para a esquerda fecha.
  const asideRef = useRef<HTMLElement>(null)
  const [dragX, setDragX] = useState<number | null>(null)
  const drawerRef = useRef(drawer)
  drawerRef.current = drawer
  const drawerWidth = () => asideRef.current?.offsetWidth || Math.min(288, window.innerWidth * 0.85)

  useEffect(() => {
    const EDGE = 28
    let g: { mode: 'open' | 'close'; x0: number; y0: number; locked: boolean; x: number; t0: number } | null = null

    const onStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024 || e.touches.length !== 1) return
      const { clientX: x, clientY: y } = e.touches[0]
      if (drawerRef.current) g = { mode: 'close', x0: x, y0: y, locked: false, x: 0, t0: Date.now() }
      else if (x <= EDGE) g = { mode: 'open', x0: x, y0: y, locked: false, x: -drawerWidth(), t0: Date.now() }
    }
    const onMove = (e: TouchEvent) => {
      if (!g) return
      const { clientX: x, clientY: y } = e.touches[0]
      const dx = x - g.x0
      const dy = y - g.y0
      if (!g.locked) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          g = null // rolagem vertical: ignora
          return
        }
        if (Math.abs(dx) < 8) return
        g.locked = true
      }
      const w = drawerWidth()
      g.x = Math.max(-w, Math.min(0, g.mode === 'open' ? -w + dx : dx))
      setDragX(g.x)
    }
    const onEnd = () => {
      if (!g) return
      if (g.locked) {
        const w = drawerWidth()
        const fast = Date.now() - g.t0 < 250
        if (g.mode === 'open') setDrawer(g.x > -w * 0.6 || (fast && g.x > -w * 0.9))
        else setDrawer(!(g.x < -w * 0.3 || (fast && g.x < -w * 0.1)))
      }
      g = null
      setDragX(null)
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])
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
  const validationCount = tasks.filter((x) => x.validation_of && isOpen(x) && !x.date).length

  const items = [
    { to: '/', label: t.nav_doing, icon: Sun, badge: doingCount },
    { to: '/tasks', label: t.nav_tasks, icon: ListTodo },
    { to: '/projects', label: t.nav_projects, icon: FolderKanban },
    { to: '/planning', label: t.nav_planning, icon: CalendarRange },
    { to: '/validation', label: t.nav_validation, icon: ShieldCheck, badge: validationCount },
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
              isActive && !(to === '/tasks' && activeArea) ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-fg'
            } ${isCollapsed ? 'justify-center px-0' : ''}`
          }
        >
          <Icon size={20} className="shrink-0" />
          {!isCollapsed && <span className="flex-1 truncate">{label}</span>}
          {!isCollapsed && !!badge && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent">{badge}</span>}
        </NavLink>
      ))}

      {!isCollapsed && (
        <div className="mt-5 flex min-h-0 flex-col">
          <div className="mb-1 flex items-center justify-between px-3">
            <span className="text-[11px] font-semibold tracking-wider text-muted uppercase">{t.areas}</span>
            <button onClick={() => setNewArea(true)} className="-mr-1.5 rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-fg" title={t.new_area} aria-label={t.new_area}>
              <Plus size={16} />
            </button>
          </div>
          <div className="scrollbar-thin -mx-1 overflow-y-auto px-1">
            {areas.length === 0 ? (
              <button onClick={() => setNewArea(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg">
                <Plus size={16} />
                {t.new_area}
              </button>
            ) : (
              areas.map((a) => {
                const active = location.pathname === '/tasks' && activeArea === a.id
                const count = tasks.filter((x) => x.area_id === a.id && isOpen(x)).length
                return (
                  <Link
                    key={a.id}
                    to={`/tasks?area=${a.id}`}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${active ? 'bg-accent-soft text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg'}`}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: a.color }} />
                    <span className="flex-1 truncate">{a.name}</span>
                    {count > 0 && <span className="text-xs text-muted">{count}</span>}
                  </Link>
                )
              })
            )}
          </div>
        </div>
      )}

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
      {(() => {
        // posição da gaveta: 0 = aberta, -largura = fechada; durante o gesto segue o dedo
        const w = drawerWidth()
        const x = dragX ?? (drawer ? 0 : -w)
        const progress = 1 + x / w
        const visible = drawer || dragX !== null
        return (
          <div
            className={`fixed inset-0 z-40 lg:hidden ${visible ? '' : 'pointer-events-none'}`}
            style={{ background: `rgba(0,0,0,${0.55 * progress})`, transition: dragX === null ? 'background 0.22s ease' : 'none' }}
            onClick={() => setDrawer(false)}
            aria-hidden={!visible}
          >
          <aside
            ref={asideRef}
            className="flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-surface p-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-2xl"
            style={{ transform: `translateX(${x}px)`, transition: dragX === null ? 'transform 0.22s ease' : 'none', visibility: visible || progress > 0 ? 'visible' : 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
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
        )
      })()}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo mobile */}
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-bg/85 px-3 py-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
          <button className="btn btn-ghost p-2" onClick={() => setDrawer(true)} aria-label={t.menu}>
            <Menu size={22} />
          </button>
          <Logo size={26} />
          <span className="font-bold tracking-tight">{t.appName}</span>
        </header>

        <main className={`mx-auto w-full ${location.pathname === '/planning' ? 'max-w-[1600px]' : 'max-w-6xl'} flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12`}>{children}</main>
      </div>

      {/* Botão flutuante mobile */}
      <button
        onClick={() => openNew()}
        className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-xl shadow-black/30 transition-transform active:scale-95 lg:hidden"
        aria-label={t.new_task}
      >
        <Plus size={26} />
      </button>

      {newArea && <NewAreaModal onClose={() => setNewArea(false)} />}
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
