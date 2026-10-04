/**
 * 媒体场景与播放列表 REST API 封装
 *
 * 职责：封装媒体场景预设、播放器分组同步、播放列表管理等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost。
 * 端点范围：/system/media/scene[/presets]、/system/media/group/{sync,unjoin}、
 *           /system/media/playlist[/{start,next}]。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../api-client'





/**
 * 获取播放器播放列表。
 * 对应后端 endpoint：GET /system/media/playlist
 * @param player 播放器标识
 * @returns 播放列表
 */
export function fetchMediaPlaylist(player: string, config?: AxiosRequestConfig) {
  return apiGet('/system/media/playlist', { ...config, params: { ...config?.params, player } })
}

/**
 * 启动播放列表。
 * 对应后端 endpoint：POST /system/media/playlist/start
 * @param payload 播放列表配置
 * @returns 操作结果
 */
export function startMediaPlaylist(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/media/playlist/start', payload, config)
}

/**
 * 切换到下一曲。
 * 对应后端 endpoint：POST /system/media/playlist/next
 * @param player 播放器标识
 * @returns 操作结果
 */
export function nextMediaPlaylist(player: string, config?: AxiosRequestConfig) {
  return apiPost('/system/media/playlist/next', { player }, config)
}
