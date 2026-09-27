/** 见文件头（store-shared 的说明）。这里补上「页面链接拼接」与两个被商品目录/订单两块共用的渲染片段。 */

import { formatCents as money } from "./money.js";
import { fromResponse } from "./api-error.js";
import type {
  StoreFrontState,
  StoreLicense,
  JsonObject,
  TimerHandle,
} from "./store-types.js";

export const STORE_PAGE_REVISION = '20260909-referrals-v1';

export const storePageHref = (path: string) =>
  `${path}${path.includes('?') ? '&' : '?'}v=${STORE_PAGE_REVISION}`;

export function resetCouponPreview(clearInput = false) {
  clearTimeout(state.couponPreviewTimer ?? undefined);
  state.couponPreviewSequence += 1;
  const form = $('#purchase-form') as HTMLFormElement | null;
  const input = form?.elements.namedItem('couponCode') as HTMLInputElement | null;
  const wrapper = input?.closest('.hb-coupon-input');
  const feedback = $('#coupon-feedback');
  if (clearInput && input) input.value = '';
  wrapper?.classList.remove('is-valid', 'is-invalid');
  if (feedback) {
    feedback.hidden = true;
    feedback.textContent = '';
    feedback.classList.remove('is-checking', 'is-valid', 'is-invalid');
  }
  const priceLabel = $('#store-product-price-label');
  if (priceLabel) priceLabel.textContent = '应付金额';
  const original = $('#store-product-original-price');
  if (original) original.hidden = true;
  if (state.product) {
    const price = $('#store-product-price');
    if (price) price.textContent = money(state.product.priceCents ?? 0);
  }
}

export function renderAddonTargets() {
  const form = $('#purchase-form') as HTMLFormElement | null;
  if (!form) return;
  const select = form.elements.namedItem('targetLicenseId') as HTMLSelectElement | null;
  if (!select) return;
  const eligible = state.accountLicenses.filter(
    (item) => item.active && !item.validityDays && !item.accessExpiresAt,
  );
  const requestedCodes = new Set(state.product?.featureCodes || []);
  const seen = new Set<string>();
  // 选项值必须是授权主键：服务端按 License.id 回查目标授权。
  const options = eligible.filter((item) => {
    if (!item.activationCodeId || seen.has(item.activationCodeId)) return false;
    seen.add(item.activationCodeId);
    const owned = new Set(
      state.accountEntitlements
        .filter(
          (entitlement) =>
            entitlement.active && entitlement.licenseId === item.activationCodeId,
        )
        .map((entitlement) => entitlement.featureCode)
        .filter((code): code is string => Boolean(code)),
    );
    return !requestedCodes.size || [...requestedCodes].some((code) => !owned.has(code));
  });
  const labelFor = (item: StoreLicense) => {
    const parts = [item.userLabel || item.productName];
    if (item.userLabel && item.productName) parts.push(item.productName);
    parts.push(`激活码尾号 ${item.codeHint}`);
    if (item.device?.instanceId) parts.push(`设备 ${item.device.instanceId}`);
    return parts.join(' · ');
  };
  const choices = options.map((item) => new Option(labelFor(item), item.activationCodeId));
  if (options.length > 1) {
    const placeholder = new Option('请选择要附加的主授权', '', true, true);
    placeholder.disabled = true;
    select.replaceChildren(placeholder, ...choices);
  } else {
    select.replaceChildren(...choices);
  }
  select.disabled = !options.length;
  const empty = $('#addon-target-empty');
  if (empty) empty.hidden = Boolean(options.length);
  const confirmation = $('#addon-target-confirmation');
  const updateConfirmation = () => {
    const selected = options.find((item) => item.activationCodeId === select.value);
    if (!confirmation) return;
    confirmation.hidden = !selected;
    confirmation.textContent = selected ? `本增量包将附加到：${labelFor(selected)}` : '';
  };
  select.onchange = updateConfirmation;
  updateConfirmation();
}

export const $ = (selector: string): HTMLElement | null =>
  document.querySelector(selector);

export const $$ = (selector: string): HTMLElement[] =>
  [...document.querySelectorAll(selector)] as HTMLElement[];

export let storeStaticVersion: string | undefined;

export function versionedStoreAsset(url: string) {
  if (typeof url !== 'string' || !url.startsWith('/store-static/') || url.includes('?')) return url;
  if (storeStaticVersion === undefined) {
    const link = document.querySelector('link[rel="stylesheet"][href*="theme.css"]');
    storeStaticVersion = (link?.getAttribute('href')?.match(/[?&]v=([^&]+)/) || [])[1] || '';
  }
  return storeStaticVersion ? `${url}?v=${storeStaticVersion}` : url;
}

export const state: StoreFrontState = {
  products: [],
  product: null,
  configuration: null,
  account: null,
  hasLicense: false,
  hasTemporaryLicense: false,
  hasPermanentLicense: false,
  hasUsedTrial: false,
  accountLicenses: [],
  accountEntitlements: [],
  accountOrders: [],
  productFilter: 'all',
  ownedFeatureCodes: new Set(),
  pollTimer: null,
  paymentCountdownTimer: null,
  pendingCountdownTimer: null,
  accountCountdownTimer: null,
  accountExpiryRefreshing: false,
  emailCooldownTimers: new Map(),
  deviceReleasePolicy: null,
  releaseCountdownTimer: null,
  releaseOpening: false,
  releaseSubmitting: false,
  releaseLicenseId: null,
  releaseTarget: null,
  labelLicenseId: null,
  currentOrder: null,
  pendingOrder: null,
  couponPreviewTimer: null,
  couponPreviewSequence: 0,
};

type ToastNode = HTMLElement & { timer?: TimerHandle | null };

export function toast(message: string, tone = 'info') {
  const node = $('#store-toast') as ToastNode | null;
  if (!node) return;
  const isError = tone === 'err';
  node.setAttribute('role', isError ? 'alert' : 'status');
  node.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  node.classList.toggle('is-err', isError);
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(node.timer ?? undefined);
  node.timer = setTimeout(() => node.classList.remove('show'), 3200);
}

let accountLoadedHandler: ((body: unknown) => void) | null = null;
export function onAccountLoaded(handler: (body: unknown) => void) {
  accountLoadedHandler = handler;
}

export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`/store/v1${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body =
    response.status === 204 ? null : await response.json().catch(() => ({} as JsonObject));
  if (!response.ok) {
    const error = fromResponse(response, body, '请求失败，请稍后重试。') as Error & {
      retryAfter?: number;
    };
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
