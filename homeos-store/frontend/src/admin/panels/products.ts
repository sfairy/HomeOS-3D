/**
 * 商品面板。
 */

import { errorMessage } from "../../store-types.js";
import { $, emptyRow, esc, toast } from "../dom.js";
import {
  closeFeaturePickers,
  featureCell,
  renderFeatureOptions,
  setFeaturePickerValue,
  syncFeatureSummary,
} from "../features.js";
import { api, withBusy } from "../api.js";
import { state } from "../state.js";
import {
  actions,
  cell,
  menuItem,
  pageState,
  pagedFetch,
  renderPager,
  resetPage,
  rowMenu,
} from "../table.js";
import { money, num, pill } from "../format.js";
import { PRODUCT_TYPE } from "../vocab.js";
import { askConfirm } from "../dialogs.js";
import { host } from "../host.js";

type Product = {
  id: string;
  name?: string;
  productCode?: string | null;
  productType?: string;
  priceCents?: number;
  originalPriceCents?: number | null;
  validityDays?: number | null;
  sortOrder?: number;
  featureCodes?: string[];
  includedProductIds?: string[];
  badgeText?: string | null;
  stockQuantity?: number | null;
  availableStock?: number | null;
  fulfillmentMode?: string;
  note?: string | null;
  displayDescription?: string | null;
  active?: boolean;
  featured?: boolean;
  isFullPrice?: boolean;
  packageContentsLocked?: boolean;
  requiresLicense?: boolean;
  imageUrl?: string | null;
  licenseCount?: number;
  orderCount?: number;
  [key: string]: unknown;
};

type ProductForm = HTMLFormElement & {
  elements: HTMLFormControlsCollection & {
    id: HTMLInputElement;
    name: HTMLInputElement;
    productCode: HTMLInputElement;
    productType: HTMLSelectElement;
    priceCents: HTMLInputElement;
    originalPriceCents: HTMLInputElement;
    validityDays: HTMLInputElement;
    sortOrder: HTMLInputElement;
    featureCodes: HTMLInputElement;
    includedProductIds: HTMLInputElement;
    badgeText: HTMLInputElement;
    stockQuantity: HTMLInputElement;
    fulfillmentMode: HTMLSelectElement;
    note: HTMLTextAreaElement;
    displayDescription: HTMLTextAreaElement;
    active: HTMLInputElement;
    featured: HTMLInputElement;
    isFullPrice: HTMLInputElement;
    packageContentsLocked: HTMLInputElement;
    requiresLicense: HTMLInputElement;
  };
};

// --------------------------------------------------------------------------- //
// 商品
// --------------------------------------------------------------------------- //
export function productFormPayload(form: ProductForm) {
  const list = (value: unknown) =>
    String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  const number = (value: string) =>
    value === '' || value === null ? null : Number(value);
  return {
    name: form.elements.name.value.trim(),
    productCode: form.elements.productCode.value.trim() || null,
    productType: form.elements.productType.value,
    priceCents: Number(form.elements.priceCents.value || 0),
    originalPriceCents: number(form.elements.originalPriceCents.value),
    validityDays: number(form.elements.validityDays.value),
    sortOrder: Number(form.elements.sortOrder.value || 100),
    featureCodes: list(form.elements.featureCodes.value),
    includedProductIds: list(form.elements.includedProductIds.value),
    badgeText: form.elements.badgeText.value.trim() || null,
    stockQuantity: number(form.elements.stockQuantity.value),
    fulfillmentMode: form.elements.fulfillmentMode.value,
    note: form.elements.note.value.trim() || null,
    displayDescription: form.elements.displayDescription.value.trim() || null,
    active: form.elements.active.checked,
    featured: form.elements.featured.checked,
    // 下面三个是结算会读的开关，不是纯展示字段：
    isFullPrice: form.elements.isFullPrice.checked,
    packageContentsLocked: form.elements.packageContentsLocked.checked,
    requiresLicense: form.elements.requiresLicense.checked,
  };
}

