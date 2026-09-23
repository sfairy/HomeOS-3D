/**
 * 展示格式化。
 *
 * 金额与点数、时间（本地/UTC 互转）、状态胶囊与日期边界。
 *
 * 金额/点数/时间的展示口径。时间一律按本地时区渲染、按 UTC 提交，换算只在这里做。
 */

import { esc } from "./dom.js?v=2609231046";

// 金额格式化的唯一实现在 store/static/money.js（前台同源）：千分位 + 两位小数。
// 这里只是短名绑定，不是第二份实现；积分与计数另有口径，走 num()。
export const money = HBMoney.formatCents;

// 积分与计数：去掉浮点尾巴（0.1+0.2 那类），至多两位小数。
export function num(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

// 概览卡主数字的字号档位：卡宽下限 186px、内边距各 16px，可用 154px 决定三种字号
// 各能放多少字符（见 admin.css 的 .stat .stat__value--*）；值都是数字/斜杠，
// 按字符数降档足够准，超长交给 text-overflow 省略。
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
// 不能拿固定小时数去加减，所以统一走 Date 换算。
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
// 实心色块在暗色底上又亮又散，一屏里几十个徽标会把视线拉走。
export function pill(text, tone = 'muted') {
  return `<span class="pill pill--${tone}">${esc(text)}</span>`;
}

// 订单/提现状态 → 语气。**这张表是唯一真值**：胶囊（下面 statusBadge）与
// 订单漏斗条的族色（下面 STATUS_HUES）都从它派生。过去两张表各存一份，
// 于是同一个 paid 在订单表里是薄荷、在漏斗里是琥珀 —— 两个控件在讲同一个状态，
// 却给出互相矛盾的结论，运维读哪张全凭先看见哪张。
const STATUS_TONES = {
  fulfilled: 'success', paid: 'success', active: 'success', paid_out: 'success',
  pending: 'warning',
  cancelled: 'muted', expired: 'muted',
  refunded: 'danger', rejected: 'danger',
  // 这两种状态都是「钱/货卡在中间，必须人工介入」，与「已退款」同属需要盯的红色。
  payment_failed: 'danger', fulfillment_failed: 'danger',
  // 退过钱、但没退完（授权仍有效）。比「已退款」轻一档：订单还活着，
  // 还能再退第二次，所以给 warning 而不是 danger。
  partially_refunded: 'warning',
};

// 语气 → 族色类（admin.css 的 .is-tone-*）。语气只有四种，所以漏斗条最多四种色相：
// 同一段里「漏掉的」那几个状态仍由计数与条长区分，不需要第五种颜色。
const TONE_HUES = {
  success: 'is-tone-emerald',
  warning: 'is-tone-amber',
  danger: 'is-tone-danger',
  muted: 'is-tone-slate',
};

// 中文文案由调用方传入（订单取接口下发的 ``statusLabel``，提现同理）：后台不再自存
// 「状态 → 中文」的第二份词表。自存那份与 store/commerce/order_status.py 只靠注释约定
// 「逐字对齐」，漏一个键就静默显示成 snake_case —— partially_refunded 曾经就是这样。
export function statusBadge(status, label) {
  return pill(label || status, STATUS_TONES[status] || 'muted');
}

// 订单漏斗条的族色：由上面的语气表派生（单源，改一处两张表一起动）。
// 未知状态不给类，走域色 —— 但 STATUS_TONES 没收录的状态本就该先在服务端补词表，
// 这里只是不让它把漏斗整条染成灰。
export const STATUS_HUES = Object.fromEntries(
  Object.entries(STATUS_TONES).map(([status, tone]) => [status, TONE_HUES[tone] || 'is-tone-slate'])
);

// 本地日期（YYYY-MM-DD）→ UTC ISO。
// 时间区间按**本地日历**选的，直接当 UTC 发会在东八区偏 8 小时，出现「筛今天却查不到
// 今天下午的单」。边界都含当天：起点当日 00:00:00、终点次日 00:00:00 前一秒。
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
