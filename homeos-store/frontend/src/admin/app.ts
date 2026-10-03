
import { $, $$, toast } from "./dom.js";
import { localZoneLabel } from "./format.js";
import { api, storeApi } from "./api.js";
import { closeRowMenus } from "./menus.js";
import { bindFilters, resetFilters, resetPage } from "./table.js";
import { loadFeatureCatalog } from "./features.js";
import { loadOverview } from "./panels/overview.js";
import { loadProductCatalog, loadProducts } from "./panels/products.js";
import { loadOrders } from "./panels/orders.js";
import { loadBindings, loadLicenses } from "./panels/licenses.js";
import { loadCoupons } from "./panels/coupons.js";
import { loadAccounts, loadWithdrawals } from "./panels/accounts.js";
import { loadCustomers, loadLedger } from "./panels/ledger.js";
import { loadAudits, loadEntitlements } from "./panels/content.js";
import { loadDiagnostics, loadSettings } from "./panels/settings.js";
import { loadEmailVerifications, loadLicenseSessions, loadLoginAttempts, loadRecoveryTokens, loadRedemptions, loadReleaseEvents, loadSessions } from "./panels/sessions.js";
import { host } from "./host.js";
import { handlePasswordToggleClick } from "../password-toggle.js";
import type { ApiError } from "../api-error.js";

type TabItem = {
  key: string;
  button: HTMLElement;
  panes: HTMLElement[];
  editors: HTMLElement[];
};

type TabTree = {
  items: TabItem[];
  byKey: Map<string, TabItem>;
};


function setNavBadge(page: string, count: unknown) {
  const node = $(`[data-nav-badge="${page}"]`);
  if (!node) return;
  node.textContent = count ? String(count) : '';

  const group = node.closest('[data-nav-group]');
  const groupBadge = group && group.querySelector('[data-nav-group-badge]');
  if (!groupBadge) return;
  const total = $$('[data-nav-badge]', group)
    .reduce((acc, item) => acc + (Number(item.textContent) || 0), 0);
  groupBadge.textContent = total ? String(total) : '';
}

const loginForm = $('#admin-login-form') as HTMLFormElement | null;
let loginFormTouched = false;

function clearAutofilledLogin() {
  if (!loginForm || loginFormTouched) return;
  const email = loginForm.elements.namedItem('email') as HTMLInputElement | null;
  const password = loginForm.elements.namedItem('password') as HTMLInputElement | null;
  if (email) email.value = '';
  if (password) password.value = '';
}


['pointerdown', 'keydown', 'input', 'change'].forEach((type) => {
  loginForm?.addEventListener(type, () => { loginFormTouched = true; }, true);
});


window.addEventListener('DOMContentLoaded', clearAutofilledLogin);
window.addEventListener('load', clearAutofilledLogin);
window.addEventListener('pageshow', clearAutofilledLogin);
[0, 60, 200, 600, 1500].forEach((delay) => setTimeout(clearAutofilledLogin, delay));


loginForm?.addEventListener('click', handlePasswordToggleClick);

function showLogin(message = '') {
  const boot = $('#admin-boot');
  const login = $('#admin-login');
  const app = $('#admin-app');
  if (boot) boot.hidden = true;
  if (login) login.hidden = false;
  if (app) app.hidden = true;
  const errorBox = $('#admin-login-error');
  if (message) {
    if (errorBox) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
  } else if (errorBox) {
    errorBox.hidden = true;
  }
}

function showApp() {
  const boot = $('#admin-boot');
  const login = $('#admin-login');
  const app = $('#admin-app');
  if (boot) boot.hidden = true;
  if (login) login.hidden = true;
  if (app) app.hidden = false;
}


async function resolveAdminSession() {
  let me;
  try {
    me = await storeApi('/auth/me') as { account?: { email?: string } };
  } catch (error) {
    const err = error as ApiError;


    if (err.status === 401 || err.status === 403) return null;
    throw new Error(`无法确认登录状态：${err.message}`);
  }
  if (!me.account) return null;

  try {
    await api('/overview');
  } catch (error) {

    const err = error as ApiError;
    if (err.status === 401 || err.status === 403) return null;
    throw error;
  }
  return me.account;
}


