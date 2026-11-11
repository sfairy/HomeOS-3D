/* knip: used by PWA runtime; frontend/src/shared/utils/core/pwa-update.ts navigator.serviceWorker.register('/sw.js'), backend spa-fallback middleware serves /sw.js, shared embed fallback whitelist includes /sw.js — 静态 PWA SW 文件非 ESM import 所以 knip 漏识别 */
/* HomeOS Service Worker：离线壳缓存 + 非哈希静态资源 */
// 版本号变更即代表「旧缓存整体作废」：activate 会删掉非当前名的所有缓存。
//
// 版本不再手写：构建收尾把下面的占位符替换成构建期资源哈希（见 frontend/vite.config.ts
// 的 writeResourceVersion）。这样「换了产物但忘了改版本号」不再可能发生 —— 那正是
// 「升级后混用旧缓存资源」的直接成因。开发态（占位符未被替换）退化成固定名字。
const BUILD_REVISION = '__HOMEOS_RESOURCE_REVISION__'
const CACHE_SHELL = `homeos-shell-${BUILD_REVISION}`
const CACHE_STATIC = `homeos-static-${BUILD_REVISION}`
/** 3D 模型（GLB）单独一层：单件大、总量按字节设上限，超了从头淘汰。 */
const CACHE_MODELS = `homeos-models-${BUILD_REVISION}`
const MODEL_PREFIXES = ['/static/3d-studio/models/', '/static/homeos/models/']
const MODEL_CACHE_MAX_BYTES = 300 * 1024 * 1024
/** 拿不到 content-length 时的保守估值，只用于 LRU 计量，不影响返回内容。 */
const MODEL_FALLBACK_BYTES = 2 * 1024 * 1024
const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/logo/logo.svg']
/** 由 SW 接管的静态资源前缀：只有稳定 URL 的可替换素材。
 *  `/static/assets/` 是内容哈希产物，由 HTTP 缓存（no-cache + ETag）负责，见 fetch 处理器。 */
const STATIC_PREFIXES = [
  '/icons/',
  '/backgrounds/',
  '/sounds/',
  '/logo/',
  // 内置字体 URL 带 `?v=<sha256>`，换字体文件即换 URL，缓存不会陈旧。
  '/fonts-static/',
]

self.addEventListener('install', (event) => {
  // 不再自动 skipWaiting：版本更新由客户端用户确认后通过 SKIP_WAITING 消息激活，
  // 避免新 SW 静默接管导致「旧页面 + 新缓存」的版本错配
  event.waitUntil(
    caches.open(CACHE_SHELL).then((cache) =>
      // 逐条 add，不用 addAll：addAll 全有或全无，任一 URL 404 就 reject，
      // install 随之失败、SW 永远装不上（控制台刷 `Failed to execute 'addAll' on 'Cache'`）。
      // 典型触发：宿主机 ./assets 没铺默认素材时 /logo/logo.svg 为空目录 → 404。
      // 离线壳真正的关键只有 / 与 /index.html，装饰性素材缺失不该连坐。
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch((error) => {
            console.warn('[sw] precache skipped:', url, error)
          }),
        ),
      ),
    ),
  )
})

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting())
  }
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 先尽力接管已打开的页面：clients.claim() 只在 worker 处于 activating/activated 时合法，
      // 若在此期间它已被更新的版本取代（开发时 DevTools「Update on reload」、连续刷新或更新检查
      // 都会触发），会以 InvalidStateError("Only the active worker can claim clients") 拒绝。
      // 这不影响功能——下次导航 SW 仍会自然接管，因此吞掉该拒绝，避免 unhandledrejection 刷屏。
      const claim = self.clients.claim().catch(() => undefined)
      try {
        const keys = await caches.keys()
        await Promise.all(
          keys
            .filter((k) => k !== CACHE_SHELL && k !== CACHE_STATIC && k !== CACHE_MODELS)
            .map((k) => caches.delete(k)),
        )
      } catch {
        /* 缓存清理失败不应阻塞激活 */
      }
      await claim
    })(),
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

