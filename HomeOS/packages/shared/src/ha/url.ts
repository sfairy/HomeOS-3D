/**
 * HA URL 工具模块
 *
 * 职责：
 *  - 规范化 HA 地址（去除尾部斜杠）。
 *  - 判断 HA URL 是否指向本机回环地址（容器内不可达宿主机 HA）。
 *  - 校验 HA URL 是否可用于部署环境。
 *
 * 调用场景：
 *  - 系统设置页保存 HA 地址前校验；
 *  - 后端部署 / 容器化环境启动时检查 HA 可达性。
 */

/**
 * 去除 HA URL 尾部斜杠。
 *
 * @param haUrl 原始 URL（可能为 null / undefined / 空串）
 * @returns 去除尾部 "/" 后的 URL；空输入返回空字符串
 *
 * 调用场景：拼接 HA REST API 路径前统一格式，避免出现 "//api" 双斜杠。
 */
export function normalizeHaUrl(haUrl: string | null | undefined): string {
  return haUrl ? haUrl.replace(/\/$/, '') : '';
}

/**
 * 判断 HA URL 是否指向本机回环地址（容器内不可达宿主机 HA）
 *
 * @param url 待检测的 URL 字符串
 * @returns true 表示 hostname 为 localhost / 127.0.0.1 / ::1
 *
 * 调用场景：Docker 部署时若用户填 localhost，容器内无法访问宿主机 HA，
 *  需提示改用宿主机 LAN IP 或 host.docker.internal。
 */
export function isLocalhostHaUrl(url: string): boolean {
  try {
    const host = new URL(url.trim()).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    // URL 解析失败视为非 localhost（后续校验会报格式错误）
    return false;
  }
}

/**
 * 校验 HA URL 是否可用于部署环境
 *
 * @param url     待校验的 URL
 * @param options  allowLocalhost 为 true 时允许回环地址（本地开发场景）
 * @returns 错误信息字符串；校验通过返回 null
 *
 * 校验项：
 *  1. 非空；
 *  2. 协议为 http / https；
 *  3. 非 localhost（除非显式 allowLocalhost）。
 */
export function validateHaUrlForDeploy(
  url: string,
  options?: { allowLocalhost?: boolean },
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return 'HA 地址不能为空';
  try {
    const parsed = new URL(trimmed);
    // 仅允许 http / https，防止 file:// / ws:// 等异常协议
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'HA 地址须以 http:// 或 https:// 开头';
    }
  } catch {
    return 'HA 地址格式无效';
  }
  // 容器 / 远程部署场景下 localhost 不可达，需提示用户
  if (!options?.allowLocalhost && isLocalhostHaUrl(trimmed)) {
    return 'HA 地址不能使用 localhost 或 127.0.0.1（Docker/远程部署请使用宿主机 LAN IP 或 host.docker.internal）';
  }
  return null;
}
