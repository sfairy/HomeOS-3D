/**
 * 商店后台 `/admin` 的入口脚本（模板 `store/templates/admin.html`，路由见 `store/api/pages.py`）。
 *
 * 这份代码此前是模板里的一段内联经典脚本（4421 行）：同源外部脚本由 CSP 的 `script-src
 * 'self'` 放行，不需要 nonce；而内联脚本要每次响应注入一次性 nonce，且**没法 import** ——
 * 面板一多就只能往同一个文件里堆，任何跨面板复用的东西都得靠「同在一个作用域里」。
 * 现在按主题拆成 `admin/` 下的模块，这个文件只做三件事：装配、路由（tab / 导航）、启动。
 *
 * 分层的口径：
 *   - `admin/dom.js` `admin/format.js` `admin/api.js`：纯工具与接口出口，不反向依赖任何东西；
 *   - `admin/table.js` `admin/dialogs.js` `admin/features.js`：表格 / 对话框 / 功能项选择器；
 *   - `admin/panels/*.js`：按面板拆的加载器与事件绑定，每个面板自己登记到 `PANELS`；
 *   - `admin/host.js`：面板需要回调「外壳」（切页、提示、导航角标）时走的窄接口，
 *     由本文件在启动时装配 —— 这样面板模块不必 import 入口文件，也就不会出现循环依赖。
 */

import { $, $$, toast } from "./dom.js?v=2609221226";
import { localZoneLabel } from "./format.js?v=2609221226";
import { api, storeApi } from "./api.js?v=2609221226";
import { closeRowMenus } from "./menus.js?v=2609221226";
import { bindFilters, resetFilters, resetPage } from "./table.js?v=2609221226";
import { loadFeatureCatalog } from "./features.js?v=2609221226";
import { loadOverview } from "./panels/overview.js?v=2609221226";
import { loadProductCatalog, loadProducts } from "./panels/products.js?v=2609221226";
import { loadOrders } from "./panels/orders.js?v=2609221226";
import { loadBindings, loadLicenses } from "./panels/licenses.js?v=2609221226";
import { loadCoupons } from "./panels/coupons.js?v=2609221226";
import { loadAccounts, loadWithdrawals } from "./panels/accounts.js?v=2609221226";
import { loadCustomers, loadLedger } from "./panels/ledger.js?v=2609221226";
import { loadAudits, loadEntitlements } from "./panels/content.js?v=2609221226";
import { loadDiagnostics, loadSettings } from "./panels/settings.js?v=2609221226";
import { loadEmailVerifications, loadLicenseSessions, loadLoginAttempts, loadRecoveryTokens, loadRedemptions, loadReleaseEvents, loadSessions } from "./panels/sessions.js?v=2609221226";
import { host } from "./host.js?v=2609221226";



// 时间口径：后端存 naive UTC、界面按浏览器本地时区显示与输入，边界只在读（UTC→本地）与写（本地→UTC）两处转换。















// --------------------------------------------------------------------------- //
// 导航待办计数
// --------------------------------------------------------------------------- //
function setNavBadge(page, count) {
  const node = $(`[data-nav-badge="${page}"]`);
  if (!node) return;
  node.textContent = count ? String(count) : '';
  // 分组收起后子项角标看不见了，把合计挂到一级菜单上，
  // 否则「有待支付订单 / 待审提现」这种信号会随着折叠一起消失。
  const group = node.closest('[data-nav-group]');
  const groupBadge = group && group.querySelector('[data-nav-group-badge]');
  if (!groupBadge) return;
  const total = $$('[data-nav-badge]', group)
    .reduce((acc, item) => acc + (Number(item.textContent) || 0), 0);
  groupBadge.textContent = total ? String(total) : '';
}

// 登录页应保持空白表单：密码管理器会把上次保存的管理员邮箱与密码灌进输入框，属性层（autocomplete / data-lpignore）挡不住延迟写入，故加载后再清空一次，用户碰过表单即停手。
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
// 且用户一交互就全变成空操作。
window.addEventListener('DOMContentLoaded', clearAutofilledLogin);
window.addEventListener('load', clearAutofilledLogin);
window.addEventListener('pageshow', clearAutofilledLogin);
[0, 60, 200, 600, 1500].forEach((delay) => setTimeout(clearAutofilledLogin, delay));

