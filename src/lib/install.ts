import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

// Captura cedo: o Chrome dispara o evento logo ao carregar.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  listeners.forEach((l) => l())
})
window.addEventListener('appinstalled', () => {
  deferred = null
  listeners.forEach((l) => l())
})

export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function useInstallPrompt() {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return {
    canPrompt: !!deferred,
    installed: isStandalone(),
    install: async () => {
      if (!deferred) return
      await deferred.prompt()
      await deferred.userChoice
      deferred = null
      force((n) => n + 1)
    },
  }
}
