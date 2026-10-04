/**
 * 职责：
 *  - 保留策略配置 zod 校验；
 * 关键依赖：
 *  - zod；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import { numIn, type AppConfigFieldError } from './primitives.util';
import {
  RETENTION_DAYS_MAX,
  RETENTION_DAYS_MIN,
  RETENTION_TABLE_KEYS,
} from '../../../common/database/retention-tables';

/** 校验各数据表的保留天数（按 RETENTION_TABLE_KEYS 逐项限幅） */
export function validateRetentionSection(
  section: string,
  partial: Record<string, unknown>,
  errors: AppConfigFieldError[],
): void {
  for (const key of RETENTION_TABLE_KEYS) {
    if (key in partial) {
      numIn(section, key, partial[key], RETENTION_DAYS_MIN, RETENTION_DAYS_MAX, errors);
    }
  }
}
