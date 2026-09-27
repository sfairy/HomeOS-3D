/**
 * 商店前台的商品目录：卡片/详情渲染、筛选与增购项分组。
 */

import { renderAddonTargets, resetCouponPreview, storePageHref } from "./store-shared.js?v=2609271508";
import { $ as $ } from "./store-shared.js?v=2609271508";
import { $$ as $$ } from "./store-shared.js?v=2609271508";
import { currentPage as currentPage } from "./store-shared.js?v=2609271508";
import { esc as escapeHtml } from "./htmlsafe.js?v=2609271508";
import { formatCents as money } from "./money.js?v=2609271508";
import { state as state } from "./store-shared.js?v=2609271508";
import { versionedStoreAsset as versionedStoreAsset } from "./store-shared.js?v=2609271508";

export function chooseProduct() {
  if (currentPage() !== 'item') { state.product = null; return; }
  const requested = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) || '');
  state.product = state.products.find(item => item.id === requested) || null;
}

export function primaryProducts() {
  return state.products.filter(item => ['base', 'bundle', 'package'].includes(item.productType));
}

export function isTrialProduct(product) {
  return product.validityDays !== null && product.validityDays !== undefined;
}

export function requestedUpgradeLicenseId() {
  return new URLSearchParams(location.search).get('upgrade');
}

export function productHref(product) {
  const base = storePageHref(`/item/${encodeURIComponent(product.id)}`);
  const upgrade = requestedUpgradeLicenseId();
  return upgrade && !isTrialProduct(product) ? `${base}&upgrade=${encodeURIComponent(upgrade)}` : base;
}

export function addonProducts() {
  return state.products.filter(item => ['template', 'module'].includes(item.productType));
}

export function isAddonProduct(product) {
  return ['template', 'module'].includes(product?.productType);
}

export function addonTypeLabel(product) {
  if (product?.productType === 'package') return '自定义套餐';
  return product?.productType === 'module' ? '功能增量包' : 'UI 方案包';
}

export function availableAddonProducts() {
  const eligible = state.accountLicenses.filter(item => item.active && !item.validityDays && !item.accessExpiresAt);
  return addonProducts().filter(product => eligible.some(license => {
    const owned = new Set(state.accountEntitlements
      .filter(item => item.active && item.customerId === license.customerId)
      .map(item => item.featureCode));
    return !(product.featureCodes || []).length || (product.featureCodes || []).some(code => !owned.has(code));
  }));
}

export function primaryProductUnavailable(product) {
  return isTrialProduct(product) && (state.hasPermanentLicense || state.hasUsedTrial);
}

export function productGroup(product) {
  if (isAddonProduct(product)) return 'addon';
  if (isTrialProduct(product)) return 'trial';
  return product.productType === 'bundle' ? 'bundle' : 'base';
}

export function primaryCard(product) {
  const bundle = product.productType === 'bundle';
  const unavailable = primaryProductUnavailable(product);
  const action = unavailable
    ? `<span class="hb-button hb-button--secondary hb-button--sm is-disabled">${state.hasPermanentLicense ? '已有永久授权' : '已购买试用'}</span>`
    : product.soldOut
    ? '<span class="hb-button hb-button--secondary hb-button--sm is-disabled">已售罄</span>'
    : `<a class="hb-button hb-button--primary hb-button--sm" href="${escapeHtml(productHref(product))}">${state.account ? (requestedUpgradeLicenseId() && !isTrialProduct(product) ? '选择升级版本' : '选择此版本') : '查看详情'}</a>`;
  const badge = isTrialProduct(product) ? `${product.validityDays} 天试用` : bundle ? '全授权' : product.productType === 'package' ? '自定义套餐' : '主授权';
  const summary = product.productType === 'package' ? packageContentsText(product) : product.displayDescription || product.note || '';
  const contents = summary ? `<p>${escapeHtml(summary)}</p>` : '';
  return `<article class="hb-addon-card${unavailable ? ' is-purchased' : ''}" data-product-group="${productGroup(product)}"><span class="hb-addon-card__badge">${escapeHtml(badge)}</span><h3>${escapeHtml(product.name)}</h3>${contents}<div class="hb-addon-card__footer"><strong>${money(product.priceCents)}</strong>${action}</div></article>`;
}

