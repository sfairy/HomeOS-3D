/* ── 布局未保存草稿持久化（按用户 + 方案隔离） ── */
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/kernel/core/local-storage'

import { nextTick, type Ref } from 'vue'
import { useChromeStore } from '@/kernel/ui/chrome/chrome-store'
import { useAuthStore } from '@/domain/auth/auth.store'
import { logger } from '@/kernel/core/logger'
import { clonePlain } from '@/kernel/core/clone-plain'
import type { UILayoutConfig } from '@/kernel/layout-config'

/** localStorage 中草稿 key 的前缀。 */
const DRAFT_PREFIX = 'homeos_layout_draft'

/** createLayoutDraftState 的依赖注入参数 */
interface LayoutDraftStateDeps {
  /** 布局配置对象（响应式） */
  layoutConfig: UILayoutConfig
  /** 脏标志（true 表示有未保存修改） */
  layoutDirty: Ref<boolean>
  /** 当前激活方案 ID（草稿按方案隔离） */
  activeProfileId: Ref<string>
  /** 临时抑制 dirty 跟踪（恢复草稿时避免把整段覆盖当作一次编辑） */
  setSuppressDirtyTracking: (v: boolean) => void
}

/** 草稿载荷：带方案与用户标识，读取时据此拒绝「别人的 / 别的方案的」草稿。 */
export type LayoutDraftPayload = {
  layoutConfig: Record<string, unknown>
  profileId: string
  userId: string
  timestamp: number
}

/**
 * 草稿 key：**按用户 + 方案隔离**。
 *
 * 为什么不能用一个全局 key：
 * - 同一浏览器里管理员会切换显示方案，A 方案的草稿被 B 方案读出来就是「布局串台」；
 * - 换账号登录时上一账号的布局会留在 localStorage 里，下一个账号有机会把它恢复出来。
 * 两者都不是理论问题：草稿是**整份布局**，串一次就等于把别人的首页配置搬过来。
 */
export function layoutDraftKey(userId: string, profileId: string): string {
  return `${DRAFT_PREFIX}:${userId || 'anonymous'}:${profileId || 'default'}`
}

/** 当前登录用户名（未登录时用 anonymous，保证不与其他用户共享同一个 key）。 */ function currentUserId(): string {
  try {
    return String(useAuthStore().user || '').trim()
  } catch {
    return ''
  }
}

/** 清掉本机所有布局草稿（登出 / 401 / 切换账号时调用）。存储不可用或退出中失败都静默跳过。 */
export function clearAllLayoutDrafts(): void {
  if (typeof localStorage === 'undefined') return
  const doomedKeys: string[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(`${DRAFT_PREFIX}:`)) doomedKeys.push(key)
    }
  } catch {
    return
  }
  for (const key of doomedKeys) removeLocalStorage(key)
}

/**
 * 解析草稿并校验归属：JSON 损坏、方案对不上、用户对不上都返回 `null`。
 *
 * 抽成纯函数是为了能在 node 里断言「换方案/换账号不会读到别人的草稿」——
 * 这一段一旦写错，表现只是「恢复出来的首页不对」，很难在浏览器里复现。
 */
export function parseLayoutDraft(raw: string | null, userId: string, profileId: string): LayoutDraftPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<LayoutDraftPayload> | null
    if (!parsed || typeof parsed !== 'object' || !parsed.layoutConfig) return null
    if (parsed.profileId !== (profileId || 'default')) return null
    if (parsed.userId !== (userId || 'anonymous')) return null
    if (typeof parsed.layoutConfig !== 'object') return null
    return {
      layoutConfig: parsed.layoutConfig as Record<string, unknown>,
      profileId: parsed.profileId,
      userId: parsed.userId,
      timestamp: Number(parsed.timestamp) || 0,
    }
  } catch {
    return null
  }
}

/**
 * 稳定序列化（递归按 key 排序）。
 *
 * 直接 `JSON.stringify` 比较「草稿 vs 服务端」会受键顺序影响：合并默认值时对象的
 * 键序与保存时可能不同，内容其实一样却判成「有未保存修改」，于是每次载入都弹一次
 * 「恢复未保存的修改」—— 用户会以为保存没生效。
 */
export function stableLayoutString(value: unknown): string {
  const walk = (node: unknown): string => {
    if (node === null || node === undefined) return 'null'
    if (Array.isArray(node)) return `[${node.map(walk).join(',')}]`
    if (typeof node === 'object') {
      const record = node as Record<string, unknown>
      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${walk(record[key])}`)
        .join(',')}}`
    }
    return JSON.stringify(node) ?? 'null'
  }
  return walk(value)
}

/**
 * 布局未保存草稿 localStorage 持久化（layout 拆分模块）。
 *
 * 草稿只作为**异常退出**兜底：页面关闭前把脏布局写进本地，下次载入同一方案时
 * 询问是否恢复。它不替代正式保存 —— 保存成功后必须 `clearDraft()`，
 * 否则下一次进入会拿一份「已经存过」的旧草稿去覆盖服务端的新内容。
 */
