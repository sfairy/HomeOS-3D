/**
 * 返利台账与客户。
 *
 * 返利流水的按类型筛选，以及客户维度的汇总列表。
 */

import { $, emptyRow, esc, toast } from "../dom.js?v=2609251458";
import { cell, pageState, pagedFetch, renderPager } from "../table.js?v=2609251458";
import { d, dt, num } from "../format.js?v=2609251458";
import { state } from "../state.js?v=2609251458";
import { openAdjustDialog } from "../dialogs.js?v=2609251458";

// 积分流水类型：**由接口下发**（`/referral-ledger` 响应里的 `kinds`），这里只作缓存。
// 后台不再自存词表 —— 自存的那份 6 个键里只有 manual_adjust 与后端对得上，而筛选是精确
// 等值匹配，选任何一项都返回空列表；列表也会把 5 类真实流水显示成英文。
// 取值与中文名的唯一出处是 store/commerce/referrals.py 的 LEDGER_KIND_LABELS。
let LEDGER_KIND = {};

// 下拉是否已经按后端词表填过：只填一次，之后刷新列表不再重建 DOM（会丢掉当前选中项）。
let ledgerKindOptionsApplied = false;

/**
 * 用后端下发的词表填筛选下拉并刷新标签映射。
 *
 * 只填一次：刷新列表时重建选项会把用户当前选中的类型重置回「全部类型」。
 * 服务端没下发 kinds（老版本）时保留空表 —— 标签会退回显示原始 kind 值，
 * 好过显示一个错的。
 */
function applyLedgerKinds(kinds) {
  if (!Array.isArray(kinds) || !kinds.length) return;
  LEDGER_KIND = Object.fromEntries(kinds.map(item => [item.value, item.label]));
  if (ledgerKindOptionsApplied) return;
  const select = $('#ledger-kind');
  const current = select.value;
  for (const item of kinds) {
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
  const params = {};
  const accountId = $('#ledger-account').value.trim();
  const kind = $('#ledger-kind').value;
  if (accountId) params.account_id = accountId;
  if (kind) params.kind = kind;
  let data;
  try {
    data = await pagedFetch('ledger', '/referral-ledger', params);
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  applyLedgerKinds(data.kinds);
  $('#ledger-rows').innerHTML = data.items.length ? data.items.map(entry => `
    <tr>
      <td class="nowrap">${dt(entry.createdAt)}</td>
      <td>${cell(entry.accountEmail || entry.accountId)}</td>
      <td class="nowrap">${esc(LEDGER_KIND[entry.kind] || entry.kind)}</td>
      <td class="nowrap ${Number(entry.delta) < 0 ? 'is-negative' : ''}">${esc(entry.delta)}</td>
      <td class="nowrap">${esc(entry.frozenDelta)}</td>
      <td class="nowrap">${esc(entry.balanceAfter)}</td>
      <td>${cell(entry.note || entry.reference || '—')}</td>
    </tr>`).join('') : emptyRow(7, cursor.offset > 0 ? '本页无数据' : '暂无积分流水');
  renderPager('ledger');
}

$('#ledger-refresh').addEventListener('click', () => {
  pageState('ledger').offset = 0;
  loadLedger();
});

$('#ledger-search').addEventListener('click', () => {
  pageState('ledger').offset = 0;
  loadLedger();
});

$('#ledger-adjust').addEventListener('click', () => {
  const accountId = $('#ledger-account').value.trim();
  if (!accountId) return toast('请先在左侧填入账号 ID，或从「账号」页的『人工调账』进入。', 'warning');
  const account = state.accounts.find(item => item.id === accountId);
  openAdjustDialog(accountId, account ? account.email : accountId);
});

// --------------------------------------------------------------------------- //
// 客户档案
// --------------------------------------------------------------------------- //
export async function loadCustomers() {
  const cursor = pageState('customers');
  const keyword = $('#customer-keyword').value.trim();
  let data;
  try {
    data = await pagedFetch('customers', '/customers', keyword ? { keyword } : {});
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#customer-rows').innerHTML = data.items.length ? data.items.map(customer => `
    <tr>
      <td>${cell(customer.email)}</td>
      <td>${cell(customer.name)}</td>
      <td class="nowrap">${num(customer.orderCount)}</td>
      <td class="nowrap">${num(customer.licenseCount)}</td>
      <td class="nowrap">${d(customer.createdAt)}</td>
    </tr>`).join('') : emptyRow(5, cursor.offset > 0 ? '本页无数据' : '暂无客户档案');
  renderPager('customers');
}

$('#customer-refresh').addEventListener('click', () => {
  pageState('customers').offset = 0;
  loadCustomers();
});

$('#customer-search').addEventListener('click', () => {
  pageState('customers').offset = 0;
  loadCustomers();
});
