/**
 * @file devices-view-actions.internals.ts
 * @module frontend/src/features/device/composables
 */
/** /devices 列表：开关类设备服务名解析（纯函数） */

import { coverToggleService } from '@/shared/entity/utils/control/cover-control-core'

type DeviceToggleCommand =
  | { ok: true; domain: string; service: string }
  | { ok: false; reason: 'unknown-state' }

/**
 * 根据域与当前状态解析 toggle 要调用的 HA service。
 * cover 状态未知时返回失败；lock 解锁为高危（调用方需二次确认）。
 */
export function resolveDeviceToggleCommand(
  domain: string,
  state: string,
): DeviceToggleCommand {
  if (domain === 'cover') {
    const service = coverToggleService(state)
    if (!service) return { ok: false, reason: 'unknown-state' }
    return { ok: true, domain: 'cover', service }
  }
  if (domain === 'lock') {
    return {
      ok: true,
      domain: 'lock',
      service: state === 'unlocked' ? 'lock' : 'unlock',
    }
  }
  const onStates = new Set(['on', 'playing'])
  return {
    ok: true,
    domain,
    service: onStates.has(state) ? 'turn_off' : 'turn_on',
  }
}
