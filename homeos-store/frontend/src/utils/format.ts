/** 展示格式化（与旧 `admin/format.ts` 同口径）。 */

import { formatCents } from "../money.js";

export const money = formatCents;

export function num(value: unknown): string {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return parsed.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function valueSize(value: unknown): string {
  const length = String(value ?? "").length;
  if (length > 13) return " stat__value--xs";
  if (length > 9) return " stat__value--sm";
  return "";
}

function parseUtc(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value).trim().replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const parsed = new Date(zoned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function localParts(value: unknown) {
  const date = parseUtc(value);
  if (date === null) return null;
  return {
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    minute: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}

export function dt(value: unknown): string {
  const parts = localParts(value);
  return parts ? `${parts.date} ${parts.time}` : "—";
}

export function d(value: unknown): string {
  const parts = localParts(value);
  return parts ? parts.date : "—";
}

export function localInput(value: unknown): string {
  const parts = localParts(value);
  return parts ? `${parts.date}T${parts.minute}` : "";
}

export function localZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "本地时区";
  } catch {
    return "本地时区";
  }
}

export function utcInput(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:00`
  );
}

export function dayStartUtc(value: unknown): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export function dayEndUtc(value: unknown): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 1);
  date.setMilliseconds(date.getMilliseconds() - 1);
  return date.toISOString();
}

const STATUS_TONES: Record<string, string> = {
  fulfilled: "success",
  paid: "success",
  active: "success",
  paid_out: "success",
  pending: "warning",
  cancelled: "muted",
  expired: "muted",
  refunded: "danger",
  rejected: "danger",
  payment_failed: "danger",
  fulfillment_failed: "danger",
  partially_refunded: "warning",
};

const TONE_HUES: Record<string, string> = {
  success: "is-tone-emerald",
  warning: "is-tone-amber",
  danger: "is-tone-danger",
  muted: "is-tone-slate",
};

/** 订单 / 授权状态 → `stat`/`funnel-item` 上的色相 class。 */
export const STATUS_HUES: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TONES).map(([status, tone]) => [status, TONE_HUES[tone] || "is-tone-slate"]),
);

export function statusTone(status: string | undefined | null): string {
  return STATUS_TONES[String(status || "")] || "muted";
}
