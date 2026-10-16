/**
 * @file security-view-events.internals.ts
 * @module frontend/src/features/security/composables
 */
/** 安防页门禁事件：视频 URL / hero 色调等纯辅助 */

export type SecurityDoorEvent = {
  date?: string
  video?: string
  clip?: string
  mp4?: string
  recording?: string
  thumbnail?: string
  [key: string]: unknown
}

/** 从门禁事件解析可播放视频地址（优先 video，依次 clip/mp4/recording）。 */
export function resolveSecurityEventVideo(event: SecurityDoorEvent | undefined): string {
  if (!event) return ''
  return event.video || event.clip || event.mp4 || event.recording || ''
}

/** 安防总览 hero 色调：未布防 muted，有告警 red，否则 amber。 */
export function resolveSecurityHeroTone(armed: boolean, alertCount: number): 'muted' | 'red' | 'amber' {
  if (!armed) return 'muted'
  if (alertCount > 0) return 'red'
  return 'amber'
}
