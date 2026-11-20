/**
 * 摄像头播放失败归因（0.8.7）。
 *
 * 现状：失败时只报一句「摄像头播放失败」，用户和维修者都不知道是**授权**、**网络**、
 * **编码**还是**地址过期**。四类原因的处置动作完全不同 —— 换编码要改 HA 出流，
 * 授权要重新配对，地址过期重连就好 —— 混在一句话里只能靠猜。
 *
 * 判定顺序（越具体越前，命中即返回）：
 *
 * 1. 授权：401 / 403 / `LICENSE_RESTRICTED` —— 重连网络不会有任何帮助；
 * 2. 地址失效：404 / 410 / HLS `manifestLoadError` —— 换票重试有效；
 * 3. 编码：`bufferAddCodecError` / `MEDIA_ERR_SRC_NOT_SUPPORTED` —— 换浏览器没用；
 * 4. 网络：0 / 5xx / `manifestLoadTimeOut` —— 通常是链路或上游服务的问题；
 * 5. 兜底：保留原始分类。
 *
 * 返回值只用于**展示与日志**，不改传输层分支：降级/重试仍由 `camera-media` 决定。
 */

export type CameraDiagnosticInput = {
  /** 失败发生的阶段：`hls-setup` / `hls-playback` / `go2rtc` / `snapshot`。 */
  phase?: string
  /** HLS 或播放器给的分类（`networkError` / `mediaError` / `manifestLoadError` …）。 */
  type?: string
  /** HLS 的细节串（`manifestLoadTimeOut` / `bufferAddCodecError` …）。 */
  details?: string
  /** HTTP 状态码；浏览器未提供时是 0。 */
  status?: number
  /** `video.error.code`（MediaError）。 */
  mediaErrorCode?: number
  /** 原始错误消息（仅兜底展示，可能很长，会被截断）。 */
  reason?: string
}

export type CameraDiagnostic = {
  /** 稳定分类，用于日志聚合与去重。 */
  code: string
  /** 一句话中文原因（直接展示给用户）。 */
  reason: string
  /** 排查建议（面板的 title 与日志的 `hint` 都是它）。 */
  hint: string
}

const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

function lower(value: unknown): string {
  return String(value ?? '').toLowerCase()
}

/** HLS 的 `details` 里出现这些片段 = 编码/解码问题，换网络没用。 */
function looksLikeCodecProblem(input: CameraDiagnosticInput): boolean {
  const details = lower(input.details)
  return (
    details.includes('codecerror') ||
    details.includes('bufaddcodecerror') ||
    details.includes('bufferaddcodecerror') ||
    details.includes('manifestparsingerror') ||
    input.mediaErrorCode === MEDIA_ERR_DECODE ||
    input.mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED
  )
}

/** 清单格式无法解析（HLS `manifestParsingError`）：不是网络问题，重连无用。 */
function looksLikeManifestParseFailure(input: CameraDiagnosticInput): boolean {
  return lower(input.details).includes('manifestparsingerror')
}

function looksLikeAddressExpired(input: CameraDiagnosticInput): boolean {
  const status = Number(input.status || 0)
  if (status === 404 || status === 410) return true
  return lower(input.details).includes('manifestloaderror') && status >= 400
}

function looksLikeAuthProblem(input: CameraDiagnosticInput): boolean {
  const status = Number(input.status || 0)
  // 401/403 也可能来自反向代理的访问限制，两种都归到「权限」，处置都是看授权/配对。
  return status === 401 || status === 403
}

/** 授权限制：后端明确说明「授权状态不允许」（`LICENSE_RESTRICTED`），与配对/网络无关。 */
function looksLikeLicenseRestriction(input: CameraDiagnosticInput): boolean {
  const text = lower(input.reason) + ' ' + lower(input.details) + ' ' + lower(input.type)
  return text.includes('license_restricted') || text.includes('license-restricted') || text.includes('授权状态不允许')
}

function looksLikeNetworkProblem(input: CameraDiagnosticInput): boolean {
  const status = Number(input.status || 0)
  // `status === 0` 单独**不算**网络问题：它是「浏览器没给出 HTTP 结果」的默认值，
  // 调用方没传状态时也是 0。把它当网络会让「中止 / 播放器未就绪」全被误分类。
  if (status >= 500) return true
  const details = lower(input.details)
  return (
    details.includes('timeout') ||
    details.includes('networkerror') ||
    details.includes('manifestloaderror') ||
    lower(input.type) === 'networkerror'
  )
}

/** 浏览器自动播放策略拦截：`NotAllowedError`。与网络/编码都无关，只能靠用户手势。 */
function looksLikeAutoplayBlocked(input: CameraDiagnosticInput): boolean {
  const text = lower(input.reason) + ' ' + lower(input.details)
  return text.includes('notallowederror') || text.includes('play() failed') || text.includes('not allowed')
}

