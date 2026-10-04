/**
 * @module earthquake/earthquake-ha-coords
 * @description 从 Home Assistant 同步家庭经纬度用于地震距离计算的工具。
 *
 * 流程：调用 fetchEarthquakeHaConfig 获取 HA 中的家庭坐标 → 通过 applyCoords 回调写入 → 弹出通知。
 *
 * 依赖：@/services/api/earthquake、@/stores/chrome.store。
 */
import { fetchEarthquakeHaConfig } from '@/services/api/earthquake'
import { useChromeStore } from '@/stores/chrome.store'

/**
 * 从 HA 同步家庭经纬度，并弹出通知。
 * @param applyCoords 坐标写入回调 (latitude, longitude)
 * @param options.silent 为 true 时抑制失败/缺失坐标的警告通知（用于向导进入坐标步骤时的
 *   静默自动同步，避免打断流程）；成功通知仍然保留，让用户知道坐标已被填好。
 * @returns true 表示坐标已通过 applyCoords 写入；false 表示同步失败或无坐标
 */
export async function syncEarthquakeHomeCoordsFromHa(
  applyCoords: (latitude: string, longitude: string) => void,
  options: { silent?: boolean } = {},
): Promise<boolean> {
  const chrome = useChromeStore()
  const res = await fetchEarthquakeHaConfig()
  if (!res?.success) {
    if (!options.silent) {
      chrome.notify(res?.message || '同步失败，请先完成 HA 连接配置', 'warning')
    }
    return false
  }
  const data = res.data
  if (data?.latitude != null && data?.longitude != null) {
    applyCoords(String(data.latitude), String(data.longitude))
    chrome.notify('已从 Home Assistant 同步家庭坐标', 'success')
    return true
  }
  if (!options.silent) {
    chrome.notify('HA 配置中未找到坐标', 'warning')
  }
  return false
}
