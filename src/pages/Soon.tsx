import type { ReactNode } from 'react'
import { useSettings } from '../lib/settings'
import { PageHeader } from '../components/Layout'
import { EmptyState } from '../components/ui'

export function Soon({ title, icon }: { title: string; icon: ReactNode }) {
  const { t } = useSettings()
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={icon} title={t.soon_title} text={t.soon_text} />
    </>
  )
}