// 密码显示 / 隐藏：与商店认证页、setup 页同一交互。
loginForm?.addEventListener('click', (event) => {
  const toggle = event.target.closest('[data-password-toggle]');
  if (!toggle) return;
  // 按「按钮的父元素」找输入框，而不是按某个字段类名：后台登录用的是场景设计系统的
  // .hos-password-field，工作台里的解绑表单用的仍是 .hb-password-field，两者的结构一样
  // （输入框与按钮是同一父元素的兄弟）。锚在类名上会让其中一个静默失效。
  const input = toggle.parentElement?.querySelector('input');
  if (!input) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  toggle.textContent = show ? '隐藏' : '显示';
  toggle.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
});

// ``message`` 非空时把失败原因写进登录卡片：「加载失败」与「未登录」必须分开 —— 把 500、
// 断网、无权限一律当成未登录，运营会对着正常登录页反复重输密码，真正的问题没有出口。
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
// 明确未登录返回 null；其余一切异常照实抛出（由调用方决定怎么提示），
// 绝不在这里吞成「未登录」。
async function resolveAdminSession() {
  let me;
  try {
    me = await storeApi('/auth/me');
  } catch (error) {
    // 401 就是「还没登录」——登录页的正常状态，不是异常；以前无条件把它包装成错误
    // 提示，导致未登录访客一打开 /admin 先看到红框报错。真正需要报的故障（500、断网）
    // 仍照实抛，见下面的注释。
    if (error.status === 401) return null;
    throw new Error(`无法确认登录状态：${error.message}`);
  }
  if (!me.account) return null;
  // 权限仍以后台 overview 探测为准（401/403 会被 api() 转成异常），而不是用
  // /auth/me 的 isAdmin 字段：那个字段只是给**前台**决定要不要给出「管理后台」
  // 入口用的，真正决定能不能进后台的是后台 API 的权限。这一步**不能**吞掉异常：
  // 403 表示「登录了但不是管理员」，必须让运营看到原因，否则他会对着一个正常的
  // 登录页反复重输密码，而真正的问题没有任何出口。
  try {
    await api('/overview');
  } catch (error) {
    // 会话恰好在这两次请求之间过期，同样属于「未登录」，按未登录处理。
    // 只有 401 走这条路：403 是权限问题，必须报出来。
    if (error.status === 401) return null;
    throw error;
  }
  return me.account;
}

// ``announce`` 为真时（登录成功后调用）汇报加载结果：登录动作本身成功、
// 但面板数据拉不动时，必须说清楚是「数据没拉到」而不是含糊地报「已登录后台」，
// 那样运营会以为一切正常，然后在空列表上操作。
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
  // 功能码目录必须先到（商品列表要用中文名渲染功能码）。用 allSettled 而非 all：
  // 一个面板 500 不该让整页卡在登录态，失败的记下来最后如实报出。
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
  // bootstrap 自己会把失败原因写进登录卡片；这里不能再补一句「已登录后台」——
  // 那正是「明明进不去，却提示已登录」的来源。
  await bootstrap({ announce: true });
});

$('#admin-logout').addEventListener('click', async () => {
  await storeApi('/auth/logout', { method: 'DELETE' }).catch(() => {});
  showLogin();
});

// 标签页（tab）：tab 树完全从 DOM 派生，一个 key 可对应多个 pane（ARIA 的 aria-controls 本就是 ID 列表）；切换只用 hidden 属性，它同时退出可访问性树与 Tab 焦点序列，不必自己写 display:none 并同步 aria。
const TAB_TREES = new Map(); // page → { items, byKey } / null（该面板没有 tab）

// 首次访问时给按钮与 pane 补齐 id / aria-controls / aria-labelledby 与
// roving tabindex，之后切 tab 只改 aria-selected 与 hidden。
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
    // 编辑器的显隐走（见 syncOnDemandTabs）——列表 tab 是常驻的，表单 tab
    // 空着留在标签条上，点下去只会得到一片空白，看起来就像坏了。
    const editors = mine.flatMap(pane => $$('[id$="-editor"]', pane));
    return { key, button, panes: mine, editors };
  });
  const tree = { items, byKey: new Map(items.map(item => [item.key, item])) };
  TAB_TREES.set(page, tree);
  return tree;
}

// tab 此刻有没有东西可看：常驻 tab 永远有，按需 tab 要看它的编辑器是否可见。
// 深链到 #products/form 但没点过「新增商品」时，它会返回 false，setTab 就
// 回落到列表 —— 否则屏幕空白、标签条上还看不出选中了谁。
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
// 而不是整块空白。
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
    // 访问，这是 WAI-ARIA 对 tabs 的规定行为（十几个按钮全在焦点序列里会变成
    // 「想跳过标签条要点十几次」）。
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

