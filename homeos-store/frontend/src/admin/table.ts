/** 表格与分页。 */

import { $, $$, esc } from "./dom.js";
import { api } from "./api.js";
import { num } from "./format.js";
import { host } from "./host.js";

type PageCursor = {
  limit: number;
  offset: number;
  total: number;
  seq: number;
};

type LatestEntry = {
  seq: number;
  promise: Promise<unknown>;
};


export const PENDING_FILTER_VALUES = new Map<string, string>();


export function actions(...buttons: Array<string | false | null | undefined>) {
  return `<div class="row-actions">${buttons.filter(Boolean).join('')}</div>`;
}


export function rowMenu(title: string, ...items: Array<string | false | null | undefined>) {
  const body = items.filter(Boolean).join('');
  if (!body) return '';
  return `<div class="menu">
      <button type="button" class="hb-button hb-button--secondary hb-button--sm menu__toggle" data-menu-toggle aria-haspopup="menu" aria-label="${esc(title)}">⋯</button>
      <div class="menu__pop" popover="manual" hidden>${body}</div>
    </div>`;
}

export function menuItem(
  label: string,
  attrs: string,
  { danger = false }: { danger?: boolean } = {},
) {
  return `<button type="button" class="menu__item${danger ? ' is-danger' : ''}" ${attrs}>${esc(label)}</button>`;
}

export function menuNote(text: string) {
  return `<p class="menu__note">${esc(text)}</p>`;
}


export function cell(value: unknown) {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  if (text === '—') return '—';
  return `<span title="${esc(text)}">${esc(text)}</span>`;
}

const paging: Record<string, PageCursor> = {};

const latestRequest: Record<string, LatestEntry> = {};

const PAGE_SIZE = 50;

export function pageState(key: string): PageCursor {
  if (!paging[key]) paging[key] = { limit: PAGE_SIZE, offset: 0, total: 0, seq: 0 };
  return paging[key]!;
}


const PAGED_TABLES: Record<string, string> = {
  products: '#product-rows',
  orders: '#order-rows',
  licenses: '#license-rows',
  entitlements: '#entitlement-rows',
  bindings: '#binding-rows',
  coupons: '#coupon-rows',
  withdrawals: '#withdrawal-rows',
  accounts: '#account-rows',
  audits: '#audit-rows',
  ledger: '#ledger-rows',
  customers: '#customer-rows',
  sessions: '#session-rows',
  'license-sessions': '#license-session-rows',
  'recovery-tokens': '#recovery-token-rows',
  'login-attempts': '#attempt-rows',
  'email-verifications': '#verification-rows',
  'device-release-events': '#release-event-rows',
  'coupon-redemptions': '#redemption-rows',
};


function tableSpan(tbody: HTMLElement) {
  const table = tbody.closest('table');
  return table ? table.querySelectorAll('thead th').length : 1;
}

function setTableState(key: string, state: 'loading' | 'ready' | 'error', message = '') {
  const selector = PAGED_TABLES[key];
  const tbody = selector ? $(selector) : null;
  if (!tbody) return;
  const wrap = tbody.closest('.table-wrap');
  if (wrap) wrap.classList.toggle('is-busy', state === 'loading');
  if (state === 'ready') return;
  if (state === 'loading') {
    tbody.innerHTML = `<tr><td colspan="${tableSpan(tbody)}"><div class="table-state is-loading">` +
      `<span class="table-state__spinner" aria-hidden="true"></span>正在读取…</div></td></tr>`;
  } else if (state === 'error') {
    tbody.innerHTML = `<tr><td colspan="${tableSpan(tbody)}"><div class="table-state is-error">` +
      `<i class="fa-duotone fa-regular fa-triangle-exclamation"></i>` +
      `<div class="table-state__text"><strong>读取出错</strong><small>${esc(message || '请稍后重试')}</small></div>` +
      `<button class="hb-button hb-button--secondary hb-button--sm" data-retry="${esc(key)}">重试</button>` +
      `</div></td></tr>`;
  }
}

