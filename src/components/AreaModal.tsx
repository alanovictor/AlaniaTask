import { useState } from 'react'
import { useData } from '../lib/data'
import { useSettings } from '../lib/settings'
import { AREA_COLORS } from '../lib/types'
import { ColorPicker, Field, Modal } from './ui'

export function NewAreaModal({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { t } = useSettings()
  const { areas, addArea } = useData()
  const [name, setName] = useState('')
  const [color, setColor] = useState(AREA_COLORS[areas.length % AREA_COLORS.length])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    setErr(false)
    try {
      await addArea(name, color)
      onCreated?.()
      onClose()
    } catch {
      setErr(true)
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t.new_area}
      footer={
        <>
          <div className="flex-1" />
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !name.trim()}>
            {t.add}
          </button>
        </>
      }
    >
      <form
        className="space-y-4 pb-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label={t.area}>
          <input autoFocus className="input" placeholder={t.area_name_ph} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <ColorPicker value={color} onChange={setColor} />
        {err && <p className="text-sm text-danger">{t.error_generic}</p>}
      </form>
    </Modal>
  )
}
