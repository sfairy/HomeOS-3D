/**
 * 语音房间标签常量
 *
 * 职责：
 * - 提供 TTS / 语音助手场景下房间名称的中文回退标签。
 * - 当用户未在 `voice.rooms` / `envSensorMap` 中配置房间标签时使用。
 *
 * 依赖：@homeos/shared 中的 `getDefaultVoiceRoomLabels` 默认房间标签工厂。
 */
import { getDefaultVoiceRoomLabels } from '@homeos/shared'

/** 语音房间标签回退（优先使用配置 voice.rooms / envSensorMap） */
export const VOICE_ROOM_LABELS = getDefaultVoiceRoomLabels()