export function applyProductFilter(value = state.productFilter) {
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

export function catalogCards() {
  const cards = primaryProducts().map(product => ({ group: productGroup(product), html: primaryCard(product) }));
  if (state.hasPermanentLicense) {
    addonProducts().forEach(product => cards.push({ group: 'addon', html: addonCard(product) }));
  }
  return cards;
}

export function renderProducts() {
  const cards = catalogCards();
  // 没有任何主授权在售时，顶栏「购买授权」与页脚入口都收起来，
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

export function addonCard(product) {
  const type = addonTypeLabel(product);
  const description = product.displayDescription || product.note || '购买后追加到现有激活码。';
  const action = product.soldOut
    ? '<span class="hb-button hb-button--secondary hb-button--sm is-disabled">已售罄</span>'
    : `<a class="hb-button hb-button--primary hb-button--sm" href="${escapeHtml(storePageHref(`/item/${encodeURIComponent(product.id)}`))}">${state.account ? '查看并购买' : '查看详情'}</a>`;
  return `<article class="hb-addon-card" data-product-group="addon"><span class="hb-addon-card__badge">${escapeHtml(type)}</span><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(description)}</p><div class="hb-addon-card__footer"><strong>${money(product.priceCents)}</strong>${action}</div></article>`;
}

export function renderAddons() {
  const availableProducts = availableAddonProducts();
  const offers = $('#account-addon-offers');
  const section = $('#account-addon-offers-section');
  if (offers && section) {
    section.hidden = !state.hasPermanentLicense || !availableProducts.length;
    offers.innerHTML = availableProducts.map(addonCard).join('');
  }
}

export function packageContentsText(product) {
  // 「主授权」是套餐默认包含的基础授权（includedProductIds 里只有增量包，基础授权是隐式的），
  return ['主授权', ...(product.packageItems || []).map(item => item.name)].join(' + ');
}

/**
 * 渲染「选择支付方式」的按钮。
 *
 * 住在 catalog 而不是 store.js：它依赖 ``renderProduct`` 算出的 ``state.purchaseBlock``，
 * 而依赖方向是 store.js → store-catalog.js，放反了就成了循环导入。
 *
 * 四条规则：
 *   1. **只渲染 available 的渠道** —— 凭据不全的渠道画出来就是个点下去 503 的按钮；
 *   2. 商品不可买（售罄/试用已用过）时给一个禁用的按钮，文案说清原因；
 *   3. 一个可用渠道都没有时给一个禁用的提示按钮，而不是整块空白（用户会以为页面坏了）；
 *   4. 每个按钮都是 submit，点哪个就把哪个渠道写进隐藏字段 —— 单渠道时与从前完全一样。
 */
export function renderPaymentMethods() {
  const box = $('#payment-methods');
  const form = $('#purchase-form');
  if (!box || !form) return;
  const channels = (state.configuration?.payment?.channels || []).filter(item => item.available);
  const blocked = state.purchaseBlock?.label || '';
  box.replaceChildren();
  form.elements.paymentChannel.value = (
    !blocked && channels.length === 1 ? channels[0].provider : ''
  );

  const makeButton = (className) => {
    const button = document.createElement('button');
    button.className = `hb-button hb-button--${className} hb-button--lg hb-pay-submit`;
    return button;
  };

  if (blocked) {
    const disabled = makeButton('primary');
    disabled.type = 'button';
    disabled.disabled = true;
    disabled.textContent = blocked;
    box.append(disabled);
    return;
  }

  if (!channels.length) {
    const disabled = makeButton('primary');
    disabled.type = 'button';
    disabled.disabled = true;
    disabled.textContent = '支付渠道暂不可用';
    box.append(disabled);
    return;
  }

  for (const channel of channels) {
    const button = makeButton(channel.isDefault ? 'primary' : 'secondary');
    button.type = 'submit';
    button.dataset.channel = channel.provider;
    const icon = document.createElement('i');
    icon.className = 'fa-duotone fa-regular fa-qrcode';
    // 显示名是运营可控的文本 —— 必须用 textContent 拼，不能进 innerHTML。
    button.append(icon, document.createTextNode(` ${channel.displayName}付款`));
    button.addEventListener('click', () => {
      form.elements.paymentChannel.value = channel.provider;
    });
    box.append(button);
  }
}
export function renderProduct() {
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
  // 付款按钮**不能**在这里抓：渠道是动态的（见 renderPaymentMethods），而
  // ``querySelector('[type="submit"]')`` 在多个渠道下只会抓到第一个，然后把它
  // 覆写成「支付宝付款」—— 微信那个按钮就永远显示不出来，售罄时也只禁用其中一个。
  // 所以这里只记录「商品层面能不能买」，按钮的渲染与禁用统一交给 renderPaymentMethods。
  state.purchaseBlock = product.soldOut
    ? { label: '已售罄' }
    : unavailable
      ? {
          label: state.hasPermanentLicense
            ? '已有永久授权，不可购买试用'
            : '每个账号只能购买一次试用',
        }
      : null;
  renderPaymentMethods();
}

