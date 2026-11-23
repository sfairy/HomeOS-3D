/**
 * 12 / 24 小时制的**唯一判定入口**。
 *
 * 背景（审计 U-04）：列表 / 审计 / 安防等格式化函数原先各自硬编码 ``hour12: false``，
 * 于是无论浏览器语言是什么都固定 24 小时制。用户偏好应该只在这里定义一次，
 * 其余调用点通过 :func:`hour12Option` 取值，避免「这里是 12 小时、那里是 24 小时」。
 *
 * 优先级：显式偏好（``localStorage['homeos.timeFormat']`` = ``'12' | '24'``）
 * → 浏览器语言推断 → 24 小时制兜底。
 *
 * 为什么用浏览器语言而不是新增后端配置：这套系统只有一个家庭、一个管理员，
 * 为了一个显示开关增加「配置项 + 设置面板 + 校验 + 迁移」的成本远高于收益；
 * 而 ``navigator.language`` 本来就是用户在自己设备上的选择。需要强制覆盖时，
 * 调 :func:`setTimeFormatPreference` 写一条 localStorage 即可。
 */

/** 显式偏好的存储键。 */
export const TIME_FORMAT_STORAGE_KEY = 'homeos.timeFormat'

/** 显式偏好：``'12'`` / ``'24'`` / ``null``（跟随语言）。 */
export type TimeFormatPreference = '12' | '24' | null

/**
 * 使用 12 小时制的语言（按 ``navigator.language`` 的主标签匹配）。
 *
 * 只列真正以 12 小时制为默认的地区；``en-GB``、``zh-*``、``de`` 等都在 24 小时制阵营，
 * 因此不列。``en`` 不带地区时按 12 小时制处理（``navigator.language`` 极少只给 ``en``，
 * 真出现时跟随最常见默认更安全）。
 */
const HOUR12_LANGUAGES = new Set(['en-us', 'en-ca', 'en-au', 'en-nz', 'en-in', 'en-ph', 'en'])

function readStoredPreference(): TimeFormatPreference {
  try {
    const value = globalThis.localStorage?.getItem(TIME_FORMAT_STORAGE_KEY)
    return value === '12' || value === '24' ? value : null
  } catch {
    // 隐私模式 / 禁用存储：按「无偏好」处理，不影响页面
    return null
  }
}

/** 浏览器语言是否倾向 12 小时制（SSR / 无 navigator 时返回 false）。 */
export function languagePrefersHour12(language?: string): boolean {
  const raw = (language ?? globalThis.navigator?.language ?? '').trim().toLowerCase()
  if (!raw) return false
  return HOUR12_LANGUAGES.has(raw)
}

/** 当前是否使用 12 小时制（显式偏好优先，其次语言推断）。 */
export function resolveHour12(): boolean {
  const stored = readStoredPreference()
  if (stored === '12') return true
  if (stored === '24') return false
  return languagePrefersHour12()
}

/** 供 ``Intl.DateTimeFormatOptions`` 展开使用：``{ hour12: boolean }``。 */
export function hour12Option(): { hour12: boolean } {
  return { hour12: resolveHour12() }
}

/** 写入显式偏好；传 ``null`` 表示恢复「跟随语言」。 */
export function setTimeFormatPreference(preference: TimeFormatPreference): void {
  try {
    if (preference === null) globalThis.localStorage?.removeItem(TIME_FORMAT_STORAGE_KEY)
    else globalThis.localStorage?.setItem(TIME_FORMAT_STORAGE_KEY, preference)
  } catch {
    // 存储不可用：静默忽略（偏好只在本次会话内无效，不影响功能）
  }
}
