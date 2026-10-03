/**
 * 安防模式标签解析共享工具：首页与安防页共用。
 * 自定义名称优先，未配置时回退内置中文标签。
 */
import { entityStateLabel } from '@/constants/entity-state-labels'

interface SecurityModeCfg {
  key: string
  name?: string
}

/** resolveSecurityModeLabel：函数，按签名入参返回处理结果。 */
export function resolveSecurityModeLabel(
  mode: string | null | undefined,
  modesCfg?: SecurityModeCfg[] | null,
): string {
  if (!mode) return '未知'
  const hit = modesCfg?.find((m) => m.key === mode)
  if (hit?.name) return hit.name
  return entityStateLabel(mode) || '未知'
}
