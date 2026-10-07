/* knip: used by PWA runtime; frontend/src/utils/core/pwa-update.ts navigator.serviceWorker.register('/sw.js'), backend spa-fallback middleware serves /sw.js, shared embed fallback whitelist includes /sw.js — 静态 PWA SW 文件非 ESM import 所以 knip 漏识别 */
/* HomeOS Service Worker：离线壳缓存 + 非哈希静态资源 */
// 版本号变更即代表「旧缓存整体作废」：activate 会删掉非当前名的所有缓存。
// v5 -> v6 的原因：此前把 no-store 的 SPA 外壳也写进了 homeos-shell-v5，
// 旧的 `/setup?xxx` 导航副本会引用重建后已删除的旧 chunk，离线兜底命中即白屏。
const CACHE_SHELL = 'homeos-shell-v6'
const CACHE_STATIC = 'homeos-static-v5'
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/logo/logo.svg']
/** 由 SW 接管的静态资源前缀；`/assets/` 是内容哈希 + immutable，故意不在其中（见 fetch 处理器） */
const STATIC_PREFIXES = [
  '/icons/',
  '/backgrounds/',
  '/sounds/',
  '/logo/',
]

self.addEventListener('install', (event) => {
  // 不再自动 skipWaiting：版本更新由客户端用户确认后通过 SKIP_WAITING 消息激活，
  // 避免新 SW 静默接管导致「旧页面 + 新缓存」的版本错配
  event.waitUntil(caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL_URLS)))
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

/**
 * 清理历史版本在静态缓存里留下的 `/assets/*` 条目。
 * 本版本起 `/assets/` 不再由 SW 接管（见 fetch 处理器），这些条目既不会被读取
 * 也不会被覆盖，留着只会永久占用 CacheStorage，因此激活时顺手清掉一次。
 */
function pruneLegacyAssetEntries() {
  return caches
    .open(CACHE_STATIC)
    .then((cache) =>
      cache
        .keys()
        .then((requests) =>
          Promise.all(
            requests
              .filter((req) => new URL(req.url).pathname.startsWith('/assets/'))
              .map((req) => cache.delete(req)),
          ),
        ),
    )
    .catch(() => undefined)
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_SHELL && k !== CACHE_STATIC).map((k) => caches.delete(k)),
        ),
      )
      .then(() => pruneLegacyAssetEntries())
      .then(() => self.clients.claim()),
  )
})

/** Cache API 不支持 206 Partial；res.ok 含 200–299，必须显式要求 200 */
function putIfCacheable(cache, request, res) {
  if (res.status !== 200 || request.headers.get('range')) return Promise.resolve()
  // 尊重服务端显式的 no-store：SPA 外壳（`/`、`/setup` 等）正是这样下发的。
  // 之前照样写缓存，会让每个访问过的 URL（含 query）都留下一个外壳副本，
  // 而旧外壳引用的是重建后已删除的 chunk —— 一旦离线兜底命中它就是白屏。
  // 离线外壳改由 install 阶段的 SHELL_URLS 显式预热，粒度可控。
  if ((res.headers.get('cache-control') || '').includes('no-store')) return Promise.resolve()
  return cache.put(request, res.clone()).catch(() => undefined)
}

function cacheThenNetwork(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    fetch(request)
      .then((res) => {
        putIfCacheable(cache, request, res)
        return res
      })
      .catch(() => cache.match(request)),
  )
}

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then(async (cache) => {
    const cached = await cache.match(request)
    const network = fetch(request)
      .then((res) => {
        putIfCacheable(cache, request, res)
        return res
      })
      .catch(() => null)
    return cached || network.then((res) => res || caches.match('/index.html'))
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  // Range 请求（音视频/大文件 seek）直接走网络，避免缓存 206
  if (request.headers.get('range')) return

  /**
   * 只接管「非哈希」静态资源（图片 / 音效 / 户型图等）。
   *
   * `/assets/*` 是内容哈希 + 后端 `Cache-Control: public, max-age=31536000, immutable`，
   * HTTP 缓存已经完全覆盖，再由 SW 的 CacheStorage 兜一层反而有害：
   *  1) `staleWhileRevalidate` 里 `cached` 恒优先于 `network`，让 immutable 彻底失效；
   *  2) 响应经 SW 世界返回，document 世界声明的 `<link rel="modulepreload">` 无法被采用，
   *     Chromium 会报 cross-world service worker resource mismatch / preload not used；
   *  3) 每个资源请求多一次 SW 转发。
   * 不再接管后离线仍然可用：不可变响应可从 HTTP 缓存离线复用，壳（/ 与 /index.html）仍留在 SW 缓存。
   */
  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC))
    return
  }

  if (request.mode === 'navigate' || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(cacheThenNetwork(request, CACHE_SHELL))
  }
})

/** Web Push 前台展示 */
self.addEventListener('push', (event) => {
  let payload = { title: 'HomeOS', body: '新通知', icon: '/logo/logo.svg' }
  try {
    if (event.data) {
      const parsed = event.data.json()
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || payload.body,
        icon: parsed.icon || payload.icon,
      }
    }
  } catch {
    try {
      payload.body = event.data ? event.data.text() : payload.body
    } catch {
      /* ignore */
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.icon,
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    }),
  )
})
