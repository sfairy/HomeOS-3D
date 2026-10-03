/**
 * 编排器 geek 图字段写入规范（automation / script 共用）。
 *
 * 所属模块：backend/src/shared/orchestrator
 * 职责：create/update 前将 payload 中的 Json 图字段规范为 Prisma.DbNull 或 InputJson。
 */
import { Prisma } from '../../generated/prisma/client';
import { toInputJson } from '../../common/utils/json-field.util';

/**
 * 写入前规范 Json 图字段（null 清空；对象写入 Json）。
 * @param payload 待写入的 create/update 载荷（会被就地修改）
 * @param field 字段名，默认 geekGraph；场景可用 geekSceneGraph
 */
export function normalizeGeekGraphInput(
  payload: Record<string, unknown>,
  field: string = 'geekGraph',
): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(payload, field)) return payload;
  const raw = payload[field];
  if (raw == null) {
    payload[field] = Prisma.DbNull;
    return payload;
  }
  payload[field] = toInputJson(raw, {});
  return payload;
}
