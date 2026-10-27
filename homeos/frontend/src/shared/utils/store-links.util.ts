/**
 * 商店入口链接：把后端 `/public/config` 下发的商店地址变成可点的 URL。
 *
 * 只有一个出口 `resolveStoreLinks()`：返回纯数据，不碰 DOM。视图把它绑到 `:href` 上，
 * 地址取不到（空串）时**不渲染**入口 —— 绝不回落到任何猜测的地址。
 *
 * 为什么不再提供「改写 HTML 里写死的 href」那种做法：那样必须等 DOM 落地再查询，
 * 而任何会被 `v-if` 重建的区块都会在重建后变回写死的假地址（旧实现正是对此写了一条注释
 * 提醒后来者）。改成纯数据 + `:href` 之后，「渲染出来的地址」与「解析到的地址」天然一致。
 */
interface StoreConfig {
  storeUrl: string
  storePasswordResetPath: string
}

/** 解析好的商店链接：地址缺失时各字段一律为空串，调用方据此隐藏入口。 */
export interface StoreLinks {
  /** 商店根地址（无尾斜杠）；取不到时为空串。 */
  storeUrl: string
  /** 商店首页（带尾斜杠）；取不到时为空串。 */
  storeHomeUrl: string
  /** 商店的「重置密码」页；取不到时为空串。 */
  passwordResetUrl: string
  /** 商店内任意深链（如 `/products`、`/user/dashboard/index`）；地址缺失时返回空串。 */
  pathUrl: (path: string) => string
}

/** 尚无解析结果时的占位值（组件用它初始化 shallowRef，首帧因此没有任何假链接）。 */
export const EMPTY_STORE_LINKS: StoreLinks = {
  storeUrl: '',
  storeHomeUrl: '',
  passwordResetUrl: '',
  pathUrl: () => '',
}

/**
 * 取不到配置时的兜底：**不回落到任何地址**。
 *
 * 这里原来写的是 `http://127.0.0.1:8802`，那是所有兜底里错得最离谱的一个：它指向
 * **访问者自己那台电脑**的 8802 —— 客户机上一定打不开，开发机上又恰好"看起来能用"，
 * 于是这个 bug 只会在生产暴露。宁可把入口藏起来，也不要给用户一个假链接：
 * 商店地址取不到，说明商店此刻就是不可达的。
 */
const FALLBACK_STORE_CONFIG: StoreConfig = {
  storeUrl: '',
  storePasswordResetPath: '/user/authentication/forget',
}

/** 归一化后端响应：只认非空字符串，缺失或类型不对一律回落到兜底值。 */
function readStoreConfig(payload: unknown): StoreConfig {
  const record = (payload || {}) as Record<string, unknown>
  const storeUrl =
    typeof record.storeUrl === 'string' ? record.storeUrl.trim().replace(/\/+$/, '') : ''
  const resetPath =
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

/** 把路径补成 `/path`：调用方可能给 `/products`，也可能给 `products`。 */
function normalizeStorePath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

/**
 * 解析商店链接。
 *
 * 不做进程内**失效**缓存（带 TTL 的那种）：`/public/config` 自己带缓存，多一层会过期策略
 * 只会在换域名后失效不了（这个模块是单例，页面不刷新就一直读旧值）。
 *
 * 但**会话内**的一次预取是必要的：坞脚那两三个入口要在**首帧**就在位（见 `prefetchStoreLinks`）。
 */
export async function resolveStoreLinks(): Promise<StoreLinks> {
  const config = await loadStoreConfig()
  const storeUrl = config.storeUrl
  return {
    storeUrl,
    storeHomeUrl: storeUrl ? `${storeUrl}/` : '',
    passwordResetUrl: storeUrl
      ? `${storeUrl}${normalizeStorePath(config.storePasswordResetPath)}`
      : '',
    pathUrl: (path) => (storeUrl ? `${storeUrl}${normalizeStorePath(path)}` : ''),
  }
}

/** 已解析好的链接。`null` = 还没解析完（或解析失败）。 */
let resolved: StoreLinks | null = null
/** 正在进行的解析（复用同一个请求：多个页面 / 多次调用不重复打接口）。 */
let inflight: Promise<StoreLinks> | null = null

/**
 * 预取商店链接，供入户页在**挂载之前**把坞脚入口准备好。
 *
 * 为什么必须在挂载前：`useStoreLinks` 的初始值是 `EMPTY_STORE_LINKS`，配置回来才填 `href`，
 * 于是登录页 / 找回页的坞脚从「0 个链接」变成「3 个链接」，坞体高度 +34px；
 * 桌面端坞体垂直居中，整块面板因此**上移一次**。手机上是高度跳一次。
 * 预取之后 `useStoreLinks` 在 setup 里就能同步拿到真地址 —— 首帧即最终布局。
 *
 * 失败也算「有结果」：`resolveStoreLinks` 内部已经把错误折成空地址兜底，
 * 所以这里不会 reject，调用方不需要 catch。
 */
export function prefetchStoreLinks(): Promise<StoreLinks> {
  if (!inflight) {
    inflight = resolveStoreLinks().then((links) => {
      resolved = links
      return links
    })
  }
  return inflight
}

/**
 * 同步读已解析的链接；还没解析完返回 `null`。
 *
 * 与 `prefetchStoreLinks` 配套：`useStoreLinks` 用它做初始值。
 */
export function peekStoreLinks(): StoreLinks | null {
  return resolved
}

/** 清掉模块级缓存（登出 / 换站点后调用；正常情况下不需要）。 */
export function forgetStoreLinks(): void {
  resolved = null
  inflight = null
}
