/**
 * @module core/pwa-update
 * @description Service Worker 注册与 PWA 更新提示工具。
 *
 * 职责：
 *  - 注册 /sw.js 并监听 updatefound / controllerchange，在 SW 更新就绪时回调提示用户刷新；
 *  - 处理自签 / 不受信任 HTTPS 证书场景：识别 SecurityError 后在本会话内不再重试，
 *    避免反复刷屏，并在开发环境给出信任根 CA 的指引。
 *
 * 依赖：navigator.serviceWorker、sessionStorage、import.meta.env。
 */
/** sessionStorage key：标记本会话已确认 SW 无法注册，避免反复重试刷屏 */
const SW_SKIP_KEY = 'homeos:sw-skip'

/** 是否应跳过 Service Worker 注册（不支持 / 非安全上下文 / 之前已失败） */
function shouldSkipServiceWorker(): boolean {
  if (!('serviceWorker' in navigator)) return true
  // 非安全上下文（http + 非 localhost）下浏览器本就不允许注册 SW
  if (typeof window !== 'undefined' && window.isSecureContext === false) return true
  try {
    return sessionStorage.getItem(SW_SKIP_KEY) === '1'
  } catch {
    return false
  }
}

/** 标记本会话跳过 SW 注册（写入 sessionStorage） */
function markServiceWorkerSkipped() {
  try {
    sessionStorage.setItem(SW_SKIP_KEY, '1')
  } catch {
    /* ignore storage 不可用 */
  }
}

/**
 * 当通过自签 / 不受信任证书的 HTTPS 访问时，浏览器会抛出
 * "An SSL certificate error occurred when fetching the script."
 * 这类错误属于 SecurityError，无法被 JS 完全屏蔽，但我们可以：
 * 1) 仅在安全上下文尝试注册；
 * 2) 失败后给出明确指引，并在本会话内不再重试，避免反复刷屏。
 */
function isSslOrSecurityError(err: unknown): boolean {
  if (!err) return false
  const name = (err as { name?: string }).name ?? ''
  const message = (err as { message?: string }).message ?? ''
  return name === 'SecurityError' || /SSL|certificate|insecure/i.test(message)
}

/**
 * 监听 Service Worker 更新并提示用户确认刷新。
 *
 * 更新模型（用户确认式）：
 *  - sw.js 不再自动 skipWaiting；新版本 SW 安装后进入 waiting 态；
 *  - 检测到 waiting 即回调 onUpdate(applyUpdate)，由用户确认后调用 applyUpdate()
 *    向 waiting worker 发送 SKIP_WAITING；
 *  - 新 SW 接管（controllerchange）后刷新页面加载新版本；
 *  - 首次安装（无 controller）直接激活，不打扰用户也不触发刷新。
 *
 * @param onUpdate 检测到新版本就绪时的回调，参数为激活更新的函数
 * @returns 卸载函数：移除监听并触发一次 update 检查
 */
export function setupPwaUpdatePrompt(onUpdate?: ((applyUpdate: () => void) => void) | null) {
  if (shouldSkipServiceWorker()) return () => {}

  let refreshing = false
  /** 仅在用户确认更新后才于 controllerchange 时刷新；首次安装激活不刷新 */
  let reloadOnControllerChange = false
  const onControllerChange = () => {
    if (refreshing || !reloadOnControllerChange) return
    refreshing = true
    window.location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

  let registration: ServiceWorkerRegistration | undefined
  const postSkipWaiting = (worker?: ServiceWorker | null) => {
    worker?.postMessage({ type: 'SKIP_WAITING' })
  }
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      registration = reg
      const applyUpdate = () => {
        reloadOnControllerChange = true
        postSkipWaiting(reg.waiting)
      }
      if (reg.waiting) {
        if (!navigator.serviceWorker.controller) postSkipWaiting(reg.waiting)
        else onUpdate?.(applyUpdate)
      }
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state !== 'installed') return
          if (!navigator.serviceWorker.controller) postSkipWaiting(worker)
          else onUpdate?.(applyUpdate)
        })
      })
    })
    .catch((err: unknown) => {
      if (isSslOrSecurityError(err)) {
        markServiceWorkerSkipped()
        if (import.meta.env.DEV) {
          console.warn(
            '[HomeOS] Service Worker 注册失败:当前 HTTPS 证书不受信任,离线/更新功能已禁用.' +
              '请在本设备信任 Caddy 内置根 CA(/data/caddy/pki/authorities/local/root.crt),' +
              '或改用 localhost / 受信任证书访问.',
          )
        }
      }
      // 其它错误静默忽略，PWA 功能缺失不影响应用主流程
    })

  return () => {
    navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    registration?.update?.()
  }
}
