import { $, $$, api, currentPage, onAccountLoaded, resetCouponPreview, state, storePageHref, toast, versionedStoreAsset } from "./store-shared.js";
import { formatCents as money } from "./money.js";
import { esc as escapeHtml } from "./htmlsafe.js";
import type { ApiError } from "./api-error.js";
import { errorMessage } from "./store-types.js";
import { bindPasswordToggles } from "./password-toggle.js";
import { HBReferrals } from "./referrals.js";
import { addonProducts, addonTypeLabel, applyProductFilter, availableAddonProducts, chooseProduct, isAddonProduct, isTrialProduct, primaryProductUnavailable, primaryProducts, renderAddons, renderPaymentMethods, renderProduct, renderProducts, requestedUpgradeLicenseId } from "./store-catalog.js";
import { archiveOrder, cancelPendingOrderFrom, confirmAction, orderCountdownText, orderRemainingSeconds, pollOrder, showPayment, showPendingOrderNotice, stopPaymentTimers } from "./store-orders.js";
import type {
  StoreLicense,
  StoreOrder,
  StoreProduct,
  StoreSiteConfig,
} from "./store-types.js";

type FormEl = HTMLFormElement;
type DialogEl = HTMLDialogElement;

function asForm(node: HTMLElement | null): FormEl | null {
  return node as FormEl | null;
}
function asDialog(node: HTMLElement | null): DialogEl | null {
  return node as DialogEl | null;
}
function asInput(node: Element | RadioNodeList | null | undefined): HTMLInputElement | null {
  return node as HTMLInputElement | null;
}
function asButton(node: Element | null | undefined): HTMLButtonElement | null {
  return node as HTMLButtonElement | null;
}
// 页面可见性切换（三张表单共用一块玻璃坞）。原先在 store-shared.js，因要用到本层的
function showPage() {
  const page = currentPage();
  $$('[data-store-page]').forEach(node => { node.hidden = node.dataset.storePage !== page; });
  const activePage = page === 'referrals' ? 'referrals' : page === 'home' ? 'home' : page === 'products' ? 'purchase' : page === 'item' ? (primaryProducts().some((item: any) => item.id === state.product?.id) ? 'purchase' : 'account') : ['login', 'register', 'forget'].includes(page) ? 'login' : 'account';
  $$('[data-hb-nav]').forEach(link => {
    const active = link.dataset.hbNav === activePage;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}


function releaseDurationText(seconds: number) {
  const total = Math.max(0, Math.ceil(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const remainder = total % 60;
  return [hours ? `${hours} 小时` : '', minutes ? `${minutes} 分钟` : '', remainder ? `${remainder} 秒` : ''].filter(Boolean).join(' ') || '0 秒';
}

function releasePolicyFor(activationCodeId: string | null | undefined) {
  const license = state.accountLicenses.find((item: any) => item.activationCodeId === activationCodeId);
  return license?.deviceReleasePolicy || { cooldownSeconds: state.deviceReleasePolicy?.cooldownSeconds || 0, nextAllowedAt: null, deadline: 0 };
}

function releaseRemainingSeconds(activationCodeId: string | null | undefined = state.releaseLicenseId) {
  return Math.max(0, Math.ceil(((releasePolicyFor(activationCodeId).deadline || 0) - performance.now()) / 1000));
}

function updateDeviceReleasePolicy(payload: any) {
  const globalPolicy = payload?.deviceReleasePolicy || { cooldownSeconds: 86400, nextAllowedAt: null, remainingSeconds: 0 };
  const configuredCooldown = Number(globalPolicy.cooldownSeconds);
  const cooldownSeconds = Number.isFinite(configuredCooldown) ? Math.max(0, configuredCooldown) : 86400;
  const serverNow = Date.parse(payload?.serverTime);
  state.deviceReleasePolicy = { cooldownSeconds };
  (payload?.licenses || []).forEach((license: StoreLicense) => {
    const policy = license.deviceReleasePolicy || globalPolicy;
    const nextAllowedAt = Date.parse(String(policy.nextAllowedAt ?? ''));
    const remainingMs = cooldownSeconds === 0 ? 0 : Number.isFinite(serverNow) && Number.isFinite(nextAllowedAt)
      ? Math.max(0, nextAllowedAt - serverNow)
      : Math.max(0, Number(policy.remainingSeconds) || 0) * 1000;
    license.deviceReleasePolicy = {
      cooldownSeconds,
      lastReleasedAt: policy.lastReleasedAt || null,
      nextAllowedAt: Number.isFinite(nextAllowedAt) ? nextAllowedAt : null,
      deadline: performance.now() + remainingMs,
    };
  });
  clearInterval(state.releaseCountdownTimer ?? undefined);
  state.releaseCountdownTimer = null;
  updateDeviceReleaseUi();
  if ((payload?.licenses || []).some((license: StoreLicense) => (license.deviceReleasePolicy?.deadline || 0) > performance.now())) {
    state.releaseCountdownTimer = setInterval(() => {
      updateDeviceReleaseUi();
      if (!state.accountLicenses.some((license) => releaseRemainingSeconds(license.activationCodeId) > 0)) {
        clearInterval(state.releaseCountdownTimer ?? undefined);
        state.releaseCountdownTimer = null;
      }
    }, 1000);
  }
}

// 把实现挂到 store-shared 的 `api` 上：每次成功拿到 /account 都会回调到这里，
onAccountLoaded(updateDeviceReleasePolicy);

function updateDeviceReleaseUi() {
  const policy = state.deviceReleasePolicy;
  if (!policy) return;
  const rule = policy.cooldownSeconds > 0
    ? `每份授权分别计算解绑间隔：${releaseDurationText(policy.cooldownSeconds)}，互不影响。`
    : '当前自助解绑不限制间隔。';
  const accountNotice = $('#account-release-policy');
  if (accountNotice) {
    accountNotice.hidden = false;
    accountNotice.textContent = rule;
  }
  $$('[data-release-license]').forEach(button => {
    const remaining = releaseRemainingSeconds(button.dataset.releaseLicense);
    button.textContent = remaining > 0 ? '查看解绑时间' : '解除设备绑定';
  });
  $$('[data-release-policy-license]').forEach(node => {
    const activationCodeId = node.dataset.releasePolicyLicense;
    const license = state.accountLicenses.find((item: any) => item.activationCodeId === activationCodeId);
    const licensePolicy = releasePolicyFor(activationCodeId);
    const remaining = releaseRemainingSeconds(activationCodeId);
    node.hidden = !license?.device && remaining === 0;
    const nextTime = licensePolicy.nextAllowedAt !== null && remaining > 0
      ? `下次可解绑时间：${new Date(Number(licensePolicy.nextAllowedAt)).toLocaleString('zh-CN', { hour12: false })}`
      : '';
    node.textContent = remaining > 0
      ? `这份授权还需等待 ${releaseDurationText(remaining)}。${nextTime}`
      : '这份授权当前可以解绑。';
  });
  const form = asForm($('#release-device-form'));
  if (!form) return;
  const licensePolicy = releasePolicyFor(state.releaseLicenseId);
  const remaining = releaseRemainingSeconds();
  const nextTime = licensePolicy.nextAllowedAt !== null && remaining > 0
    ? `下次可解绑时间：${new Date(Number(licensePolicy.nextAllowedAt)).toLocaleString('zh-CN', { hour12: false })}。`
    : '';
  const availability = remaining > 0
    ? `这份授权还需等待 ${releaseDurationText(remaining)}。${nextTime}`
    : '这份授权当前可以解绑。';
  const policyEl = $('#release-device-policy');
  if (policyEl) policyEl.textContent = remaining > 0 ? rule : `请输入当前账号的登录密码。${rule}`;
  const status = $('#release-device-status');
  if (status) {
    status.textContent = availability;
    status.hidden = remaining === 0;
  }
  const passwordBox = $('#release-device-password');
  if (passwordBox) passwordBox.hidden = remaining > 0;
  const passwordInput = form.elements.namedItem('password') as HTMLInputElement | null;
  if (passwordInput) passwordInput.disabled = remaining > 0 || state.releaseSubmitting;
  const submit = asButton(form.querySelector('[type="submit"]'));
  if (submit) {
    submit.disabled = remaining > 0 || state.releaseSubmitting;
    submit.textContent = state.releaseSubmitting ? '正在解绑…' : remaining > 0 ? '冷却中' : '确认解绑';
  }
}


function applyConfiguration() {
  const store = state.configuration?.store as StoreSiteConfig | undefined;
  if (!store) return;
  document.title = store.siteTitle || document.title;
  const footer = $('#footer-site-name');
  if (footer) footer.textContent = store.siteName || '';
  $$('.hb-store-brand-mark').forEach((image) => {
    (image as HTMLImageElement).src = versionedStoreAsset(store.logoUrl || '');
  });
  if (store.announcement) toast(String(store.announcement));
  renderPaymentMethods();
}

function applyMaintenanceMode() {
  const store = state.configuration?.store as StoreSiteConfig | undefined;
  const enabled = Boolean(store?.maintenanceMode);
  const maintenancePage = $('#store-maintenance');
  document.body.classList.toggle('hb-maintenance-active', enabled);
  if (maintenancePage) maintenancePage.hidden = !enabled;
  if (!enabled) return false;
  const siteName = $('#maintenance-site-name');
  if (siteName) siteName.textContent = store?.siteName || 'HomeOS';
  const message = $('#store-maintenance-message');
  if (message) {
    message.textContent = store?.maintenanceMessage || '系统正在升级维护，请稍后再试。';
  }
  document.title = `商城维护中 - ${store?.siteTitle || store?.siteName || 'HomeOS'}`;
  stopPaymentTimers();
  document.body.classList.remove('hb-store-loading');
  return true;
}


/* 商品分组的唯一口径：筛选 tab、卡片上的 data-product-group、首页速览都用它。
   自定义套餐归入「主授权」组（它同样是一次性的基础能力购买），只是徽标另说。 */


/* 商品页的 tab 筛选：只切 .is-filtered，不重排 DOM，
   这样切来切去不会丢焦点，也不需要重新渲染卡片。 */


/* 上架商品清单：主授权永远显示；增量包只在账号已有永久授权时出现
   （没有可附加的激活码，展示出来也买不了，与 init() 的跳转守卫同口径）。 */


function setCouponFeedback(kind: string, message: string) {
  const form = asForm($('#purchase-form'));
  const input = asInput(form?.elements.namedItem('couponCode'));
  const wrapper = input?.closest('.hb-coupon-input');
  const feedback = $('#coupon-feedback');
  wrapper?.classList.remove('is-valid', 'is-invalid');
  if (!feedback) return;
  feedback.classList.remove('is-checking', 'is-valid', 'is-invalid');
  if (kind === 'valid' || kind === 'invalid') wrapper?.classList.add(`is-${kind}`);
  feedback.classList.add(`is-${kind}`);
  feedback.textContent = message;
  feedback.hidden = false;
}

async function previewCoupon() {
  const form = asForm($('#purchase-form'));
  const product = state.product;
  const input = asInput(form?.elements.namedItem('couponCode'));
  const couponCode = input?.value.trim() || '';
  const sequence = ++state.couponPreviewSequence;
  if (!product || !couponCode || product.fulfillmentMode === 'manual') {
    resetCouponPreview(false);
    return;
  }
  setCouponFeedback('checking', '正在验证优惠码…');
  try {
    const result = await api('/coupons/preview', {
      method: 'POST',
      body: JSON.stringify({ productId: product.id, couponCode }),
    });
    if (sequence !== state.couponPreviewSequence || couponCode !== (input?.value.trim() || '')) return;
    const data = result as { discountCents?: number; originalAmountCents?: number; amountCents?: number };
    setCouponFeedback('valid', `优惠码有效，优惠 ${money(data.discountCents)}`);
    const priceLabel = $('#store-product-price-label');
    if (priceLabel) priceLabel.textContent = '优惠后';
    const original = $('#store-product-original-price');
    if (original) {
      original.textContent = money(data.originalAmountCents);
      original.hidden = false;
    }
    const price = $('#store-product-price');
    if (price) price.textContent = money(data.amountCents);
  } catch (_) {
    if (sequence !== state.couponPreviewSequence || couponCode !== (input?.value.trim() || '')) return;
    setCouponFeedback('invalid', '优惠码无效');
    const priceLabel = $('#store-product-price-label');
    if (priceLabel) priceLabel.textContent = '应付金额';
    const original = $('#store-product-original-price');
    if (original) original.hidden = true;
    const price = $('#store-product-price');
    if (price) price.textContent = money(product.priceCents);
  }
}

function scheduleCouponPreview() {
  clearTimeout(state.couponPreviewTimer ?? undefined);
  const form = asForm($('#purchase-form'));
  const input = asInput(form?.elements.namedItem('couponCode'));
  if (!input?.value.trim()) {
    resetCouponPreview(false);
    return;
  }
  const priceLabel = $('#store-product-price-label');
  if (priceLabel) priceLabel.textContent = '应付金额';
  const original = $('#store-product-original-price');
  if (original) original.hidden = true;
  if (state.product) {
    const price = $('#store-product-price');
    if (price) price.textContent = money(state.product.priceCents);
  }
  setCouponFeedback('checking', '正在验证优惠码…');
  state.couponPreviewTimer = setTimeout(() => previewCoupon(), 450);
}


// 站内统一确认框，替代 window.confirm（系统框跟不上暗色主题、文案不可定制）。用 <dialog> 自绘，


// 取消待支付订单：付款码与待支付订单两个弹窗共用。必须走接口：服务端要先关掉渠道侧预下单交易


function ownedPermanentLicense(product: StoreProduct | null | undefined) {
  if (!state.account || !product || isAddonProduct(product) || product.validityDays) return null;
  const now = Date.now();
  return state.accountLicenses.find((item: any) => {
    if (!item.active || item.productId !== product.id) return false;
    // 永久授权 = 没有 validityDays 也没有到期时间；已过期的时限授权不算。
    if (item.validityDays) return false;
    if (item.accessExpiresAt && new Date(item.accessExpiresAt).getTime() <= now) return false;
    return true;
  }) || null;
}

function confirmDuplicatePurchase(product: StoreProduct) {
  return confirmAction({
    kicker: 'Duplicate Purchase',
    title: '你可能已经买过这个授权',
    message: `账号下已有一张有效期内的「${product.name}」授权。再买一张会额外签发一个新的激活码，而不是延长原有授权。`,
    detail: '如果你只是想续期或升级，请到账号中心使用「升级为永久授权」，或联系客服处理。',
    confirmLabel: '仍然购买新授权',
    cancelLabel: '先不买了',
  });
}

async function createOrder(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const product = state.product;
  if (!product) return;
  if (product.soldOut) { toast('该商品已售罄。'); return; }
  if (!state.account) { showGuestPurchaseNotice(); return; }
  // 重复购买永久商品会另发新激活码而非延长原授权；服务端不能硬拦（多设备是合法需求），故这里二次确认。
  if (ownedPermanentLicense(product) && !await confirmDuplicatePurchase(product)) {
    toast('已取消，未创建订单。');
    return;
  }
  const payload: Record<string, unknown> = { productId: product.id, email: state.account.email };
  const coupon = asInput(form.elements.namedItem('couponCode'));
  if (product.fulfillmentMode !== 'manual') payload.couponCode = coupon?.value.trim() || null;
  if (isAddonProduct(product)) {
    const target = asInput(form.elements.namedItem('targetLicenseId'));
    if (!target?.value) { toast('请选择增量包要附加到的主授权。'); return; }
    payload.targetLicenseId = target.value;
  } else if (!isTrialProduct(product) && requestedUpgradeLicenseId()) {
    payload.upgradeLicenseId = requestedUpgradeLicenseId();
  }
  const submit = asButton(form.querySelector('[type="submit"]'));
  if (submit) submit.disabled = true;
  try {
    const accountPayload = await api('/account') as any;
    const pendingOrder = (accountPayload.orders || []).find((item: any) => item.status === 'pending');
    if (pendingOrder) {
      showPendingOrderNotice(pendingOrder);
      return;
    }
    // 渠道由购买页上那个按钮决定（见 renderPaymentMethods）：点哪个就把哪个写进
    // 隐藏字段。下单接口会把渠道**冻结在订单上**，之后的回调与对账都按订单自己
    // 的渠道走，所以运营中途换默认渠道不影响在途订单。
    const channel = asInput(form.elements.namedItem('paymentChannel'))?.value;
    if (channel) payload.paymentChannel = channel;
    const order = await api('/orders', { method: 'POST', body: JSON.stringify(payload) }) as StoreOrder;
    showPayment(order);
  } catch (error) {
    const err = error as ApiError;
    if (err.status === 409) {
      const accountPayload = await api('/account').catch(() => null) as any;
      const pendingOrder = accountPayload?.orders?.find((item: any) => item.status === 'pending');
      if (pendingOrder) {
        showPendingOrderNotice(pendingOrder);
        return;
      }
    }
    toast(errorMessage(error), 'err');
  }
  finally { if (submit) submit.disabled = false; }
}


function applyAccountUi() {
  const form = asForm($('#purchase-form'));
  const card = form?.closest('.hb-checkout-card');
  const email = $('#purchase-account-email');
  const hint = $('#purchase-account-hint');
  const actions = $('.hb-purchase-account-actions');
  if (form) form.classList.toggle('is-account-locked', !state.account);
  card?.classList.toggle('is-guest-checkout', !state.account);
  const title = $('#checkout-card-title');
  if (title) title.textContent = state.account ? '确认并支付' : '登录后继续购买';
  if (email) email.textContent = state.account?.email || '尚未登录';
  if (hint) {
    hint.textContent = state.account
      ? '订单、激活码和设备将归属于此账号'
      : '请先登录后购买，未登录不会创建订单';
  }
  if (actions) actions.hidden = Boolean(state.account);
  const purchaseLink = $('#home-purchase-link');
  if (purchaseLink) purchaseLink.hidden = !primaryProducts().length;
  const catalogEmpty = $('#home-catalog-empty');
  if (catalogEmpty) catalogEmpty.hidden = Boolean(primaryProducts().length);
  const accountLink = $('#home-account-link');
  if (accountLink) accountLink.hidden = !state.account;
  const loginLink = $('#home-login-link');
  if (loginLink) loginLink.hidden = Boolean(state.account);
  const registerLink = $('#home-register-link');
  if (registerLink) registerLink.hidden = Boolean(state.account);
  // 管理后台入口：只给管理员账号。标记里默认 hidden，这里只负责在确认过
  $$('[data-admin-entry]').forEach((entry) => {
    entry.hidden = !Boolean((state.account as any)?.isAdmin);
  });
}

function setAuthHint(authenticated: boolean, hasPermanentLicense = false, hasTemporaryLicense = false) {
  document.documentElement.classList.toggle('hb-auth-hint', authenticated);
  document.documentElement.classList.toggle('hb-license-hint', authenticated && hasPermanentLicense);
  document.documentElement.classList.toggle('hb-unlicensed-hint', authenticated && !hasPermanentLicense);
  document.cookie = authenticated
    ? `homeos_store_hint=${hasPermanentLicense ? 'permanent' : hasTemporaryLicense ? 'temporary' : 'unlicensed'}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    : 'homeos_store_hint=; Max-Age=0; Path=/; SameSite=Lax';
}

function showGuestPurchaseNotice() {
  if (state.account) return;
  const dialog = asDialog($('#guest-purchase-dialog'));
  if (!dialog?.showModal) {
    toast('请先登录后购买。');
    return;
  }
  dialog.showModal();
}

function bindPasswordControls(form: HTMLFormElement | null) {
  if (!form) return;
  bindPasswordToggles(form);
  const password = asInput(form.elements.namedItem('password'));
  const confirmation = asInput(form.elements.namedItem('confirmPassword'));
  const message = form.querySelector('[data-password-mismatch]') as HTMLElement | null;
  if (!password || !confirmation || !message) return;
  const validate = () => {
    const mismatch = Boolean(confirmation.value) && password.value !== confirmation.value;
    confirmation.setCustomValidity(mismatch ? '两次输入的密码不一致。' : '');
    message.hidden = !mismatch;
    return !mismatch;
  };
  password.addEventListener('input', validate);
  confirmation.addEventListener('input', validate);
  form.addEventListener('submit', (event) => {
    if (!validate()) {
      event.preventDefault();
      confirmation.reportValidity();
    }
  }, { capture: true });
}

function statusLabel(order: StoreOrder | null | undefined) {
  if (!order) return '';
  if (order.status === 'paid' && order.fulfillmentMode === 'manual') return '待人工发卡';
  return (order as any).statusLabel || order.status || '';
}

function startEmailCooldown(button: HTMLButtonElement | null, seconds: number) {
  if (!button || Number(seconds) <= 0) return;
  const previous = state.emailCooldownTimers.get(button);
  if (previous) clearInterval(previous ?? undefined);
  const defaultLabel = button.dataset.defaultLabel || button.textContent;
  button.dataset.defaultLabel = defaultLabel;
  const expiresAt = Date.now() + Number(seconds) * 1000;
  const update = () => {
    const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
    if (remaining <= 0) {
      clearInterval(state.emailCooldownTimers.get(button) ?? undefined);
      state.emailCooldownTimers.delete(button);
      button.disabled = false;
      button.textContent = defaultLabel;
      return;
    }
    button.disabled = true;
    button.textContent = `${remaining} 秒后重发`;
  };
  update();
  state.emailCooldownTimers.set(button, setInterval(update, 1000));
}

// 服务端现在如实回报投递结果（delivered / deliveryMode / deliveryError）。这里必须照着
// 它说话：以前无论信发没发出去都提示「验证码已发送」，用户对着收件箱干等，而服务端
// 其实根本没发出那封信 —— 注册就这样彻底卡死。
// 这里的 `form` 参数仍然保留：将来若加「把码写进某个隐藏域」也走同一条路径。
function applyVerificationResponse(_form: HTMLFormElement | null, button: HTMLButtonElement | null, result: any) {
  startEmailCooldown(button, result.resendAfter || 120);
  if (result.delivered === true) {
    toast('验证码已发送，请检查邮箱。');
    return;
  }
  if (result.deliveryError) {
    toast(result.deliveryError, 'err');
    return;
  }
  // 没回显、没投递、也没给原因：只能说「没发出去」，绝不能报「已发送」。
  toast(`验证码未能通过邮件发出（当前投递方式：${result.deliveryMode || '未知'}），请联系客服。`, 'err');
}

async function sendRegisterCode() {
  const form = asForm($('#store-register-form'));
  if (!form) return;
  const emailInput = asInput(form.elements.namedItem('email'));
  const email = emailInput?.value.trim() || '';
  if (!email || !emailInput?.reportValidity()) return;
  const button = asButton($('#send-register-code'));
  if (button) button.disabled = true;
  try {
    const result = await api('/verifications', { method: 'POST', body: JSON.stringify({ email, purpose: 'register' }) });
    applyVerificationResponse(form, button, result);
  } catch (error) {
    const err = error as ApiError;
    if (err.retryAfter) startEmailCooldown(button, err.retryAfter);
    else if (button) button.disabled = false;
    throw error;
  }
}

async function register(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const result = await api('/auth/register', { method: 'POST', body: JSON.stringify({
    email: asInput(form.elements.namedItem('email'))?.value.trim(),
    code: asInput(form.elements.namedItem('code'))?.value.trim(),
    password: asInput(form.elements.namedItem('password'))?.value,
    confirmPassword: asInput(form.elements.namedItem('confirmPassword'))?.value,
    referralCode: asInput(form.elements.namedItem('referralCode'))?.value.trim() || null,
  }) }) as any;
  HBReferrals.clearInvite();
  state.account = result.account;
  state.hasLicense = Boolean(result.hasLicense);
  state.hasTemporaryLicense = Boolean(result.hasTemporaryLicense);
  state.hasPermanentLicense = Boolean(result.hasPermanentLicense);
  state.hasUsedTrial = Boolean(result.hasUsedTrial);
  setAuthHint(true, state.hasPermanentLicense, state.hasTemporaryLicense);
  if (result.referralNote) {
    // 邀请码没绑定成功必须显式告诉用户：绑定只发生在注册这一步，错过就补不上。
    toast(`注册成功。${result.referralNote}`);
  } else {
    toast(state.hasPermanentLicense ? '注册成功，正在进入账号中心。' : '注册成功，正在进入购买页。');
  }
  setTimeout(() => { location.href = state.hasPermanentLicense ? '/user/dashboard/index' : '/products'; }, 500);
}

async function login(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const result = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: asInput(form.elements.namedItem('email'))?.value.trim(),
      password: asInput(form.elements.namedItem('password'))?.value,
    }),
  }) as any;
  state.account = result.account;
  state.hasLicense = Boolean(result.hasLicense);
  state.hasTemporaryLicense = Boolean(result.hasTemporaryLicense);
  state.hasPermanentLicense = Boolean(result.hasPermanentLicense);
  state.hasUsedTrial = Boolean(result.hasUsedTrial);
  setAuthHint(true, state.hasPermanentLicense, state.hasTemporaryLicense);
  toast(state.hasPermanentLicense ? '登录成功，正在进入账号中心。' : '登录成功，正在进入购买页。');
  setTimeout(() => { location.href = state.hasPermanentLicense ? '/user/dashboard/index' : '/products'; }, 350);
}

async function sendResetCode() {
  const form = asForm($('#store-forget-form'));
  if (!form) return;
  const button = asButton($('#send-reset-code'));
  const emailInput = asInput(form.elements.namedItem('email'));
  const email = emailInput?.value.trim() || '';
  if (!email || !emailInput?.reportValidity()) return;
  try {
    const result = await api('/verifications', { method: 'POST', body: JSON.stringify({ email, purpose: 'reset' }) });
    applyVerificationResponse(form, button, result);
  } catch (error) {
    const err = error as ApiError;
    if (err.retryAfter) startEmailCooldown(button, err.retryAfter);
    throw error;
  }
}

async function resetPassword(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  await api('/auth/password/reset', { method: 'POST', body: JSON.stringify({
    email: asInput(form.elements.namedItem('email'))?.value.trim(),
    code: asInput(form.elements.namedItem('code'))?.value.trim(),
    password: asInput(form.elements.namedItem('password'))?.value,
    confirmPassword: asInput(form.elements.namedItem('confirmPassword'))?.value,
  }) });
  toast('密码已重置，请重新登录。');
  setTimeout(() => { location.href = '/user/authentication/login'; }, 500);
}

function accountOrderActions(item: any) {
  const actions = [];
  if (item.status === 'pending') {
    if (item.payment?.qrCode) actions.push(`<button class="hb-button hb-button--secondary" data-order-pay="${escapeHtml(item.orderNo)}">继续支付</button>`);
  }
  if (['cancelled', 'expired', 'payment_failed', 'refunded'].includes(item.status)) {
    actions.push(`<button class="hb-button hb-button--secondary" data-order-archive="${escapeHtml(item.orderNo)}">清除记录</button>`);
  }
  return actions.length ? `<div class="hb-account-actions">${actions.join('')}</div>` : '';
}

function accountOrderCard(item: any) {
  const countdown = item.status === 'pending'
    ? `<p class="hb-order-countdown" data-order-expires="${escapeHtml(item.expiresAt)}" data-order-no="${escapeHtml(item.orderNo)}">剩余 ${orderCountdownText(item.expiresAt)}，超时后自动关闭</p>`
    : '';
  // 优先按订单记录的目标授权匹配：同一账号下的多张授权共享同一个 customerId，
  const target = item.orderType === 'addon'
    ? state.accountLicenses.find(license => license.activationCodeId === item.targetLicenseId)
      || state.accountLicenses.find(license => license.customerId === item.customerId)
    : null;
  const targetLine = target ? `<p>附加到：${escapeHtml(target.userLabel || target.productName)} · 激活码尾号 ${escapeHtml(target.codeHint)}</p>` : '';
  return `<article class="hb-account-item hb-account-item--row"><div class="hb-account-order-main"><h3>${escapeHtml(item.productName)}</h3><p>订单号：${escapeHtml(item.orderNo)}</p>${targetLine}<p>${escapeHtml(statusLabel(item))} · ${money(item.amountCents)}</p>${countdown}</div><div class="hb-account-order-side"><span>${escapeHtml(new Date(item.createdAt).toLocaleDateString('zh-CN'))}</span>${accountOrderActions(item)}</div></article>`;
}

/** 「加载更多订单」按钮：只在还有未加载的订单时出现，并写出剩余条数。
 *  被系统丢掉了 —— 界面上既看不到后面的单，也没有任何「还有更多」的提示。 */
function accountOrdersMoreButton() {
  const remaining = Number(state.accountOrdersTotal || 0) - Number(state.accountOrdersLoaded || 0);
  if (remaining <= 0) return '';
  return `<div class="hb-account-more"><button class="hb-button hb-button--secondary" type="button" data-orders-more>加载更多订单（还有 ${remaining} 单）</button></div>`;
}

async function loadMoreAccountOrders() {
  const container = $('#account-orders');
  const button = asButton(container?.querySelector('[data-orders-more]'));
  if (!container || !button) return;
  button.disabled = true;
  button.textContent = '加载中…';
  try {
    const offset = Number(state.accountOrdersLoaded || 0);
    const data = await api(`/orders?offset=${offset}&limit=20`) as any;
    const items = data.items || [];
    state.accountOrdersLoaded = offset + items.length;
    state.accountOrdersTotal = Number(data.ordersTotal ?? state.accountOrdersTotal);
    button.parentElement?.remove();
    container.insertAdjacentHTML(
      'beforeend',
      items.map(accountOrderCard).join('') + accountOrdersMoreButton(),
    );
  } catch (error) {
    button.disabled = false;
    button.textContent = '加载更多订单';
    throw error;
  }
}

/* 账号中心的元信息芯片。
   只做中性展示。颜色统一走 theme.css 的令牌，不要在 JS 里写色值。 */
function metaChip(text: unknown, variant = '') {
  return `<span class="hb-meta-chip${variant ? ` hb-meta-chip--${variant}` : ''}">${escapeHtml(text)}</span>`;
}

/* 授权/权益卡的「规格表」单元格：小号等宽标签 + 值。
   比一排长短不一的芯片更容易竖着对齐，宽屏下也能自己铺满内容区。 */
function factCell(label: string, value: unknown, variant = '') {
  return `<li><small>${escapeHtml(label)}</small><span${variant ? ` class="${variant}"` : ''}>${escapeHtml(value)}</span></li>`;
}

/* 生命周期 → 芯片配色：有效=绿、到期=琥珀（可续期，不是错误）、停用=红。 */
function licenseStateVariant(active: boolean, expired: boolean) {
  if (!active) return 'danger';
  return expired ? 'warning' : 'success';
}

/* 账号中心的 tab 切换：纯 class 切换，面板用 [hidden]，不做路由。 */
function showAccountTab(tab = 'licenses') {
  $$('[data-account-tab]').forEach(button => {
    const active = button.dataset.accountTab === tab;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $$('[data-account-panel]').forEach(panel => { panel.hidden = panel.dataset.accountPanel !== tab; });
}

function setText(selector: string, value: unknown) {
  const node = $(selector);
  if (node) node.textContent = String(value);
}

/* 概览统计条与 tab 计数 —— 都是 payload 的纯函数，别在别处再算一遍。 */
function renderAccountOverview(payload: any) {
  const licenses = payload.licenses || [];
  const entitlements = payload.entitlements || [];
  const orders = payload.orders || [];
  setText('#account-stat-licenses', licenses.length);
  setText('#account-stat-entitlements', entitlements.length);
  setText('#account-stat-orders', orders.length);
  setText('#account-stat-pending', orders.filter((item: any) => item.status === 'pending').length);
  setText('[data-account-tab-count="licenses"]', licenses.length);
  setText('[data-account-tab-count="addons"]', entitlements.length);
  setText('[data-account-tab-count="orders"]', orders.length);
}

function deploymentMarkup() {
  const scripts = state.configuration?.store?.deployScripts;
  if (!Array.isArray(scripts) || !scripts.length) return '';
  const rows = scripts.map((item: any) => `<article class="hb-deploy-cmd">
    <div class="hb-deploy-cmd__bar"><span class="hb-deploy-cmd__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="hb-deploy-cmd__label">${escapeHtml(item.label)}</span></div>
    <div class="hb-deploy-cmd__body"><code><span class="hb-deploy-cmd__prompt">$</span> ${escapeHtml(item.command)}</code><button type="button" class="hb-deploy-cmd__copy" data-deploy-copy="${escapeHtml(item.command)}">复制</button></div>
  </article>`).join('');
  return `<section class="hb-deploy" aria-label="一键部署指令">
    <header class="hb-deploy__head">
      <span class="hb-deploy__icon" aria-hidden="true"><i class="fa-duotone fa-regular fa-rocket-launch"></i></span>
      <div class="hb-deploy__title"><strong>一键部署 HomeOS</strong><small>复制到服务器的终端执行，脚本会自动拉取并启动服务。</small></div>
    </header>
    <div class="hb-deploy__commands">${rows}</div>
    <p class="hb-deploy__hint"><i class="fa-duotone fa-regular fa-circle-info" aria-hidden="true"></i> 部署完成后回到本页，用上方的激活码完成授权。</p>
  </section>`;
}

function renderAccount(payload: any) {
  const accountEmail = $('#account-email');
  if (accountEmail) accountEmail.textContent = payload.account.email;
  state.accountLicenses = payload.licenses || [];
  state.accountOrders = payload.orders || [];
  renderAccountOverview(payload);
  const licenses = $('#account-licenses');
  if (!licenses) return;
  const permanentProducts = primaryProducts().filter((item: any) => !isTrialProduct(item) && !item.soldOut);
  licenses.innerHTML = payload.licenses.length ? payload.licenses.map((item: any, index: number) => {
    const activationCode = item.activationCode || item.codeHint;
    const expired = item.accessExpiresAt && new Date(item.accessExpiresAt) <= new Date();
    const unavailable = expired
      ? '<small class="hb-account-code-note">试用已到期，请购买升级订单。支付完成后，原激活码将自动恢复生效。</small>'
      : item.activationCode
        ? ''
        : '<small class="hb-account-code-note">历史激活码无法恢复完整内容，请联系管理员处理。</small>';
    const releaseAction = item.device ? `<button class="hb-button hb-button--secondary" data-release-license="${escapeHtml(item.activationCodeId)}">解除设备绑定</button>` : '';
    const releasePolicyState = `<p class="hb-release-policy-state" data-release-policy-license="${escapeHtml(item.activationCodeId)}"></p>`;
    const labelAction = `<button class="hb-button hb-button--secondary" data-label-license="${escapeHtml(item.activationCodeId)}" data-current-label="${escapeHtml(item.userLabel || '')}">修改备注</button>`;
    // 重发激活码邮件：买家邮箱收不到时的自助入口（服务端按账号限流）。
    const emailAction = item.activationCode
      ? `<button class="hb-button hb-button--secondary" data-email-license="${escapeHtml(item.activationCodeId)}">重发激活码邮件</button>`
      : '';
    const upgradeAction = item.validityDays && permanentProducts.length
      ? `<a class="hb-button hb-button--primary" href="${escapeHtml(storePageHref('/products'))}&upgrade=${encodeURIComponent(item.activationCodeId)}">升级为永久授权</a>`
      : '';
    const actions = `<div class="hb-account-actions">${upgradeAction}${emailAction}${labelAction}${releaseAction}</div>`;
    // 来源与「是否手动发放」都由服务端下发（apps/store/core/serializers.py 的
    const source = item.issuanceSourceLabel || '后台发放';
    const status = !item.active ? '已停用' : expired ? '已到期' : '有效';
    const validity = item.validityDays ? `${item.validityDays} 天` : '永久授权';
    const period = item.accessExpiresAt ? `${item.accessStartedAt ? new Date(item.accessStartedAt).toLocaleDateString('zh-CN') : '发卡日'} 至 ${new Date(item.accessExpiresAt).toLocaleDateString('zh-CN')}` : validity;
    const manualNote = item.manuallyIssued ? '<p class="hb-account-manual-note">该授权由后台手动发放，因此没有支付订单。</p>' : '';
    const title = item.userLabel || `主授权 #${payload.licenses.length - index}`;
    const productLine = item.userLabel ? `<p>${escapeHtml(item.productName)}</p>` : '';
    const statusChip = metaChip(status, licenseStateVariant(item.active, expired));
    const facts = [
      factCell('来源', source),
      factCell('期限', period, item.validityDays ? '' : 'is-accent'),
      factCell('发卡时间', new Date(item.issuedAt).toLocaleString('zh-CN')),
    ].join('');
    const deviceLine = item.device
      ? `已绑定本机（硬件指纹）· <code>${escapeHtml(item.device.instanceId)}</code>`
      : '当前未绑定设备';
    return `<article class="hb-account-item hb-account-item--stacked"><header class="hb-account-head"><div class="hb-account-ident"><div class="hb-account-title"><h3>${escapeHtml(title)}</h3>${statusChip}</div>${productLine}</div>${actions}</header><div class="hb-account-body"><p class="hb-account-license-code"><span>激活码</span><code>${escapeHtml(activationCode)}</code>${unavailable}</p><ul class="hb-account-facts">${facts}</ul>${item.active ? deploymentMarkup() : ''}</div><footer class="hb-account-foot"><div class="hb-account-foot-main"><p class="hb-account-device">${deviceLine}</p>${manualNote}</div>${releasePolicyState}</footer></article>`;
  }).join('') : '<div class="hb-account-empty">账号下暂无授权。</div>';
  const entitlementSection = $('#account-entitlements-section');
  const entitlementList = $('#account-entitlements');
  const entitlements = payload.entitlements || [];
  state.accountEntitlements = entitlements;
  state.ownedFeatureCodes = new Set(entitlements.filter((item: any) => item.active).map((item: any) => item.featureCode));
  renderAddons();
  if (entitlementSection) entitlementSection.hidden = !entitlements.length;
  if (entitlementList) entitlementList.innerHTML = entitlements.map((item: any) => {
    const expired = Boolean(item.expiresAt) && new Date(item.expiresAt) <= new Date();
    const status = !item.active ? '已停用' : expired ? '已到期' : '有效';
    const validity = item.expiresAt ? `有效至 ${new Date(item.expiresAt).toLocaleDateString('zh-CN')}` : '永久';
    // 权益带 licenseId，定位它挂在哪张授权上。
    const target = state.accountLicenses.find(license =>
      license.activationCodeId === item.licenseId
    );
    const targetName = target ? `${target.userLabel || target.productName} · 激活码尾号 ${target.codeHint}` : '原主授权';
    const statusChip = metaChip(status, licenseStateVariant(item.active, expired));
    const facts = [
      factCell('附加到', targetName),
      factCell('有效期', validity, item.expiresAt ? '' : 'is-accent'),
    ].join('');
    return `<article class="hb-account-item hb-account-item--stacked"><header class="hb-account-head"><div class="hb-account-ident"><div class="hb-account-title"><h3>${escapeHtml(item.productName)}</h3>${statusChip}</div><p>${escapeHtml(addonTypeLabel(item))}</p></div></header><div class="hb-account-body"><ul class="hb-account-facts">${facts}</ul></div></article>`;
  }).join('');
  const orders = $('#account-orders');
  const orderItems = payload.orders || [];
  state.accountOrdersLoaded = orderItems.length;
  state.accountOrdersTotal = Number(payload.ordersTotal ?? orderItems.length);
  if (orders) orders.innerHTML = (orderItems.length
    ? orderItems.map(accountOrderCard).join('')
    : '<div class="hb-account-empty">账号下暂无订单。</div>')
    + accountOrdersMoreButton();
  clearInterval(state.accountCountdownTimer ?? undefined);
  const updateAccountCountdowns = () => {
    const nodes = $$('[data-order-expires]');
    let expiredOrderNo = null;
    nodes.forEach(node => {
      const remaining = orderRemainingSeconds(node.dataset.orderExpires);
      node.textContent = remaining > 0
        ? `剩余 ${orderCountdownText(node.dataset.orderExpires)}，超时后自动关闭`
        : '正在自动关闭并释放库存、优惠码…';
      if (remaining <= 0) expiredOrderNo ||= node.dataset.orderNo;
    });
    if (!expiredOrderNo || state.accountExpiryRefreshing) return;
    state.accountExpiryRefreshing = true;
    api(`/orders/${encodeURIComponent(expiredOrderNo)}`)
      .catch(() => null)
      .finally(() => loadAccount().catch(() => null))
      .finally(() => { state.accountExpiryRefreshing = false; });
  };
  updateAccountCountdowns();
  state.accountCountdownTimer = setInterval(updateAccountCountdowns, 1000);
  updateDeviceReleaseUi();
}

export async function loadAccount() {
  const payload = await api('/account') as any;
  state.account = payload.account;
  state.accountLicenses = payload.licenses || [];
  renderAccount(payload);
}

async function accountAction(event: Event) {
  const targetEl = event.target;
  if (!(targetEl instanceof Element)) return;
  // 复制部署指令。命令原文放在 data-deploy-copy 上而不是读 <code> 的文本：
  const copy = targetEl.closest('[data-deploy-copy]') as HTMLElement | null;
  if (copy) {
    try {
      await navigator.clipboard.writeText(copy.dataset.deployCopy || '');
      toast('部署指令已复制。');
    } catch (_) {
      // 非安全上下文（http 局域网）里 navigator.clipboard 不存在，只能让用户手动选。
      toast('复制失败，请手动选中命令复制。', 'err');
    }
    return;
  }
  const resend = targetEl.closest('[data-email-license]') as HTMLButtonElement | null;
  if (resend) {
    const licenseId = resend.dataset.emailLicense;
    const original = resend.textContent;
    resend.disabled = true;
    resend.textContent = '发送中…';
    try {
      const result = await api(`/account/licenses/${licenseId}/email`, { method: 'POST' }) as any;
      if (result.sent) toast(`激活码已发往 ${result.email}。`);
      else toast(result.deliveryError || '邮件未能发出，请稍后再试或联系客服。', 'err');
    } catch (error) {
      toast(errorMessage(error, '重发失败，请稍后再试。'), 'err');
    } finally {
      resend.disabled = false;
      resend.textContent = original;
    }
    return;
  }
  const label = targetEl.closest('[data-label-license]') as HTMLElement | null;
  if (label) {
    const dialog = asDialog($('#license-label-dialog'));
    const form = asForm($('#license-label-form'));
    if (!dialog || !form) return;
    state.labelLicenseId = label.dataset.labelLicense || null;
    const labelInput = asInput(form.elements.namedItem('label'));
    if (labelInput) {
      labelInput.value = label.dataset.currentLabel || '';
      dialog.showModal();
      labelInput.focus();
      labelInput.select();
    }
    return;
  }
  const release = targetEl.closest('[data-release-license]') as HTMLButtonElement | null;
  if (!release || state.releaseOpening) return;
  const activationCodeId = release.dataset.releaseLicense || '';
  state.releaseOpening = true;
  release.disabled = true;
  release.textContent = '读取解绑设置…';
  try {
    await loadAccount();
    const license = state.accountLicenses.find((item: any) => item.activationCodeId === activationCodeId);
    if (!license?.device) {
      toast('该授权当前没有绑定设备，已刷新账号信息。');
      return;
    }
    const dialog = asDialog($('#release-device-dialog'));
    const form = asForm($('#release-device-form'));
    if (!dialog || !form) return;
    state.releaseLicenseId = activationCodeId;
    state.releaseTarget = {
      expectedBindingId: license.device.bindingId,
      expectedActivatedAt: license.device.activatedAt,
      expectedBindingVersion: license.device.bindingVersion,
    };
    const target = $('#release-device-target');
    const targetLabel = document.createElement('span');
    const targetId = document.createElement('code');
    targetLabel.textContent = `${license.userLabel || license.productName} · 设备`;
    targetId.textContent = license.device.instanceId || '';
    target?.replaceChildren(targetLabel, targetId);
    form.reset();
    const password = asInput(form.elements.namedItem('password'));
    if (password) password.type = 'password';
    const toggle = form.querySelector('[data-password-toggle]');
    if (toggle) {
      toggle.textContent = '显示';
      toggle.setAttribute('aria-label', '显示密码');
    }
    const errBox = form.querySelector('.hb-release-error') as HTMLElement | null;
    if (errBox) errBox.hidden = true;
    updateDeviceReleaseUi();
    dialog.showModal();
    if (releaseRemainingSeconds() > 0) {
      asButton(form.querySelector('[data-release-close]'))?.focus();
    } else {
      password?.focus();
    }
  } catch (error) {
    toast(errorMessage(error), 'err');
  } finally {
    state.releaseOpening = false;
    release.disabled = false;
    updateDeviceReleaseUi();
  }
}

async function saveLicenseLabel(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const submit = asButton(form.querySelector('[type="submit"]'));
  if (!state.labelLicenseId || !form.reportValidity()) return;
  if (submit) submit.disabled = true;
  try {
    await api(`/account/licenses/${state.labelLicenseId}/label`, {
      method: 'PATCH',
      body: JSON.stringify({
        label: asInput(form.elements.namedItem('label'))?.value.trim() || null,
      }),
    });
    asDialog($('#license-label-dialog'))?.close();
    state.labelLicenseId = null;
    toast('授权备注已保存。');
    await loadAccount();
  } catch (error) {
    toast(errorMessage(error), 'err');
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function accountOrderAction(event: Event) {
  const _t = event.target;
  if (!(_t instanceof Element)) return;
  const pay = _t.closest('[data-order-pay]') as HTMLElement | null;
  const archive = _t.closest('[data-order-archive]') as HTMLButtonElement | null;
  if (pay) {
    const account = (await api('/account')) as any;
    const order = (account.orders || []).find(
      (item: any) => item.orderNo === pay.dataset.orderPay,
    );
    if (order) showPayment(order);
    return;
  }
  if (archive) {
    const ok = await confirmAction({
      kicker: 'Clear Record',
      title: '清除这条订单记录？',
      message: '这条订单记录会从账号中心移除，账号下其他订单和授权不受影响。',
      detail: '如果之后还需要查这笔订单的金额或状态，请联系客服。',
      confirmLabel: '清除记录',
      tone: 'danger',
    });
    if (!ok) return;
    archive.disabled = true;
    try {
      await archiveOrder(archive.dataset.orderArchive || '');
    } catch (error) {
      toast(errorMessage(error), 'err');
      archive.disabled = false;
    }
  }
}

async function releaseDevice(event: Event) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const errorNode = form.querySelector('.hb-release-error') as HTMLElement | null;
  if (!state.releaseLicenseId || !state.releaseTarget || state.releaseSubmitting) return;
  if (releaseRemainingSeconds() > 0) {
    updateDeviceReleaseUi();
    return;
  }
  if (!form.reportValidity()) return;
  const password = asInput(form.elements.namedItem('password'))?.value || '';
  state.releaseSubmitting = true;
  updateDeviceReleaseUi();
  if (errorNode) errorNode.hidden = true;
  try {
    await api(`/account/licenses/${state.releaseLicenseId}/release`, {
      method: 'POST',
      body: JSON.stringify({ password, ...state.releaseTarget }),
    });
    asDialog($('#release-device-dialog'))?.close();
    state.releaseLicenseId = null;
    state.releaseTarget = null;
    toast('设备已解绑。请回到 HomeOS 激活页，用商店购买邮箱与激活码重新激活。');
    await loadAccount();
  } catch (error) {
    const err = error as ApiError;
    if (errorNode) {
      errorNode.textContent = errorMessage(error);
      errorNode.hidden = false;
    }
    if (err.status === 409) {
      asDialog($('#release-device-dialog'))?.close();
      toast(errorMessage(error), 'err');
      await loadAccount().catch(() => null);
    } else if (err.status === 429) {
      await loadAccount().catch(() => null);
    }
  } finally {
    state.releaseSubmitting = false;
    updateDeviceReleaseUi();
    const dialog = asDialog($('#release-device-dialog'));
    const passwordInput = asInput(form.elements.namedItem('password'));
    if (errorNode && !errorNode.hidden && dialog?.open && passwordInput && !passwordInput.disabled) {
      passwordInput.select();
    }
  }
}

async function logout() {
  await api('/auth/logout', { method: 'DELETE' });
  setAuthHint(false);
  location.href = '/user/authentication/login';
}

async function init() {
  $('.hb-store-nav-toggle')?.addEventListener('click', () => {
    $('#navbarNav')?.classList.toggle('mobile-open');
  });
  $$('[data-product-filter]').forEach((button) =>
    button.addEventListener('click', () =>
      applyProductFilter(button.dataset.productFilter || 'all'),
    ),
  );
  $$('[data-account-tab]').forEach((button) =>
    button.addEventListener('click', () =>
      showAccountTab(button.dataset.accountTab || 'licenses'),
    ),
  );
  // ESC 和「关闭」按钮都会关掉这个 <dialog>，把停表和清空当前订单挂在 close
  asDialog($('#payment-dialog'))?.addEventListener('close', () => {
    stopPaymentTimers();
    state.currentOrder = null;
  });
  $$('#payment-dialog [data-payment-close]').forEach((button) =>
    button.addEventListener('click', () => asDialog($('#payment-dialog'))?.close()),
  );
  // 「我已完成支付」：不等下一轮 3 秒轮询，立刻查一次状态；订单超时被关单后后端对「关单时发现
  asButton($('#payment-refresh'))?.addEventListener('click', async () => {
    const order = state.currentOrder;
    if (!order) return;
    const button = asButton($('#payment-refresh'));
    const status = $('#payment-status');
    const previous = status?.textContent || '';
    if (button) button.disabled = true;
    if (status) status.textContent = '正在向服务端确认支付结果…';
    const ok = await pollOrder(order.orderNo || '', order.lookupToken);
    if (button) button.disabled = false;
    // 查单失败时把状态文案还原：停在「正在确认…」会让用户以为卡住了。
    if (!ok) {
      if (status) status.textContent = previous;
      toast('查询支付结果失败，请检查网络后重试。');
    }
  });
  asButton($('#payment-cancel'))?.addEventListener('click', (event) =>
    cancelPendingOrderFrom(event.currentTarget as HTMLButtonElement, state.currentOrder),
  );
  $('#guest-purchase-trigger')?.addEventListener('click', showGuestPurchaseNotice);
  $('#guest-purchase-dismiss')?.addEventListener('click', () =>
    asDialog($('#guest-purchase-dialog'))?.close(),
  );
  // 待支付订单弹窗：右上角 X / ESC 只是关掉提示（订单仍然有效，倒计时继续走），
  asDialog($('#pending-order-dialog'))?.addEventListener('close', () => {
    clearInterval(state.pendingCountdownTimer ?? undefined);
    state.pendingCountdownTimer = null;
  });
  $$('#pending-order-dialog [data-pending-close]').forEach((button) =>
    button.addEventListener('click', () => asDialog($('#pending-order-dialog'))?.close()),
  );
  asButton($('#pending-order-cancel'))?.addEventListener('click', (event) =>
    cancelPendingOrderFrom(event.currentTarget as HTMLButtonElement, state.pendingOrder),
  );
  $('#pending-order-continue')?.addEventListener('click', () => {
    const order = state.pendingOrder;
    asDialog($('#pending-order-dialog'))?.close();
    clearInterval(state.pendingCountdownTimer ?? undefined);
    state.pendingCountdownTimer = null;
    if (order) showPayment(order);
  });
  $('#share-product')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast('商品链接已复制。');
    } catch (_) {
      toast('复制失败，请从地址栏复制。');
    }
  });
  const purchaseForm = asForm($('#purchase-form'));
  purchaseForm?.addEventListener('submit', createOrder);
  const couponInput = asInput(purchaseForm?.elements.namedItem('couponCode'));
  couponInput?.addEventListener('input', scheduleCouponPreview);
  couponInput?.addEventListener('blur', () => {
    clearTimeout(state.couponPreviewTimer ?? undefined);
    if (couponInput.value.trim()) previewCoupon();
  });
  $('#store-login-form')?.addEventListener('submit', (event) =>
    login(event).catch((error) => toast(errorMessage(error), 'err')),
  );
  $('#send-register-code')?.addEventListener('click', () =>
    sendRegisterCode().catch((error) => toast(errorMessage(error), 'err')),
  );
  $('#store-register-form')?.addEventListener('submit', (event) =>
    register(event).catch((error) => toast(errorMessage(error), 'err')),
  );
  $('#send-reset-code')?.addEventListener('click', () =>
    sendResetCode().catch((error) => toast(errorMessage(error), 'err')),
  );
  $('#store-forget-form')?.addEventListener('submit', (event) =>
    resetPassword(event).catch((error) => toast(errorMessage(error), 'err')),
  );
  $('#account-licenses')?.addEventListener('click', accountAction);
  $('#account-orders')?.addEventListener('click', (event) => {
    // 「加载更多」按钮与订单操作共用同一个委派监听：都在 #account-orders 里。
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-orders-more]')) {
      return loadMoreAccountOrders().catch((error) => toast(errorMessage(error), 'err'));
    }
    return accountOrderAction(event).catch((error) => toast(errorMessage(error), 'err'));
  });
  $('#release-device-form')?.addEventListener('submit', releaseDevice);
  $('#license-label-form')?.addEventListener('submit', saveLicenseLabel);
  $$('[data-release-close]').forEach((button) =>
    button.addEventListener('click', () => {
      asDialog($('#release-device-dialog'))?.close();
      state.releaseLicenseId = null;
      state.releaseTarget = null;
    }),
  );
  asDialog($('#release-device-dialog'))?.addEventListener('close', () => {
    state.releaseLicenseId = null;
    state.releaseTarget = null;
    asForm($('#release-device-form'))?.reset();
  });
  $$('[data-label-close]').forEach((button) =>
    button.addEventListener('click', () => {
      asDialog($('#license-label-dialog'))?.close();
      state.labelLicenseId = null;
    }),
  );
  $('#store-logout')?.addEventListener('click', () =>
    logout().catch((error) => toast(errorMessage(error), 'err')),
  );
  bindPasswordControls(asForm($('#store-login-form')));
  bindPasswordControls(asForm($('#store-register-form')));
  bindPasswordControls(asForm($('#store-forget-form')));
  bindPasswordControls(asForm($('#release-device-form')));
  try {
    const configuration = (await api('/configuration')) as any;
    state.configuration = configuration;
    applyConfiguration();
    if (applyMaintenanceMode()) return;
    const products = (await api('/products')) as any;
    state.products = products.items;
    renderProducts();
    renderAddons();
    const authentication = (await api('/auth/me').catch(() => null)) as any;
    state.account = authentication?.account || null;
    state.hasLicense = Boolean(authentication?.hasLicense);
    state.hasTemporaryLicense = Boolean(authentication?.hasTemporaryLicense);
    state.hasPermanentLicense = Boolean(authentication?.hasPermanentLicense);
    state.hasUsedTrial = Boolean(authentication?.hasUsedTrial);
    setAuthHint(Boolean(state.account), state.hasPermanentLicense, state.hasTemporaryLicense);
    renderProducts();
    const accountOverview = state.hasLicense ? ((await api('/account')) as any) : null;
    if (accountOverview) {
      state.accountLicenses = accountOverview.licenses || [];
      state.accountEntitlements = accountOverview.entitlements || [];
      state.ownedFeatureCodes = new Set(
        (accountOverview.entitlements || [])
          .filter((item: any) => item.active)
          .map((item: any) => item.featureCode),
      );
    }
    renderAddons();
    if (['account', 'referrals'].includes(currentPage()) && !state.account) {
      location.replace('/user/authentication/login');
      return;
    }
    chooseProduct();
    document.body.classList.remove('hb-store-loading');
    showPage();
    if (currentPage() === 'item' && state.product && primaryProductUnavailable(state.product)) {
      location.replace(storePageHref('/products'));
      return;
    }
    const productId = state.product?.id;
    if (
      currentPage() === 'item' &&
      state.account &&
      !state.hasPermanentLicense &&
      productId &&
      addonProducts().some((item: any) => item.id === productId)
    ) {
      location.replace(storePageHref('/products'));
      return;
    }
    if (
      currentPage() === 'item' &&
      state.hasPermanentLicense &&
      productId &&
      addonProducts().some((item: any) => item.id === productId) &&
      !availableAddonProducts().some((item: any) => item.id === productId)
    ) {
      location.replace('/user/dashboard/index');
      return;
    }
    renderProduct();
    applyAccountUi();
    if (currentPage() === 'referrals') await HBReferrals.init();
    if (currentPage() === 'account') {
      if (accountOverview) renderAccount(accountOverview);
      else await loadAccount();
    }
  } catch (error) {
    document.body.classList.remove('hb-store-loading');
    if (!document.body.classList.contains('hb-maintenance-active')) showPage();
    toast(errorMessage(error), 'err');
  }
}

init();
