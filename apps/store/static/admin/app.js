
import { $, $$, toast } from "./dom.js?v=2609271411";
import { localZoneLabel } from "./format.js?v=2609271411";
import { api, storeApi } from "./api.js?v=2609271411";
import { closeRowMenus } from "./menus.js?v=2609271411";
import { bindFilters, resetFilters, resetPage } from "./table.js?v=2609271411";
import { loadFeatureCatalog } from "./features.js?v=2609271411";
import { loadOverview } from "./panels/overview.js?v=2609271411";
import { loadProductCatalog, loadProducts } from "./panels/products.js?v=2609271411";
import { loadOrders } from "./panels/orders.js?v=2609271411";
import { loadBindings, loadLicenses } from "./panels/licenses.js?v=2609271411";
import { loadCoupons } from "./panels/coupons.js?v=2609271411";
import { loadAccounts, loadWithdrawals } from "./panels/accounts.js?v=2609271411";
import { loadCustomers, loadLedger } from "./panels/ledger.js?v=2609271411";
import { loadAudits, loadEntitlements } from "./panels/content.js?v=2609271411";
import { loadDiagnostics, loadSettings } from "./panels/settings.js?v=2609271411";
import { loadEmailVerifications, loadLicenseSessions, loadLoginAttempts, loadRecoveryTokens, loadRedemptions, loadReleaseEvents, loadSessions } from "./panels/sessions.js?v=2609271411";
import { host } from "./host.js?v=2609271411";


















// --------------------------------------------------------------------------- //
// 导航待办计数
// --------------------------------------------------------------------------- //
function setNavBadge(page, count) {
  const node = $(`[data-nav-badge="${page}"]`);
  if (!node) return;
  node.textContent = count ? String(count) : '';
  // 分组收起后子项角标看不见了，把合计挂到一级菜单上，
  const group = node.closest('[data-nav-group]');
  const groupBadge = group && group.querySelector('[data-nav-group-badge]');
  if (!groupBadge) return;
  const total = $$('[data-nav-badge]', group)
    .reduce((acc, item) => acc + (Number(item.textContent) || 0), 0);
  groupBadge.textContent = total ? String(total) : '';
}

const loginForm = $('#admin-login-form');
let loginFormTouched = false;

function clearAutofilledLogin() {
  if (!loginForm || loginFormTouched) return;
  loginForm.elements.email.value = '';
  loginForm.elements.password.value = '';
}

// 捕获阶段监听：不打断表单自己的事件处理，也能在冒泡被拦时照样记到「用户已经动过手」。
['pointerdown', 'keydown', 'input', 'change'].forEach((type) => {
  loginForm.addEventListener(type, () => { loginFormTouched = true; }, true);
});

// 自动填充的时机不确定（不同浏览器、不同扩展各写各的），多清几轮。定时器都很短，
window.addEventListener('DOMContentLoaded', clearAutofilledLogin);
window.addEventListener('load', clearAutofilledLogin);
window.addEventListener('pageshow', clearAutofilledLogin);
[0, 60, 200, 600, 1500].forEach((delay) => setTimeout(clearAutofilledLogin, delay));

// 密码显示 / 隐藏：与商店认证页、setup 页同一交互。
loginForm?.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-password-toggle]');
  if (!toggle) return;
  // 按「按钮的父元素」找输入框，而不是按某个字段类名：后台登录用的是场景设计系统的
  const input = toggle.parentElement?.querySelector('input');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  toggle.textContent = show ? '隐藏' : '显示';
  toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
});

function showLogin(message = '') {
  $('#admin-boot').hidden = true;
  $('#admin-login').hidden = false;
  $('#admin-app').hidden = true;
  const errorBox = $('#admin-login-error');
  if (message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  } else if (errorBox) {
    errorBox.hidden = true;
  }
}

function showApp() {
  $('#admin-boot').hidden = true;
  $('#admin-login').hidden = true;
  $('#admin-app').hidden = false;
}

