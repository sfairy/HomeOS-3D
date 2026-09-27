/**
 * 返利台账与客户。
 */

import { $, emptyRow, esc, toast } from "../dom.js";
import { cell, pageState, pagedFetch, renderPager } from "../table.js";
import { d, dt, num } from "../format.js";
import { state } from "../state.js";
import { openAdjustDialog } from "../dialogs.js";

type LedgerKind = { value: string; label: string };

type LedgerEntry = {
  createdAt?: string;
  accountEmail?: string;
  accountId?: string;
  kind?: string;
  delta?: unknown;
  frozenDelta?: unknown;
  balanceAfter?: unknown;
  note?: string;
  reference?: string;
};

type Customer = {
  email?: string;
  name?: string;
  orderCount?: unknown;
  licenseCount?: unknown;
  createdAt?: string;
};

type AccountRow = { id?: string; email?: string; [key: string]: unknown };

// 积分流水类型：**由接口下发**（`/referral-ledger` 响应里的 `kinds`），这里只作缓存。
let LEDGER_KIND: Record<string, string> = {};

// 下拉是否已经按后端词表填过：只填一次，之后刷新列表不再重建 DOM（会丢掉当前选中项）。
let ledgerKindOptionsApplied = false;

/**
 * 用后端下发的词表填筛选下拉并刷新标签映射。
 */
function applyLedgerKinds(kinds: unknown) {
  if (!Array.isArray(kinds) || !kinds.length) return;
  const typed = kinds as LedgerKind[];
  LEDGER_KIND = Object.fromEntries(typed.map((item) => [item.value, item.label]));
  if (ledgerKindOptionsApplied) return;
  const select = $('#ledger-kind') as HTMLSelectElement | null;
  if (!select) return;
  const current = select.value;
  for (const item of typed) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  }
  select.value = current;
  ledgerKindOptionsApplied = true;
}

export async function loadLedger() {
  const cursor = pageState('ledger');
  const params: Record<string, string> = {};
  const accountId = (($('#ledger-account') as HTMLInputElement | null)?.value || '').trim();
  const kind = ($('#ledger-kind') as HTMLSelectElement | null)?.value || '';
  if (accountId) params.account_id = accountId;
  if (kind) params.kind = kind;
  let data: {
    kinds?: unknown;
    items?: LedgerEntry[];
  } | null;
  try {
    data = (await pagedFetch('ledger', '/referral-ledger', params)) as typeof data;
  } catch (error) {
    toast(error instanceof Error ? error.message : '读取失败', 'danger');
    return;
  }
  if (!data) return;
  applyLedgerKinds(data.kinds);
  const rows = $('#ledger-rows');
  if (rows) {
    const items = data.items || [];
    rows.innerHTML = items.length
      ? items
          .map(
            (entry) => `
    <tr>
      <td class="nowrap">${dt(entry.createdAt)}</td>
      <td>${cell(entry.accountEmail || entry.accountId)}</td>
      <td class="nowrap">${esc(LEDGER_KIND[entry.kind || ''] || entry.kind)}</td>
      <td class="nowrap ${Number(entry.delta) < 0 ? 'is-negative' : ''}">${esc(entry.delta)}</td>
      <td class="nowrap">${esc(entry.frozenDelta)}</td>
      <td class="nowrap">${esc(entry.balanceAfter)}</td>
      <td>${cell(entry.note || entry.reference || '—')}</td>
    </tr>`,
          )
          .join('')
      : emptyRow(7, cursor.offset > 0 ? '本页无数据' : '暂无积分流水');
  }
  renderPager('ledger');
}

$('#ledger-refresh')?.addEventListener('click', () => {
  pageState('ledger').offset = 0;
  loadLedger();
});

$('#ledger-search')?.addEventListener('click', () => {
  pageState('ledger').offset = 0;
  loadLedger();
});

$('#ledger-adjust')?.addEventListener('click', () => {
  const accountId = (($('#ledger-account') as HTMLInputElement | null)?.value || '').trim();
  if (!accountId) {
    return toast(
      '请先在左侧填入账号 ID，或从「账号」页的『人工调账』进入。',
      'warning',
    );
  }
  const account = (state.accounts as AccountRow[]).find((item) => item.id === accountId);
  openAdjustDialog(accountId, account ? account.email : accountId);
});

// --------------------------------------------------------------------------- //
// 客户档案
// --------------------------------------------------------------------------- //
export async function loadCustomers() {
  const cursor = pageState('customers');
  const keyword = (($('#customer-keyword') as HTMLInputElement | null)?.value || '').trim();
  let data: { items?: Customer[] } | null;
  try {
    data = (await pagedFetch(
      'customers',
      '/customers',
      keyword ? { keyword } : {},
    )) as typeof data;
  } catch (error) {
    toast(error instanceof Error ? error.message : '读取失败', 'danger');
    return;
  }
  if (!data) return;
  const rows = $('#customer-rows');
  if (rows) {
    const items = data.items || [];
    rows.innerHTML = items.length
      ? items
          .map(
            (customer) => `
    <tr>
      <td>${cell(customer.email)}</td>
      <td>${cell(customer.name)}</td>
      <td class="nowrap">${num(customer.orderCount)}</td>
      <td class="nowrap">${num(customer.licenseCount)}</td>
      <td class="nowrap">${d(customer.createdAt)}</td>
    </tr>`,
          )
          .join('')
      : emptyRow(5, cursor.offset > 0 ? '本页无数据' : '暂无客户档案');
  }
  renderPager('customers');
}

$('#customer-refresh')?.addEventListener('click', () => {
  pageState('customers').offset = 0;
  loadCustomers();
});

$('#customer-search')?.addEventListener('click', () => {
  pageState('customers').offset = 0;
  loadCustomers();
});