/** 主入口：把一次播放失败收敛成 `{ code, reason, hint }`。 */
export function cameraPlaybackDiagnostic(input: CameraDiagnosticInput): CameraDiagnostic {
  // 自动播放拦截排在授权之前：它的 `reason` 里也可能带「denied」字样，但处置完全不同。
  if (looksLikeAutoplayBlocked(input)) return autoplayBlocked()
  if (looksLikeLicenseRestriction(input)) return licenseRestricted()
  if (looksLikeManifestParseFailure(input)) return manifestUnparsable()
  if (looksLikeAuthProblem(input)) return accessDenied(input)
  if (looksLikeAddressExpired(input)) return addressExpired()
  if (looksLikeCodecProblem(input)) return codecUnsupported()
  // 中止要排在「网络」之前：`MEDIA_ERR_ABORTED` 是**主动**中断（切页/关弹窗），
  // 报成网络问题会把「用户自己关掉了」变成一条假的故障记录。
  if (input.mediaErrorCode === MEDIA_ERR_ABORTED) return playbackAborted()
  if (looksLikeNetworkProblem(input)) return upstreamUnreachable(input)
  if (input.mediaErrorCode === MEDIA_ERR_NETWORK) return upstreamUnreachable(input)
  return unclassified(input)
}

function autoplayBlocked(): CameraDiagnostic {
  return {
    code: 'CAMERA_AUTOPLAY_BLOCKED',
    reason: '浏览器阻止了摄像头视频自动播放。',
    hint: '检查浏览器或App的媒体播放限制，可允许本页面播放媒体后重新打开画面。',
  }
}

function accessDenied(input: CameraDiagnosticInput): CameraDiagnostic {
  return {
    code: 'CAMERA_ACCESS_DENIED',
    reason: `视频请求被拒绝（HTTP ${input.status}）。`,
    hint: '检查当前登录、显示设备配对及摄像头访问权限；具体拒绝来源见关联后台记录。',
  }
}

/** 授权状态限制（0.8.7）：重连、换浏览器都没用，必须先恢复授权。 */
function licenseRestricted(): CameraDiagnostic {
  return {
    code: 'CAMERA_LICENSE_RESTRICTED',
    reason: '当前授权状态不允许读取摄像头。',
    hint: '先在授权页恢复有效授权；恢复后重新打开摄像头画面，不需要重新配对设备。',
  }
}

/** 清单格式异常（0.8.7）：上游把「服务返回的视频清单」与「网络读不到」分开报。 */
function manifestUnparsable(): CameraDiagnostic {
  return {
    code: 'CAMERA_MANIFEST_UNPARSABLE',
    reason: '服务返回的视频清单格式无法解析。',
    hint: '检查 HA 出流编码与播放器分类；清单本身不合法时重连不会恢复。',
  }
}

function addressExpired(): CameraDiagnostic {
  return {
    code: 'CAMERA_ADDRESS_EXPIRED',
    reason: '视频清单或片段地址不存在或已失效。',
    hint: '检查 HA 摄像头来源和流服务状态，可重新打开摄像头画面获取当前地址。',
  }
}

function codecUnsupported(): CameraDiagnostic {
  return {
    code: 'CAMERA_CODEC_UNSUPPORTED',
    reason: '播放器未找到当前浏览器支持的视频或音频编码。',
    hint: '检查视频编码和流内容；仅重连网络不能确认编码问题已经解决。',
  }
}

function playbackAborted(): CameraDiagnostic {
  return {
    code: 'CAMERA_PLAYBACK_ABORTED',
    reason: '视频读取被中断。',
    hint: '通常是页面切换或手动关闭画面；重复出现时查看同一时段的关联记录。',
  }
}

function upstreamUnreachable(input: CameraDiagnosticInput): CameraDiagnostic {
  const status = Number(input.status || 0)
  return {
    code: 'CAMERA_UPSTREAM_UNREACHABLE',
    reason: status >= 500 ? `视频服务暂时不可用（HTTP ${status}）。` : '浏览器未能完整读取视频数据。',
    hint: '检查浏览器到 HA Bridge 以及 HA Bridge 到视频服务的连接；状态为 0 时浏览器未提供 HTTP 结果。',
  }
}

function unclassified(input: CameraDiagnosticInput): CameraDiagnostic {
  const rawReason = String(input.reason || '').trim()
  const type = String(input.type || '').trim()
  const hintPrefix = type ? `播放器分类：${type}；` : '播放器未提供分类；'
  return {
    code: 'CAMERA_PLAYBACK_FAILED',
    reason: rawReason ? `播放失败：${rawReason.slice(0, 80)}` : '播放器未能继续播放，原始分类见详情。',
    hint: hintPrefix + '查看关联后台记录及摄像头来源，核对网络和浏览器支持的视频编码。',
  }
}

/** 展示用的单行文案：`原因（编码）` 这种组合在面板里只该占一行。 */
export function cameraDiagnosticText(diagnostic: CameraDiagnostic): string {
  return diagnostic.reason
}