// 确认「当前浏览器带着一个**管理员**会话」，返回账号。
async function resolveAdminSession() {
  let me;
  try {
    me = await storeApi('/auth/me');
  } catch (error) {
    if (error.status === 401) return null;
    throw new Error(`无法确认登录状态：${error.message}`);
  }
  if (!me.account) return null;
  // 权限仍以后台 overview 探测为准（401/403 会被 api() 转成异常），而不是用
  try {
    await api('/overview');
  } catch (error) {
    // 会话恰好在这两次请求之间过期，同样属于「未登录」，按未登录处理。
    if (error.status === 401) return null;
    throw error;
  }
  return me.account;
}

// ``announce`` 为真时（登录成功后调用）汇报加载结果：登录动作本身成功、
async function bootstrap({ announce = false } = {}) {
  let account;
  try {
    account = await resolveAdminSession();
  } catch (error) {
    showLogin(error.message);
    return false;
  }
  if (!account) {
    showLogin();
    return false;
  }
  $('#admin-identity').textContent = `${account.email}`;
  $('#admin-avatar').textContent = (account.email || 'A').trim().charAt(0);
  $('#admin-identity-side').textContent = `${account.email}`;
  $('#admin-avatar-side').textContent = (account.email || 'A').trim().charAt(0);
  // 后台所有时间列都按这个时区渲染，写死在界面上比写在文档里靠谱
  $('#admin-timezone').textContent = `时间按 ${localZoneLabel()} 显示`;
  showApp();
  // 商品目录要一并拉（授权签发 / 权益编辑的下拉框依赖它，分页列表只有当前页）；
  const results = await Promise.allSettled([
    loadOverview(), loadProductCatalog(), loadFeatureCatalog(),
  ]);
  const failed = results.filter(item => item.status === 'rejected');
  let productFailed = false;
  try {
    await loadProducts();
  } catch (error) {
    productFailed = true;
    failed.push(error);
  }
  if (announce) {
    if (failed.length) {
      const reason = failed[0].reason ? failed[0].reason.message || String(failed[0].reason) : '';
      toast(`已登录后台，但有 ${failed.length} 处数据没拉到${reason ? `：${reason}` : ''}。可刷新页面重试。`, 'warning');
    } else {
      toast('已登录后台');
    }
  }
  return true;
}

$('#admin-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const errorBox = $('#admin-login-error');
  errorBox.hidden = true;
  try {
    await storeApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.elements.email.value.trim(), password: form.elements.password.value }),
    });
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
    return;
  }
  // 会话已经落到 Cookie 上，输入框里的密码没用了，先清掉再继续
  form.reset();
  await bootstrap({ announce: true });
});

$('#admin-logout').addEventListener('click', async () => {
  await storeApi('/auth/logout', { method: 'DELETE' }).catch(() => {});
  showLogin();
});

const TAB_TREES = new Map();

// 首次访问时给按钮与 pane 补齐 id / aria-controls / aria-labelledby 与
function collectTabs(page) {
  if (TAB_TREES.has(page)) return TAB_TREES.get(page);
  const panel = $(`#panel-${page}`);
  const strip = panel && panel.querySelector('[data-tab-strip]');
  if (!strip) {
    TAB_TREES.set(page, null);
    return null;
  }
  const panes = $$('[data-tab-pane]', panel);
  const items = $$('[data-tab]', strip).map(button => {
    const key = button.dataset.tab;
    const mine = panes.filter(pane => pane.dataset.tabPane === key);
    const tabId = `tab-${page}-${key}`;
    button.id = tabId;
    button.setAttribute(
      'aria-controls',
      mine
        .map((pane, index) => {
          pane.id = pane.id || `pane-${page}-${key}-${index + 1}`;
          pane.setAttribute('aria-labelledby', tabId);
          return pane.id;
        })
        .join(' '),
    );
    // 「按需出现」的 tab：内容是编辑器表单，默认整块 hidden。这类按钮要跟着
    const editors = mine.flatMap(pane => $$('[id$="-editor"]', pane));
    return { key, button, panes: mine, editors };
  });
  const tree = { items, byKey: new Map(items.map(item => [item.key, item])) };
  TAB_TREES.set(page, tree);
  return tree;
}

