/**
 * 优惠码。
 *
 * 优惠码列表、编辑器与核销记录跳转。
 */

import { $, emptyRow, esc, toast } from "../dom.js?v=2609251851";
import { actions, cell, menuItem, pageState, pagedFetch, renderPager, resetPage, rowMenu } from "../table.js?v=2609251851";
import { state } from "../state.js?v=2609251851";
import { localInput, money, num, pill, utcInput } from "../format.js?v=2609251851";
import { api, withBusy } from "../api.js?v=2609251851";
import { askConfirm } from "../dialogs.js?v=2609251851";
import { host } from "../host.js?v=2609251851";

// --------------------------------------------------------------------------- //
// 优惠码
// --------------------------------------------------------------------------- //
export async function loadCoupons() {
  const params = new URLSearchParams();
  const keyword = $('#coupon-keyword').value.trim();
  const status = $('#coupon-status').value;
  if (keyword) params.set('keyword', keyword);
  if (status) params.set('status_filter', status);
  const data = await pagedFetch('coupons', '/coupons', Object.fromEntries(params));
  state.coupons = data.items;
  $('#coupon-rows').innerHTML = data.items.length ? data.items.map(coupon => `
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
        rowMenu('更多操作',
          menuItem('编辑', `data-coupon-edit="${esc(coupon.id)}"`),
          menuItem('查看核销记录', `data-coupon-redemptions="${esc(coupon.id)}" data-coupon-code="${esc(coupon.code)}"`),
          // 删除守卫数的是核销记录（历史凭证），不是「占用名额」，所以判据用 redemptionCount
          menuItem('删除', `data-coupon-delete="${esc(coupon.id)}" data-coupon-code="${esc(coupon.code)}" data-coupon-used="${coupon.redemptionCount || 0}"`, { danger: true }),
        ),
      )}</td>
    </tr>`).join('') : emptyRow(8, pageState('coupons').offset > 0 ? '本页无数据' : '没有符合条件的优惠码');
  renderPager('coupons');
}

// 逗号分隔的 ID 列表 ↔ 数组。多选字段（功能码、套餐内容、适用商品）共用这一个口径。
export function idList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

export function openCouponEditor(coupon) {
  const form = $('#coupon-form');
  form.reset();
  $('#coupon-editor-title').textContent = coupon ? `编辑优惠码 ${coupon.code}` : '新增优惠码';
  // 码是对外承诺，改掉等于让已发出去的码失效，所以只有新增时能填
  form.elements.code.readOnly = Boolean(coupon);
  if (!coupon) { host.showEditor('#coupon-editor'); return; }
  form.elements.id.value = coupon.id;
  form.elements.code.value = coupon.code || '';
  form.elements.description.value = coupon.description || '';
  form.elements.discountType.value = coupon.discountType || 'percent';
  form.elements.percent.value = coupon.percent ?? 0;
  form.elements.amountCents.value = coupon.amountCents ?? 0;
  form.elements.minAmountCents.value = coupon.minAmountCents ?? 0;
  form.elements.maxRedemptions.value = coupon.maxRedemptions ?? '';
  form.elements.perAccountLimit.value = coupon.perAccountLimit ?? 0;
  form.elements.startsAt.value = localInput(coupon.startsAt);
  form.elements.expiresAt.value = localInput(coupon.expiresAt);
  form.elements.applicableProductIds.value = (coupon.applicableProductIds || []).join(', ');
  form.elements.active.checked = Boolean(coupon.active);
  host.showEditor('#coupon-editor');
}

$('#coupon-new').addEventListener('click', () => openCouponEditor(null));

$('#coupon-cancel').addEventListener('click', () => { host.hideEditor('#coupon-editor'); });

$('#coupon-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const couponId = form.elements.id.value;
  const body = {
    description: form.elements.description.value.trim(),
    discountType: form.elements.discountType.value,
    percent: Number(form.elements.percent.value || 0),
    amountCents: Number(form.elements.amountCents.value || 0),
    minAmountCents: Number(form.elements.minAmountCents.value || 0),
    maxRedemptions: form.elements.maxRedemptions.value ? Number(form.elements.maxRedemptions.value) : null,
    perAccountLimit: Number(form.elements.perAccountLimit.value || 0),
    // 空串即「不限」，这里刻意传 null 而不是省略字段：
    // 省略等于「保持原值」，运营想清掉已设的截止时间就永远清不掉。
    // 输入框里的本地时间要换算成库里的 UTC（见 utcInput）。
    startsAt: utcInput(form.elements.startsAt.value),
    expiresAt: utcInput(form.elements.expiresAt.value),
    applicableProductIds: idList(form.elements.applicableProductIds.value),
    active: form.elements.active.checked,
  };
  try {
    await withBusy(form, async () => {
      if (couponId) {
        await api(`/coupons/${couponId}`, { method: 'PATCH', body: JSON.stringify(body) });
        toast('优惠码已更新');
      } else {
        await api('/coupons', { method: 'POST', body: JSON.stringify({ ...body, code: form.elements.code.value.trim() }) });
        toast('优惠码已创建');
      }
      host.hideEditor('#coupon-editor');
      // 新建的优惠码按 created_at desc 排最前，回到第 1 页才看得到
      if (!couponId) resetPage('coupons');
      await Promise.all([loadCoupons(), host.loadOverview()]);
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
});

$('#coupon-rows').addEventListener('click', async (event) => {
  const couponId = event.target.dataset.couponDelete;
  const toggleId = event.target.dataset.couponToggle;
  const editId = event.target.dataset.couponEdit;
  const redemptionsFor = event.target.dataset.couponRedemptions;

  if (editId) {
    const coupon = state.coupons.find(item => item.id === editId);
    if (coupon) openCouponEditor(coupon);
    return;
  }

  // 跳到诊断页并只看这个码的核销记录：作废重复核销必须能一眼看到「是谁、哪一单」
  if (redemptionsFor) {
    state.redemptionFilter = { couponId: redemptionsFor, couponCode: event.target.dataset.couponCode || redemptionsFor };
    pageState('coupon-redemptions').offset = 0;
    // 落到「优惠码核销」那个 tab：核销表不在默认 tab 上，停在默认 tab 的话
    // 下面那句 scrollIntoView 会对着一个 hidden 元素做无效滚动。
    await host.activate('diagnostics', 'redeem');
    $('#redemption-rows').scrollIntoView({ block: 'center' });
    return;
  }

  // 启用 / 停用：不影响核销记录
  if (toggleId) {
    const next = event.target.dataset.couponActive !== '1';
    try {
      await api(`/coupons/${toggleId}`, { method: 'PATCH', body: JSON.stringify({ active: next }) });
      toast(next ? '优惠码已启用' : '优惠码已停用');
      await loadCoupons();
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  if (!couponId) return;
  const code = event.target.dataset.couponCode || couponId;
  const used = Number(event.target.dataset.couponUsed || 0);
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
    const result = await api(`/coupons/${couponId}`, { method: 'DELETE' });
    toast(result.deleted ? '优惠码已删除' : `优惠码已停用（${result.reason || '已有核销记录'}）`, result.deleted ? 'success' : 'warning');
    await loadCoupons();
  } catch (error) { toast(error.message, 'danger'); }
});
