/**
 * @file primitives.util.ts
 * @module backend/src/shared/app-config/validate
 */
/**
 * 配置校验原子工具：字段错误类型、校验异常类与数值/布尔/实体 ID 等基础校验函数。
 *
 * 被 sections.util 分发的各分区校验函数复用，统一收集 AppConfigFieldError 后由
 * 调用方抛出 AppConfigValidationError（BadRequestException 子类）。
 * 关键依赖：@nestjs/common#BadRequestException。
 */
import { BadRequestException } from '@nestjs/common';

/** 配置字段错误：记录分区、键与中文错误消息，汇总后由 AppConfigValidationError 抛出 */
export type AppConfigFieldError = { section: string; key: string; message: string };

/** 配置校验异常：携带字段级错误数组，序列化为 BadRequestException 响应体 */
export class AppConfigValidationError extends BadRequestException {
  constructor(public readonly fieldErrors: AppConfigFieldError[]) {
    const summary = fieldErrors.map((e) => `${e.section}.${e.key}: ${e.message}`).join('; ');
    super({ message: summary, fieldErrors });
  }
}

/**
 * 校验数值字段：必须为有限数且在 [min, max] 区间内。
 * 非法时 push 错误并返回 null，合法时返回原值。
 */
export function numIn(
  section: string,
  key: string,
  val: unknown,
  min: number,
  max?: number,
  errors: AppConfigFieldError[] = [],
): number | null {
  if (typeof val !== 'number' || !Number.isFinite(val)) {
    errors.push({ section, key, message: '必须为数字' });
    return null;
  }
  if (val < min || (max != null && val > max)) {
    errors.push({ section, key, message: max != null ? `须在 ${min}–${max} 之间` : `须 ≥ ${min}` });
    return null;
  }
  return val;
}

/** 校验布尔字段：非布尔值时 push 错误并返回 null */
export function requireBool(
  section: string,
  key: string,
  val: unknown,
  errors: AppConfigFieldError[],
): boolean | null {
  if (typeof val !== 'boolean') {
    errors.push({ section, key, message: '必须为布尔值' });
    return null;
  }
  return val;
}

/** HA entity_id 格式正则：domain.aaa_bb0 形式 */
const ENTITY_ID_RE = /^[a-z_]+\.[a-z0-9_]+$/i;

/** 判断值是否为合法 HA entity_id（domain.aaa_bb0 形式） */
export function isEntityId(val: unknown): boolean {
  return typeof val === 'string' && ENTITY_ID_RE.test(val.trim());
}

/** 校验可选 entity_id：留空跳过，非空时须为合法 entity_id */
export function validateOptionalEntityId(
  section: string,
  key: string,
  val: unknown,
  errors: AppConfigFieldError[],
): void {
  if (val == null || val === '') return;
  if (!isEntityId(val)) {
    errors.push({ section, key, message: '须为有效 entity_id 或留空' });
  }
}

/** 校验 entity_id 列表：须为非空字符串数组，每项须为合法 entity_id */
export function validateEntityIdList(
  section: string,
  key: string,
  val: unknown,
  errors: AppConfigFieldError[],
): void {
  if (!Array.isArray(val)) {
    errors.push({ section, key, message: '须为字符串数组' });
    return;
  }
  for (const id of val) {
    if (typeof id !== 'string' || !id.trim() || !isEntityId(id)) {
      errors.push({ section, key, message: '每项须为有效 entity_id' });
      break;
    }
  }
}
