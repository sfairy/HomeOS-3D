/**
 * HomeOS 中控主题：固定石板深蓝。
 *
 * 语义色**只有一份真源**：`app/hos-design-system.css` 的 `:root`（以及它内部按容器宽度
 * 分档的覆盖块）。这里不再往 `<html>` 写 `data-theme`：全仓没有任何 `[data-theme="slate-navy"]`
 * 选择器，写上去只会让人以为「改这个属性就能换肤」。历史上那套可切换主题
 * （warm-amber / light / system）已经删除，本函数现在只负责**清理残留偏好**——
 * 否则老设备升级后，遗留的 `homeos_ui_theme` 会让别的读取方以为用户还选着浅色主题。
 */
import { removeLocalStorage } from '@/kernel/core/local-storage'

/** 当前唯一主题名（供设置页展示 / 埋点使用）。 */
export type HomeOsResolvedTheme = 'slate-navy'

const STORAGE_KEY = 'homeos_ui_theme'

/**
 * 清理历史主题偏好并返回当前主题名。
 *
 * @returns 固定返回 `'slate-navy'`
 */
export function applyHomeOsTheme(): HomeOsResolvedTheme {
  try {
    removeLocalStorage(STORAGE_KEY)
  } catch {
    /* 隐私模式下 localStorage 可能抛错：主题本来就是固定的，忽略即可 */
  }
  return 'slate-navy'
}
