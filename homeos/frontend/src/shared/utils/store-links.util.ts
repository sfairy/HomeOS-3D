/** 商店入口链接：把 HTML 里写死的 href 换成后端下发的商店地址。 */
interface StoreConfig {
  storeUrl: string;
  storePasswordResetPath: string;
}

/**
 * 取不到配置时的兜底：**不回落到任何地址**。
 *
 * 这里原来写的是 `http://127.0.0.1:8802`，那是所有兜底里错得最离谱的一个：它指向
 * **访问者自己那台电脑**的 8802 —— 客户机上一定打不开，开发机上又恰好"看起来能用"，
 * 于是这个 bug 只会在生产暴露。宁可把入口藏起来（见 `applyStoreLinks` 的 `hidden`），
 * 也不要给用户一个假链接：商店地址取不到，说明商店此刻就是不可达的。
 */
const FALLBACK_STORE_CONFIG: StoreConfig = {
  storeUrl: '',
  storePasswordResetPath: '/user/authentication/forget',
}

/** 归一化后端响应：只认非空字符串，缺失或类型不对一律回落到兜底值。 */
function readStoreConfig(payload: unknown): StoreConfig {
  const record = (payload || {}) as Record<string, unknown>,
    storeUrl =
      typeof record.storeUrl === 'string' ? record.storeUrl.trim().replace(/\/+$/, '') : '',
    resetPath =
      typeof record.storePasswordResetPath === 'string'
        ? record.storePasswordResetPath.trim()
        : ''
  return {
    storeUrl: storeUrl || FALLBACK_STORE_CONFIG.storeUrl,
    storePasswordResetPath: resetPath || FALLBACK_STORE_CONFIG.storePasswordResetPath,
  }
}

async function loadStoreConfig(): Promise<StoreConfig> {
  try {
    const response = await fetch('/api/v1/public/config', {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    return response.ok ? readStoreConfig(await response.json()) : FALLBACK_STORE_CONFIG
  } catch {

    return FALLBACK_STORE_CONFIG
  }
}

export async function applyStoreLinks(): Promise<void> {
  const config = await loadStoreConfig(),
    storeHomeUrl = config.storeUrl ? `${config.storeUrl}/` : '',
    passwordResetUrl = config.storeUrl
      ? `${config.storeUrl}${
          config.storePasswordResetPath.startsWith('/')
            ? config.storePasswordResetPath
            : `/${config.storePasswordResetPath}`
        }`
      : ''

  /** 地址不可用就把入口藏起来：留着一个 href 会把人送到 404 或不存在的 127.0.0.1。 */
  const paint = (selector: string, url: string): void => {
    for (const link of document.querySelectorAll<HTMLAnchorElement>(selector)) {
      if (url) {
        link.hidden = false
        link.href = url
      } else {
        link.hidden = true
        link.removeAttribute('href')
      }
    }
  }
  paint('a[data-store-link]', storeHomeUrl)
  paint('a[data-store-password-reset-link]', passwordResetUrl)
}

/**
 * 由视图在挂载后调用。
 *
 * 显式导出，保证在视图 DOM 渲染完成后再改写 `a[data-store-link]` 的 href。
 */
