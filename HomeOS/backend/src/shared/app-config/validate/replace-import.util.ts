/**
 * 所属模块：backend/shared/app-config/validate
 * 职责：
 *  - 占位符语法校验（${ENV}/${secret.xxx}）；
 * 关键依赖：
 *  - zod custom；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { AppConfigData } from '../types';
import { DEFAULT_APP_CONFIG } from '../defaults';
import {
  AppConfigValidationError,
  type AppConfigFieldError,
} from './primitives.util';
import { validateAppConfigSection } from './sections.util';
import { validateAppConfigFull } from './core.util';
import { validateVoiceCommandsArray } from './lifestyle.util';

type SectionKey = keyof AppConfigData;

const ARRAY_SECTIONS = new Set<SectionKey>(['voiceCommands']);

function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      mergeDeep(target[key] as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
}

/** 全量替换导入：拒绝未知顶层分区，并按默认值合并后校验各分区全部字段 */
export function validateAppConfigReplaceImport(config: unknown): asserts config is AppConfigData {
  validateAppConfigFull(config);
  const errors: AppConfigFieldError[] = [];
  const input = config as unknown as Record<string, unknown>;
  const allowed = new Set(Object.keys(DEFAULT_APP_CONFIG));
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      errors.push({ section: key, key: '*', message: '未知配置分区' });
    }
  }
  if (errors.length) throw new AppConfigValidationError(errors);

  const merged = structuredClone(DEFAULT_APP_CONFIG) as unknown as Record<string, unknown>;
  mergeDeep(merged, input);

  for (const section of Object.keys(DEFAULT_APP_CONFIG) as SectionKey[]) {
    const val = merged[section];
    if (ARRAY_SECTIONS.has(section)) {
      if (!Array.isArray(val)) {
        errors.push({ section, key: '*', message: '分区须为数组' });
      } else if (section === 'voiceCommands') {
        validateVoiceCommandsArray(val, errors);
      }
      continue;
    }
    if (val == null || typeof val !== 'object' || Array.isArray(val)) {
      errors.push({ section, key: '*', message: '分区须为对象' });
      continue;
    }
    try {
      validateAppConfigSection(section, val as Record<string, unknown>);
    } catch (e) {
      if (e instanceof AppConfigValidationError) {
        errors.push(...e.fieldErrors);
      } else {
        throw e;
      }
    }
  }
  if (errors.length) throw new AppConfigValidationError(errors);
}
