/**
 * 语音命令 → QuickActions 分组桥接
 *
 * 所属模块：语音 / QuickActions 桥接
 * 职责：将用户语音文本匹配到设备分组意图（light / cover / climate / offline / battery / all-off），
 *   并管理场景收藏的 localStorage 读写与事件分发。
 * 依赖：无外部依赖，纯函数 + localStorage。
 */
import { readLocalStorageJson, writeLocalStorageJson } from '@/utils/core/local-storage.util'

const GROUP_PATTERNS = [
  { re: /开.*灯|打开.*灯|灯光/, group: 'light' },
  { re: /关.*灯|关闭.*灯/, group: 'light', action: 'off' },
  { re: /窗帘|cover/i, group: 'cover' },
  { re: /空调|climate|暖气/i, group: 'climate' },
  { re: /离线|offline/i, group: 'offline' },
  { re: /电池|battery|低电/i, group: 'battery' },
  { re: /全部关闭|全屋关闭|全关|关灯关窗/, group: 'all-off' },
]

/**
 * 将语音文本匹配为 QuickActions 意图。
 *
 * @param text 用户语音文本（可为空）
 * @returns 匹配成功返回 { type: 'group', group, action? } 或 { type: 'all-off' }；无匹配返回 null
 */
export function matchQuickActionIntent(text: string | null | undefined) {
  const t = String(text || '').trim()
  if (!t) return null
  for (const p of GROUP_PATTERNS) {
    if (p.re.test(t)) {
      if (p.group === 'all-off') return { type: 'all-off' }
      return { type: 'group', group: p.group, action: p.action }
    }
  }
  return null
}

/**
 * 从 localStorage 读取场景收藏列表。
 *
 * @returns 收藏场景 id 数组；解析失败或无数据时返回空数组
 */
export function loadSceneFavorites() {
  return readLocalStorageJson('homeos_scene_favs', [])
}

/**
 * 持久化场景收藏并广播变更事件（供其他组件监听刷新）。
 *
 * @param ids 场景 id 数组（任意可序列化值）
 * @副作用 写入 localStorage 'homeos_scene_favs'；在 window 上 dispatch 'homeos-scene-favs-changed' 事件
 */
export function saveSceneFavorites(ids: unknown) {
  writeLocalStorageJson('homeos_scene_favs', ids)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('homeos-scene-favs-changed'))
  }
}