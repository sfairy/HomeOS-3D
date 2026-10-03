/**
 * 所属模块：backend/shared/app-config/validate
 * 职责：
 *  - dev/staging/prod 档位校验；
 * 关键依赖：
 *  - zod；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { type AppConfigFieldError } from './primitives.util';

/** 新终端默认方案允许值：activeProfile（跟随当前激活方案）或 default */
const NEW_TERMINAL_DEFAULTS = new Set(['activeProfile', 'default']);

/** 校验 profiles 分区：activeProfileId 非空、newTerminalDefault 枚举、terminalBindings 结构 */
export function validateProfilesSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('activeProfileId' in partial) {
    if (typeof partial.activeProfileId !== 'string' || !String(partial.activeProfileId).trim()) {
      errors.push({ section, key: 'activeProfileId', message: '须为非空字符串' });
    }
  }

  if ('newTerminalDefault' in partial) {
    const val = String(partial.newTerminalDefault || '');
    if (!NEW_TERMINAL_DEFAULTS.has(val)) {
      errors.push({ section, key: 'newTerminalDefault', message: '须为 activeProfile 或 default' });
    }
  }

  if ('terminalBindings' in partial) {
    const bindings = partial.terminalBindings;
    if (!Array.isArray(bindings)) {
      errors.push({ section, key: 'terminalBindings', message: '须为数组' });
      return;
    }
    for (let i = 0; i < bindings.length; i++) {
      const item = bindings[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push({ section, key: 'terminalBindings', message: `第 ${i + 1} 项须为对象` });
        break;
      }
      const o = item as Record<string, unknown>;
      if (typeof o.clientId !== 'string' || !String(o.clientId).trim()) {
        errors.push({
          section,
          key: 'terminalBindings',
          message: `第 ${i + 1} 项 clientId 须为非空字符串`,
        });
        break;
      }
      if (typeof o.profileId !== 'string' || !String(o.profileId).trim()) {
        errors.push({
          section,
          key: 'terminalBindings',
          message: `第 ${i + 1} 项 profileId 须为非空字符串`,
        });
        break;
      }
      if ('label' in o && o.label != null && typeof o.label !== 'string') {
        errors.push({
          section,
          key: 'terminalBindings',
          message: `第 ${i + 1} 项 label 须为字符串`,
        });
        break;
      }
      if ('updatedAt' in o && o.updatedAt != null && typeof o.updatedAt !== 'string') {
        errors.push({
          section,
          key: 'terminalBindings',
          message: `第 ${i + 1} 项 updatedAt 须为 ISO 字符串`,
        });
        break;
      }
    }
  }
}