export function openProductEditor(product: Product | null) {
  const form = $('#product-form') as ProductForm | null;
  const picker = $('#product-features');
  if (!form || !picker) return;
  closeFeaturePickers();
  form.reset();
  form.elements.id.value = product ? product.id : '';
  const title = $('#product-editor-title');
  if (title) {
    title.textContent = product ? `编辑商品 · ${product.name}` : '新增商品';
  }
  setFeaturePickerValue(picker, (product && product.featureCodes) || []);
  if (product) {
    form.elements.name.value = product.name || '';
    form.elements.productCode.value = product.productCode || '';
    form.elements.productType.value = product.productType || '';
    form.elements.priceCents.value = String(product.priceCents ?? '');
    form.elements.originalPriceCents.value =
      product.originalPriceCents == null ? '' : String(product.originalPriceCents);
    form.elements.validityDays.value =
      product.validityDays == null ? '' : String(product.validityDays);
    form.elements.sortOrder.value = String(product.sortOrder ?? 100);
    form.elements.includedProductIds.value = (product.includedProductIds || []).join(',');
    form.elements.badgeText.value = product.badgeText || '';
    form.elements.stockQuantity.value =
      product.stockQuantity == null ? '' : String(product.stockQuantity);
    form.elements.fulfillmentMode.value = product.fulfillmentMode || 'automatic';
    form.elements.note.value = product.note || '';
    form.elements.displayDescription.value = product.displayDescription || '';
    form.elements.active.checked = Boolean(product.active);
    form.elements.featured.checked = Boolean(product.featured);
    form.elements.isFullPrice.checked = Boolean(product.isFullPrice);
    form.elements.packageContentsLocked.checked = Boolean(product.packageContentsLocked);
    form.elements.requiresLicense.checked = Boolean(product.requiresLicense);
  } else {
    form.elements.active.checked = true;
  }
  renderFeatureOptions(picker);
  syncFeatureSummary(picker);
  host.showEditor?.('#product-editor');
  form.elements.name.focus();
}

// 商品目录（不分页）单独拉一份：授权签发、权益编辑这些下拉框要的是**全部**在售
export async function loadProductCatalog() {
  const data = (await api('/products?limit=500&status_filter=active')) as {
    items?: Product[];
  };
  state.products = data.items || [];
  const select = $('#license-product');
  if (select) {
    select.innerHTML = (state.products as Product[])
      .map(
        (product) =>
          `<option value="${esc(product.id)}">${esc(product.name)}</option>`,
      )
      .join('');
  }
}

