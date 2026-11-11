/**
 * 解析当前打开的设备弹窗实体 ID，供 WS pinned 订阅使用。
 *
 * 优先栈 A（EntityControlHost），其次栈 B 媒体全屏（MediaPlayerModal）。
 * 取代从未写入的 layout.activeFloorplanPopupId。
 */
import { getActivePinia } from 'pinia'
import { useChromeStore } from '@/stores/chrome.store'

export function resolveActivePopupEntityId(): string | null {
  try {
    const pinia = getActivePinia()
    if (!pinia) return null
    const chrome = useChromeStore(pinia)
    if (chrome.isEntityControlOpen && chrome.entityControlEntityId?.includes('.')) {
      return chrome.entityControlEntityId
    }
    if (chrome.isMediaPlayerOpen && chrome.activeMediaEntityId?.includes('.')) {
      return chrome.activeMediaEntityId
    }
  } catch {
    /* Pinia 未就绪 */
  }
  return null
}
