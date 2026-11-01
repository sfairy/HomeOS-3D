/** 授权修正表单 → PATCH body 的纯函数实现（与组件解耦，便于单测与复杂度控制）。 */

import { utcInput } from "@store/features/admin/utils/format";

export interface LicensePatchInput {
  userLabel: string;
  extendDays: string;
  accessExpiresAt: string;
  permanent: boolean;
  validityDays: string;
}

export type LicensePatchResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; message: string };

export const MIXED_EXPIRY_MESSAGE = "「续期天数」「新的到期时间 / 永久有效」「有效天数」只能选一种。";
export const EXTEND_DAYS_MESSAGE = "续期天数必须是不小于 1 的整数。";
export const VALIDITY_DAYS_MESSAGE = "有效天数必须是不小于 1 的整数。";
export const EXPIRES_AT_MESSAGE = "新的到期时间无法解析，请重新选择。";

/** 解析「天数」输入：留空返回 ``null``，非法返回 ``undefined``（调用方据此报错）。 */
export function parseDaysInput(raw: string): number | null | undefined {
  const text = raw.trim();
  if (!text) return null;
  const days = Number(text);
  if (!Number.isFinite(days) || !Number.isInteger(days) || days < 1) return undefined;
  return days;
}

/** 到期口径：``undefined`` = 本次不改，``null`` = 改为永久有效，字符串 = 绝对时间。 */
type ExpiryResolution = { value?: string | null; error?: string };

function resolveAccessExpiresAt(input: LicensePatchInput): ExpiryResolution {
  if (input.permanent) return { value: null };
  if (!input.accessExpiresAt) return {};
  const iso = utcInput(input.accessExpiresAt);
  return iso ? { value: iso } : { error: EXPIRES_AT_MESSAGE };
}

export function buildLicensePatch(input: LicensePatchInput): LicensePatchResult {
  // 三种到期口径互斥（后端会按「绝对时间 → 顺延 → 有效天数」的顺序互相覆盖，
  // 同时提交不会报错，只会有一条被静默丢弃）。
  const modes = [
    Boolean(input.extendDays.trim()),
    Boolean(input.accessExpiresAt) || input.permanent,
    Boolean(input.validityDays.trim()),
  ].filter(Boolean).length;
  if (modes > 1) return { ok: false, message: MIXED_EXPIRY_MESSAGE };

  const payload: Record<string, unknown> = { userLabel: input.userLabel.trim() };

  const extendDays = parseDaysInput(input.extendDays);
  if (extendDays === undefined) return { ok: false, message: EXTEND_DAYS_MESSAGE };
  if (extendDays !== null) payload.extendDays = extendDays;

  const expiry = resolveAccessExpiresAt(input);
  if (expiry.error) return { ok: false, message: expiry.error };
  if (expiry.value !== undefined) payload.accessExpiresAt = expiry.value;

  const validityDays = parseDaysInput(input.validityDays);
  if (validityDays === undefined) return { ok: false, message: VALIDITY_DAYS_MESSAGE };
  if (validityDays !== null) payload.validityDays = validityDays;

  return { ok: true, payload };
}
