import { type AxiosRequestConfig } from 'axios'
import { apiGet, apiPost } from '../../kernel/http/index'

/** 媒体库 API：Music Assistant 点歌 + MoviePilot 入库（与既有 media.ts 的播放列表区分）。 */

export interface MusicPlayer {
  playerId: string
  name: string
  available: boolean
  type: string
}

export interface MusicTrack {
  uri: string
  name: string
  artists: Array<{ uri: string; name: string }>
  album: string
  duration?: number
}

export interface MediaArrival {
  id: string
  source: string
  remoteId: string
  title: string
  season?: string | null
  tmdbId?: string | null
  posterUrl?: string | null
  arrivedAt?: string | null
  notifiedAt?: string | null
}

export function testMediaConnection(kind: 'ma' | 'mp', config?: AxiosRequestConfig) {
  return apiPost<{ success: boolean; status?: number; message?: string }>('/media/test-connection', { kind }, config)
}

export function listMusicPlayers(config?: AxiosRequestConfig) {
  return apiGet<{ success: boolean; items: MusicPlayer[]; message?: string }>('/media/players', config)
}

export function searchMusic(query: string, type: 'track' | 'artist' = 'track', limit = 10) {
  return apiGet<{ success: boolean; items: MusicTrack[]; message?: string }>('/media/search', {
    params: { query, type, limit },
    dedupe: false,
  })
}

/** 点歌结果：成功时带 `playerId` / `track`，多结果或无音箱时带 `message` / `candidates`。 */
export interface MusicPlayResult {
  success: boolean
  phase?: string
  message?: string
  playerId?: string
  track?: MusicTrack
  /** 候选：同名歌曲是 `{name, uri}`，多台音箱时是 playerId 字符串 */
  candidates?: Array<{ name?: string; uri?: string } | string>
}

export function playMusic(artist: string, track: string, areaId = '', config?: AxiosRequestConfig) {
  return apiPost<MusicPlayResult>('/media/play', { artist, track, areaId }, config)
}

export function listMediaArrivals(limit = 50, config?: AxiosRequestConfig) {
  return apiGet<{ items: MediaArrival[] }>('/media/arrivals', { params: { limit }, ...config })
}

export function pollMediaArrivals(config?: AxiosRequestConfig) {
  return apiPost<{
    success: boolean
    added: number
    notified: number
    message?: string
    /** 上一轮轮询仍在进行时后端会直接跳过（不排队） */
    skipped?: boolean
    /** 首轮只建游标，不导历史 */
    initialized?: boolean
  }>('/media/arrivals/poll', undefined, config)
}

/** 媒体场景与播放列表 REST API 封装 */

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
