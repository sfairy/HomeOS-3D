/**
 * Frigate 告警联动布防模式解析。
 *
 * 从 security-panel.internals 迁出，避免 frigate ↔ panel 循环依赖。
 */
import type { SecurityArmingMode } from '@homeos/shared';

/**
 * 解析 `security.frigateAlarmModes` 配置（逗号分隔）。
 * - 空 / `none` → 不联动告警
 * - 默认 `armed_away,armed_night`
 */
export function parseFrigateAlarmModes(raw: string | undefined): SecurityArmingMode[] {
  const text = (raw || 'armed_away,armed_night').trim();
  if (!text || text === 'none') return [];
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as SecurityArmingMode[];
}
