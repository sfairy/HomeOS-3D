/**
 * 表格与分页。
 *
 * 单元格与状态单元格、19 张分页表的游标与分页器、筛选框绑定，以及「失败重试」。
 *
 * 19 张列表共用同一套游标、分页器与筛选口径；面板只管拼表格行，不再各写一遍翻页状态。
 */

import { $, $$, esc } from "./dom.js?v=2609222006";
import { api } from "./api.js?v=2609222006";
import { num } from "./format.js?v=2609222006";
import { host } from "./host.js?v=2609222006";

// 由服务端词表填选项的筛选器：跳转目标可能先于选项到位设值 —— 赋给一个不存在的 option
// 会把 select 静默设成空值，所以先把意图记下来，等选项填好再补一次。
export const PENDING_FILTER_VALUES = new Map();

// 表格内统一的操作按钮组
export function actions(...buttons) {
  return `<div class="row-actions">${buttons.filter(Boolean).join('')}</div>`;
}

// 「主操作 + ⋯ 菜单」：把低频/破坏性操作收进菜单。
// 菜单项仍是 <button data-xxx>，沿用各表已有的事件委托，处理函数一行都不用改。
// popover="manual" 的理由见 menus.js 的 openRowMenu：打开时它把节点放进顶层，
// 弹层才不受 .table-wrap / .hb-card 上 backdrop-filter 造出的包含块与 overflow 影响。
export function rowMenu(title, ...items) {
  const body = items.filter(Boolean).join('');
  if (!body) return '';
  return `<div class="menu">
      <button type="button" class="hb-button hb-button--secondary hb-button--sm menu__toggle" data-menu-toggle aria-haspopup="menu" aria-label="${esc(title)}">⋯</button>
      <div class="menu__pop" popover="manual" hidden>${body}</div>
    </div>`;
}

// 菜单项（破坏性操作加 is-danger，红字而非红底，避免满屏红色按钮）
export function menuItem(label, attrs, { danger = false } = {}) {
  return `<button type="button" class="menu__item${danger ? ' is-danger' : ''}" ${attrs}>${esc(label)}</button>`;
}

// 菜单里的**说明**（不是动作）：用于「本来该有这个动作，但因为某个原因暂时没有」。
// 例如订单因渠道交易未关单而删不掉时，直接不给入口会让「操作」列变空白，运营只能猜。
export function menuNote(text) {
  return `<p class="menu__note">${esc(text)}</p>`;
}

// 长内容只在单元格里附带完整值（title），截断交给「固定列宽 + td 省略号」。
// 之前想用 max-width + nowrap 在单元格内部截断，结果反而把表格的最小内容宽度顶大了
// （自动布局按内容定列宽，nowrap 让每列都不可压缩），表格照样溢出。
export function cell(value) {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  if (text === '—') return '—';
  return `<span title="${esc(text)}">${esc(text)}</span>`;
}

// ------------------- 诊断数据：统一分页 + 单条撤销 + 按安全谓词清理 ------------------- //
// 每张表各自记一份游标。诊断数据是「翻旧账」用的，过去一律 limit<=500 且无 offset，
// 第 501 条之后的记录在界面上永远看不到。
const paging = {};

//: 每个 key 最近一次发出的请求（{seq, promise}），pagedFetch 用它判定「我的响应是不是过期了」
const latestRequest = {};

const PAGE_SIZE = 50;

export function pageState(key) {
  if (!paging[key]) paging[key] = { limit: PAGE_SIZE, offset: 0, total: 0, seq: 0 };
  return paging[key];
}