// 让某个元素所在的 tab 显示出来（打开编辑器、跨页跳转都要它），否则操作生效了但屏幕上
// 什么都没有，用户只会以为按钮没反应。push 让地址栏跟着走：地址里的 tab 必须是眼前真能
// 看到的那个，否则刷新一次就跳到别处。
function revealTabFor(node) {
  const pane = node && node.closest('[data-tab-pane]');
  const panel = pane && pane.closest('.admin-panel');
  if (!panel) return;
  setTab(panel.id.replace(/^panel-/, ''), pane.dataset.tabPane, { push: true });
}

// 编辑器的显隐必须和 tab 一起走：表单在 DOM 里可见了，但用户停在列表 tab 上
// 就是看不到（过去是「往下滚一下」的自然结果，现在不滚也看不到了）。
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
// 也不用为将来动态插入的 tab 条补注册。
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
  // 一个 hidden 的按钮上，浏览器不会给焦点，表现成「按了右键没反应」。
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
// 因为「同一个面板内只换了 tab」不该重新拉一次数据。
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
// 「想切到某个页面先猜它在哪个组里」；默认全开的代价只是一次滚动，收益是不用猜。
function setNavGroupOpen(group, open) {
  if (!group) return;
  group.classList.toggle('open', open);
  const toggle = group.querySelector('.nav-group__toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// 收起的分组里那些链接会退出 Tab 焦点序列（见 .nav-group__items-inner 的
// visibility 过渡），所以折叠是「对键盘用户同样成立」的隐藏，不是视觉把戏。
function toggleNavGroup(group) {
  setNavGroupOpen(group, !group.classList.contains('open'));
}

// 当前页所在的链接要始终看得见：默认全开时通常已经可见，但运营收起分组后
// 再用概览待办跳转、或侧栏滚过一段距离，就需要把高亮项拉回视野。
// 用 nearest 而不是 center —— 已经可见时不产生任何滚动。
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
  // 点击看起来像没反应。loader 里若要落到别的 tab（例如核销记录），
  // 加载完自己再调 setTab / revealTabFor。
  const applied = setTab(page, tab);
  // 深链要把 tab 写回地址栏，否则刷新/前进后退会丢掉「在哪一屏」。
  // 只有显式给了 tab 才写：点侧栏导航进来时地址栏保持 #page 更干净。
  if (tab && applied) {
    const next = `#${page}/${applied}`;
    if (location.hash !== next) location.hash = next;
  }
  // 主区是唯一滚动容器，切面板时要把滚动位置复位，
  // 否则从长列表切到短面板会停在半空。
  $('.admin-main').scrollTop = 0;
  // 返回 Promise：调用方要能在加载完之后再滚动/聚焦（例如从优惠码跳到核销记录）。
  // 失败在这一层收口：列表类 loader 已经在表格里渲染了「读取出错 + 重试」，
  // 再往外抛就只剩一条 unhandled rejection —— 点击导航是同步回调，没人接这个 Promise。
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
// 除诊断页之外，还包含八张业务主表（商品/订单/授权/权益/绑定/优惠码/提现/账号），
// 它们以前一律 limit<=500 且无 offset，第 501 条之后的记录在界面上永远看不到。
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
// （它在本文件靠后位置定义），分散在各面板里注册会踩到暂时性死区。
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

// --------------------------- 启动 --------------------------- //
// 筛选控件在启动时统一注册且只注册一次（挂两遍会让每次改动触发两次请求）；放在这里
// 是因为它依赖本文件靠后定义的 PAGED_LOADERS 与 resetPage（提前注册会踩暂时性死区）。
// 面板模块回调「外壳」时的窄接口见 admin/host.js 的注释。装配位置不能挪到文件末尾：
// 下面这句启动语句就会调到 bindFilters，而它要读 PAGED_LOADERS；也不能提前到这些绑定
// 的声明之前，否则命中暂时性死区（下面这段校验由 split-admin.mjs 保证）。
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
// 每个 401 又会把登录卡片重新渲染一遍，登录页上的报错会被自己的失败淹掉。
bootstrap().then(loggedIn => {
  if (loggedIn && loaders[initial.page]) activate(initial.page, initial.tab);
});

// 点导航走 activate()，但浏览器前进/后退、以及手工改地址栏只改 hash，不会调 activate。
// 没有这个监听就会出现「地址栏是 #orders、画面还停在概览」的错位——刷新一下才对得上，
// 用户会以为后台卡住了。点击导航时 hash 与面板同时变化，这里用面板 id 去重，避免重复加载。
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
  // push 让地址栏说真话：深链 tab 可能已被收起（表单编辑器关掉了），setTab 会回落，
  // 回落结果要写回地址，否则「地址写 form、画面是 list」。
  setTab(page, tab, { push: true });
});
