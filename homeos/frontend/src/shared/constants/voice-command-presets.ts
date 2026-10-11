/** 语音房间标签常量 */
import { getDefaultVoiceRoomLabels } from '@homeos/shared'

/** 语音房间标签回退（优先使用配置 voice.rooms / envSensorMap） */
export const VOICE_ROOM_LABELS = getDefaultVoiceRoomLabels()
