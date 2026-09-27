/**
 * 商店前台的商品目录：卡片/详情渲染、筛选与增购项分组。
 */

import { renderAddonTargets, resetCouponPreview, storePageHref } from "./store-shared.js?v=2609271226";
import { $ as $ } from "./store-shared.js?v=2609271226";
import { $$ as $$ } from "./store-shared.js?v=2609271226";
import { currentPage as currentPage } from "./store-shared.js?v=2609271226";
import { esc as escapeHtml } from "./htmlsafe.js?v=2609271226";
import { formatCents as money } from "./money.js?v=2609271226";
import { state as state } from "./store-shared.js?v=2609271226";
import { versionedStoreAsset as versionedStoreAsset } from "./store-shared.js?v=2609271226";

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
  const submit = $('#purchase-form').querySelector('[type="submit"]');
  submit.disabled = Boolean(product.soldOut || unavailable);
  submit.innerHTML = product.soldOut
    ? '已售罄'
    : unavailable
      ? (state.hasPermanentLicense ? '已有永久授权，不可购买试用' : '每个账号只能购买一次试用')
      : '<i class="fa-duotone fa-regular fa-qrcode"></i> 支付宝付款';
}

