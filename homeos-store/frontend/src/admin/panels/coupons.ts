/** 优惠码。 */

import { errorMessage } from "../../store-types.js";
import { $, emptyRow, esc, toast } from "../dom.js";
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
import { state } from "../state.js";
import { localInput, money, num, pill, utcInput } from "../format.js";
import { api, withBusy } from "../api.js";
import { askConfirm } from "../dialogs.js";
import { host } from "../host.js";

type Coupon = {
  id: string;
  code?: string;
  description?: string;
  discountType?: string;
  amountCents?: number;
  percent?: number;
  minAmountCents?: number;
  redeemedCount?: number;
  maxRedemptions?: number | null;
  redemptionCount?: number;
  active?: boolean;
  perAccountLimit?: number;
  startsAt?: string;
  expiresAt?: string;
  applicableProductIds?: string[];
  [key: string]: unknown;
};

type CouponForm = HTMLFormElement & {
  elements: HTMLFormControlsCollection & {
    id: HTMLInputElement;
    code: HTMLInputElement;
    description: HTMLInputElement;
    discountType: HTMLSelectElement;
    percent: HTMLInputElement;
    amountCents: HTMLInputElement;
    minAmountCents: HTMLInputElement;
    maxRedemptions: HTMLInputElement;
    perAccountLimit: HTMLInputElement;
    startsAt: HTMLInputElement;
    expiresAt: HTMLInputElement;
    applicableProductIds: HTMLInputElement;
    active: HTMLInputElement;
  };
};


export async function loadCoupons() {
  const params = new URLSearchParams();
  const keyword = (($('#coupon-keyword') as HTMLInputElement | null)?.value || '').trim();
  const status = ($('#coupon-status') as HTMLSelectElement | null)?.value || '';
  if (keyword) params.set('keyword', keyword);
  if (status) params.set('status_filter', status);

  let data: { items?: Coupon[] } | null;
  try {
    data = (await pagedFetch(
      'coupons',
      '/coupons',
      Object.fromEntries(params),
    )) as typeof data;
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
    return;
  }
  if (!data) return;
  state.coupons = data.items || [];
  const rows = $('#coupon-rows');
  if (!rows) return;
  const items = data.items || [];
  rows.innerHTML = items.length
    ? items
        .map(
          (coupon) => `
    <tr>
      <td class="mono">${cell(coupon.code)}</td>
      <td>${cell(coupon.description)}</td>
      <td class="nowrap">${coupon.discountType === 'fixed' ? money(coupon.amountCents) : `${num(coupon.percent)}%`}</td>
      <td class="nowrap">${coupon.minAmountCents ? money(coupon.minAmountCents) : '无'}</td>
      <td class="nowrap">${num(coupon.redeemedCount)}/${esc(coupon.maxRedemptions ?? '∞')}</td>
      <td class="nowrap">${coupon.redemptionCount ? `<span title="历史上被占用过的次数（含已归还），点击「查看核销记录」可逐条作废">${num(coupon.redemptionCount)} 次</span>` : '—'}</td>
      <td class="nowrap">${coupon.active ? pill('启用', 'success') : pill('停用', 'muted')}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-coupon-toggle="${esc(coupon.id)}" data-coupon-active="${coupon.active ? '1' : '0'}">${coupon.active ? '停用' : '启用'}</button>`,
        rowMenu(
          '更多操作',
          menuItem('编辑', `data-coupon-edit="${esc(coupon.id)}"`),
          menuItem(
            '查看核销记录',
            `data-coupon-redemptions="${esc(coupon.id)}" data-coupon-code="${esc(coupon.code)}"`,
          ),
          menuItem(
            '删除',
            `data-coupon-delete="${esc(coupon.id)}" data-coupon-code="${esc(coupon.code)}" data-coupon-used="${coupon.redemptionCount || 0}"`,
            { danger: true },
          ),
        ),
      )}</td>
    </tr>`,
        )
        .join('')
    : emptyRow(8, pageState('coupons').offset > 0 ? '本页无数据' : '没有符合条件的优惠码');
  renderPager('coupons');
}


 function idList(value: unknown) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

 function openCouponEditor(coupon: Coupon | null) {
  const form = $('#coupon-form') as CouponForm | null;
  if (!form) return;
  form.reset();
  const title = $('#coupon-editor-title');
  if (title) {
    title.textContent = coupon ? `编辑优惠码 ${coupon.code}` : '新增优惠码';
  }
  form.elements.code.readOnly = Boolean(coupon);
  if (!coupon) {
    host.showEditor?.('#coupon-editor');
    return;
  }
  form.elements.id.value = coupon.id;
  form.elements.code.value = coupon.code || '';
  form.elements.description.value = coupon.description || '';
  form.elements.discountType.value = coupon.discountType || 'percent';
  form.elements.percent.value = String(coupon.percent ?? 0);
  form.elements.amountCents.value = String(coupon.amountCents ?? 0);
  form.elements.minAmountCents.value = String(coupon.minAmountCents ?? 0);
  form.elements.maxRedemptions.value =
    coupon.maxRedemptions == null ? '' : String(coupon.maxRedemptions);
  form.elements.perAccountLimit.value = String(coupon.perAccountLimit ?? 0);
  form.elements.startsAt.value = localInput(coupon.startsAt);
  form.elements.expiresAt.value = localInput(coupon.expiresAt);
  form.elements.applicableProductIds.value = (coupon.applicableProductIds || []).join(', ');
  form.elements.active.checked = Boolean(coupon.active);
  host.showEditor?.('#coupon-editor');
}

$('#coupon-new')?.addEventListener('click', () => openCouponEditor(null));

$('#coupon-cancel')?.addEventListener('click', () => {
  host.hideEditor?.('#coupon-editor');
});

$('#coupon-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target as CouponForm;
  const couponId = form.elements.id.value;
  const body = {
    description: form.elements.description.value.trim(),
    discountType: form.elements.discountType.value,
    percent: Number(form.elements.percent.value || 0),
    amountCents: Number(form.elements.amountCents.value || 0),
    minAmountCents: Number(form.elements.minAmountCents.value || 0),
    maxRedemptions: form.elements.maxRedemptions.value
      ? Number(form.elements.maxRedemptions.value)
      : null,
    perAccountLimit: Number(form.elements.perAccountLimit.value || 0),
    startsAt: utcInput(form.elements.startsAt.value),
    expiresAt: utcInput(form.elements.expiresAt.value),
    applicableProductIds: idList(form.elements.applicableProductIds.value),
    active: form.elements.active.checked,
  };
  try {
    await withBusy(
      form,
      async () => {
        if (couponId) {
          await api(`/coupons/${couponId}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          toast('优惠码已更新');
        } else {
          await api('/coupons', {
            method: 'POST',
            body: JSON.stringify({
              ...body,
              code: form.elements.code.value.trim(),
            }),
          });
          toast('优惠码已创建');
        }
        host.hideEditor?.('#coupon-editor');

        if (!couponId) resetPage('coupons');
        await Promise.all([loadCoupons(), host.loadOverview?.()]);
      },
      '保存中…',
    );
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