export async function pagedFetch(
  key: string,
  path: string,
  params: Record<string, string> = {},
) {
  const cursor = pageState(key);
  const query = new URLSearchParams({
    ...params,
    limit: String(cursor.limit),
    offset: String(cursor.offset),
  });
  const seq = ++cursor.seq;
  const run = async () => {

    setTableState(key, 'loading');
    let data: { total?: unknown; limit?: unknown; offset?: unknown; [key: string]: unknown };
    try {
      data = (await api(`${path}?${query.toString()}`)) as typeof data;
    } catch (error) {
      if (seq === cursor.seq) {
        const message = error instanceof Error ? error.message : '请稍后重试';
        setTableState(key, 'error', message);
        throw error;
      }


      return null;
    }

    if (seq !== cursor.seq) return null;
    setTableState(key, 'ready');
    cursor.total = Number(data.total || 0);
    cursor.limit = Number(data.limit || cursor.limit);
    cursor.offset = Number(data.offset || 0);
    return data;
  };
  latestRequest[key] = { seq, promise: run() };
  let entry = latestRequest[key]!;
  let data = await entry.promise;

  while (latestRequest[key] && latestRequest[key]!.seq !== entry.seq) {
    entry = latestRequest[key]!;
    data = await entry.promise;
  }
  return data;
}


export function resetPage(key: string) {
  pageState(key).offset = 0;
}


function atLastPage(key: string) {
  const cursor = pageState(key);
  return cursor.offset + cursor.limit >= cursor.total;
}

export function renderPager(key: string) {
  const cursor = pageState(key);
  const from = cursor.total === 0 ? 0 : cursor.offset + 1;
  const to = Math.min(cursor.offset + cursor.limit, cursor.total);
  const page = Math.floor(cursor.offset / cursor.limit) + 1;
  const pages = Math.max(1, Math.ceil(cursor.total / cursor.limit));
  const last = pages === 1 ? 0 : (pages - 1) * cursor.limit;
  $$(`[data-pager="${key}"]`).forEach((box) => {
    box.innerHTML = `
      <span class="admin-pager__info">第 ${page}/${pages} 页 · 显示 ${from}–${to} / 共 ${num(cursor.total)} 条</span>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="first" ${cursor.offset <= 0 ? 'disabled' : ''}>首页</button>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="prev" ${cursor.offset <= 0 ? 'disabled' : ''}>上一页</button>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="next" ${atLastPage(key) ? 'disabled' : ''}>下一页</button>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="last" ${last === 0 || atLastPage(key) ? 'disabled' : ''}>末页</button>`;
  });
}

export function bindFilters(entries: Array<[string, string]>) {
  entries.forEach(([selector, key]) => {
    const node = $(selector) as HTMLInputElement | HTMLSelectElement | null;
    const loader = host.PAGED_LOADERS?.[key];
    if (!node || !loader) return;
    const event =
      ('type' in node && node.type === 'checkbox') || node.tagName === 'SELECT'
        ? 'change'
        : 'input';
    node.addEventListener(event, () => {
      resetPage(key);
      loader();
    });

    if (event === 'input') {
      node.addEventListener('keydown', (event_) => {
        if (!(event_ instanceof KeyboardEvent)) return;
        if (event_.key === 'Enter') {
          event_.preventDefault();
          resetPage(key);
          loader();
        }
      });
    }
  });
}


export function resetFilters(selectors: string[], key: string) {
  selectors.forEach((selector) => {
    const node = $(selector) as HTMLInputElement | HTMLSelectElement | null;
    if (!node) return;
    if ('type' in node && node.type === 'checkbox') {
      (node as HTMLInputElement).checked = false;
    } else {
      node.value = '';
    }
    PENDING_FILTER_VALUES.delete(selector);
  });
  resetPage(key);
  host.PAGED_LOADERS?.[key]?.();
}

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const retry = target.closest<HTMLElement>('[data-retry]');
  if (retry) {
    const loader = host.PAGED_LOADERS?.[retry.dataset.retry || ''];
    if (loader) await loader();
    return;
  }
  const page = target.closest<HTMLElement>('[data-page]');
  if (!page) return;
  const key = page.dataset.page || '';
  const loader = host.PAGED_LOADERS?.[key];
  if (!loader) return;
  const cursor = pageState(key);
  const dir = page.dataset.pageDir;
  if (dir === 'first') cursor.offset = 0;
  else if (dir === 'prev') cursor.offset = Math.max(0, cursor.offset - cursor.limit);
  else if (dir === 'last') {
    cursor.offset = Math.max(
      0,
      (Math.ceil(cursor.total / cursor.limit) - 1) * cursor.limit,
    );
  } else cursor.offset += cursor.limit;
  await loader();
});
