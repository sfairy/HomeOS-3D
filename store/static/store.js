(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const STORE_PAGE_REVISION = '20260909-referrals-v1';
  const storePageHref = path => `${path}${path.includes('?') ? '&' : '?'}v=${STORE_PAGE_REVISION}`;
  // 接口下发的 logo_url 与商品图路径不带版本号，浏览器会按启发式缓存复用旧图。
  // 这里复用页面已加载的 theme.css 上的 ?v=（由 tools/bump_static_cache_versions.mjs
  // 统一维护），给商店静态资源补上版本号，避免图标更新后仍显示旧文件。
  let storeStaticVersion;
  function versionedStoreAsset(url) {
    if (typeof url !== 'string' || !url.startsWith('/store-static/') || url.includes('?')) return url;
    if (storeStaticVersion === undefined) {
      const link = document.querySelector('link[rel="stylesheet"][href*="theme.css"]');
      storeStaticVersion = (link?.getAttribute('href')?.match(/[?&]v=([^&]+)/) || [])[1] || '';
    }
    return storeStaticVersion ? `${url}?v=${storeStaticVersion}` : url;
  }
  const state = { products: [], product: null, configuration: null, account: null, hasLicense: false, hasTemporaryLicense: false, hasPermanentLicense: false, hasUsedTrial: false, accountLicenses: [], accountEntitlements: [], accountOrders: [], productFilter: 'all', ownedFeatureCodes: new Set(), pollTimer: null, paymentCountdownTimer: null, pendingCountdownTimer: null, accountCountdownTimer: null, accountExpiryRefreshing: false, emailCooldownTimers: new Map(), deviceReleasePolicy: null, releaseCountdownTimer: null, releaseOpening: false, releaseSubmitting: false, releaseLicenseId: null, releaseTarget: null, labelLicenseId: null, currentOrder: null, pendingOrder: null, couponPreviewTimer: null, couponPreviewSequence: 0 };
  const money = cents => `¥${(Number(cents || 0) / 100).toFixed(2)}`;
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

  function toast(message) {
    const node = $('#store-toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node.timer);
    node.timer = setTimeout(() => node.classList.remove('show'), 3200);
  }

  async function api(path, options = {}) {
    const response = await fetch(`/store/v1${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof body?.detail === 'string' ? body.detail : '请求失败，请稍后重试。');
      error.status = response.status;
      error.payload = body;
      error.retryAfter = Number(response.headers.get('Retry-After') || 0);
      throw error;
    }
    if (path === '/account') updateDeviceReleasePolicy(body);
    return body;
  }

  function releaseDurationText(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const remainder = total % 60;
    return [hours ? `${hours} 小时` : '', minutes ? `${minutes} 分钟` : '', remainder ? `${remainder} 秒` : ''].filter(Boolean).join(' ') || '0 秒';
  }

  function releasePolicyFor(activationCodeId) {
    const license = state.accountLicenses.find(item => item.activationCodeId === activationCodeId);
    return license?.deviceReleasePolicy || { cooldownSeconds: state.deviceReleasePolicy?.cooldownSeconds || 0, nextAllowedAt: null, deadline: 0 };
  }

  function releaseRemainingSeconds(activationCodeId = state.releaseLicenseId) {
    return Math.max(0, Math.ceil(((releasePolicyFor(activationCodeId).deadline || 0) - performance.now()) / 1000));
  }

  function updateDeviceReleasePolicy(payload) {
    const globalPolicy = payload?.deviceReleasePolicy || { cooldownSeconds: 86400, nextAllowedAt: null, remainingSeconds: 0 };
    const configuredCooldown = Number(globalPolicy.cooldownSeconds);
    const cooldownSeconds = Number.isFinite(configuredCooldown) ? Math.max(0, configuredCooldown) : 86400;
    const serverNow = Date.parse(payload?.serverTime);
    state.deviceReleasePolicy = { cooldownSeconds };
    (payload?.licenses || []).forEach(license => {
      // The global policy fallback keeps a rolling deployment safe while an old
      // API node still returns the previous account-level countdown shape.
      const policy = license.deviceReleasePolicy || globalPolicy;
      const nextAllowedAt = Date.parse(policy.nextAllowedAt);
      // Use the server's clock to establish each license's remaining interval,
      // then advance it monotonically without relying on the device clock.
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
    clearInterval(state.releaseCountdownTimer);
    state.releaseCountdownTimer = null;
    updateDeviceReleaseUi();
    if ((payload?.licenses || []).some(license => (license.deviceReleasePolicy?.deadline || 0) > performance.now())) {
      state.releaseCountdownTimer = setInterval(() => {
        updateDeviceReleaseUi();
        if (!state.accountLicenses.some(license => releaseRemainingSeconds(license.activationCodeId) > 0)) {
          clearInterval(state.releaseCountdownTimer);
          state.releaseCountdownTimer = null;
        }
      }, 1000);
    }
  }

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
      const license = state.accountLicenses.find(item => item.activationCodeId === activationCodeId);
      const licensePolicy = releasePolicyFor(activationCodeId);
      const remaining = releaseRemainingSeconds(activationCodeId);
      node.hidden = !license?.device && remaining === 0;
      const nextTime = licensePolicy.nextAllowedAt !== null && remaining > 0
        ? `下次可解绑时间：${new Date(licensePolicy.nextAllowedAt).toLocaleString('zh-CN', { hour12: false })}`
        : '';
      node.textContent = remaining > 0
        ? `这份授权还需等待 ${releaseDurationText(remaining)}。${nextTime}`
        : '这份授权当前可以解绑。';
    });
    const form = $('#release-device-form');
    if (!form) return;
    const licensePolicy = releasePolicyFor(state.releaseLicenseId);
    const remaining = releaseRemainingSeconds();
    const nextTime = licensePolicy.nextAllowedAt !== null && remaining > 0
      ? `下次可解绑时间：${new Date(licensePolicy.nextAllowedAt).toLocaleString('zh-CN', { hour12: false })}。`
      : '';
    const availability = remaining > 0
      ? `这份授权还需等待 ${releaseDurationText(remaining)}。${nextTime}`
      : '这份授权当前可以解绑。';
    $('#release-device-policy').textContent = remaining > 0 ? rule : `请输入当前账号的登录密码。${rule}`;
    const status = $('#release-device-status');
    status.textContent = availability;
    status.hidden = remaining === 0;
    $('#release-device-password').hidden = remaining > 0;
    form.elements.password.disabled = remaining > 0 || state.releaseSubmitting;
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = remaining > 0 || state.releaseSubmitting;
    submit.textContent = state.releaseSubmitting ? '正在解绑…' : remaining > 0 ? '冷却中' : '确认解绑';
  }

  function orderRemainingSeconds(expiresAt) {
    return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
  }

  function orderCountdownText(expiresAt) {
    const remaining = orderRemainingSeconds(expiresAt);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  function stopPaymentTimers() {
    if (state.pollTimer !== null) clearInterval(state.pollTimer);
    if (state.paymentCountdownTimer !== null) clearInterval(state.paymentCountdownTimer);
    state.pollTimer = null;
    state.paymentCountdownTimer = null;
  }

  function currentPage() {
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

  function showPage() {
    const page = currentPage();
    $$('[data-store-page]').forEach(node => { node.hidden = node.dataset.storePage !== page; });
    const activePage = page === 'referrals' ? 'referrals' : page === 'home' ? 'home' : page === 'products' ? 'purchase' : page === 'item' ? (primaryProducts().some(item => item.id === state.product?.id) ? 'purchase' : 'account') : ['login', 'register', 'forget'].includes(page) ? 'login' : 'account';
    $$('[data-hb-nav]').forEach(link => {
      const active = link.dataset.hbNav === activePage;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  }

  function applyConfiguration() {
    const store = state.configuration?.store;
    if (!store) return;
    document.title = store.siteTitle;
    $('#footer-site-name').textContent = store.siteName;
    $$('.hb-store-brand-mark').forEach(image => { image.src = versionedStoreAsset(store.logoUrl); });
    if (store.announcement) toast(store.announcement);
  }

  function applyMaintenanceMode() {
    const store = state.configuration?.store;
    const enabled = Boolean(store?.maintenanceMode);
    const maintenancePage = $('#store-maintenance');
    document.body.classList.toggle('hb-maintenance-active', enabled);
    maintenancePage.hidden = !enabled;
    if (!enabled) return false;
    $('#maintenance-site-name').textContent = store.siteName || 'HomeOS';
    $('#store-maintenance-message').textContent = store.maintenanceMessage || '系统正在升级维护，请稍后再试。';
    document.title = `商城维护中 - ${store.siteTitle || store.siteName || 'HomeOS'}`;
    stopPaymentTimers();
    document.body.classList.remove('hb-store-loading');
    return true;
  }

  function chooseProduct() {
    if (currentPage() !== 'item') { state.product = null; return; }
    const requested = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
    state.product = state.products.find(item => item.id === requested) || null;
  }

  function primaryProducts() {
    return state.products.filter(item => ['base', 'bundle', 'package'].includes(item.productType));
  }

  function isTrialProduct(product) {
    return product.validityDays !== null && product.validityDays !== undefined;
  }

  function requestedUpgradeCustomerId() {
    return new URLSearchParams(location.search).get('upgrade');
  }

  function productHref(product) {
    const base = storePageHref(`/item/${encodeURIComponent(product.id)}`);
    const upgrade = requestedUpgradeCustomerId();
    return upgrade && !isTrialProduct(product) ? `${base}&upgrade=${encodeURIComponent(upgrade)}` : base;
  }

  function availablePrimaryProducts() {
    return primaryProducts().filter(product => !primaryProductUnavailable(product));
  }

  function addonProducts() {
    return state.products.filter(item => ['template', 'module'].includes(item.productType));
  }

  function isAddonProduct(product) {
    return ['template', 'module'].includes(product?.productType);
  }

  function addonTypeLabel(product) {
    if (product?.productType === 'package') return '自定义套餐';
    return product?.productType === 'module' ? '功能增量包' : 'UI 方案包';
  }

  function availableAddonProducts() {
    const eligible = state.accountLicenses.filter(item => item.active && !item.validityDays && !item.accessExpiresAt);
    return addonProducts().filter(product => eligible.some(license => {
      const owned = new Set(state.accountEntitlements
        .filter(item => item.active && item.customerId === license.customerId)
        .map(item => item.featureCode));
      return !(product.featureCodes || []).length || (product.featureCodes || []).some(code => !owned.has(code));
    }));
  }

  function primaryProductUnavailable(product) {
    return isTrialProduct(product) && (state.hasPermanentLicense || state.hasUsedTrial);
  }

  /* 商品分组的唯一口径：筛选 tab、卡片上的 data-product-group、首页速览都用它。
     自定义套餐归入「主授权」组（它同样是一次性的基础能力购买），只是徽标另说。 */
  function productGroup(product) {
    if (isAddonProduct(product)) return 'addon';
    if (isTrialProduct(product)) return 'trial';
    return product.productType === 'bundle' ? 'bundle' : 'base';
  }

  function primaryCard(product) {
    const bundle = product.productType === 'bundle';
    const unavailable = primaryProductUnavailable(product);
    const action = unavailable
      ? `<span class="hb-button hb-button--secondary hb-button--sm is-disabled">${state.hasPermanentLicense ? '已有永久授权' : '已购买试用'}</span>`
      : product.soldOut
      ? '<span class="hb-button hb-button--secondary hb-button--sm is-disabled">已售罄</span>'
      : `<a class="hb-button hb-button--primary hb-button--sm" href="${productHref(product)}">${state.account ? (requestedUpgradeCustomerId() && !isTrialProduct(product) ? '选择升级版本' : '选择此版本') : '查看详情'}</a>`;
    const badge = isTrialProduct(product) ? `${product.validityDays} 天试用` : bundle ? '全授权' : product.productType === 'package' ? '自定义套餐' : '主授权';
    // 每个主授权卡都要有一行说明：套餐卡展示所含内容，其余卡展示商品说明（与详情页
    // #store-product-description 同源）。否则「主授权」卡只有徽标+标题，同排被套餐卡拉
    // 齐高度后不但显空，标题还会比其他卡低一截。
    const summary = product.productType === 'package' ? packageContentsText(product) : product.displayDescription || product.note || '';
    const contents = summary ? `<p>${escapeHtml(summary)}</p>` : '';
    return `<article class="hb-addon-card${unavailable ? ' is-purchased' : ''}" data-product-group="${productGroup(product)}"><span class="hb-addon-card__badge">${escapeHtml(badge)}</span><h3>${escapeHtml(product.name)}</h3>${contents}<div class="hb-addon-card__footer"><strong>${money(product.priceCents)}</strong>${action}</div></article>`;
  }

  /* 商品页的 tab 筛选：只切 .is-filtered，不重排 DOM，
     这样切来切去不会丢焦点，也不需要重新渲染卡片。 */
  function applyProductFilter(value = state.productFilter) {
    state.productFilter = value;
    $$('[data-product-filter]').forEach(button => {
      const active = button.dataset.productFilter === value;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    $$('#products-grid .hb-addon-card').forEach(card => {
      card.classList.toggle('is-filtered', value !== 'all' && card.dataset.productGroup !== value);
    });
  }

  /* 上架商品清单：主授权永远显示；增量包只在账号已有永久授权时出现
     （没有可附加的激活码，展示出来也买不了，与 init() 的跳转守卫同口径）。 */
  function catalogCards() {
    const cards = primaryProducts().map(product => ({ group: productGroup(product), html: primaryCard(product) }));
    if (state.hasPermanentLicense) {
      addonProducts().forEach(product => cards.push({ group: 'addon', html: addonCard(product) }));
    }
    return cards;
  }

  function renderProducts() {
    const cards = catalogCards();
    // 没有任何主授权在售时，顶栏「购买授权」与页脚入口都收起来，
    // 避免把用户送进一个空页面。语义是「完全没上架」，不是「已经买完」。
    document.documentElement.classList.toggle('hb-no-base-products', !primaryProducts().length);
    const counts = { all: cards.length, base: 0, bundle: 0, trial: 0, addon: 0 };
    cards.forEach(card => { counts[card.group] += 1; });
    const emptyMarkup = '<div class="hb-addons-empty">暂无主授权或全授权上架。</div>';
    const markup = cards.length ? cards.map(card => card.html).join('') : emptyMarkup;
    const grid = $('#products-grid');
    if (grid) grid.innerHTML = markup;
    $$('[data-product-count]').forEach(node => {
      const key = node.dataset.productCount;
      node.textContent = String(counts[key] ?? 0);
    });
    $$('[data-product-filter]').forEach(button => {
      const key = button.dataset.productFilter;
      button.hidden = key !== 'all' && !counts[key];
    });
    if (state.productFilter !== 'all' && !counts[state.productFilter]) state.productFilter = 'all';
    applyProductFilter(state.productFilter);
  }

  function addonCard(product) {
    const type = addonTypeLabel(product);
    const description = product.displayDescription || product.note || '购买后追加到现有激活码。';
    const action = product.soldOut
      ? '<span class="hb-button hb-button--secondary hb-button--sm is-disabled">已售罄</span>'
      : `<a class="hb-button hb-button--primary hb-button--sm" href="${storePageHref(`/item/${encodeURIComponent(product.id)}`)}">${state.account ? '查看并购买' : '查看详情'}</a>`;
    return `<article class="hb-addon-card" data-product-group="addon"><span class="hb-addon-card__badge">${escapeHtml(type)}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(description)}</p><div class="hb-addon-card__footer"><strong>${money(product.priceCents)}</strong>${action}</div></article>`;
  }

  function renderAddons() {
    const availableProducts = availableAddonProducts();
    const offers = $('#account-addon-offers');
    const section = $('#account-addon-offers-section');
    if (offers && section) {
      section.hidden = !state.hasPermanentLicense || !availableProducts.length;
      offers.innerHTML = availableProducts.map(addonCard).join('');
    }
  }

  function packageContentsText(product) {
    // 「主授权」是套餐默认包含的基础授权（includedProductIds 里只有增量包，基础授权是隐式的），
    // 所以这里只能给字面量。不要写死品牌：站点名在后台可改，写死会跟站点名对不上。
    return ['主授权', ...(product.packageItems || []).map(item => item.name)].join(' + ');
  }

  function renderProduct() {
    const product = state.product;
    const empty = !product;
    $('#store-empty-state').hidden = !empty;
    $('#store-checkout-shell').hidden = empty;
    $('#store-checkout-assurances').hidden = empty;
    if (empty) return;
    $('#hb-checkout-title').textContent = product.name;
    $('#store-product-price').textContent = money(product.priceCents);
    const manual = product.fulfillmentMode === 'manual';
    const addon = isAddonProduct(product);
    const packageSummary = $('#store-package-contents');
    packageSummary.hidden = product.productType !== 'package';
    packageSummary.textContent = product.productType === 'package'
      ? `套餐包含：${packageContentsText(product)}。购买后共用一个激活码。` : '';
    const unavailable = !addon && primaryProductUnavailable(product);
    $('#store-product-description').textContent = product.displayDescription || product.note || (addon
      ? `支付确认后${addonTypeLabel(product)}会自动添加到选中的原激活码。`
      : manual ? '支付确认后由管理员核对并发放激活码。' : '支付确认后系统自动生成激活码，并在账号中心显示。');
    $('#store-delivery-label').textContent = addon ? '自动开通' : manual ? '手动发货' : '自动发货';
    $('#store-delivery-fact').textContent = addon ? '原激活码自动更新' : manual ? '后台确认后发放' : '账号中心显示激活码';
    $('#store-stock-fact').textContent = product.stockQuantity === null || product.stockQuantity === undefined
      ? '不限量'
      : product.soldOut ? '已售罄' : `剩余 ${product.availableStock} 份`;
    $('#coupon-section').hidden = manual;
    resetCouponPreview(true);
    $('#addon-target').hidden = !addon;
    if (addon) renderAddonTargets();
    const image = $('#store-product-image');
    image.src = versionedStoreAsset(product.imageUrl || '/store-static/homeos-mark.svg');
    image.alt = product.name;
    image.closest('.hb-product-cover')?.classList.toggle('has-product-image', Boolean(product.imageUrl));
    const submit = $('#purchase-form').querySelector('[type="submit"]');
    submit.disabled = Boolean(product.soldOut || unavailable);
    submit.innerHTML = product.soldOut
      ? '已售罄'
      : unavailable
        ? (state.hasPermanentLicense ? '已有永久授权，不可购买试用' : '每个账号只能购买一次试用')
        : '<i class="fa-duotone fa-regular fa-qrcode"></i> 支付宝付款';
  }

  function resetCouponPreview(clearInput = false) {
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

  function setCouponFeedback(kind, message) {
    const input = $('#purchase-form')?.elements.couponCode;
    const wrapper = input?.closest('.hb-coupon-input');
    const feedback = $('#coupon-feedback');
    wrapper?.classList.remove('is-valid', 'is-invalid');
    feedback.classList.remove('is-checking', 'is-valid', 'is-invalid');
    if (kind === 'valid' || kind === 'invalid') wrapper?.classList.add(`is-${kind}`);
    feedback.classList.add(`is-${kind}`);
    feedback.textContent = message;
    feedback.hidden = false;
  }

  async function previewCoupon() {
    const form = $('#purchase-form');
    const product = state.product;
    const input = form?.elements.couponCode;
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
      if (sequence !== state.couponPreviewSequence || couponCode !== input.value.trim()) return;
      setCouponFeedback('valid', `优惠码有效，优惠 ${money(result.discountCents)}`);
      $('#store-product-price-label').textContent = '优惠后';
      $('#store-product-original-price').textContent = money(result.originalAmountCents);
      $('#store-product-original-price').hidden = false;
      $('#store-product-price').textContent = money(result.amountCents);
    } catch (_) {
      if (sequence !== state.couponPreviewSequence || couponCode !== input.value.trim()) return;
      setCouponFeedback('invalid', '优惠码无效');
      $('#store-product-price-label').textContent = '应付金额';
      $('#store-product-original-price').hidden = true;
      $('#store-product-price').textContent = money(product.priceCents);
    }
  }

  function scheduleCouponPreview() {
    clearTimeout(state.couponPreviewTimer);
    const input = $('#purchase-form')?.elements.couponCode;
    if (!input?.value.trim()) {
      resetCouponPreview(false);
      return;
    }
    $('#store-product-price-label').textContent = '应付金额';
    $('#store-product-original-price').hidden = true;
    if (state.product) $('#store-product-price').textContent = money(state.product.priceCents);
    setCouponFeedback('checking', '正在验证优惠码…');
    state.couponPreviewTimer = setTimeout(() => previewCoupon(), 450);
  }

  function showPayment(order) {
    if (!order.payment?.qrCode) { toast('该订单暂无可用付款二维码。'); return; }
    const dialog = $('#payment-dialog');
    state.currentOrder = order;
    $('#payment-product').textContent = order.productName;
    $('#payment-price').textContent = money(order.amountCents);
    $('#payment-order').textContent = order.orderNo;
    $('#payment-status').textContent = '等待支付';
    $('#payment-status').classList.remove('done');
    const qr = $('#payment-qr');
    qr.replaceChildren();
    window.jQuery(qr).qrcode({ width: 198, height: 198, text: order.payment.qrCode });
    dialog.showModal();
    stopPaymentTimers();
    const updateCountdown = () => {
      const remaining = orderRemainingSeconds(state.currentOrder?.expiresAt || order.expiresAt);
      $('#payment-countdown').textContent = orderCountdownText(state.currentOrder?.expiresAt || order.expiresAt);
      if (remaining > 0) return;
      clearInterval(state.paymentCountdownTimer);
      state.paymentCountdownTimer = null;
      $('#payment-status').textContent = '正在自动关闭订单…';
      pollOrder(order.orderNo, order.lookupToken);
    };
    updateCountdown();
    state.paymentCountdownTimer = setInterval(updateCountdown, 1000);
    state.pollTimer = setInterval(() => pollOrder(order.orderNo, order.lookupToken), 3000);
  }

  function showPendingOrderNotice(order) {
    state.pendingOrder = order;
    $('#pending-order-product').textContent = order.productName;
    const dialog = $('#pending-order-dialog');
    const updateCountdown = () => {
      const remaining = orderRemainingSeconds(order.expiresAt);
      $('#pending-order-countdown').textContent = orderCountdownText(order.expiresAt);
      if (remaining > 0) return;
      clearInterval(state.pendingCountdownTimer);
      state.pendingCountdownTimer = null;
      $('#pending-order-copy').textContent = '原订单已到期，正在自动释放库存和优惠码…';
      api(`/orders/${encodeURIComponent(order.orderNo)}`)
        .catch(() => null)
        .finally(() => {
          state.pendingOrder = null;
          dialog.close();
          toast('原订单已自动关闭，现在可以重新下单。');
          if (currentPage() === 'account') loadAccount().catch(() => null);
        });
    };
    clearInterval(state.pendingCountdownTimer);
    $('#pending-order-copy').textContent = '超时后将自动关闭，并释放库存和优惠码。';
    updateCountdown();
    state.pendingCountdownTimer = setInterval(updateCountdown, 1000);
    dialog.showModal();
  }

  async function pollOrder(orderNo, token) {
    try {
      const order = await api(`/orders/${encodeURIComponent(orderNo)}`, {
        headers: token ? { 'X-Order-Token': token } : {},
      });
      const labels = {
        pending: '等待支付', paid: order.fulfillmentMode === 'manual' ? '支付成功，等待管理员发卡' : '支付已确认',
        fulfilled: order.orderType === 'addon' ? '增量包已开通' : '激活码已生成，请到账号中心查看', cancelled: '订单已取消', expired: '订单已过期',
        payment_failed: '支付下单失败', fulfillment_failed: '已支付，正在人工处理',
      };
      $('#payment-status').textContent = labels[order.status] || order.status;
      state.currentOrder = { ...state.currentOrder, ...order };
      if (order.status === 'fulfilled') {
        $('#payment-status').classList.add('done');
        stopPaymentTimers();
        toast(labels.fulfilled);
        setTimeout(() => location.replace('/user/dashboard/index'), 800);
      }
      if (['expired', 'payment_failed', 'cancelled'].includes(order.status)) {
        stopPaymentTimers();
        if (order.status === 'expired') toast('订单已超时关闭，库存和优惠码已释放。');
      }
    } catch (_) {}
  }

  async function archiveOrder(orderNo) {
    await api(`/orders/${encodeURIComponent(orderNo)}/archive`, { method: 'POST' });
    toast('订单记录已清除。');
    await loadAccount();
  }

  function renderAddonTargets() {
    const form = $('#purchase-form');
    const select = form.elements.customerId;
    const eligible = state.accountLicenses.filter(item => item.active && !item.validityDays && !item.accessExpiresAt);
    const requestedCodes = new Set(state.product?.featureCodes || []);
    const seen = new Set();
    const options = eligible.filter(item => {
      if (!item.customerId || seen.has(item.customerId)) return false;
      seen.add(item.customerId);
      const owned = new Set(state.accountEntitlements
        .filter(entitlement => entitlement.active && entitlement.customerId === item.customerId)
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
    const choices = options.map(item => new Option(labelFor(item), item.customerId));
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
      const selected = options.find(item => item.customerId === select.value);
      confirmation.hidden = !selected;
      confirmation.textContent = selected ? `本增量包将附加到：${labelFor(selected)}` : '';
    };
    select.onchange = updateConfirmation;
    updateConfirmation();
  }

  async function createOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const product = state.product;
    if (!product) return;
    if (product.soldOut) { toast('该商品已售罄。'); return; }
    if (!state.account) { showGuestPurchaseNotice(); return; }
    const payload = { productId: product.id, email: state.account.email };
    if (product.fulfillmentMode !== 'manual') payload.couponCode = form.elements.couponCode.value.trim() || null;
    if (isAddonProduct(product)) {
      if (!form.elements.customerId.value) { toast('请选择增量包要附加到的主授权。'); return; }
      payload.customerId = form.elements.customerId.value;
    } else if (!isTrialProduct(product) && requestedUpgradeCustomerId()) {
      payload.customerId = requestedUpgradeCustomerId();
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const accountPayload = await api('/account');
      const pendingOrder = accountPayload.orders.find(item => item.status === 'pending');
      if (pendingOrder) {
        showPendingOrderNotice(pendingOrder);
        return;
      }
      const order = await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
      localStorage.setItem(`hb-order-${order.orderNo}`, order.lookupToken);
      showPayment(order);
    } catch (error) {
      if (error.status === 409) {
        const accountPayload = await api('/account').catch(() => null);
        const pendingOrder = accountPayload?.orders?.find(item => item.status === 'pending');
        if (pendingOrder) {
          showPendingOrderNotice(pendingOrder);
          return;
        }
      }
      toast(error.message);
    }
    finally { submit.disabled = false; }
  }

  function applyAccountUi() {
    const form = $('#purchase-form');
    const card = form?.closest('.hb-checkout-card');
    const email = $('#purchase-account-email');
    const hint = $('#purchase-account-hint');
    const actions = $('.hb-purchase-account-actions');
    if (form) form.classList.toggle('is-account-locked', !state.account);
    card?.classList.toggle('is-guest-checkout', !state.account);
    $('#checkout-card-title').textContent = state.account ? '确认并支付' : '登录后继续购买';
    email.textContent = state.account?.email || '尚未登录';
    hint.textContent = state.account ? '订单、激活码和设备将归属于此账号' : '请先登录后购买，未登录不会创建订单';
    actions.hidden = Boolean(state.account);
    $('#home-purchase-link').hidden = !primaryProducts().length;
    $('#home-catalog-empty').hidden = Boolean(primaryProducts().length);
    $('#home-account-link').hidden = !state.account;
    $('#home-login-link').hidden = Boolean(state.account);
    $('#home-register-link').hidden = Boolean(state.account);
  }

  function setAuthHint(authenticated, hasPermanentLicense = false, hasTemporaryLicense = false) {
    document.documentElement.classList.toggle('hb-auth-hint', authenticated);
    document.documentElement.classList.toggle('hb-license-hint', authenticated && hasPermanentLicense);
    document.documentElement.classList.toggle('hb-unlicensed-hint', authenticated && !hasPermanentLicense);
    document.cookie = authenticated
      ? `ha_bridge_store_hint=${hasPermanentLicense ? 'permanent' : hasTemporaryLicense ? 'temporary' : 'unlicensed'}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      : 'ha_bridge_store_hint=; Max-Age=0; Path=/; SameSite=Lax';
  }

  function showGuestPurchaseNotice() {
    if (state.account) return;
    const dialog = $('#guest-purchase-dialog');
    if (!dialog?.showModal) {
      toast('请先登录后购买。');
      return;
    }
    dialog.showModal();
  }

  function bindPasswordControls(form) {
    if (!form) return;
    form.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
      const input = button.parentElement.querySelector('input');
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      button.textContent = visible ? '显示' : '隐藏';
      button.setAttribute('aria-label', visible ? '显示密码' : '隐藏密码');
    }));
    const password = form.elements.password;
    const confirmation = form.elements.confirmPassword;
    const message = form.querySelector('[data-password-mismatch]');
    if (!password || !confirmation || !message) return;
    const validate = () => {
      const mismatch = Boolean(confirmation.value) && password.value !== confirmation.value;
      confirmation.setCustomValidity(mismatch ? '两次输入的密码不一致。' : '');
      message.hidden = !mismatch;
      return !mismatch;
    };
    password.addEventListener('input', validate);
    confirmation.addEventListener('input', validate);
    form.addEventListener('submit', event => {
      if (!validate()) {
        event.preventDefault();
        confirmation.reportValidity();
      }
    }, { capture: true });
  }

  function statusLabel(order) {
    return ({ pending: '待付款', paid: order.fulfillmentMode === 'manual' ? '待人工发卡' : '已付款', fulfilled: '已完成', cancelled: '已取消', expired: '已过期', payment_failed: '下单失败', fulfillment_failed: '处理中', refunded: '已退款' })[order.status] || order.status;
  }

  function startEmailCooldown(button, seconds) {
    if (!button || Number(seconds) <= 0) return;
    const previous = state.emailCooldownTimers.get(button);
    if (previous) clearInterval(previous);
    const defaultLabel = button.dataset.defaultLabel || button.textContent;
    button.dataset.defaultLabel = defaultLabel;
    const expiresAt = Date.now() + Number(seconds) * 1000;
    const update = () => {
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      if (remaining <= 0) {
        clearInterval(state.emailCooldownTimers.get(button));
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

  async function sendRegisterCode() {
    const form = $('#store-register-form');
    const email = form.elements.email.value.trim();
    if (!email || !form.elements.email.reportValidity()) return;
    const button = $('#send-register-code');
    button.disabled = true;
    try {
      const result = await api('/verifications', { method: 'POST', body: JSON.stringify({ email, purpose: 'register' }) });
      form.dataset.verificationId = result.verificationId;
      startEmailCooldown(button, result.resendAfter || 120);
      if (result.code) {
        // 本地联调（mail_mode=echo）：服务端把验证码回显在响应里，自动填入并明确提示，
        // 否则默认 log 模式下用户永远收不到码、注册流程直接卡死。
        form.elements.code.value = result.code;
        toast(`本地联调验证码 ${result.code}，已自动填入。`);
      } else {
        toast('验证码已发送，请检查邮箱。');
      }
    } catch (error) {
      if (error.retryAfter) startEmailCooldown(button, error.retryAfter);
      else button.disabled = false;
      throw error;
    }
  }

  async function register(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await api('/auth/register', { method: 'POST', body: JSON.stringify({
      email: form.elements.email.value.trim(), verificationId: form.dataset.verificationId,
      code: form.elements.code.value.trim(), password: form.elements.password.value,
      confirmPassword: form.elements.confirmPassword.value, referralCode: form.elements.referralCode.value.trim() || null,
    }) });
    window.HBReferrals?.clearInvite();
    state.account = result.account;
    state.hasLicense = Boolean(result.hasLicense);
    state.hasTemporaryLicense = Boolean(result.hasTemporaryLicense);
    state.hasPermanentLicense = Boolean(result.hasPermanentLicense);
    state.hasUsedTrial = Boolean(result.hasUsedTrial);
    setAuthHint(true, state.hasPermanentLicense, state.hasTemporaryLicense);
    toast(state.hasPermanentLicense ? '注册成功，正在进入账号中心。' : '注册成功，正在进入购买页。');
    setTimeout(() => { location.href = state.hasPermanentLicense ? '/user/dashboard/index' : '/products'; }, 500);
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: form.elements.email.value.trim(), password: form.elements.password.value }) });
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
    const form = $('#store-forget-form');
    const button = $('#send-reset-code');
    const email = form.elements.email.value.trim();
    if (!email || !form.elements.email.reportValidity()) return;
    try {
      const result = await api('/verifications', { method: 'POST', body: JSON.stringify({ email, purpose: 'password_reset' }) });
      form.dataset.verificationId = result.verificationId;
      startEmailCooldown(button, result.resendAfter);
      if (result.code) {
        // 同注册流程：本地联调直接回显，避免重置密码卡在收不到验证码
        form.elements.code.value = result.code;
        toast(`本地联调验证码 ${result.code}，已自动填入。`);
      } else {
        toast('验证码已发送，请检查邮箱。');
      }
    } catch (error) {
      if (error.retryAfter) startEmailCooldown(button, error.retryAfter);
      throw error;
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    const form = event.currentTarget;
    await api('/auth/password/reset', { method: 'POST', body: JSON.stringify({
      email: form.elements.email.value.trim(), verificationId: form.dataset.verificationId,
      code: form.elements.code.value.trim(), password: form.elements.password.value,
      confirmPassword: form.elements.confirmPassword.value,
    }) });
    toast('密码已重置，请重新登录。');
    setTimeout(() => { location.href = '/user/authentication/login'; }, 500);
  }

  function accountOrderActions(item) {
    const actions = [];
    if (item.status === 'pending') {
      if (item.payment?.qrCode) actions.push(`<button class="hb-button hb-button--secondary" data-order-pay="${escapeHtml(item.orderNo)}">继续支付</button>`);
    }
    if (['cancelled', 'expired', 'payment_failed', 'refunded'].includes(item.status)) {
      actions.push(`<button class="hb-button hb-button--secondary" data-order-archive="${escapeHtml(item.orderNo)}">清除记录</button>`);
    }
    return actions.length ? `<div class="hb-account-actions">${actions.join('')}</div>` : '';
  }

  /* 账号中心的元信息芯片。
     状态与期限是最需要一眼扫到的两个字段，给它们语义色；来源、发卡时间这类
     只做中性展示。颜色统一走 theme.css 的令牌，不要在 JS 里写色值。 */
  function metaChip(text, variant = '') {
    return `<span class="hb-meta-chip${variant ? ` hb-meta-chip--${variant}` : ''}">${escapeHtml(text)}</span>`;
  }

  /* 生命周期 → 芯片配色：有效=绿、到期=琥珀（可续期，不是错误）、停用=红。 */
  function licenseStateVariant(active, expired) {
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

  function setText(selector, value) {
    const node = $(selector);
    if (node) node.textContent = String(value);
  }

  /* 概览统计条与 tab 计数 —— 都是 payload 的纯函数，别在别处再算一遍。 */
  function renderAccountOverview(payload) {
    const licenses = payload.licenses || [];
    const entitlements = payload.entitlements || [];
    const orders = payload.orders || [];
    setText('#account-stat-licenses', licenses.length);
    setText('#account-stat-entitlements', entitlements.length);
    setText('#account-stat-orders', orders.length);
    setText('#account-stat-pending', orders.filter(item => item.status === 'pending').length);
    setText('[data-account-tab-count="licenses"]', licenses.length);
    setText('[data-account-tab-count="addons"]', entitlements.length);
    setText('[data-account-tab-count="orders"]', orders.length);
  }

  function renderAccount(payload) {
    $('#account-email').textContent = payload.account.email;
    state.accountLicenses = payload.licenses || [];
    state.accountOrders = payload.orders || [];
    renderAccountOverview(payload);
    const licenses = $('#account-licenses');
    const permanentProducts = primaryProducts().filter(item => !isTrialProduct(item) && !item.soldOut);
    licenses.innerHTML = payload.licenses.length ? payload.licenses.map((item, index) => {
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
      const upgradeAction = item.validityDays && permanentProducts.length
        ? `<a class="hb-button hb-button--primary" href="${storePageHref('/products')}&upgrade=${encodeURIComponent(item.customerId)}">升级为永久授权</a>`
        : '';
      const actions = `<div class="hb-account-actions">${upgradeAction}${labelAction}${releaseAction}</div>`;
      const source = ({ admin_manual: '后台手动发卡', historical_import: '历史导入', payment_manual: '支付后手动发卡', payment_automatic: '支付后自动发卡' })[item.issuanceSource] || '后台发放';
      const status = !item.active ? '已停用' : expired ? '已到期' : '有效';
      const validity = item.validityDays ? `${item.validityDays} 天` : '永久授权';
      const period = item.accessExpiresAt ? `${item.accessStartedAt ? new Date(item.accessStartedAt).toLocaleDateString('zh-CN') : '发卡日'} 至 ${new Date(item.accessExpiresAt).toLocaleDateString('zh-CN')}` : validity;
      const manualNote = ['admin_manual', 'historical_import'].includes(item.issuanceSource) ? '<p class="hb-account-manual-note">该授权由后台手动发放，因此没有支付订单。</p>' : '';
      const title = item.userLabel || `主授权 #${payload.licenses.length - index}`;
      const productLine = item.userLabel ? `<p>${escapeHtml(item.productName)}</p>` : '';
      const meta = [
        metaChip(`来源：${source}`),
        metaChip(`状态：${status}`, licenseStateVariant(item.active, expired)),
        metaChip(`期限：${period}`, item.validityDays ? '' : 'accent'),
        metaChip(`发卡时间：${new Date(item.issuedAt).toLocaleString('zh-CN')}`),
      ].join('');
      return `<article class="hb-account-item"><div><h3>${escapeHtml(title)}</h3>${productLine}<p class="hb-account-license-code"><span>激活码</span><code>${escapeHtml(activationCode)}</code>${unavailable}</p><div class="hb-account-meta">${meta}</div><p>${item.device ? `已绑定设备 · ${escapeHtml(item.device.instanceId)}` : '当前未绑定设备'}</p>${releasePolicyState}${manualNote}</div>${actions}</article>`;
    }).join('') : '<div class="hb-account-empty">账号下暂无授权。</div>';
    const entitlementSection = $('#account-entitlements-section');
    const entitlementList = $('#account-entitlements');
    const entitlements = payload.entitlements || [];
    state.accountEntitlements = entitlements;
    state.ownedFeatureCodes = new Set(entitlements.filter(item => item.active).map(item => item.featureCode));
    renderAddons();
    entitlementSection.hidden = !entitlements.length;
    entitlementList.innerHTML = entitlements.map(item => {
      const expired = Boolean(item.expiresAt) && new Date(item.expiresAt) <= new Date();
      const status = !item.active ? '已停用' : expired ? '已到期' : '有效';
      const validity = item.expiresAt ? `有效至 ${new Date(item.expiresAt).toLocaleDateString('zh-CN')}` : '永久';
      const target = state.accountLicenses.find(license => license.customerId === item.customerId);
      const targetName = target ? `${target.userLabel || target.productName} · 激活码尾号 ${target.codeHint}` : '原主授权';
      const meta = [
        metaChip(`附加到：${targetName}`),
        metaChip(`状态：${status}`, licenseStateVariant(item.active, expired)),
        metaChip(validity, item.expiresAt ? '' : 'accent'),
      ].join('');
      return `<article class="hb-account-item"><div><h3>${escapeHtml(item.productName)}</h3><p>${escapeHtml(addonTypeLabel(item))}</p><div class="hb-account-meta">${meta}</div></div></article>`;
    }).join('');
    const orders = $('#account-orders');
    orders.innerHTML = payload.orders.length ? payload.orders.map(item => {
      const countdown = item.status === 'pending'
        ? `<p class="hb-order-countdown" data-order-expires="${escapeHtml(item.expiresAt)}" data-order-no="${escapeHtml(item.orderNo)}">剩余 ${orderCountdownText(item.expiresAt)}，超时后自动关闭</p>`
        : '';
      const target = item.orderType === 'addon' ? state.accountLicenses.find(license => license.customerId === item.customerId) : null;
      const targetLine = target ? `<p>附加到：${escapeHtml(target.userLabel || target.productName)} · 激活码尾号 ${escapeHtml(target.codeHint)}</p>` : '';
      return `<article class="hb-account-item"><div><h3>${escapeHtml(item.productName)}</h3><p>订单号：${escapeHtml(item.orderNo)}</p>${targetLine}<p>${escapeHtml(statusLabel(item))} · ${money(item.amountCents)}</p>${countdown}</div><div class="hb-account-order-side"><span>${escapeHtml(new Date(item.createdAt).toLocaleDateString('zh-CN'))}</span>${accountOrderActions(item)}</div></article>`;
    }).join('') : '<div class="hb-account-empty">账号下暂无订单。</div>';
    clearInterval(state.accountCountdownTimer);
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

  async function loadAccount() {
    const payload = await api('/account');
    state.account = payload.account;
    state.accountLicenses = payload.licenses || [];
    renderAccount(payload);
  }

  async function accountAction(event) {
    const label = event.target.closest('[data-label-license]');
    if (label) {
      const dialog = $('#license-label-dialog');
      const form = $('#license-label-form');
      state.labelLicenseId = label.dataset.labelLicense;
      form.elements.label.value = label.dataset.currentLabel || '';
      dialog.showModal();
      form.elements.label.focus();
      form.elements.label.select();
      return;
    }
    const release = event.target.closest('[data-release-license]');
    if (!release || state.releaseOpening) return;
    const activationCodeId = release.dataset.releaseLicense;
    state.releaseOpening = true;
    release.disabled = true;
    release.textContent = '读取解绑设置…';
    try {
      // Refresh on every entry so a previously displayed cooldown cannot block new settings.
      await loadAccount();
      const license = state.accountLicenses.find(item => item.activationCodeId === activationCodeId);
      if (!license?.device) {
        toast('该授权当前没有绑定设备，已刷新账号信息。');
        return;
      }
      const dialog = $('#release-device-dialog');
      const form = $('#release-device-form');
      state.releaseLicenseId = activationCodeId;
      state.releaseTarget = { expectedBindingId: license.device.bindingId, expectedActivatedAt: license.device.activatedAt, expectedBindingVersion: license.device.bindingVersion };
      const target = $('#release-device-target');
      const targetLabel = document.createElement('span');
      const targetId = document.createElement('code');
      targetLabel.textContent = `${license.userLabel || license.productName} · 设备`;
      targetId.textContent = license.device.instanceId;
      target.replaceChildren(targetLabel, targetId);
      form.reset();
      form.elements.password.type = 'password';
      form.querySelector('[data-password-toggle]').textContent = '显示';
      form.querySelector('[data-password-toggle]').setAttribute('aria-label', '显示密码');
      form.querySelector('.hb-release-error').hidden = true;
      updateDeviceReleaseUi();
      dialog.showModal();
      if (releaseRemainingSeconds() > 0) form.querySelector('[data-release-close]').focus();
      else form.elements.password.focus();
    } catch (error) {
      toast(error.message);
    } finally {
      state.releaseOpening = false;
      release.disabled = false;
      updateDeviceReleaseUi();
    }
  }

  async function saveLicenseLabel(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    if (!state.labelLicenseId || !form.reportValidity()) return;
    submit.disabled = true;
    try {
      await api(`/account/licenses/${state.labelLicenseId}/label`, {
        method: 'PATCH',
        body: JSON.stringify({ label: form.elements.label.value.trim() || null }),
      });
      $('#license-label-dialog').close();
      state.labelLicenseId = null;
      toast('授权备注已保存。');
      await loadAccount();
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  }

  async function accountOrderAction(event) {
    const pay = event.target.closest('[data-order-pay]');
    const archive = event.target.closest('[data-order-archive]');
    if (pay) {
      const order = (await api('/account')).orders.find(item => item.orderNo === pay.dataset.orderPay);
      if (order) showPayment(order);
      return;
    }
    if (archive) {
      if (!window.confirm('确定从账号中清除这条订单记录吗？')) return;
      archive.disabled = true;
      try { await archiveOrder(archive.dataset.orderArchive); }
      catch (error) { toast(error.message); archive.disabled = false; }
    }
  }

  async function releaseDevice(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorNode = form.querySelector('.hb-release-error');
    if (!state.releaseLicenseId || !state.releaseTarget || state.releaseSubmitting) return;
    if (releaseRemainingSeconds() > 0) { updateDeviceReleaseUi(); return; }
    if (!form.reportValidity()) return;
    const password = form.elements.password.value;
    state.releaseSubmitting = true;
    updateDeviceReleaseUi();
    errorNode.hidden = true;
    try {
      await api(`/account/licenses/${state.releaseLicenseId}/release`, {
        method: 'POST', body: JSON.stringify({ password, ...state.releaseTarget }),
      });
      $('#release-device-dialog').close();
      state.releaseLicenseId = null; state.releaseTarget = null;
      toast('设备已解绑。');
      await loadAccount();
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      if (error.status === 409) {
        $('#release-device-dialog').close();
        toast(error.message);
        await loadAccount().catch(() => null);
      } else if (error.status === 429) {
        await loadAccount().catch(() => null);
      }
    } finally {
      state.releaseSubmitting = false;
      updateDeviceReleaseUi();
      if (!errorNode.hidden && $('#release-device-dialog').open && !form.elements.password.disabled) {
        form.elements.password.select();
      }
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'DELETE' });
    setAuthHint(false);
    location.href = '/user/authentication/login';
  }

  async function init() {
    $('.hb-store-nav-toggle').addEventListener('click', () => $('#navbarNav').classList.toggle('mobile-open'));
    $$('[data-product-filter]').forEach(button => button.addEventListener('click', () => applyProductFilter(button.dataset.productFilter)));
    $$('[data-account-tab]').forEach(button => button.addEventListener('click', () => showAccountTab(button.dataset.accountTab)));
    $('#payment-dialog .hb-payment-close').addEventListener('click', () => { $('#payment-dialog').close(); stopPaymentTimers(); state.currentOrder = null; });
    $('#guest-purchase-trigger')?.addEventListener('click', showGuestPurchaseNotice);
    $('#guest-purchase-dismiss')?.addEventListener('click', () => $('#guest-purchase-dialog')?.close());
    $('#pending-order-dismiss').addEventListener('click', () => {
      $('#pending-order-dialog').close();
      clearInterval(state.pendingCountdownTimer);
      state.pendingCountdownTimer = null;
    });
    $('#pending-order-continue').addEventListener('click', () => {
      const order = state.pendingOrder;
      $('#pending-order-dialog').close();
      clearInterval(state.pendingCountdownTimer);
      state.pendingCountdownTimer = null;
      if (order) showPayment(order);
    });
    $('#share-product').addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.href); toast('商品链接已复制。'); } catch (_) { toast('复制失败，请从地址栏复制。'); } });
    $('#purchase-form').addEventListener('submit', createOrder);
    $('#purchase-form').elements.couponCode.addEventListener('input', scheduleCouponPreview);
    $('#purchase-form').elements.couponCode.addEventListener('blur', () => {
      clearTimeout(state.couponPreviewTimer);
      if ($('#purchase-form').elements.couponCode.value.trim()) previewCoupon();
    });
    $('#store-login-form')?.addEventListener('submit', event => login(event).catch(error => toast(error.message)));
    $('#send-register-code')?.addEventListener('click', () => sendRegisterCode().catch(error => toast(error.message)));
    $('#store-register-form')?.addEventListener('submit', event => register(event).catch(error => toast(error.message)));
    $('#send-reset-code')?.addEventListener('click', () => sendResetCode().catch(error => toast(error.message)));
    $('#store-forget-form')?.addEventListener('submit', event => resetPassword(event).catch(error => toast(error.message)));
    $('#account-licenses')?.addEventListener('click', accountAction);
    $('#account-orders')?.addEventListener('click', event => accountOrderAction(event).catch(error => toast(error.message)));
    $('#release-device-form')?.addEventListener('submit', releaseDevice);
    $('#license-label-form')?.addEventListener('submit', saveLicenseLabel);
    $$('[data-release-close]').forEach(button => button.addEventListener('click', () => {
      $('#release-device-dialog').close(); state.releaseLicenseId = null; state.releaseTarget = null;
    }));
    $('#release-device-dialog')?.addEventListener('close', () => {
      state.releaseLicenseId = null; state.releaseTarget = null;
      $('#release-device-form').reset();
    });
    $$('[data-label-close]').forEach(button => button.addEventListener('click', () => {
      $('#license-label-dialog').close(); state.labelLicenseId = null;
    }));
    $('#store-logout')?.addEventListener('click', () => logout().catch(error => toast(error.message)));
    bindPasswordControls($('#store-login-form'));
    bindPasswordControls($('#store-register-form'));
    bindPasswordControls($('#store-forget-form'));
    bindPasswordControls($('#release-device-form'));
    try {
      const configuration = await api('/configuration');
      state.configuration = configuration;
      applyConfiguration();
      if (applyMaintenanceMode()) return;
      const products = await api('/products');
      state.products = products.items;
      renderProducts();
      renderAddons();
      const authentication = await api('/auth/me').catch(() => null);
      state.account = authentication?.account || null;
      state.hasLicense = Boolean(authentication?.hasLicense);
      state.hasTemporaryLicense = Boolean(authentication?.hasTemporaryLicense);
      state.hasPermanentLicense = Boolean(authentication?.hasPermanentLicense);
      state.hasUsedTrial = Boolean(authentication?.hasUsedTrial);
      setAuthHint(Boolean(state.account), state.hasPermanentLicense, state.hasTemporaryLicense);
      renderProducts();
      const accountOverview = state.hasLicense ? await api('/account') : null;
      if (accountOverview) {
        state.accountLicenses = accountOverview.licenses || [];
        state.accountEntitlements = accountOverview.entitlements || [];
        state.ownedFeatureCodes = new Set((accountOverview.entitlements || []).filter(item => item.active).map(item => item.featureCode));
      }
      renderAddons();
      if (['account', 'referrals'].includes(currentPage()) && !state.account) { location.replace('/user/authentication/login'); return; }
      chooseProduct();
      document.body.classList.remove('hb-store-loading');
      showPage();
      if (currentPage() === 'item' && state.product && primaryProductUnavailable(state.product)) {
        location.replace(storePageHref('/products')); return;
      }
      if (currentPage() === 'item' && state.account && !state.hasPermanentLicense && state.product && addonProducts().some(item => item.id === state.product.id)) {
        location.replace(storePageHref('/products')); return;
      }
      if (currentPage() === 'item' && state.hasPermanentLicense && state.product && addonProducts().some(item => item.id === state.product.id) && !availableAddonProducts().some(item => item.id === state.product.id)) {
        location.replace('/user/dashboard/index'); return;
      }
      renderProduct();
      applyAccountUi();
      if (currentPage() === 'referrals') await window.HBReferrals.init(api, toast);
      if (currentPage() === 'account') {
        if (accountOverview) renderAccount(accountOverview);
        else await loadAccount();
      }
    } catch (error) {
      document.body.classList.remove('hb-store-loading');
      if (!document.body.classList.contains('hb-maintenance-active')) showPage();
      toast(error.message);
    }
  }

  init();
})();
