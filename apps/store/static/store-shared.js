/** 见文件头（store-shared 的说明）。这里补上「页面链接拼接」与两个被商品目录/订单两块共用的渲染片段。 */

import { formatCents as money } from "./money.js?v=2609271208";
import { fromResponse } from "./api-error.js?v=2609271208";

export const STORE_PAGE_REVISION = '20260909-referrals-v1';

export const storePageHref = path => `${path}${path.includes('?') ? '&' : '?'}v=${STORE_PAGE_REVISION}`;

export function resetCouponPreview(clearInput = false) {
  clearTimeout(state.couponPreviewTimer);
  state.couponPreviewSequence += 1;
  const form = $('#purchase-form');
  const input = form?.elements.couponCode;
  const wrapper = input?.closest('.hb-coupon-input');
  const feedback = $('#coupon-feedback');
  if (clearInput && input) input.value = '';
  wrapper?.classList.remove('is-valid', 'is-invalid');
  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.classList.remove('is-checking', 'is-valid', 'is-invalid');
  }
  $('#store-product-price-label').textContent = '应付金额';
  $('#store-product-original-price').hidden = true;
  if (state.product) $('#store-product-price').textContent = money(state.product.priceCents);
}

export function renderAddonTargets() {
  const form = $('#purchase-form');
  const select = form.elements.targetLicenseId;
  const eligible = state.accountLicenses.filter(item => item.active && !item.validityDays && !item.accessExpiresAt);
  const requestedCodes = new Set(state.product?.featureCodes || []);
  const seen = new Set();
  // 选项值必须是授权主键：服务端按 License.id 回查目标授权。
  const options = eligible.filter(item => {
    if (!item.activationCodeId || seen.has(item.activationCodeId)) return false;
    seen.add(item.activationCodeId);
    const owned = new Set(state.accountEntitlements
      .filter(entitlement => entitlement.active && entitlement.licenseId === item.activationCodeId)
      .map(entitlement => entitlement.featureCode));
    return !requestedCodes.size || [...requestedCodes].some(code => !owned.has(code));
  });
  const labelFor = (item) => {
    const parts = [item.userLabel || item.productName];
    if (item.userLabel && item.productName) parts.push(item.productName);
    parts.push(`激活码尾号 ${item.codeHint}`);
    if (item.device?.instanceId) parts.push(`设备 ${item.device.instanceId}`);
    return parts.join(' · ');
  };
  const choices = options.map(item => new Option(labelFor(item), item.activationCodeId));
  if (options.length > 1) {
    const placeholder = new Option('请选择要附加的主授权', '', true, true);
    placeholder.disabled = true;
    select.replaceChildren(placeholder, ...choices);
  } else {
    select.replaceChildren(...choices);
  }
  select.disabled = !options.length;
  $('#addon-target-empty').hidden = Boolean(options.length);
  const confirmation = $('#addon-target-confirmation');
  const updateConfirmation = () => {
    const selected = options.find(item => item.activationCodeId === select.value);
    confirmation.hidden = !selected;
    confirmation.textContent = selected ? `本增量包将附加到：${labelFor(selected)}` : '';
  };
  select.onchange = updateConfirmation;
  updateConfirmation();
}

export const $ = selector => document.querySelector(selector);

export const $$ = selector => [...document.querySelectorAll(selector)];

export let storeStaticVersion;

export function versionedStoreAsset(url) {
  if (typeof url !== 'string' || !url.startsWith('/store-static/') || url.includes('?')) return url;
  if (storeStaticVersion === undefined) {
    const link = document.querySelector('link[rel="stylesheet"][href*="theme.css"]');
    storeStaticVersion = (link?.getAttribute('href')?.match(/[?&]v=([^&]+)/) || [])[1] || '';
  }
  return storeStaticVersion ? `${url}?v=${storeStaticVersion}` : url;
}

export const state = { products: [], product: null, configuration: null, account: null, hasLicense: false, hasTemporaryLicense: false, hasPermanentLicense: false, hasUsedTrial: false, accountLicenses: [], accountEntitlements: [], accountOrders: [], productFilter: 'all', ownedFeatureCodes: new Set(), pollTimer: null, paymentCountdownTimer: null, pendingCountdownTimer: null, accountCountdownTimer: null, accountExpiryRefreshing: false, emailCooldownTimers: new Map(), deviceReleasePolicy: null, releaseCountdownTimer: null, releaseOpening: false, releaseSubmitting: false, releaseLicenseId: null, releaseTarget: null, labelLicenseId: null, currentOrder: null, pendingOrder: null, couponPreviewTimer: null, couponPreviewSequence: 0 };

export function toast(message, tone = 'info') {
  const node = $('#store-toast');
  const isError = tone === 'err';
  node.setAttribute('role', isError ? 'alert' : 'status');
  node.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  node.classList.toggle('is-err', isError);
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(node.timer);
  node.timer = setTimeout(() => node.classList.remove('show'), 3200);
}

// `api` 是「拿到 /account 就刷新解绑策略」的天然收口点，但具体渲染逻辑（updateDeviceReleasePolicy）
// 在 store.js，直接 import 会与 store.js -> store-shared.js 形成循环依赖。所以这里只留一个注册口，
// 由 store.js 在模块求值期把自己的实现挂进来；未注册时（如后台/初始化页只调 api 不碰账号区）静默跳过。
let accountLoadedHandler = null;
export function onAccountLoaded(handler) {
  accountLoadedHandler = handler;
}

export async function api(path, options = {}) {
  const response = await fetch(`/store/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) {
    // 「把 detail 变成人话」只有一份实现（apps/store/static/api-error.js），与后台/初始化页
    // 共用。
    const error = fromResponse(response, body, '请求失败，请稍后重试。');
    error.retryAfter = Number(response.headers.get('Retry-After') || 0);
    throw error;
  }
  if (path === '/account') accountLoadedHandler?.(body);
  return body;
}

export function currentPage() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/item/')) return 'item';
  if (path === '/user/referrals') return 'referrals';
  if (path === '/products') return 'products';
  if (path === '/user/index/query') return 'account';
  if (path === '/user/authentication/login') return 'login';
  if (path === '/user/authentication/register') return 'register';
  if (path === '/user/authentication/forget') return 'forget';
  if (path === '/user/dashboard/index') return 'account';
  return 'home';
}

// showPage 已随「商品目录」一起下沉到 store.js：它要判断当前商品是不是主商品
// （primaryProducts），而该函数属于 store-catalog.js；留在这一层就得反向 import，形成
// store-shared → store-catalog → store-shared 的循环依赖。
