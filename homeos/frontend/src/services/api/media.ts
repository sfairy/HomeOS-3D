/** 媒体场景与播放列表 REST API 封装 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from './client'





/** 获取播放器播放列表。 */
export function fetchMediaPlaylist(player: string, config?: AxiosRequestConfig) {
  return apiGet('/system/media/playlist', { ...config, params: { ...config?.params, player } })
}

/** 启动播放列表。 */
export function startMediaPlaylist(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/media/playlist/start', payload, config)
}

/** 切换到下一曲。 */
export function nextMediaPlaylist(player: string, config?: AxiosRequestConfig) {
  return apiPost('/system/media/playlist/next', { player }, config)
}