async function bootstrap({ announce = false }: { announce?: boolean } = {}) {
  let account;
  try {
    account = await resolveAdminSession();
  } catch (error) {
    showLogin(error instanceof Error ? error.message : '登录失败');
    return false;
  }
  if (!account) {
    showLogin();
    return false;
  }
  const identity = $('#admin-identity');
  const avatar = $('#admin-avatar');
  const identitySide = $('#admin-identity-side');
  const avatarSide = $('#admin-avatar-side');
  const timezone = $('#admin-timezone');
  if (identity) identity.textContent = `${account.email}`;
  if (avatar) avatar.textContent = (account.email || 'A').trim().charAt(0);
  if (identitySide) identitySide.textContent = `${account.email}`;
  if (avatarSide) avatarSide.textContent = (account.email || 'A').trim().charAt(0);

  if (timezone) timezone.textContent = `时间按 ${localZoneLabel()} 显示`;
  showApp();

  const results = await Promise.allSettled([
    loadOverview(), loadProductCatalog(), loadFeatureCatalog(),
  ]);
  const failed: PromiseRejectedResult[] = results.filter(
    (item): item is PromiseRejectedResult => item.status === 'rejected',
  );
  try {
    await loadProducts();
  } catch (error) {
    failed.push({ status: 'rejected', reason: error });
  }
  if (announce) {
    if (failed.length) {
      const first = failed[0]!;
      const reason = first.reason instanceof Error
        ? first.reason.message
        : first.reason
          ? String(first.reason)
          : '';
      toast(`已登录后台，但有 ${failed.length} 处数据没拉到${reason ? `：${reason}` : ''}。可刷新页面重试。`, 'warning');
    } else {
      toast('已登录后台');
    }
  }
  return true;
}

$('#admin-login-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const errorBox = $('#admin-login-error');
  if (errorBox) errorBox.hidden = true;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  try {
    await storeApi('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    });
  } catch (error) {
    if (errorBox) {
      errorBox.textContent = error instanceof Error ? error.message : '登录失败';
      errorBox.hidden = false;
    }
    return;
  }

  form.reset();
  await bootstrap({ announce: true });
});

$('#admin-logout')?.addEventListener('click', async () => {
  await storeApi('/auth/logout', { method: 'DELETE' }).catch(() => {});
  showLogin();
});

const TAB_TREES = new Map<string, TabTree | null>();


function collectTabs(page: string) {
  if (TAB_TREES.has(page)) return TAB_TREES.get(page);
  const panel = $(`#panel-${page}`);
  const strip = panel && panel.querySelector('[data-tab-strip]');
  if (!strip) {
    TAB_TREES.set(page, null);
    return null;
  }
  const panes = $$('[data-tab-pane]', panel);
  const items = $$('[data-tab]', strip).map((button): TabItem => {
    const key = button.dataset.tab || '';
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

    const editors = mine.flatMap(pane => $$('[id$="-editor"]', pane));
    return { key, button, panes: mine, editors };
  });
  const tree: TabTree = { items, byKey: new Map(items.map((item) => [item.key, item])) };
  TAB_TREES.set(page, tree);
  return tree;
}


function tabAvailable(item: TabItem) {
  return !item.editors.length || item.editors.some(node => !node.hidden);
}


function syncOnDemandTabs(page: string) {
  const tree = collectTabs(page);
  if (!tree) return;
  for (const item of tree.items) {
    if (item.editors.length) item.button.hidden = !tabAvailable(item);
  }
}


function setTab(page: string, key: string, { push = false, focus = false }: { push?: boolean; focus?: boolean } = {}) {
  const tree = collectTabs(page);
  if (!tree || !tree.items.length) return '';
  const wanted = tree.byKey.get(key);
  const target = wanted && tabAvailable(wanted)
    ? wanted
    : tree.items.find(tabAvailable) || tree.items[0];
  for (const item of tree.items) {
    const on = item.key === target.key;
    item.button.setAttribute('aria-selected', on ? 'true' : 'false');

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

function revealTabFor(node: HTMLElement | null) {
  const pane = node?.closest('[data-tab-pane]') as HTMLElement | null;
  const panel = pane?.closest('.admin-panel');
  if (!pane || !panel) return;
  setTab(panel.id.replace(/^panel-/, ''), pane.dataset.tabPane || '', { push: true });
}


function showEditor(selector: string) {
  const node = $(selector);
  if (!node) return;
  node.hidden = false;
  revealTabFor(node);
}


function hideEditor(selector: string) {
  const node = $(selector);
  if (!node) return;
  node.hidden = true;
  const panel = node.closest('.admin-panel');
  if (!panel) return;
  const page = panel.id.replace(/^panel-/, '');
  const tree = collectTabs(page);
  if (tree && tree.items.length) setTab(page, tree.items[0].key, { push: true });
}


function tabPageOf(node: Element) {
  const strip = node.closest('[data-tab-strip]');
  const panel = strip && strip.closest('.admin-panel');
  return panel ? panel.id.replace(/^panel-/, '') : '';
}

$('.admin-main')?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('.admin-tabs__tab') as HTMLElement | null;
  if (!button) return;
  const page = tabPageOf(button);
  if (page) setTab(page, button.dataset.tab || '', { push: true });
});

