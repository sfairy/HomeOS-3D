/**
 * MoviePilot 地址的唯一解析入口。
 *
 * 历史上有两个字段描述同一台服务：
 * - `layout.mediaConfig.mpUrl`：媒体库（入库轮询、图片代理）用的地址；
 * - `layout.moviePilotUrl`：内嵌网页（导航 Tab / iframe）用的地址。
 *
 * 只填一处就会出现「能打开页面但轮询不到入库」或「轮询正常但顶栏没有入口」，
 * 所以前端所有消费方（导航 Tab 判存、内嵌页 URL、配置态徽标）统一走这里；
 * 后端 `_mp()` / `get_moviepilot_url()` / `resolve_embed_configured_url()` 是同一条链。
 */
export type MoviePilotUrlSource =
  | {
      moviePilotUrl?: string | null
      mediaConfig?: { mpUrl?: string | null } | null
    }
  | null
  | undefined

/** 媒体库地址优先，其次内嵌页地址；都没有时返回空串。 */
export function resolveMoviePilotUrl(layout: MoviePilotUrlSource): string {
  const fromMedia = String(layout?.mediaConfig?.mpUrl || '').trim()
  if (fromMedia) return fromMedia
  return String(layout?.moviePilotUrl || '').trim()
}

/** 只填了 `mediaConfig.mpUrl`、旧字段为空（迁移提示用；新 UI 已不再消费）。 */
export function isMoviePilotUrlInherited(layout: MoviePilotUrlSource): boolean {
  return !String(layout?.moviePilotUrl || '').trim() && Boolean(String(layout?.mediaConfig?.mpUrl || '').trim())
}

/** 比较用：忽略大小写、末尾斜杠与默认端口差异，避免 `http://h:80/` 和 `http://h` 被当成冲突。 */
function normalizeForCompare(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
    .replace(/:(80|443)(?=\/|$)/, '')
}

/**
 * 两处都填了**不同**地址。
 *
 * 此时实际生效的是媒体库地址，内嵌那栏被静默忽略 —— 用户改了一个看起来生效、其实没生效
 * 的输入框，属于必须提示的配置矛盾（两处面板都要显示，并提供一键收敛）。
 */
export function hasMoviePilotUrlConflict(layout: MoviePilotUrlSource): boolean {
  const fromMedia = String(layout?.mediaConfig?.mpUrl || '').trim()
  const fromEmbed = String(layout?.moviePilotUrl || '').trim()
  if (!fromMedia || !fromEmbed) return false
  return normalizeForCompare(fromMedia) !== normalizeForCompare(fromEmbed)
}
