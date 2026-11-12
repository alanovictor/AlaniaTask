// Recebe as notificações push e abre o app ao tocar. Importado pelo service worker gerado (vite-plugin-pwa).
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Alania Task', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Alania Task'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: 'pwa-192x192.png',
      badge: 'pwa-64x64.png',
      tag: data.tag,
      renotify: !!data.tag,
      data: { url: data.url || self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of all) {
        if (c.url.startsWith(self.registration.scope)) {
          await c.focus()
          if ('navigate' in c) await c.navigate(url).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})
