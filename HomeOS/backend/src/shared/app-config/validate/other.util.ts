/**
 * 所属模块：backend/shared/app-config/validate
 * 职责：
 *  - 杂项次级配置 zod 校验；
 * 关键依赖：
 *  - zod；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { numIn, requireBool, type AppConfigFieldError } from './primitives.util';

/** 校验杂项配置段（事件保留天数、冷却时长、访客通行等数值与布尔字段） */
export function validateOtherSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  if ('eventlogRetentionDays' in partial)
    numIn(section, 'eventlogRetentionDays', partial.eventlogRetentionDays, 1, 365, errors);
  if ('haHistoryCacheMin' in partial)
    numIn(section, 'haHistoryCacheMin', partial.haHistoryCacheMin, 1, 1440, errors);
  if ('speakCooldownMin' in partial)
    numIn(section, 'speakCooldownMin', partial.speakCooldownMin, 0, 1440, errors);
  if ('tipCooldownHours' in partial)
    numIn(section, 'tipCooldownHours', partial.tipCooldownHours, 0, 72, errors);
  if ('guestPassDefaultHours' in partial)
    numIn(section, 'guestPassDefaultHours', partial.guestPassDefaultHours, 1, 168, errors);
  if ('guestPassExtendHours' in partial)
    numIn(section, 'guestPassExtendHours', partial.guestPassExtendHours, 1, 168, errors);
  if ('guestPassRevokeOnAway' in partial)
    requireBool(section, 'guestPassRevokeOnAway', partial.guestPassRevokeOnAway, errors);
  if ('advisorTipActions' in partial && partial.advisorTipActions != null) {
    const aa = partial.advisorTipActions;
    if (typeof aa !== 'object' || Array.isArray(aa)) {
      errors.push({ section, key: 'advisorTipActions', message: '须为对象' });
    } else {
      for (const [cat, val] of Object.entries(aa)) {
        if (!cat.trim()) {
          errors.push({ section, key: 'advisorTipActions', message: '分类键须为非空字符串' });
          break;
        }
        if (!val || typeof val !== 'object' || Array.isArray(val)) {
          errors.push({
            section,
            key: 'advisorTipActions',
            message: `「${cat}」须为 { type, id } 对象`,
          });
          break;
        }
        const o = val as Record<string, unknown>;
        if (o.type !== 'home_mode' && o.type !== 'scene') {
          errors.push({
            section,
            key: 'advisorTipActions',
            message: `「${cat}」type 须为 home_mode 或 scene`,
          });
          break;
        }
        if (typeof o.id !== 'string' || !String(o.id).trim()) {
          errors.push({
            section,
            key: 'advisorTipActions',
            message: `「${cat}」id 须为非空字符串`,
          });
          break;
        }
      }
    }
  }
}