export async function loadProducts() {
  const params = new URLSearchParams();
  const keyword = (($('#product-keyword') as HTMLInputElement | null)?.value || '').trim();
  const status = ($('#product-status') as HTMLSelectElement | null)?.value || '';
  if (keyword) params.set('keyword', keyword);
  if (status) params.set('status_filter', status);
  // 「刷新 / 搜索」按钮、分页器与筛选框都直接调这个 loader，失败时没人接那个 Promise，
  let data: { items?: Product[] } | null;
  try {
    data = (await pagedFetch(
      'products',
      '/products',
      Object.fromEntries(params),
    )) as typeof data;
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
    return;
  }
  if (!data) return;
  state.productPage = data.items || [];
  const rows = $('#product-rows');
  if (!rows) return;
  const items = data.items || [];
  rows.innerHTML = items.length
    ? items
        .map(
          (product) => `
    <tr>
      <td>${cell(product.name)}${product.featured ? ` ${pill('推荐', 'warning')}` : ''}${product.requiresLicense ? ` ${pill('增量包', 'info')}` : ''}</td>
      <td>${esc(PRODUCT_TYPE[product.productType || ''] || product.productType)}</td>
      <td class="nowrap">${money(product.priceCents)}</td>
      <td class="nowrap">${product.validityDays ? `${num(product.validityDays)} 天` : '永久'}</td>
      <td>${featureCell(product.featureCodes || [])}</td>
      <td class="nowrap">${product.stockQuantity === null ? '不限' : `${num(product.availableStock)}/${num(product.stockQuantity)}`}</td>
      <td class="nowrap">${product.active ? pill('上架', 'success') : pill('下架', 'muted')}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-product-edit="${esc(product.id)}">编辑</button>`,
        rowMenu(
          '更多操作',
          `<label class="menu__item">上传商品图<input type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" data-product-image-upload="${esc(product.id)}"></label>`,
          product.imageUrl
            ? menuItem(
                '移除商品图',
                `data-product-image="${esc(product.id)}" data-product-name="${esc(product.name)}"`,
              )
            : '',
          menuItem('删除', `data-product-delete="${esc(product.id)}"`, { danger: true }),
        ),
      )}</td>
    </tr>`,
        )
        .join('')
    : emptyRow(
        8,
        pageState('products').offset > 0 ? '本页无数据' : '没有符合条件的商品',
      );
  renderPager('products');
}

// 商品在两个地方各有一份：分页列表（当前页）与完整目录（下拉框用）。
export function findProduct(id: string) {
  return (
    ((state.productPage || []) as Product[]).find((item) => item.id === id) ||
    ((state.products || []) as Product[]).find((item) => item.id === id)
  );
}

$('#product-new')?.addEventListener('click', () => openProductEditor(null));

$('#product-refresh')?.addEventListener('click', () => {
  resetPage('products');
  loadProducts();
});

$('#product-cancel')?.addEventListener('click', () => {
  host.hideEditor?.('#product-editor');
});

$('#product-rows')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const editId = target.dataset.productEdit;
  const deleteId = target.dataset.productDelete;
  const imageId = target.dataset.productImage;
  if (editId) openProductEditor(findProduct(editId) || null);

  // 移除商品图：会同时删掉磁盘文件，删完前台回落到默认标识
  if (imageId) {
    const name = target.dataset.productName || imageId;
    const ok = await askConfirm({
      title: '移除商品图',
      message: `将删除「${name}」的自定义商品图。`,
      impact:
        '同时会<b>删除磁盘上的图片文件</b>，前台该商品回落到默认标识。此操作不可撤销。',
      okText: '移除图片',
    });
    if (!ok) return;
    try {
      await api(`/products/${imageId}/image`, { method: 'DELETE' });
      toast('商品图已移除');
      await Promise.all([loadProductCatalog(), loadProducts()]);
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
    return;
  }
  if (deleteId) {
    const product = findProduct(deleteId);
    // 用后端给的 licenseCount / orderCount（与删除守卫同口径）如实预告结果，
    const refs: string[] = [];
    if (product?.licenseCount) refs.push(`<b>${num(product.licenseCount)}</b> 条授权`);
    if (product?.orderCount) refs.push(`<b>${num(product.orderCount)}</b> 笔订单`);
    const ok = await askConfirm({
      title: '删除商品',
      message: `将删除「${product ? product.name : deleteId}」。`,
      impact: refs.length
        ? `该商品已被 ${refs.join('、')}引用，为避免历史数据悬空，系统只会把它<b>下架</b>而不是删除。`
        : '该商品没有产生过授权或订单，将被<b>彻底删除</b>（含商品图文件）。',
      okText: refs.length ? '下架' : '删除',
      tone: refs.length ? 'warning' : 'danger',
    });
    if (!ok) return;
    try {
      const result = (await api(`/products/${deleteId}`, { method: 'DELETE' })) as {
        deleted?: boolean;
        reason?: string;
      };
      toast(
        result.deleted
          ? '商品已删除'
          : `商品已下架（${result.reason || '存在历史引用'}）`,
        result.deleted ? 'success' : 'warning',
      );
      await Promise.all([
        loadProductCatalog(),
        loadProducts(),
        host.loadOverview?.(),
      ]);
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
  }
});

// 商品图上传：走 multipart，后端会按扩展名落盘并生成新的 ?v= 版本号，
$('#product-rows')?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const input = target.closest(
    '[data-product-image-upload]',
  ) as HTMLInputElement | null;
  if (!input) return;
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const body = new FormData();
  body.append('file', file);
  try {
    await api(`/products/${input.dataset.productImageUpload}/image`, {
      method: 'POST',
      body,
    });
    toast('商品图已更新');
    await loadProducts();
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

$('#product-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target as ProductForm;
  const payload = productFormPayload(form);
  try {
    await withBusy(
      form,
      async () => {
        if (form.elements.id.value) {
          await api(`/products/${form.elements.id.value}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          });
          toast('商品已更新');
        } else {
          await api('/products', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          toast('商品已创建');
        }
        host.hideEditor?.('#product-editor');
        await Promise.all([
          loadProductCatalog(),
          loadProducts(),
          host.loadOverview?.(),
        ]);
      },
      '保存中…',
    );
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});
