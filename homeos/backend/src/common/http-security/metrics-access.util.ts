/**
 * /metrics 访问控制：生产未配置 METRICS_TOKEN 时仅本机回环可探活，
 * 便于本地 NODE_ENV=production 跑验收脚本；外网仍 404。
 *
 * 职责：判定 Prometheus /metrics 端点的访问权限，避免在生产环境向公网暴露
 *   运行时指标（连接数、实体数、内存等）。
 * 关键依赖：无（纯函数工具模块）。
 */

/**
 * 判断远端地址是否为本机回环（loopback）。
 * 兼容 IPv4 映射的 IPv6 地址（::ffff:127.0.0.1）。
 *
 * @param raw 原始 remoteAddress 字符串
 * @returns true 表示来自本机回环
 */
function isLoopbackRemoteAddress(raw: string | undefined): boolean {
  if (!raw) return false;
  // 剥离 IPv4 映射前缀，统一按 IPv4 比较
  const ip = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

/** 访问判定结果：allow 放行 / not_found 视为不存在（404）/ unauthorized 鉴权失败（401） */
type MetricsAccessDecision = 'allow' | 'not_found' | 'unauthorized';

/**
 * 判定 /metrics 是否放行。
 * - 已配置 METRICS_TOKEN：必须 Bearer 或 ?token= 匹配
 * - 未配置：非 production 放行；production 仅 loopback 放行
 *
 * @param input 鉴权输入（token 配置、环境、远端地址、Authorization 头、查询 token）
 * @returns 访问判定结果
 */
export function decideMetricsAccess(input: {
  metricsToken: string | undefined;
  isProduction: boolean;
  remoteAddress: string | undefined;
  authorizationHeader: string | undefined;
  queryToken: string | undefined;
}): MetricsAccessDecision {
  const token = input.metricsToken?.trim();
  if (!token) {
    if (!input.isProduction) return 'allow';
    return isLoopbackRemoteAddress(input.remoteAddress) ? 'allow' : 'not_found';
  }
  const bearer = input.authorizationHeader?.startsWith('Bearer ')
    ? input.authorizationHeader.slice(7)
    : '';
  const provided = bearer || (input.queryToken ?? '');
  return provided === token ? 'allow' : 'unauthorized';
}
