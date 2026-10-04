/**
 * HA 媒体代理工具（纯函数，便于单测）
 *
 * 职责：透传 HA 媒体资源给前端 —— 摄像头快照（fetchHaMediaImage）与媒体流
 *      （openHaMediaStream，MJPEG / HLS 分片）。路径经 validateHaMediaPath /
 *      validateHaStreamPath 白名单校验，鉴权失败回调 onAuthError 通知上层刷新 token。
 * 关键依赖：API_ERROR、media-path.util（路径校验/头构造）、BusinessException。
 */
import { API_ERROR } from '../../common/errors/api-error-messages';
import { buildHaStreamFetchHeaders, validateHaMediaPath, validateHaStreamPath } from '../../shared/ha/media-path.util';
import { BusinessException, ErrorCode } from '../../common/utils';

/**
 * 拉取 HA 媒体图像（如摄像头快照），返回 Buffer + contentType。
 * 摄像头快照路径（/api/camera_proxy）使用 25s 长超时，其余走默认超时。
 *
 * @param haUrl HA 基地址。
 * @param token HA 长期令牌。
 * @param path HA 媒体路径（经 validateHaMediaPath 校验）。
 * @param fetchWithTimeout 带超时的 fetch 实现。
 * @param onAuthError 鉴权失败回调（如 401 通知上层）。
 * @returns 图像 Buffer 与 content-type。
 */
export async function fetchHaMediaImage(
  haUrl: string,
  token: string,
  path: string,
  fetchWithTimeout: (url: string, init: RequestInit, timeoutMs?: number) => Promise<Response>,
  onAuthError: (status: number) => void,
): Promise<{ data: Buffer; contentType: string }> {
  const cleanPath = validateHaMediaPath(path);
  const url = `${haUrl}${cleanPath}`;
  const pathOnly = cleanPath.split('?')[0] || '';
  const cameraSnapshot = pathOnly.startsWith('/api/camera_proxy');
  const response = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    cameraSnapshot ? 25_000 : undefined,
  );
  if (!response.ok) {
    onAuthError(response.status);
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_REST_RESPONSE_FAILED(response.status),
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    data: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') || 'image/jpeg',
  };
}

/** 打开 HA 媒体流（MJPEG / HLS 分片等），由调用方 pipe 到客户端 */
export async function openHaMediaStream(
  haUrl: string,
  token: string,
  path: string,
  fetchFn: (url: string, init: RequestInit) => Promise<Response>,
  onAuthError: (status: number) => void,
): Promise<Response> {
  const cleanPath = validateHaStreamPath(path);
  const url = `${haUrl}${cleanPath}`;
  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...buildHaStreamFetchHeaders(cleanPath),
    },
  });
  if (!response.ok) {
    onAuthError(response.status);
    throw new BusinessException(
      ErrorCode.EXTERNAL_ERROR,
      API_ERROR.HA_REST_RESPONSE_FAILED(response.status),
    );
  }
  return response;
}