/** 保证 respondWith 永远拿到 Response；缓存未命中时不能返回 undefined。 */
function offlineFallbackResponse() {
  return new Response('HomeOS offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function matchShell(cache, request) {
  // navigate 到 `/?x` 时需忽略 search，才能命中 install 预热的 `/` / `/index.html`
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match('/index.html')) ||
    (await cache.match('/')) ||
    null
  )
}

function cacheThenNetwork(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    fetch(request)
      .then((res) => {
        putIfCacheable(cache, request, res)
        return res
      })
      .catch(() => matchShell(cache, request).then((hit) => hit || offlineFallbackResponse())),
  )
}

/**
 * 模型 GLB 的缓存优先策略。
 *
 * 只接管带 `?v=<批次键>` 的 URL —— 后端对这类 URL 下发 `private, max-age=31536000, immutable`
 * （见 `studio_shell._is_model_batch_pinned`），键变了内容才会变，因此缓存命中可以直接返回、
 * 连条件请求都不发；没带键的模型继续走 HTTP 缓存回源校验。
 *
 * 为什么要 SW 这一层：HTTP 缓存会被浏览器按配额淘汰，而 3D 首屏一次要拉上百个 GB 级里的
 * 十几 MB 模型，淘汰后就是整批重新下载。CacheStorage 独立于 HTTP 缓存，且总量可控。
 */
function modelCacheFirst(request) {
  return caches.open(CACHE_MODELS).then(async (cache) => {
    const cached = await cache.match(request)
    if (cached) return cached
    const res = await fetch(request)
    if (res.status === 200) {
      await cache.put(request, res.clone()).catch(() => undefined)
      await trimModelCache(cache)
    }
    return res
  })
}

/** 按字节上限淘汰：Cache API 没有插入时间，`keys()` 的顺序即写入顺序，从头删即可。 */
async function trimModelCache(cache) {
  const requests = await cache.keys()
  const sizes = []
  let total = 0
  for (const request of requests) {
    const hit = await cache.match(request)
    const declared = Number(hit?.headers.get('content-length') || 0)
    const size = declared > 0 ? declared : MODEL_FALLBACK_BYTES
    sizes.push({ request, size })
    total += size
  }
  if (total <= MODEL_CACHE_MAX_BYTES) return
  // 多删到 80% 以下，避免每次新增都触发一轮淘汰。
  for (const entry of sizes) {
    if (total <= MODEL_CACHE_MAX_BYTES * 0.8) break
    await cache.delete(entry.request).catch(() => undefined)
    total -= entry.size
  }
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
    if (cached) return cached
    const fromNetwork = await network
    if (fromNetwork) return fromNetwork
    const shell = await matchShell(cache, request)
    return shell || offlineFallbackResponse()
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
   * `/static/assets/*` 是内容哈希文件名，后端下发 `Cache-Control: no-cache` + ETag 由
   * HTTP 缓存回源校验（命中即 304）；再由 SW 的 CacheStorage 兜一层反而有害：
   *  1) `staleWhileRevalidate` 里 `cached` 恒优先于 `network`，让条件请求形同虚设；
   *  2) 响应经 SW 世界返回，document 世界声明的 `<link rel="modulepreload">` 无法被采用，
   *     Chromium 会报 cross-world service worker resource mismatch / preload not used；
   *  3) 每个资源请求多一次 SW 转发。
   * 不再接管后离线仍然可用：响应仍可从 HTTP 缓存复用，壳（/ 与 /index.html）留在 SW 缓存。
   */
  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC))
    return
  }

  // 模型带批次键才接管：键变了 URL 就变，命中即返回，不再发条件请求。
  if (url.searchParams.get('v') && MODEL_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(modelCacheFirst(request).catch(() => fetch(request)))
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
