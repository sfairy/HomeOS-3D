/**
 * 展示格式化。
 */

import { esc } from "./dom.js?v=2609271508";

// 金额格式化的唯一实现在 apps/store/static/money.js（前台同源）：千分位 + 两位小数。
import { formatCents } from "../money.js?v=2609271508";

export const money = formatCents;

// 积分与计数：去掉浮点尾巴（0.1+0.2 那类），至多两位小数。
export function num(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

// 概览卡主数字的字号档位：卡宽下限 186px、内边距各 16px，可用 154px 决定三种字号
export function valueSize(value) {
  const length = String(value ?? '').length;
  if (length > 13) return ' stat__value--xs';
  if (length > 9) return ' stat__value--sm';
  return '';
}

// 后端 ISO 串（无时区标记）按 UTC 解析。带 Z / 偏移的串原样交给 Date。
function parseUtc(value) {
  if (!value) return null;
  const text = String(value).trim().replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const parsed = new Date(zoned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value) { return String(value).padStart(2, '0'); }

function localParts(value) {
  const date = parseUtc(value);
  if (date === null) return null;
  return {
    date: `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    time: `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
    minute: `${pad2(date.getHours())}:${pad2(date.getMinutes())}`,
  };
}

// 到秒。诊断与订单列表用它，排查时能对上日志时间。
export function dt(value) {
  const parts = localParts(value);
  return parts ? `${parts.date} ${parts.time}` : '—';
}

// 只到日期。到期时间、发布日期这类字段精确到秒只会挤占列宽，没有信息价值。
export function d(value) {
  const parts = localParts(value);
  return parts ? parts.date : '—';
}

// datetime-local 输入框要的是「本地时间、精确到分」。本地时区的偏移量随夏令时变化，
export function localInput(value) {
  const parts = localParts(value);
  return parts ? `${parts.date}T${parts.minute}` : '';
}

// 提交前把 datetime-local 的本地值转回 naive UTC ISO，与库内口径对齐。
export function utcInput(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:00`
  );
}

// 后台时间列统一标注一次「本地时区」，免得运营拿去和服务器日志对时间。
export function localZoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
  } catch (error) {
    return '本地时区';
  }
}

// 状态胶囊：柔和底色 + 同色文字 + 发光小点。
export function pill(text, tone = 'muted') {
  return `<span class="pill pill--${tone}">${esc(text)}</span>`;
}

// 订单/提现状态 → 语气。**这张表是唯一真值**：胶囊（下面 statusBadge）与
const STATUS_TONES = {
  fulfilled: 'success', paid: 'success', active: 'success', paid_out: 'success',
  pending: 'warning',
  cancelled: 'muted', expired: 'muted',
  refunded: 'danger', rejected: 'danger',
  // 这两种状态都是「钱/货卡在中间，必须人工介入」，与「已退款」同属需要盯的红色。
  payment_failed: 'danger', fulfillment_failed: 'danger',
  // 退过钱、但没退完（授权仍有效）。比「已退款」轻一档：订单还活着，
  partially_refunded: 'warning',
};

const TONE_HUES = {
  success: 'is-tone-emerald',
  warning: 'is-tone-amber',
  danger: 'is-tone-danger',
  muted: 'is-tone-slate',
};

// 中文文案由调用方传入（订单取接口下发的 ``statusLabel``，提现同理）：后台不再自存
export function statusBadge(status, label) {
  return pill(label || status, STATUS_TONES[status] || 'muted');
}

// 订单漏斗条的族色：由上面的语气表派生（单源，改一处两张表一起动）。
export const STATUS_HUES = Object.fromEntries(
  Object.entries(STATUS_TONES).map(([status, tone]) => [status, TONE_HUES[tone] || 'is-tone-slate'])
);

// 本地日期（YYYY-MM-DD）→ UTC ISO。
export function dayStartUtc(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function dayEndUtc(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + 1);
  date.setMilliseconds(date.getMilliseconds() - 1);
  return date.toISOString();
}