// 每个分页列表对应的表格主体。集中在这里，是为了让「加载中 / 出错」这两种瞬时
// 状态只在一个地方渲染 —— 分散到 18 个 loader 里必然漏掉一半。
const PAGED_TABLES = {
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

// 列数从表头现读：写死列数的话，将来给某张表加一列就得回来改这里，
// 而漏改的后果是整行错位一整列。
function tableSpan(tbody) {
  const table = tbody.closest('table');
  return table ? table.querySelectorAll('thead th').length : 1;
}

function setTableState(key, state, message = '') {
  const tbody = PAGED_TABLES[key] ? $(PAGED_TABLES[key]) : null;
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

// 带回 {items, total, limit, offset}，并把游标落在 paging[key] 上；筛选框是 input 事件触发、请求返回顺序不保证，
// 故用每个 key 的递增序号做竞态守卫：只有最新请求能写游标与表格，被取代的调用方拿到最新那次返回值（各 loader 无需改）。
export async function pagedFetch(key, path, params = {}) {
  const cursor = pageState(key);
  const query = new URLSearchParams({ ...params, limit: String(cursor.limit), offset: String(cursor.offset) });
  const seq = ++cursor.seq;
  const run = async () => {
    // 先占位再发请求：后台的列表查询偶尔要一两秒，没有占位用户会以为按钮坏了。
    setTableState(key, 'loading');
    let data;
    try {
      data = await api(`${path}?${query.toString()}`);
    } catch (error) {
      if (seq === cursor.seq) setTableState(key, 'error', error.message);
      throw error;
    }
    // 拿到数据就把压暗去掉；行内容由各 loader 自己填（它们才知道列怎么排）。
    // 这里只清「忙」标记，是因为 loader 紧接着就会覆写 tbody。
    if (seq !== cursor.seq) return null;  // 已被更新的请求取代，不写游标也不清状态
    setTableState(key, 'ready');
    cursor.total = Number(data.total || 0);
    cursor.limit = Number(data.limit || cursor.limit);
    cursor.offset = Number(data.offset || 0);
    return data;
  };
  latestRequest[key] = { seq, promise: run() };
  let entry = latestRequest[key];
  let data = await entry.promise;
  // 等待期间又发了新请求：改用最新那次的返回值。序号严格递增，循环必然收敛。
  while (latestRequest[key] && latestRequest[key].seq !== entry.seq) {
    entry = latestRequest[key];
    data = await entry.promise;
  }
  return data;
}

// 筛选条件变了必须回到第 1 页：留在第 3 页去查一个缩小后的结果集，
// 大概率是空页，用户会以为「查不到」。
export function resetPage(key) {
  pageState(key).offset = 0;
}

// 「已到末页」的判定：不能只比 offset+limit，末页不足一页时同样算到底了。
function atLastPage(key) {
  const cursor = pageState(key);
  return cursor.offset + cursor.limit >= cursor.total;
}

export function renderPager(key) {
  const cursor = pageState(key);
  const from = cursor.total === 0 ? 0 : cursor.offset + 1;
  const to = Math.min(cursor.offset + cursor.limit, cursor.total);
  const page = Math.floor(cursor.offset / cursor.limit) + 1;
  const pages = Math.max(1, Math.ceil(cursor.total / cursor.limit));
  const last = pages === 1 ? 0 : (pages - 1) * cursor.limit;
  $$(`[data-pager="${key}"]`).forEach(box => {
    box.innerHTML = `
      <span class="admin-pager__info">第 ${page}/${pages} 页 · 显示 ${from}–${to} / 共 ${num(cursor.total)} 条</span>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="first" ${cursor.offset <= 0 ? 'disabled' : ''}>首页</button>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="prev" ${cursor.offset <= 0 ? 'disabled' : ''}>上一页</button>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="next" ${atLastPage(key) ? 'disabled' : ''}>下一页</button>
      <button class="hb-button hb-button--secondary hb-button--sm" data-page="${key}" data-page-dir="last" ${last === 0 || atLastPage(key) ? 'disabled' : ''}>末页</button>`;
  });
}

// 筛选控件 → 重载的绑定统一在这里做，避免每个面板各写一遍「change 先 resetPage
// 再 load」而漏掉一步；参数是 [选择器, 面板 key]，绑定必须在 PAGED_LOADERS 初始化
// 之后由 bindPanelFilters() 统一注册。
export function bindFilters(entries) {
  entries.forEach(([selector, key]) => {
    const node = $(selector);
    const loader = host.PAGED_LOADERS[key];
    if (!node || !loader) return;
    const event = node.type === 'checkbox' || node.tagName === 'SELECT' ? 'change' : 'input';
    node.addEventListener(event, () => {
      resetPage(key);
      loader();
    });
    // 文本框按回车即查询：运营的肌肉记忆，省一次点击。
    if (event === 'input') {
      node.addEventListener('keydown', (event_) => {
        if (event_.key === 'Enter') {
          event_.preventDefault();
          resetPage(key);
          loader();
        }
      });
    }
  });
}

// 「重置」按钮：把一组控件恢复成默认值再重载。
export function resetFilters(selectors, key) {
  selectors.forEach(selector => {
    const node = $(selector);
    if (!node) return;
    if (node.type === 'checkbox') node.checked = false;
    else node.value = '';
    // 重置也是「用户的明确意图」：清掉还没补上的跳转意图，否则下次加载会把它又设回来。
    PENDING_FILTER_VALUES.delete(selector);
  });
  resetPage(key);
  host.PAGED_LOADERS[key]();
}

document.addEventListener('click', async (event) => {
  const retry = event.target.closest('[data-retry]');
  if (retry) {
    const loader = host.PAGED_LOADERS[retry.dataset.retry];
    if (loader) await loader();
    return;
  }
  const page = event.target.closest('[data-page]');
  if (!page) return;
  const key = page.dataset.page;
  const loader = host.PAGED_LOADERS[key];
  if (!loader) return;
  const cursor = pageState(key);
  const dir = page.dataset.pageDir;
  if (dir === 'first') cursor.offset = 0;
  else if (dir === 'prev') cursor.offset = Math.max(0, cursor.offset - cursor.limit);
  else if (dir === 'last') cursor.offset = Math.max(0, (Math.ceil(cursor.total / cursor.limit) - 1) * cursor.limit);
  else cursor.offset += cursor.limit;
  await loader();
});