// tab 此刻有没有东西可看：常驻 tab 永远有，按需 tab 要看它的编辑器是否可见。
function tabAvailable(item) {
  return !item.editors.length || item.editors.some(node => !node.hidden);
}

// 按需 tab 的按钮跟着编辑器显隐。空按钮留在标签条上会让人点了以后面对一片空白。
function syncOnDemandTabs(page) {
  const tree = collectTabs(page);
  if (!tree) return;
  for (const item of tree.items) {
    if (item.editors.length) item.button.hidden = !tabAvailable(item);
  }
}

// 切到某个 tab。key 不认识时回落到第一个 —— 深链里写错 key 也该看到点东西，
function setTab(page, key, { push = false, focus = false } = {}) {
  const tree = collectTabs(page);
  if (!tree || !tree.items.length) return '';
  const wanted = tree.byKey.get(key);
  const target = wanted && tabAvailable(wanted)
    ? wanted
    : tree.items.find(tabAvailable) || tree.items[0];
  for (const item of tree.items) {
    const on = item.key === target.key;
    item.button.setAttribute('aria-selected', on ? 'true' : 'false');
    // roving tabindex：Tab 键进入标签条只落在选中的那一个上，其余靠左右方向键
    item.button.tabIndex = on ? 0 : -1;
    for (const pane of item.panes) pane.hidden = !on;
  }
  syncOnDemandTabs(page);
  if (push) {
    const next = `#${page}/${target.key}`;
    if (location.hash !== next) location.hash = next;
  }
  if (focus) target.button.focus();
  return target.key;
}

function revealTabFor(node) {
  const pane = node && node.closest('[data-tab-pane]');
  const panel = pane && pane.closest('.admin-panel');
  if (!panel) return;
  setTab(panel.id.replace(/^panel-/, ''), pane.dataset.tabPane, { push: true });
}

// 编辑器的显隐必须和 tab 一起走：表单在 DOM 里可见了，但用户停在列表 tab 上
function showEditor(selector) {
  const node = $(selector);
  if (!node) return;
  node.hidden = false;
  revealTabFor(node);
}

// 收起编辑器并切回列表 tab：留着停在空表单上会让人分不清「保存成功了没有」。
function hideEditor(selector) {
  const node = $(selector);
  if (!node) return;
  node.hidden = true;
  const panel = node.closest('.admin-panel');
  if (!panel) return;
  const page = panel.id.replace(/^panel-/, '');
  const tree = collectTabs(page);
  if (tree && tree.items.length) setTab(page, tree.items[0].key, { push: true });
}

// 点击与键盘都委派在 .admin-main 上：tab 条是静态的，但这样只需一个监听器，
function tabPageOf(node) {
  const strip = node.closest('[data-tab-strip]');
  const panel = strip && strip.closest('.admin-panel');
  return panel ? panel.id.replace(/^panel-/, '') : '';
}

$('.admin-main').addEventListener('click', (event) => {
  const button = event.target.closest('.admin-tabs__tab');
  if (!button) return;
  const page = tabPageOf(button);
  if (page) setTab(page, button.dataset.tab, { push: true });
});

$('.admin-main').addEventListener('keydown', (event) => {
  const button = event.target.closest('.admin-tabs__tab');
  if (!button) return;
  const strip = button.closest('[data-tab-strip]');
  // 只走看得见的按钮：按需 tab（表单）在编辑器收起时是 hidden，方向键落到
  const buttons = $$('[data-tab]', strip).filter(tab => !tab.hidden);
  const index = buttons.indexOf(button);
  let next = -1;
  if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else return;
  event.preventDefault();
  const page = tabPageOf(button);
  if (page) setTab(page, buttons[next].dataset.tab, { push: true, focus: true });
});

