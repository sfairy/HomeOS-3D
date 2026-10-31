/**
 * Toast 合并器：同一条提示在短时间内重复推送时只保留一张卡片并累加次数。
 *
 * 为什么需要：批量操作（一次关 12 盏灯）与批量失败（HA 断连、6s 乐观更新超时回滚）
 * 是「一条手势 → N 条相同提示」。store 原来每条都 push，于是右侧竖排 12 张
 * 「未生效，已恢复」，把整屏遮住且读屏连播 12 次。合并后是一张「未生效，已恢复 ×12」。
 *
 * 纯函数式持有状态、不依赖 Vue，便于直接单测（见
 * ``ops/checks/frontend/tests/notify-coalesce.test.mjs``）。
 */

/** 默认合并窗口（毫秒）：窗口内重复的 (type, message) 累加到同一张卡片。 */
const DEFAULT_WINDOW_MS = 2000
/** 默认最多跟踪多少条记录；超限时先淘汰最旧的，避免 Map 无界增长。 */
const DEFAULT_MAX_TRACKED = 32

/** 一次命中：复用哪张卡片、累加后是第几次。 */
export interface NotifyCoalesceHit {
  /** 已存在卡片的 id */
  id: string
  /** 累加后的次数（首条为 1，重复推送为 2、3……） */
  count: number
}

/** 合并器对外能力 */
export interface NotifyCoalescer {
  /** 记录/命中一条提示；窗口内同键返回命中信息并累加计数，否则返回 null 交给调用方新建。 */
  hit: (type: string, message: string, now?: number) => NotifyCoalesceHit | null
  /** 登记一张新卡片，之后同键推送会合并到它。 */
  remember: (type: string, message: string, id: string, now?: number) => void
  /** 忘记某张卡片（用户手动关闭 / 被上限挤掉时调用），下次同文案重新新建。 */
  forget: (id: string) => void
  /** 清空全部跟踪记录（测试与热重载用）。 */
  reset: () => void
}

interface Tracked {
  /** 卡片 id */
  id: string
  /** 已合并次数 */
  count: number
  /** 最近一次推送时间戳 */
  at: number
}

/** 合并键：类型也参与 —— 同文案但不同严重级别（info→warning）必须各显示一张。 */
function keyOf(type: string, message: string): string {
  return `${type}\u0000${message}`
}

/**
 * 创建合并器。
 *
 * @param windowMs 合并窗口，默认 2000ms；设为 0 等价于关闭合并
 * @param maxTracked 跟踪表上限，默认 32
 */
export function createNotifyCoalescer(
  windowMs = DEFAULT_WINDOW_MS,
  maxTracked = DEFAULT_MAX_TRACKED,
): NotifyCoalescer {
  const tracked = new Map<string, Tracked>()

  function prune(now: number): void {
    for (const [key, item] of tracked) {
      if (now - item.at > windowMs) tracked.delete(key)
    }
    // 时间无关的兜底：极端情况下（窗口配置很大）仍要有硬上限
    while (tracked.size > maxTracked) {
      const oldest = tracked.keys().next().value
      if (oldest === undefined) break
      tracked.delete(oldest)
    }
  }

  return {
    hit(type, message, now = Date.now()) {
      prune(now)
      const key = keyOf(type, message)
      const item = tracked.get(key)
      if (!item) return null
      item.count += 1
      item.at = now
      return { id: item.id, count: item.count }
    },
    remember(type, message, id, now = Date.now()) {
      prune(now)
      tracked.set(keyOf(type, message), { id, count: 1, at: now })
    },
    forget(id) {
      for (const [key, item] of tracked) {
        if (item.id === id) tracked.delete(key)
      }
    },
    reset() {
      tracked.clear()
    },
  }
}