$('#coupon-rows')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const couponId = target.dataset.couponDelete;
  const toggleId = target.dataset.couponToggle;
  const editId = target.dataset.couponEdit;
  const redemptionsFor = target.dataset.couponRedemptions;

  if (editId) {
    const coupon = (state.coupons as Coupon[]).find((item) => item.id === editId);
    if (coupon) openCouponEditor(coupon);
    return;
  }


  if (redemptionsFor) {
    state.redemptionFilter = {
      couponId: redemptionsFor,
      couponCode: target.dataset.couponCode || redemptionsFor,
    };
    pageState('coupon-redemptions').offset = 0;

    await host.activate?.('diagnostics', 'redeem');
    $('#redemption-rows')?.scrollIntoView({ block: 'center' });
    return;
  }


  if (toggleId) {
    const next = target.dataset.couponActive !== '1';
    try {
      await api(`/coupons/${toggleId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: next }),
      });
      toast(next ? '优惠码已启用' : '优惠码已停用');
      await loadCoupons();
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
    return;
  }

  if (!couponId) return;
  const code = target.dataset.couponCode || couponId;
  const used = Number(target.dataset.couponUsed || 0);
  const ok = await askConfirm({
    title: '删除优惠码',
    message: `将删除优惠码 ${code}。`,
    impact: used
      ? `该码已被核销 <b>${used}</b> 次，为保留核销记录，系统只会把它<b>停用</b>而不是删除。`
      : '该码尚未被使用，将被<b>彻底删除</b>。',
    okText: used ? '停用' : '删除',
    tone: used ? 'warning' : 'danger',
  });
  if (!ok) return;
  try {
    const result = (await api(`/coupons/${couponId}`, { method: 'DELETE' })) as {
      deleted?: boolean;
      reason?: string;
    };
    toast(
      result.deleted
        ? '优惠码已删除'
        : `优惠码已停用（${result.reason || '已有核销记录'}）`,
      result.deleted ? 'success' : 'warning',
    );
    await loadCoupons();
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});