// 地址栏格式：#page 或 #page/tab。拆成两段而不是一个字符串，
function parseHash() {
  const [page, tab] = (location.hash || '').replace(/^#/, '').split('/');
  return { page: page || 'overview', tab: tab || '' };
}

// --------------------------------------------------------------------------- //
// 导航
// --------------------------------------------------------------------------- //
const loaders = {
  overview: loadOverview, products: loadProducts, orders: loadOrders, licenses: loadLicenses,
  bindings: loadBindings, coupons: loadCoupons, withdrawals: loadWithdrawals,
  accounts: loadAccounts, settings: loadSettings, audits: loadAudits,
  entitlements: loadEntitlements, ledger: loadLedger, customers: loadCustomers,
  diagnostics: loadDiagnostics,
};

// 一级菜单折叠：分组独立且默认全开。不做手风琴式「一次只开一组」——那会变成
function setNavGroupOpen(group, open) {
  if (!group) return;
  group.classList.toggle('open', open);
  const toggle = group.querySelector('.nav-group__toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// 收起的分组里那些链接会退出 Tab 焦点序列（见 .nav-group__items-inner 的
function toggleNavGroup(group) {
  setNavGroupOpen(group, !group.classList.contains('open'));
}

// 当前页所在的链接要始终看得见：默认全开时通常已经可见，但运营收起分组后
function revealActiveNav() {
  const active = $('#admin-nav a.nav-link.active');
  const nav = $('#admin-nav');
  if (!active || !nav) return;
  const link = active.getBoundingClientRect();
  const box = nav.getBoundingClientRect();
  if (link.top < box.top) {
    nav.scrollTop -= box.top - link.top + 8;
  } else if (link.bottom > box.bottom) {
    nav.scrollTop += link.bottom - box.bottom + 8;
  }
}

function activate(page, tab = '') {
  closeRowMenus();
  $$('#admin-nav a').forEach(link => link.classList.toggle('active', link.dataset.adminPage === page));
  // 展开当前页所在的分组：概览待办、优惠码 → 核销记录这类跳转也要落在看得见的菜单上
  const activeLink = $(`#admin-nav a[data-admin-page="${page}"]`);
  if (activeLink) setNavGroupOpen(activeLink.closest('[data-nav-group]'), true);
  revealActiveNav();
  $$('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${page}`));
  // tab 立刻切，不等 loader：加载要几百毫秒，等它回来才动标签条的话，
  const applied = setTab(page, tab);
  if (tab && applied) {
    const next = `#${page}/${applied}`;
    if (location.hash !== next) location.hash = next;
  }
  // 主区是唯一滚动容器，切面板时要把滚动位置复位，
  $('.admin-main').scrollTop = 0;
  // 返回 Promise：调用方要能在加载完之后再滚动/聚焦（例如从优惠码跳到核销记录）。
  return (loaders[page] || (() => {}))().catch(error => {
    toast(error.message, 'danger');
  });
}

$('#admin-nav').addEventListener('click', (event) => {
  // 再点一下已展开的一级菜单可以收起，方便把后面的分组顶上来
  const toggle = event.target.closest('.nav-group__toggle');
  if (toggle) {
    const group = toggle.closest('[data-nav-group]');
    // 独立折叠：只动被点的这一组，其它分组保持原状（默认全开，收起只是临时让位）
    toggleNavGroup(group);
    return;
  }
  const link = event.target.closest('a[data-admin-page]');
  if (!link) return;
  event.preventDefault();
  location.hash = link.dataset.adminPage;
  activate(link.dataset.adminPage);
});














// --------------------------------------------------------------------------- //
// 积分流水
// --------------------------------------------------------------------------- //






// 游标变化后要重新拉的那一支数据。key 与 data-pager / data-page 一一对应。
const PAGED_LOADERS = {
  products: loadProducts,
  orders: loadOrders,
  licenses: loadLicenses,
  entitlements: loadEntitlements,
  bindings: loadBindings,
  coupons: loadCoupons,
  withdrawals: loadWithdrawals,
  accounts: loadAccounts,
  sessions: loadSessions,
  'license-sessions': loadLicenseSessions,
  'recovery-tokens': loadRecoveryTokens,
  'login-attempts': loadLoginAttempts,
  'email-verifications': loadEmailVerifications,
  'device-release-events': loadReleaseEvents,
  'coupon-redemptions': loadRedemptions,
  audits: loadAudits,
  ledger: loadLedger,
  customers: loadCustomers,
};


// 各面板的筛选控件 → 重载。集中注册的理由：loader 需要 PAGED_LOADERS 已经建好
function bindPanelFilters() {
  bindFilters([
    ['#product-keyword', 'products'],
    ['#product-status', 'products'],
    ['#order-status', 'orders'],
    ['#order-keyword', 'orders'],
    ['#order-date-from', 'orders'],
    ['#order-date-to', 'orders'],
    ['#order-review', 'orders'],
    ['#license-keyword', 'licenses'],
    ['#license-status', 'licenses'],
    ['#license-expiring', 'licenses'],
    ['#entitlement-feature', 'entitlements'],
    ['#entitlement-status', 'entitlements'],
    ['#binding-keyword', 'bindings'],
    ['#binding-active-only', 'bindings'],
    ['#coupon-keyword', 'coupons'],
    ['#coupon-status', 'coupons'],
    ['#withdrawal-status', 'withdrawals'],
    ['#withdrawal-keyword', 'withdrawals'],
    ['#account-keyword', 'accounts'],
    ['#account-role', 'accounts'],
    ['#account-status', 'accounts'],
  ]);

  $('#product-reset').addEventListener('click', () => resetFilters(['#product-keyword', '#product-status'], 'products'));
  $('#license-reset').addEventListener('click', () => resetFilters(['#license-keyword', '#license-status', '#license-expiring'], 'licenses'));
  $('#entitlement-reset').addEventListener('click', () => resetFilters(['#entitlement-feature', '#entitlement-status'], 'entitlements'));
  $('#binding-reset').addEventListener('click', () => resetFilters(['#binding-keyword', '#binding-active-only'], 'bindings'));
  $('#coupon-reset').addEventListener('click', () => resetFilters(['#coupon-keyword', '#coupon-status'], 'coupons'));
  $('#coupon-refresh').addEventListener('click', () => { resetPage('coupons'); loadCoupons(); });
  $('#withdrawal-reset').addEventListener('click', () => resetFilters(['#withdrawal-status', '#withdrawal-keyword'], 'withdrawals'));
  $('#account-reset').addEventListener('click', () => resetFilters(['#account-keyword', '#account-role', '#account-status'], 'accounts'));
}

Object.assign(host, {
  PAGED_LOADERS,
  activate,
  collectTabs,
  hideEditor,
  loadAccounts,
  loadCoupons,
  loadEmailVerifications,
  loadLedger,
  loadLicenseSessions,
  loadLoginAttempts,
  loadOverview,
  loadProducts,
  loadRecoveryTokens,
  loadRedemptions,
  loadReleaseEvents,
  loadSessions,
  setNavBadge,
  showEditor,
  showLogin
});

bindPanelFilters();

const initial = parseHash();
// 只有确认拿到了管理员会话才去加载面板：未登录时照样 activate 会打出一串 401，
bootstrap().then(loggedIn => {
  if (loggedIn && loaders[initial.page]) activate(initial.page, initial.tab);
});

// 点导航走 activate()，但浏览器前进/后退、以及手工改地址栏只改 hash，不会调 activate。
window.addEventListener('hashchange', () => {
  const { page, tab } = parseHash();
  if (!loaders[page]) return;
  const active = document.querySelector('.admin-panel.active');
  // 换了面板：整页重新加载（数据也重拉）
  if (!active || active.id !== `panel-${page}`) {
    activate(page, tab);
    return;
  }
  // 同一个面板只换 tab：切显示、不重新请求（重拉既慢又会冲掉筛选/翻页状态）。
  setTab(page, tab, { push: true });
});
