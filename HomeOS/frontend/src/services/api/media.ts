/**
 * 媒体场景与播放列表 REST API 封装
 *
 * 所属模块：前端服务层（services/api/）
 * 职责：封装媒体场景预设、播放器分组同步、播放列表管理等接口。
 * 依赖：../api-client 提供的 apiGet / apiPost。
 * 端点范围：/system/media/scene[/presets]、/system/media/group/{sync,unjoin}、
 *           /system/media/playlist[/{start,next}]。
 */
import type { AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../api-client'

/**
 * 获取媒体场景预设列表。
 * 对应后端 endpoint：GET /system/media/scene/presets
 * @returns 预设列表
 */
export function fetchMediaScenePresets(config?: AxiosRequestConfig) {
  return apiGet('/system/media/scene/presets', config)
}

/**
 * 应用媒体场景。
 * 对应后端 endpoint：POST /system/media/scene
 * @param payload 场景配置
 * @returns 操作结果
 */
export function applyMediaScene(payload: Record<string, unknown>, config?: AxiosRequestConfig) {
  return apiPost('/system/media/scene', payload, config)
}

/**
 * 同步媒体播放器组。
 * 对应后端 endpoint：POST /system/media/group/sync
 * @param players 播放器标识列表
 * @returns 操作结果
 */
export function syncMediaGroup(players: string[], config?: AxiosRequestConfig) {
  return apiPost('/system/media/group/sync', { players }, config)
}

/**
 * 退出媒体播放器组。
 * 对应后端 endpoint：POST /system/media/group/unjoin
 * @param players 播放器标识列表
 * @returns 操作结果
 */
export function unjoinMediaGroup(players: string[], config?: AxiosRequestConfig) {
  return apiPost('/system/media/group/unjoin', { players }, config)
}

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
