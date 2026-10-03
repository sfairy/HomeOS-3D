/**
 * 所属模块：backend/common/utils
 * 职责：
 *  - 实体 JSON 列（Prisma Json / JsonB）安全读写与路径寻址（parseJsonArray / readJsonObject / toInputJson）；
 * 关键依赖：
 *  - Prisma 生成类型（Prisma.InputJsonValue）；
 * 约定：
 *  - 非法/缺失输入一律降级为安全默认值（[] / {} / null），绝不抛出；
 *  - 不修改入参对象，返回值为新引用。
 */

import type { Prisma } from '../../generated/prisma/client';

/** 将任意值规范为 JSON 数组（非数组 → []） */
export function parseJsonArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}


/** 将任意值规范为可写入 Prisma Json 的值；非法则 fallback */
export function toInputJson(
  value: unknown,
  fallback: Prisma.InputJsonValue = {},
): Prisma.InputJsonValue {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return fallback;
    try {
      return JSON.parse(t) as Prisma.InputJsonValue;
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') return value as Prisma.InputJsonValue;
  return fallback;
}

/** 读出对象（JSONB 对象直通；非对象 → fallback） */
export function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> {
  if (value == null) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return fallback;
}

/** 读出数组（JSONB 数组直通；非数组 → fallback） */
export function readJsonArray<T = unknown>(value: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(value)) return value as T[];
  return fallback;
}
