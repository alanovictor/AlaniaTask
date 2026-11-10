import { useState } from 'react'
import { Download, Plus, Trash2 } from 'lucide-react'
import { isIOS, useInstallPrompt } from '../lib/install'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { AREA_COLORS, type Area } from '../lib/types'
import { PageHeader } from '../components/Layout'
import { Segmented } from '../components/ui'

export function Settings({ email }: { email: string }) {
  const { t, theme, setTheme, lang, setLang } = useSettings()
  const { areas, tasks, addArea, deleteArea } = useData()
  const [name, setName] = useState('')
  const [color, setColor] = useState(AREA_COLORS[0])
  const [busy, setBusy] = useState(false)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      await addArea(name, color)
      setName('')
      setColor(AREA_COLORS[(areas.length + 1) % AREA_COLORS.length])
    } catch {
      alert(t.error_generic)
    }
    setBusy(false)
  }

  return (
    <>
      <PageHeader title={t.settings_title} />
      <div className="grid max-w-2xl gap-6">
        <Card title={t.areas} hint={t.areas_hint}>
          <ul className="mb-4 space-y-1.5">
            {areas.map((a) => (
              <AreaRow key={a.id} area={a} count={tasks.filter((x) => x.area_id === a.id).length} onDelete={() => confirm(t.confirm_delete_area) && deleteArea(a.id).catch(() => alert(t.error_generic))} />
            ))}
          </ul>
          <form onSubmit={add} className="space-y-3">
            <div className="flex gap-2">
              <input className="input" placeholder={t.area_name_ph} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
              <button className="btn btn-primary shrink-0" disabled={busy || !name.trim()}>
                <Plus size={18} />
                <span className="hidden sm:inline">{t.add}</span>
              </button>
            </div>
            <ColorPicker value={color} onChange={setColor} />
          </form>
        </Card>

        <Card title={t.appearance}>
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-sm font-medium">{t.theme}</div>
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: 'system', label: t.theme_system },
                  { value: 'dark', label: t.theme_dark },
                  { value: 'light', label: t.theme_light },
                ]}
              />
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium">{t.language}</div>
              <Segmented
                value={lang}
                onChange={setLang}
                options={[
                  { value: 'pt', label: 'Português' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </div>
          </div>
        </Card>

        <InstallCard />

        <Card title={t.account}>
          <p className="text-sm text-muted">{email}</p>
        </Card>
      </div>
    </>
  )
}

function InstallCard() {
  const { t } = useSettings()
  const { canPrompt, installed, install } = useInstallPrompt()
  return (
    <Card title={t.install_app} hint={installed ? t.install_done : t.install_hint}>
      {!installed && (
        <div className="space-y-3">
          {canPrompt && (
            <button className="btn btn-primary" onClick={install}>
              <Download size={18} />
              {t.install_app}
            </button>
          )}
          <p className="text-sm text-muted">{isIOS() ? t.install_ios : t.install_manual}</p>
        </div>
      )}
    </Card>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {AREA_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full transition-transform ${value === c ? 'scale-110 ring-2 ring-fg ring-offset-2 ring-offset-surface' : ''}`}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  )
}

function AreaRow({ area, count, onDelete }: { area: Area; count: number; onDelete: () => void }) {
  const { updateArea } = useData()
  const [name, setName] = useState(area.name)
  const [picking, setPicking] = useState(false)
  return (
    <li className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-3">
        <button className="h-4 w-4 shrink-0 rounded" style={{ background: area.color }} onClick={() => setPicking(!picking)} aria-label="Cor" />
        <input
          className="flex-1 bg-transparent text-sm font-medium outline-none"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== area.name && updateArea(area.id, { name: name.trim() }).catch(() => setName(area.name))}
        />
        <span className="text-xs text-muted">{count}</span>
        <button className="p-1 text-muted hover:text-danger" onClick={onDelete} aria-label="Excluir">
          <Trash2 size={16} />
        </button>
      </div>
      {picking && (
        <div className="mt-2.5">
          <ColorPicker
            value={area.color}
            onChange={(c) => {
              updateArea(area.id, { color: c }).catch(() => {})
              setPicking(false)
            }}
          />
        </div>
      )}
    </li>
  )
}
