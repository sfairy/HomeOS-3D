/**
 * 摄像头流地址工具。
 *
 * 职责：通过 HomeOS 同源代理端点换取可直接播放的摄像头 HLS 地址。
 */

/**
 * 通过 HomeOS `/api/camera_hls/{entityId}` 向 HA 换取同源 HLS 播放地址。
 * @throws 请求失败或响应无有效相对路径时
 */
export async function resolveCameraHlsPlayUrl(entityId: string): Promise<string> {
  const eid = String(entityId || '').trim()
  if (!eid) throw new Error('摄像头实体为空')
  const response = await fetch(`/api/camera_hls/${encodeURIComponent(eid)}`, {
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(`摄像头 HLS 请求失败: ${response.status}`)
  }
  const payload = (await response.json()) as { url?: unknown }
  const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
  if (!url.startsWith('/')) throw new Error('摄像头 HLS 响应无可用代理地址')
  return url
}