$('.admin-main')?.addEventListener('keydown', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest('.admin-tabs__tab') as HTMLElement | null;
  if (!button) return;
  const strip = button.closest('[data-tab-strip]');
  if (!strip) return;

  const buttons = $$('[data-tab]', strip).filter((tab) => !tab.hidden);
  const index = buttons.indexOf(button);
  let next = -1;
  if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = buttons.length - 1;
  else return;
  event.preventDefault();
  const page = tabPageOf(button);
  if (page) setTab(page, buttons[next]?.dataset.tab || '', { push: true, focus: true });
});


function parseHash() {
  const [page, tab] = (location.hash || '').replace(/^#/, '').split('/');
  return { page: page || 'overview', tab: tab || '' };
}


const loaders = {
  overview: loadOverview, products: loadProducts, orders: loadOrders, licenses: loadLicenses,
  bindings: loadBindings, coupons: loadCoupons, withdrawals: loadWithdrawals,
  accounts: loadAccounts, settings: loadSettings, audits: loadAudits,
  entitlements: loadEntitlements, ledger: loadLedger, customers: loadCustomers,
  diagnostics: loadDiagnostics,
};


function setNavGroupOpen(group: Element | null, open: boolean) {
  if (!group) return;
  group.classList.toggle('open', open);
  const toggle = group.querySelector('.nav-group__toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
}


function toggleNavGroup(group: Element | null) {
  if (!group) return;
  setNavGroupOpen(group, !group.classList.contains('open'));
}


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

function activate(page: string, tab = '') {
  closeRowMenus();
  $$('#admin-nav a').forEach(link => link.classList.toggle('active', link.dataset.adminPage === page));

  const activeLink = $(`#admin-nav a[data-admin-page="${page}"]`);
  if (activeLink) setNavGroupOpen(activeLink.closest('[data-nav-group]'), true);
  revealActiveNav();
  $$('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${page}`));

  const applied = setTab(page, tab);
  if (tab && applied) {
    const next = `#${page}/${applied}`;
    if (location.hash !== next) location.hash = next;
  }

  const main = $('.admin-main');
  if (main) main.scrollTop = 0;

  const loader = (loaders as Record<string, () => Promise<unknown>>)[page] || (() => Promise.resolve());
  return loader().catch((error: unknown) => {
    toast(error instanceof Error ? error.message : '加载失败', 'danger');
  });
}

$('#admin-nav')?.addEventListener('click', (event) => {

  const target = event.target;
  if (!(target instanceof Element)) return;
  const toggle = target.closest('.nav-group__toggle');
  if (toggle) {
    const group = toggle.closest('[data-nav-group]');

    toggleNavGroup(group);
    return;
  }
  const link = target.closest('a[data-admin-page]') as HTMLElement | null;
  if (!link) return;
  event.preventDefault();
  const page = link.dataset.adminPage || '';
  location.hash = page;
  activate(page);
});


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

  $('#product-reset')?.addEventListener('click', () => resetFilters(['#product-keyword', '#product-status'], 'products'));
  $('#license-reset')?.addEventListener('click', () => resetFilters(['#license-keyword', '#license-status', '#license-expiring'], 'licenses'));
  $('#entitlement-reset')?.addEventListener('click', () => resetFilters(['#entitlement-feature', '#entitlement-status'], 'entitlements'));
  $('#binding-reset')?.addEventListener('click', () => resetFilters(['#binding-keyword', '#binding-active-only'], 'bindings'));
  $('#coupon-reset')?.addEventListener('click', () => resetFilters(['#coupon-keyword', '#coupon-status'], 'coupons'));
  $('#coupon-refresh')?.addEventListener('click', () => { resetPage('coupons'); loadCoupons(); });
  $('#withdrawal-reset')?.addEventListener('click', () => resetFilters(['#withdrawal-status', '#withdrawal-keyword'], 'withdrawals'));
  $('#account-reset')?.addEventListener('click', () => resetFilters(['#account-keyword', '#account-role', '#account-status'], 'accounts'));
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

bootstrap().then((loggedIn) => {
  if (loggedIn && (loaders as Record<string, unknown>)[initial.page]) {
    activate(initial.page, initial.tab);
  }
});


window.addEventListener('hashchange', () => {
  const { page, tab } = parseHash();
  if (!(loaders as Record<string, unknown>)[page]) return;
  const active = document.querySelector('.admin-panel.active');

  if (!active || active.id !== `panel-${page}`) {
    activate(page, tab);
    return;
  }

  setTab(page, tab, { push: true });
});
