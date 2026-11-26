/**
 * MoviePilot 地址的唯一解析入口。
 *
 * 唯一真源是 `layout.mediaConfig.mpUrl`（「设置 → 媒体与入库」里填的那一栏）。
 *
 * 历史背景（已清理）：这里曾经还要在读侧合并 `layout.moviePilotUrl` —— 那是「内嵌网页
 * 管理」里另开的一个输入框，两个位置描述同一台服务，只填一处就会出现「能打开页面但轮询
 * 不到入库」或反过来。作为全新系统交付时该字段已删除，因此本模块不再做「两处择一」，
 * 也不再提供迁移提示（没有旧值可迁）。
 */

export type MoviePilotUrlSource =
  | {
      mediaConfig?: { mpUrl?: string | null } | null
    }
  | null
  | undefined

/** 媒体库地址；未配置时返回空串（调用方据此判定「未配置」）。 */
export function resolveMoviePilotUrl(layout: MoviePilotUrlSource): string {
  return String(layout?.mediaConfig?.mpUrl || '').trim()
}
