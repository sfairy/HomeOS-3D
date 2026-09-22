(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const STORE_PAGE_REVISION = '20260909-referrals-v1';
  const storePageHref = path => `${path}${path.includes('?') ? '&' : '?'}v=${STORE_PAGE_REVISION}`;
  // 接口下发的 logo_url 与商品图路径不带版本号，浏览器会按启发式缓存复用旧图；这里复用页面已
  // 加载的 theme.css 上的 `?v=`（由 tools/bump_static_cache_versions.mjs 统一改写）补上版本号。
  // 注意 `?v=` 要用反引号包住：刷新工具是按字面量全局替换的，写成裸 `?v=` 会把这段注释也
  // 当成待改写的戳（本文件直到 store/static 被纳入扫描范围才暴露这个问题）。
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
  // 金额格式化的唯一实现在 store/static/money.js（后台同源）。保留这两个短名是因为
  // 下面已有 20+ 处调用点；它们只是绑定，不是第二份实现。
  const money = HBMoney.formatCents;
  // 支付弹窗把「¥」单独排成小一号的符号，只取数字部分
  const moneyAmount = HBMoney.formatCentsPlain;
  // HTML 转义。实现在 store/static/htmlsafe.js（唯一一份）；
  // 这个名字保留是因为下面已有 20+ 处调用点。
  const escapeHtml = HtmlSafe.esc;

  // `tone` 只区分「报错」与「其它」，因为这两类需要的不是同一条通道：
  //   报错 → role=alert / aria-live=assertive，直接打断读当前内容，并及时上红边
  //   其它 → role=status / aria-live=polite，等用户读完当前这句再播报
  // 属性一律在写 textContent **之前**设置：读屏器是在 DOM 变更那一刻取用当前的角色与
  // politeness，先写文字再改 role，这一次播报仍然按旧角色发出去。
  function toast(message, tone = 'info') {
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

  async function api(path, options = {}) {
    const response = await fetch(`/store/v1${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
      // 「把 detail 变成人话」只有一份实现（store/static/api-error.js），与后台/初始化页
      // 共用。
      const error = ApiError.fromResponse(response, body, '请求失败，请稍后重试。');
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

  function requestedUpgradeLicenseId() {
    return new URLSearchParams(location.search).get('upgrade');
  }

  function productHref(product) {
    const base = storePageHref(`/item/${encodeURIComponent(product.id)}`);
    const upgrade = requestedUpgradeLicenseId();
    return upgrade && !isTrialProduct(product) ? `${base}&upgrade=${encodeURIComponent(upgrade)}` : base;
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
      : `<a class="hb-button hb-button--primary hb-button--sm" href="${escapeHtml(productHref(product))}">${state.account ? (requestedUpgradeLicenseId() && !isTrialProduct(product) ? '选择升级版本' : '选择此版本') : '查看详情'}</a>`;
    const badge = isTrialProduct(product) ? `${product.validityDays} 天试用` : bundle ? '全授权' : product.productType === 'package' ? '自定义套餐' : '主授权';
    // 每个主授权卡都要有一行说明（套餐卡展示所含内容，其余卡展示商品说明）；否则卡片显空且标题比同排低一截。
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
      : `<a class="hb-button hb-button--primary hb-button--sm" href="${escapeHtml(storePageHref(`/item/${encodeURIComponent(product.id)}`))}">${state.account ? '查看并购买' : '查看详情'}</a>`;
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
    // 上一张订单如果超时关闭过，弹窗上会留着「已结束」的压暗状态，重开前先清掉
    dialog.classList.remove('is-closed');
    $('#payment-product').textContent = order.productName;
    $('#payment-price').textContent = moneyAmount(order.amountCents);
    // 付款说明由渠道下发（支付宝与本地模拟收银台文案不同），一直存在 payment.note 里但界面从未渲染，写死「支付宝」在 mock 模式下是错的。
    $('#payment-hint').textContent = order.payment.note
      || `打开${order.payment.displayName || '支付宝'}「扫一扫」完成付款，付款后本页会自动确认。`;
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
    // 金额和订单号以前不显示：金额要跟商品对得上，订单号是找客服时唯一能定位的
    // 凭证。两者都在这张弹窗里补齐，用户不用先跳到账号中心抄单号。
    $('#pending-order-price').textContent = moneyAmount(order.amountCents);
    $('#pending-order-no').textContent = order.orderNo;
    const dialog = $('#pending-order-dialog');
    const updateCountdown = () => {
      const remaining = orderRemainingSeconds(order.expiresAt);
      $('#pending-order-countdown').textContent = orderCountdownText(order.expiresAt);
      if (remaining > 0) return;
      clearInterval(state.pendingCountdownTimer);
      state.pendingCountdownTimer = null;
      $('#pending-order-copy').textContent = '已到期，正在释放库存和优惠码…';
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
    $('#pending-order-copy').textContent = '等待支付，超时后自动关闭';
    updateCountdown();
    state.pendingCountdownTimer = setInterval(updateCountdown, 1000);
    dialog.showModal();
  }

  // 站内统一确认框，替代 window.confirm（系统框跟不上暗色主题、文案不可定制）。用 <dialog> 自绘，
  // 行为严格对齐：遮罩 / Esc 按「取消」（false）且不下发写操作，只有明确点确认才 resolve(true)。
  function confirmAction({
    kicker = 'Confirm',
    title,
    message,
    detail = '',
    confirmLabel = '确定',
    cancelLabel = '取消',
    tone = 'default',
  }) {
    const dialog = $('#confirm-dialog');
    $('#confirm-kicker').textContent = kicker;
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    // 危险动作用红按钮：确认前让用户看清「这一步会清掉什么」。
    const accept = $('#confirm-accept');
    accept.textContent = confirmLabel;
    accept.className = `hb-button hb-button--${tone === 'danger' ? 'danger' : 'primary'}`;
    $('#confirm-cancel').textContent = cancelLabel;
    const detailNode = $('#confirm-detail');
    detailNode.textContent = detail;
    detailNode.hidden = !detail;

    // 老 WebView 没有 showModal 时的兜底：用 open 手动挂出并打上 is-fallback 交给 CSS 居中；不用 window.confirm 兜底。
    const modal = typeof dialog.showModal === 'function';
    if (modal) dialog.showModal();
    else {
      dialog.classList.add('is-fallback');
      dialog.setAttribute('open', '');
    }

    return new Promise(resolve => {
      const finish = (ok) => {
        $('#confirm-accept').onclick = null;
        $('#confirm-cancel').onclick = null;
        dialog.oncancel = null;
        if (dialog.open) {
          // 走兜底路径时 close() 也可能不存在，两条都留好出口。
          if (typeof dialog.close === 'function') dialog.close();
          else dialog.removeAttribute('open');
        }
        dialog.classList.remove('is-fallback');
        resolve(ok);
      };
      accept.onclick = () => finish(true);
      $('#confirm-cancel').onclick = () => finish(false);
      // Esc 与点遮罩都按「取消」处理：这类确认的默认答案必须是「什么都不做」。
      dialog.oncancel = (event) => { event.preventDefault(); finish(false); };
      accept.focus();
    });
  }

  // 取消待支付订单：付款码与待支付订单两个弹窗共用。必须走接口：服务端要先关掉渠道侧预下单交易
  // （否则二维码还能继续扫付），再归还库存预留与优惠码名额；各写一份迟早分叉。
  async function cancelPendingOrderFrom(button, order) {
    if (!order) return;
    const ok = await confirmAction({
      kicker: 'Cancel Order',
      title: '取消这笔待支付订单？',
      message: '取消后订单立即关闭，占用的库存和优惠码会释放。',
      detail: '如果还需要这份授权，需要重新下单；付款码也会同时作废。',
      confirmLabel: '取消订单',
      cancelLabel: '继续支付',
      tone: 'danger',
    });
    if (!ok) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '正在取消…';
    try {
      await api(`/orders/${encodeURIComponent(order.orderNo)}/cancel`, {
        method: 'POST',
        headers: order.lookupToken ? { 'X-Order-Token': order.lookupToken } : {},
      });
      toast('订单已取消，库存和优惠码已释放。');
    } catch (error) {
      // 409 的两种来源（订单已被支付/已被超时关闭、关单时发现钱已付）都意味着
      // 这笔单不再归用户处置：提示服务端原文，并把界面状态刷新到最新。
      toast(error.message || '取消失败，请刷新后重试。');
    }
    stopPaymentTimers();
    clearInterval(state.pendingCountdownTimer);
    state.pendingCountdownTimer = null;
    state.currentOrder = null;
    state.pendingOrder = null;
    $('#payment-dialog').close();
    $('#pending-order-dialog').close();
    // 账号中心的订单卡片是服务端渲染的，取消后要重新拉一次才会变成「已取消」。
    if (currentPage() === 'account') loadAccount().catch(() => null);
    button.disabled = false;
    button.textContent = label;
  }

  // 返回是否成功取到订单状态：手动点「我已完成支付」时要靠它决定要不要提示失败。
  async function pollOrder(orderNo, token) {
    let order = null;
    try {
      order = await api(`/orders/${encodeURIComponent(orderNo)}`, {
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
        // 订单作废后二维码没用了（渠道侧交易随后关单），压暗避免反复扫；但不关闭弹窗：订单号要留给
        // 用户报客服，且「钱刚好卡在到期点到账」时后端会认回这笔单（reconcile._confirm_paid_after_close）。
        $('#payment-dialog').classList.add('is-closed');
        if (order.status === 'expired') toast('订单已超时关闭，库存和优惠码已释放。');
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function archiveOrder(orderNo) {
    await api(`/orders/${encodeURIComponent(orderNo)}/archive`, { method: 'POST' });
    toast('订单记录已清除。');
    await loadAccount();
  }

  function renderAddonTargets() {
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

  function ownedPermanentLicense(product) {
    if (!state.account || !product || isAddonProduct(product) || product.validityDays) return null;
    const now = Date.now();
    return state.accountLicenses.find(item => {
      if (!item.active || item.productId !== product.id) return false;
      // 永久授权 = 没有 validityDays 也没有到期时间；已过期的时限授权不算。
      if (item.validityDays) return false;
      if (item.accessExpiresAt && new Date(item.accessExpiresAt).getTime() <= now) return false;
      return true;
    }) || null;
  }

  //: 用户在「已经买过」确认框里点了「仍然购买」后置为 true，避免第二次提交又弹一次。
  function confirmDuplicatePurchase(product) {
    // 原专用弹窗 #duplicate-purchase-dialog 与站内确认框只差文案，统一到 confirmAction 可少一份模板、CSS 与 Esc 判断。
    return confirmAction({
      kicker: 'Duplicate Purchase',
      title: '你可能已经买过这个授权',
      message: `账号下已有一张有效期内的「${product.name}」授权。再买一张会额外签发一个新的激活码，而不是延长原有授权。`,
      detail: '如果你只是想续期或升级，请到账号中心使用「升级为永久授权」，或联系客服处理。',
      confirmLabel: '仍然购买新授权',
      cancelLabel: '先不买了',
    });
  }

  async function createOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const product = state.product;
    if (!product) return;
    if (product.soldOut) { toast('该商品已售罄。'); return; }
    if (!state.account) { showGuestPurchaseNotice(); return; }
    // 重复购买永久商品会另发新激活码而非延长原授权；服务端不能硬拦（多设备是合法需求），故这里二次确认。
    if (ownedPermanentLicense(product) && !await confirmDuplicatePurchase(product)) {
      toast('已取消，未创建订单。');
      return;
    }
    const payload = { productId: product.id, email: state.account.email };
    if (product.fulfillmentMode !== 'manual') payload.couponCode = form.elements.couponCode.value.trim() || null;
    if (isAddonProduct(product)) {
      if (!form.elements.targetLicenseId.value) { toast('请选择增量包要附加到的主授权。'); return; }
      payload.targetLicenseId = form.elements.targetLicenseId.value;
    } else if (!isTrialProduct(product) && requestedUpgradeLicenseId()) {
      payload.upgradeLicenseId = requestedUpgradeLicenseId();
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
      toast(error.message, 'err');
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
    // 管理后台入口：只给管理员账号。标记里默认 hidden，这里只负责在确认过
    // /auth/me 的 isAdmin 之后放行；非管理员（含未登录）保持隐藏。
    $$('[data-admin-entry]').forEach(entry => { entry.hidden = !state.account?.isAdmin; });
  }

  function setAuthHint(authenticated, hasPermanentLicense = false, hasTemporaryLicense = false) {
    document.documentElement.classList.toggle('hb-auth-hint', authenticated);
    document.documentElement.classList.toggle('hb-license-hint', authenticated && hasPermanentLicense);
    document.documentElement.classList.toggle('hb-unlicensed-hint', authenticated && !hasPermanentLicense);
    document.cookie = authenticated
      ? `homeos_store_hint=${hasPermanentLicense ? 'permanent' : hasTemporaryLicense ? 'temporary' : 'unlicensed'}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      : 'homeos_store_hint=; Max-Age=0; Path=/; SameSite=Lax';
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
    // 「已付款但要人工发卡」是前台自己的措辞（后台列表不区分这一档），所以只这一档由前台判。
    // 其余一律用服务端下发的 statusLabel —— 它来自 store/commerce/order_status.py 的唯一词表。
    // 前台自存一份就会漏值：partially_refunded（后台可真实写入）曾因此被原样显示成 snake_case。
    if (order.status === 'paid' && order.fulfillmentMode === 'manual') return '待人工发卡';
    return order.statusLabel || order.status;
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
    if (result.referralNote) {
      // 邀请码没绑定成功必须显式告诉用户：绑定只发生在注册这一步，错过就补不上。
      toast(`注册成功。${result.referralNote}`);
    } else {
      toast(state.hasPermanentLicense ? '注册成功，正在进入账号中心。' : '注册成功，正在进入购买页。');
    }
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
      const result = await api('/verifications', { method: 'POST', body: JSON.stringify({ email, purpose: 'reset' }) });
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

  // 单张订单卡片。抽成函数是因为它有两条渲染路径：账号中心首屏与「加载更多」。
  // 两处各写一份模板的话，加载出来的卡片迟早和首屏长得不一样。
  function accountOrderCard(item) {
    const countdown = item.status === 'pending'
      ? `<p class="hb-order-countdown" data-order-expires="${escapeHtml(item.expiresAt)}" data-order-no="${escapeHtml(item.orderNo)}">剩余 ${orderCountdownText(item.expiresAt)}，超时后自动关闭</p>`
      : '';
    // 优先按订单记录的目标授权匹配：同一账号下的多张授权共享同一个 customerId，
    // 只按 customerId 找会一律命中第一张，附加关系显示错。
    const target = item.orderType === 'addon'
      ? state.accountLicenses.find(license => license.activationCodeId === item.targetLicenseId)
        || state.accountLicenses.find(license => license.customerId === item.customerId)
      : null;
    const targetLine = target ? `<p>附加到：${escapeHtml(target.userLabel || target.productName)} · 激活码尾号 ${escapeHtml(target.codeHint)}</p>` : '';
    return `<article class="hb-account-item hb-account-item--row"><div class="hb-account-order-main"><h3>${escapeHtml(item.productName)}</h3><p>订单号：${escapeHtml(item.orderNo)}</p>${targetLine}<p>${escapeHtml(statusLabel(item))} · ${money(item.amountCents)}</p>${countdown}</div><div class="hb-account-order-side"><span>${escapeHtml(new Date(item.createdAt).toLocaleDateString('zh-CN'))}</span>${accountOrderActions(item)}</div></article>`;
  }

  /** 「加载更多订单」按钮：只在还有未加载的订单时出现，并写出剩余条数。
   *  接口按页返回（默认 20 单），没有这个按钮时买满一页的用户会以为更早的订单
   *  被系统丢掉了 —— 界面上既看不到后面的单，也没有任何「还有更多」的提示。 */
  function accountOrdersMoreButton() {
    const remaining = Number(state.accountOrdersTotal || 0) - Number(state.accountOrdersLoaded || 0);
    if (remaining <= 0) return '';
    return `<div class="hb-account-more"><button class="hb-button hb-button--secondary" type="button" data-orders-more>加载更多订单（还有 ${remaining} 单）</button></div>`;
  }

  async function loadMoreAccountOrders() {
    const container = $('#account-orders');
    const button = container?.querySelector('[data-orders-more]');
    if (!container || !button) return;
    button.disabled = true;
    button.textContent = '加载中…';
    try {
      const offset = Number(state.accountOrdersLoaded || 0);
      const data = await api(`/orders?offset=${offset}&limit=20`);
      const items = data.items || [];
      // 游标按**实际返回条数**推进，而不是按请求的 limit：后端可能因为筛选口径
      // 变化少给几条，按 limit 跳会被跳过一段（订单从列表里消失）。
      state.accountOrdersLoaded = offset + items.length;
      state.accountOrdersTotal = Number(data.ordersTotal ?? state.accountOrdersTotal);
      button.parentElement.remove();
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
     状态与期限是最需要一眼扫到的两个字段，给它们语义色；来源、发卡时间这类
     只做中性展示。颜色统一走 theme.css 的令牌，不要在 JS 里写色值。 */
  function metaChip(text, variant = '') {
    return `<span class="hb-meta-chip${variant ? ` hb-meta-chip--${variant}` : ''}">${escapeHtml(text)}</span>`;
  }

  /* 授权/权益卡的「规格表」单元格：小号等宽标签 + 值。
     比一排长短不一的芯片更容易竖着对齐，宽屏下也能自己铺满内容区。 */
  function factCell(label, value, variant = '') {
    return `<li><small>${escapeHtml(label)}</small><span${variant ? ` class="${variant}"` : ''}>${escapeHtml(value)}</span></li>`;
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
        ? `<a class="hb-button hb-button--primary" href="${escapeHtml(storePageHref('/products'))}&upgrade=${encodeURIComponent(item.activationCodeId)}">升级为永久授权</a>`
        : '';
      const actions = `<div class="hb-account-actions">${upgradeAction}${labelAction}${releaseAction}</div>`;
      // 来源与「是否手动发放」都由服务端下发（store/core/serializers.py 的
      // ISSUANCE_SOURCE_LABELS）。前台曾自存一份 admin_manual/historical_import/
      // payment_manual 的映射，而后端只写 manual / payment_automatic —— 手工签发的授权
      // 落到兜底文案，手动发放提示的判断也恒为 false。
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
      return `<article class="hb-account-item hb-account-item--stacked"><header class="hb-account-head"><div class="hb-account-ident"><div class="hb-account-title"><h3>${escapeHtml(title)}</h3>${statusChip}</div>${productLine}</div>${actions}</header><div class="hb-account-body"><p class="hb-account-license-code"><span>激活码</span><code>${escapeHtml(activationCode)}</code>${unavailable}</p><ul class="hb-account-facts">${facts}</ul></div><footer class="hb-account-foot"><div class="hb-account-foot-main"><p class="hb-account-device">${deviceLine}</p>${manualNote}</div>${releasePolicyState}</footer></article>`;
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
    //: 分页状态与「加载更多」：接口只返回最近 20 单，总数在 ordersTotal 里；没有按钮时买满一页的用户会以为更早订单丢了。
    state.accountOrdersLoaded = orderItems.length;
    state.accountOrdersTotal = Number(payload.ordersTotal ?? orderItems.length);
    orders.innerHTML = (orderItems.length
      ? orderItems.map(accountOrderCard).join('')
      : '<div class="hb-account-empty">账号下暂无订单。</div>')
      + accountOrdersMoreButton();
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
      toast(error.message, 'err');
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
      toast(error.message, 'err');
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
      try { await archiveOrder(archive.dataset.orderArchive); }
      catch (error) { toast(error.message, 'err'); archive.disabled = false; }
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
      toast('设备已解绑。请回到 HomeOS 激活页，用商店购买邮箱与激活码重新激活。');
      await loadAccount();
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      if (error.status === 409) {
        $('#release-device-dialog').close();
        toast(error.message, 'err');
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
    // ESC 和「关闭」按钮都会关掉这个 <dialog>，把停表和清空当前订单挂在 close
    // 事件上，免得只按 ESC 时轮询还在后台跑、state.currentOrder 还留着旧订单。
    $('#payment-dialog').addEventListener('close', () => { stopPaymentTimers(); state.currentOrder = null; });
    $$('#payment-dialog [data-payment-close]').forEach(button => button.addEventListener('click', () => $('#payment-dialog').close()));
    // 「我已完成支付」：不等下一轮 3 秒轮询，立刻查一次状态；订单超时被关单后后端对「关单时发现
    // 已付款」有兜底入账（reconcile._confirm_paid_after_close），用户点一下就能取回补发的激活码。
    $('#payment-refresh').addEventListener('click', async () => {
      const order = state.currentOrder;
      if (!order) return;
      const button = $('#payment-refresh');
      const status = $('#payment-status');
      const previous = status.textContent;
      button.disabled = true;
      status.textContent = '正在向服务端确认支付结果…';
      const ok = await pollOrder(order.orderNo, order.lookupToken);
      button.disabled = false;
      // 查单失败时把状态文案还原：停在「正在确认…」会让用户以为卡住了。
      if (!ok) {
        status.textContent = previous;
        toast('查询支付结果失败，请检查网络后重试。');
      }
    });
    $('#payment-cancel').addEventListener('click', event => cancelPendingOrderFrom(event.currentTarget, state.currentOrder));
    $('#guest-purchase-trigger')?.addEventListener('click', showGuestPurchaseNotice);
    $('#guest-purchase-dismiss')?.addEventListener('click', () => $('#guest-purchase-dialog')?.close());
    // 待支付订单弹窗：右上角 X / ESC 只是关掉提示（订单仍然有效，倒计时继续走），
    // 「取消支付」才真的关单。停表挂在 close 事件上，两条路径都不会漏。
    $('#pending-order-dialog').addEventListener('close', () => {
      clearInterval(state.pendingCountdownTimer);
      state.pendingCountdownTimer = null;
    });
    $$('#pending-order-dialog [data-pending-close]').forEach(button => button.addEventListener('click', () => $('#pending-order-dialog').close()));
    $('#pending-order-cancel').addEventListener('click', event => cancelPendingOrderFrom(event.currentTarget, state.pendingOrder));
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
    $('#store-login-form')?.addEventListener('submit', event => login(event).catch(error => toast(error.message, 'err')));
    $('#send-register-code')?.addEventListener('click', () => sendRegisterCode().catch(error => toast(error.message, 'err')));
    $('#store-register-form')?.addEventListener('submit', event => register(event).catch(error => toast(error.message, 'err')));
    $('#send-reset-code')?.addEventListener('click', () => sendResetCode().catch(error => toast(error.message, 'err')));
    $('#store-forget-form')?.addEventListener('submit', event => resetPassword(event).catch(error => toast(error.message, 'err')));
    $('#account-licenses')?.addEventListener('click', accountAction);
    $('#account-orders')?.addEventListener('click', event => {
      // 「加载更多」按钮与订单操作共用同一个委派监听：都在 #account-orders 里。
      if (event.target.closest('[data-orders-more]')) {
        return loadMoreAccountOrders().catch(error => toast(error.message, 'err'));
      }
      return accountOrderAction(event).catch(error => toast(error.message, 'err'));
    });
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
    $('#store-logout')?.addEventListener('click', () => logout().catch(error => toast(error.message, 'err')));
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
      toast(error.message, 'err');
    }
  }

  init();
})();