export function createLayoutDraftState(deps: LayoutDraftStateDeps) {
  const { layoutConfig, layoutDirty, activeProfileId, setSuppressDirtyTracking } = deps

  function keyForCurrent(): string {
    return layoutDraftKey(currentUserId(), activeProfileId.value)
  }

  /**
   * 保存当前布局为草稿到 localStorage。
   * 仅在脏标志为 true 时执行；失败时仅记录调试日志，不抛出异常。
   */
  async function saveDraft(): Promise<void> {
    try {
      if (!layoutDirty.value) return
      const payload: LayoutDraftPayload = {
        layoutConfig: clonePlain(layoutConfig) as unknown as Record<string, unknown>,
        profileId: activeProfileId.value || 'default',
        userId: currentUserId() || 'anonymous',
        timestamp: Date.now(),
      }
      writeLocalStorage(keyForCurrent(), JSON.stringify(payload))
    } catch (e: unknown) {
      logger.debug('布局草稿保存失败', e instanceof Error ? e.message : e)
    }
  }

  /**
   * 恢复草稿（由载入完成后的询问流程调用）。
   *
   * 覆盖整份配置时必须抑制 dirty 跟踪：否则 `Object.assign` 会先触发一次深 watch，
   * 把「恢复」误记成一次用户编辑；恢复后由本函数显式置脏，语义才正确。
   */
  function applyDraft(draft: LayoutDraftPayload): void {
    setSuppressDirtyTracking(true)
    try {
      Object.assign(layoutConfig, clonePlain(draft.layoutConfig))
      layoutDirty.value = true
    } finally {
      nextTick(() => setSuppressDirtyTracking(false))
    }
  }

  /** 读取当前方案 + 当前用户的草稿（不消费、不改状态）。 */
  function readDraft(): LayoutDraftPayload | null {
    return parseLayoutDraft(readLocalStorage(keyForCurrent()), currentUserId(), activeProfileId.value)
  }

  /**
   * 载入完成后询问是否恢复上次未保存的草稿。
   *
   * 三个前提缺一不可：有草稿、草稿与刚载入的配置**确实不同**、用户选择恢复。
   * 「确实不同」这一条是必需的：保存成功但 `beforeunload` 竞态留下了草稿时，
   * 内容与服务端一致，再弹一次「恢复未保存修改」只会让用户怀疑保存没生效。
   *
   * @returns 是否恢复了草稿
   */
  async function maybeRestoreDraft(): Promise<boolean> {
    const draft = readDraft()
    if (!draft) return false
    const currentSignature = stableLayoutString(clonePlain(layoutConfig))
    if (stableLayoutString(draft.layoutConfig) === currentSignature) {
      clearDraft()
      return false
    }
    const when = draft.timestamp ? new Date(draft.timestamp) : null
    const confirmed = await useChromeStore().confirm(
      `检测到上次离开时还有未保存的布局修改${when ? `（${when.toLocaleString()}）` : ''}。` +
        '恢复会覆盖当前已保存的布局，之后仍需点击「保存布局」写回服务端。',
      '恢复未保存的布局修改？',
      { confirmText: '恢复修改', cancelText: '丢弃草稿', type: 'warning' },
    )
    if (!confirmed) {
      clearDraft()
      return false
    }
    applyDraft(draft)
    return true
  }

  /** 清除当前方案 + 当前用户的草稿（保存成功 / 用户放弃 / 账号切换时调用）。 */
  function clearDraft(): void {
    removeLocalStorage(keyForCurrent())
  }

  /** 清除指定方案的草稿（删除方案时清理遗留，避免 localStorage 里堆永远读不到的整份布局）。 */
  function clearDraftFor(profileId: string): void {
    removeLocalStorage(layoutDraftKey(currentUserId(), profileId))
  }

  /**
   * 清掉本机上**所有**账号 / 方案的布局草稿（登出 / 401 时调用）。
   *
   * 按用户隔离的 key 已经避免串号，但登出后上一账号的整份布局没有理由继续留在本机；
   * 而且登出时当前用户已不可靠（token 已清），无法只按「当前用户」清。
   */
  function clearAllDrafts(): void {
    clearAllLayoutDrafts()
  }

  // 注册 beforeunload 钩子：页面卸载前若有未保存修改则抢救性保存草稿。
  // 应用级单例监听（页面生命周期即其生命周期），触发点之后进程就结束了，不配对移除。
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (layoutDirty.value) {
        void saveDraft()
      }
    })
  }

  return {
    saveDraft,
    readDraft,
    applyDraft,
    maybeRestoreDraft,
    clearDraft,
    clearDraftFor,
    clearAllDrafts,
  }
}
