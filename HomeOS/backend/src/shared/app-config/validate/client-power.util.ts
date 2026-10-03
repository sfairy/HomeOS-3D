/**
 * @file client-power.util.ts
 * @module backend/src/shared/app-config/validate
 */
/** 应用配置校验：客户端功耗监测与充放电联动 */
import {
  numIn,
  requireBool,
  validateOptionalEntityId,
  type AppConfigFieldError,
} from './primitives.util';

/** 校验客户端功耗监测配置段（上报/超时/冷却间隔与客户端列表） */
export function validateClientPowerSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('enabled' in partial) requireBool(section, 'enabled', partial.enabled, errors);
  if ('reportIntervalSec' in partial)
    numIn(section, 'reportIntervalSec', partial.reportIntervalSec, 5, 600, errors);
  if ('staleTimeoutSec' in partial)
    numIn(section, 'staleTimeoutSec', partial.staleTimeoutSec, 60, 3600, errors);
  if ('cooldownMin' in partial) numIn(section, 'cooldownMin', partial.cooldownMin, 1, 120, errors);

  if ('clients' in partial) {
    const clients = partial.clients;
    if (!Array.isArray(clients)) {
      errors.push({ section, key: 'clients', message: '须为数组' });
    } else {
      for (let i = 0; i < clients.length; i++) {
        const item = clients[i];
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          errors.push({ section, key: 'clients', message: `第 ${i + 1} 项须为对象` });
          break;
        }
        const o = item as Record<string, unknown>;
        if (typeof o.id !== 'string' || !String(o.id).trim()) {
          errors.push({ section, key: 'clients', message: `第 ${i + 1} 项 id 须为非空字符串` });
          break;
        }
        if (typeof o.label !== 'string' || !String(o.label).trim()) {
          errors.push({ section, key: 'clients', message: `第 ${i + 1} 项 label 须为非空字符串` });
          break;
        }
        if ('enabled' in o) requireBool(section, 'clients', o.enabled, errors);
        if ('presenceWakeEnabled' in o)
          requireBool(section, 'clients', o.presenceWakeEnabled, errors);
        validateOptionalEntityId(section, 'clients', o.chargerSwitchEntityId, errors);
        const sc = o.selfCharge;
        if (sc != null) {
          if (typeof sc !== 'object' || Array.isArray(sc)) {
            errors.push({ section, key: 'clients', message: `第 ${i + 1} 项 selfCharge 须为对象` });
            break;
          }
          const s = sc as Record<string, unknown>;
          if ('enabled' in s) requireBool(section, 'clients', s.enabled, errors);
          if ('touEnabled' in s) requireBool(section, 'clients', s.touEnabled, errors);
          const low =
            'lowPercent' in s ? numIn(section, 'clients', s.lowPercent, 0, 100, errors) : null;
          const high =
            'highPercent' in s ? numIn(section, 'clients', s.highPercent, 0, 100, errors) : null;
          if (low != null && high != null && low >= high) {
            errors.push({
              section,
              key: 'clients',
              message: `第 ${i + 1} 项 lowPercent 须小于 highPercent`,
            });
            break;
          }
          const critical =
            'criticalPercent' in s
              ? numIn(section, 'clients', s.criticalPercent, 0, 100, errors)
              : null;
          if (critical != null && low != null && critical >= low) {
            errors.push({
              section,
              key: 'clients',
              message: `第 ${i + 1} 项 criticalPercent 须小于 lowPercent`,
            });
            break;
          }
        }
      }
    }
  }
}
