/** 展示格式化。 */

import { esc } from './dom.js';


import { formatCents } from '../money.js';

export const money = formatCents;


export function num(value: unknown) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return '0';
  return parsed.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}


export function valueSize(value: unknown) {
  const length = String(value ?? '').length;
  if (length > 13) return ' stat__value--xs';
  if (length > 9) return ' stat__value--sm';
  return '';
}


function parseUtc(value: unknown): Date | null {
  if (!value) return null;
  const text = String(value).trim().replace(' ', 'T');
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const parsed = new Date(zoned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
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


export function dt(value: unknown) {
  const parts = localParts(value);
  return parts ? `${parts.date} ${parts.time}` : '—';
}


export function d(value: unknown) {
  const parts = localParts(value);
  return parts ? parts.date : '—';
}


export function localInput(value: unknown) {
  const parts = localParts(value);
  return parts ? `${parts.date}T${parts.minute}` : '';
}


export function utcInput(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return (
    `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:00`
  );
}


export function localZoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '本地时区';
  } catch {
    return '本地时区';
  }
}


export function pill(text: unknown, tone = 'muted') {
  return `<span class="pill pill--${tone}">${esc(text)}</span>`;
}


const STATUS_TONES: Record<string, string> = {
  fulfilled: 'success',
  paid: 'success',
  active: 'success',
  paid_out: 'success',
  pending: 'warning',
  cancelled: 'muted',
  expired: 'muted',
  refunded: 'danger',
  rejected: 'danger',

  payment_failed: 'danger',
  fulfillment_failed: 'danger',

  partially_refunded: 'warning',
};

const TONE_HUES: Record<string, string> = {
  success: 'is-tone-emerald',
  warning: 'is-tone-amber',
  danger: 'is-tone-danger',
  muted: 'is-tone-slate',
};


export function statusBadge(status: string, label?: string) {
  return pill(label || status, STATUS_TONES[status] || 'muted');
}


export const STATUS_HUES = Object.fromEntries(
  Object.entries(STATUS_TONES).map(([status, tone]) => [
    status,
    TONE_HUES[tone] || 'is-tone-slate',
  ]),
);


export function dayStartUtc(value: unknown) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function dayEndUtc(value: unknown) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + 1);
  date.setMilliseconds(date.getMilliseconds() - 1);
  return date.toISOString();
}
