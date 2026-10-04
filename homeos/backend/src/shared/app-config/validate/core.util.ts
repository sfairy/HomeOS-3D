/**
 * 配置校验入口：partial 局部更新校验与 full 全量替换校验。
 *
 * 关键依赖：./sections.util#validateAppConfigSection（分区分发）、./lifestyle.util#validateVoiceCommandsArray。
 */
import { badRequest } from '../../../common/utils/business-exception';
import type { AppConfigData, DeepPartialAppConfigData } from '../types';
import { API_ERROR } from '../../../common/errors/api-error-messages';
import type { AppConfigFieldError } from './primitives.util';
import { AppConfigValidationError } from './primitives.util';
import { validateAppConfigSection } from './sections.util';
import { validateVoiceCommandsArray } from './lifestyle.util';

type SectionKey = keyof AppConfigData;

/** 数组类型的配置分区（其余分区均为对象） */
const ARRAY_SECTIONS = new Set<SectionKey>(['voiceCommands']);

/** 校验 PUT /system/config 各分区 partial；context 为当前完整配置，用于跨字段一致性校验（可选） */
export function validateAppConfigPartial(
  partial: DeepPartialAppConfigData,
  context?: Record<string, unknown>,
): void {
  for (const section of Object.keys(partial) as SectionKey[]) {
    const val = partial[section];
    if (val == null) continue;
    if (ARRAY_SECTIONS.has(section)) {
      if (!Array.isArray(val)) {
        throw new AppConfigValidationError([{ section, key: '*', message: '分区须为数组' }]);
      }
      if (section === 'voiceCommands') {
        const errors: AppConfigFieldError[] = [];
        validateVoiceCommandsArray(val, errors);
        if (errors.length) throw new AppConfigValidationError(errors);
      }
      continue;
    }
    if (typeof val !== 'object' || Array.isArray(val)) {
      throw new AppConfigValidationError([{ section, key: '*', message: '分区须为对象' }]);
    }
    validateAppConfigSection(section, val as Record<string, unknown>, context);
  }
}

/** import replace 时校验完整配置结构 */
export function validateAppConfigFull(config: unknown): asserts config is AppConfigData {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    badRequest(API_ERROR.CONFIG_JSON_OBJECT_REQUIRED);
  }
  validateAppConfigPartial(config as Partial<AppConfigData>);
}
