/** 订单面板。 */

import { errorMessage } from "../../store-types.js";
import { $, emptyRow, esc, toast } from "../dom.js";
import {
  PENDING_FILTER_VALUES,
  actions,
  cell,
  menuItem,
  menuNote,
  pageState,
  pagedFetch,
  renderPager,
  resetFilters,
  resetPage,
  rowMenu,
} from "../table.js";
import { api } from "../api.js";
import { dayEndUtc, dayStartUtc, dt, money, statusBadge } from "../format.js";
import { LICENSE_ACTION, ORDER_TYPE } from "../vocab.js";
import { askConfirm } from "../dialogs.js";
import { host } from "../host.js";

type OrderStatusMeta = {
  choices: string[];
  labels: Record<string, string>;
  fulfillable: string[];
  refundable: string[];
};

type AdminOrder = {
  orderNo: string;
  email?: string;
  productName?: string;
  orderType?: string;
  licenseAction?: string;
  amountCents: number;
  paymentProvider?: string;
  paymentProviderLabel?: string;
  status?: string;
  statusLabel?: string;
  createdAt?: string;
  paidAt?: string | null;
  needsReview?: boolean;
  licenseId?: string | null;
  targetLicenseModified?: boolean;
  channelPayable?: boolean;
  manualSettlement?: boolean;
  [key: string]: unknown;
};


let orderStatusMetaPromise: Promise<OrderStatusMeta> | null = null;


let orderStatusOptionsApplied = false;

function applyOrderStatusOptions(meta: OrderStatusMeta) {
  if (orderStatusOptionsApplied) return;
  orderStatusOptionsApplied = true;
  const select = $('#order-status') as HTMLSelectElement | null;
  if (!select) return;
  select.append(
    ...meta.choices.map((code) => new Option(meta.labels[code] || code, code)),
  );
  const pendingValue = PENDING_FILTER_VALUES.get('#order-status');
  if (pendingValue !== undefined) {
    PENDING_FILTER_VALUES.delete('#order-status');
    select.value = pendingValue;
  }
}

/** 支付渠道单元格。 */
function providerCell(order: AdminOrder) {
  const raw = String(order.paymentProvider || '').trim();
  if (!raw) {


    return '<span class="hb-meta-chip" title="这笔订单没有渠道信息">—</span>';
  }
  const label = order.paymentProviderLabel || raw;
  const known = ['alipay', 'wechat'].includes(raw.toLowerCase());


  return known
    ? `<span class="hb-meta-chip" title="${esc(raw)}">${esc(label)}</span>`
    : `<span class="hb-meta-chip hb-meta-chip--warning" title="不是当前受支持的渠道：${esc(raw)}">${esc(label)}</span>`;
}

function orderStatusMeta() {

  if (!orderStatusMetaPromise) {
    orderStatusMetaPromise = api('/order-status-meta')
      .then((meta) => {
        const typed = meta as OrderStatusMeta;
        applyOrderStatusOptions(typed);
        return typed;
      })
      .catch((error) => {

        orderStatusMetaPromise = null;
        throw error;
      });
  }
  return orderStatusMetaPromise;
}


export async function loadOrders() {

  let orderStatus: OrderStatusMeta;
  let data: { items?: AdminOrder[] } | null;
  try {
    orderStatus = await orderStatusMeta();
    const params = new URLSearchParams();
    const status = ($('#order-status') as HTMLSelectElement | null)?.value || '';
    const keyword = (($('#order-keyword') as HTMLInputElement | null)?.value || '').trim();
    const from = dayStartUtc(
      ($('#order-date-from') as HTMLInputElement | null)?.value,
    );
    const to = dayEndUtc(($('#order-date-to') as HTMLInputElement | null)?.value);
    if (status) params.set('status_filter', status);
    if (keyword) params.set('keyword', keyword);
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (($('#order-review') as HTMLInputElement | null)?.checked) {
      params.set('needs_review', 'true');
    }
    data = (await pagedFetch(
      'orders',
      '/orders',
      Object.fromEntries(params),
    )) as typeof data;
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
    return;
  }
  if (!data) return;
  const rows = $('#order-rows');
  if (!rows) return;
  const items = data.items || [];
  rows.innerHTML = items.length
    ? items
        .map((order) => {

          const canMarkPaid =
            orderStatus.fulfillable.includes(order.status || '') && !order.paidAt;
          const canFulfill = orderStatus.fulfillable.includes(order.status || '');
          const canRefund = orderStatus.refundable.includes(order.status || '');
          const canCancel = order.status === 'pending';

          const canReview = Boolean(order.needsReview) && order.status !== 'pending';

          const terminalOrder = ['cancelled', 'expired'].includes(order.status || '');
          const untouchedLicense =
            !order.licenseId && !order.targetLicenseModified;
          const canDelete =
            terminalOrder && untouchedLicense && !order.channelPayable;
          const deleteHeldByChannel =
            terminalOrder && untouchedLicense && order.channelPayable;
          const primaryPaid = canMarkPaid;
          const primary = primaryPaid
            ? `<button class="hb-button hb-button--primary hb-button--sm" data-order-paid="${esc(order.orderNo)}">标记支付</button>`
            : canFulfill
              ? `<button class="hb-button hb-button--secondary hb-button--sm" data-order-fulfill="${esc(order.orderNo)}">履约</button>`
              : '';

          const manualBadge = order.manualSettlement
            ? ' <span class="hb-meta-chip hb-meta-chip--warning" title="人工补记：钱未经渠道确认，不计入营收">人工补记</span>'
            : '';
          return `
    <tr>
      <td class="mono">${cell(order.orderNo)}</td>
      <td class="nowrap">${cell(order.email)}</td>
      <td>${cell(order.productName)}</td>
      <td class="nowrap">${esc(ORDER_TYPE[order.orderType || ''] || order.orderType)} · ${esc(LICENSE_ACTION[order.licenseAction || ''] || order.licenseAction)}</td>
      <td class="nowrap">${money(order.amountCents)}</td>
      <td class="nowrap">${providerCell(order)}</td>
      <td class="nowrap">${statusBadge(order.status || '', order.statusLabel)}${manualBadge}</td>
      <td class="nowrap">${dt(order.createdAt)}</td>
      <td class="nowrap">${actions(
        primary,
        rowMenu(
          '更多操作',
          canFulfill && primaryPaid
            ? menuItem('履约', `data-order-fulfill="${esc(order.orderNo)}"`)
            : '',

          primaryPaid
            ? menuItem(
                '线下收款入账',
                `data-order-offline-settle="${esc(order.orderNo)}"`,
              )
            : '',
          canRefund
            ? menuItem(
                '退款',
                `data-order-refund="${esc(order.orderNo)}" data-order-provider="${esc(order.paymentProvider || '')}"`,
                { danger: true },
              )
            : '',
          canCancel
            ? menuItem('取消订单', `data-order-cancel="${esc(order.orderNo)}"`)
            : '',
          canReview
            ? menuItem('标记已处理', `data-order-review="${esc(order.orderNo)}"`)
            : '',
          canDelete
            ? menuItem('删除订单', `data-order-delete="${esc(order.orderNo)}"`, {
                danger: true,
              })
            : deleteHeldByChannel
              ? menuNote('渠道交易未关闭，暂不可删除')
              : '',
        ),
      )}</td>
    </tr>`;
        })
        .join('')
    : emptyRow(
        9,
        pageState('orders').offset > 0 ? '本页无数据' : '没有符合条件的订单',
      );
  renderPager('orders');
}

$('#order-refresh')?.addEventListener('click', () => {
  resetPage('orders');
  loadOrders();
});

$('#order-reset')?.addEventListener('click', () =>
  resetFilters(
    [
      '#order-status',
      '#order-keyword',
      '#order-date-from',
      '#order-date-to',
      '#order-review',
    ],
    'orders',
  ),
);

$('#order-rows')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const {
    orderPaid,
    orderFulfill,
    orderRefund,
    orderCancel,
    orderDelete,
    orderReview,
    orderProvider,
    orderOfflineSettle,
  } = target.dataset;
  const orderNo =
    orderPaid ||
    orderFulfill ||
    orderRefund ||
    orderCancel ||
    orderDelete ||
    orderReview ||
    orderOfflineSettle;
  if (!orderNo) return;

  if (orderOfflineSettle) {

    const ok = await askConfirm({
      title: '线下收款入账',
      message: `确认订单 ${orderNo} 的款项已经收到（银行转账 / 现金等）？`,
      impact:
        '这笔金额将<b>计入营收</b>，并记录操作人。' +
        '若钱还没到账、只是先把订单放行，请改用<b>标记支付</b> —— 那样照常发码但不计营收。',
      tone: 'warning',
      okText: '确认已收到钱',
    });
    if (!ok) return;
    try {
      await api(`/orders/${orderNo}/settle-offline`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      toast('已按线下收款入账');
      await Promise.all([loadOrders(), host.loadOverview?.()]);
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
    return;
  }

  if (orderReview) {
    const ok = await askConfirm({
      title: '标记复核完成',
      message: `确认订单 ${orderNo} 的待复核事项已处理？`,
      impact:
        '清除后台概览页的待办提醒，并记录处理时间与操作人。<b>不影响</b>订单与授权本身。',
      tone: 'success',
      okText: '标记已处理',
    });
    if (!ok) return;
    try {
      await api(`/orders/${orderNo}/review`, {
        method: 'POST',
        body: JSON.stringify({ note: '后台标记为已处理' }),
      });
      toast('已标记为处理完成');
      await Promise.all([loadOrders(), host.loadOverview?.()]);
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
    return;
  }

  if (orderDelete) {
    const ok = await askConfirm({
      title: '删除订单',
      message: `将彻底删除订单 ${orderNo}。仅限已取消/已过期且没有产生授权的订单。`,
      okText: '删除',
    });
    if (!ok) return;
    try {
      await api(`/orders/${orderNo}`, { method: 'DELETE' });
      toast('订单已删除');
      await Promise.all([loadOrders(), host.loadOverview?.()]);
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
    return;
  }

  if (orderCancel) {
    const ok = await askConfirm({
      title: '取消订单',
      message: `确认取消订单 ${orderNo}？取消后会释放占用的库存。`,
      impact: '取消后该订单才会变成可<b>删除</b>的终态。',
      okText: '取消订单',
    });
    if (!ok) return;
    try {
      await api(`/orders/${orderNo}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ note: '后台操作' }),
      });
      toast('订单已取消');
      await Promise.all([loadOrders(), host.loadOverview?.()]);
    } catch (error) {
      toast(errorMessage(error, '操作失败'), 'danger');
    }
    return;
  }

  const action = orderPaid ? 'mark-paid' : orderFulfill ? 'fulfill' : 'refund';
  let offlineRefund = false;
  if (action === 'mark-paid') {

    const ok = await askConfirm({
      title: '标记支付',
      message: `确认订单 ${orderNo} 已支付并放行？`,
      impact:
        '订单照常发码 / 进入待履约，但<b>不计入营收</b>（营收只统计渠道确认收款' +
        '与人工线下入账）。若这笔钱确实已经收到（转账 / 现金），' +
        '请改用 ⋯ 菜单里的<b>线下收款入账</b>。',
      tone: 'warning',
      okText: '标记支付（不计营收）',
    });
    if (!ok) return;
  }
  if (action === 'refund') {


    const provider = String(orderProvider || '').toLowerCase();
    offlineRefund = !['alipay', 'wechat'].includes(provider);
    const ok = await askConfirm({
      title: offlineRefund ? '订单退款（线下）' : '订单退款',
      message: `确认对订单 ${orderNo} 退款？`,
      impact: offlineRefund
        ? '该订单在支付渠道侧没有可退交易（人工标记支付 / 未记录下单渠道 / 历史失效渠道）：' +
          '系统不会（也无法）把钱退回去。确认后按<b>线下退款</b>记账 —— 请先自行在渠道外把钱退给用户。' +
          '同时会<b>停用</b>该订单产生的激活码与权益，并退回邀请奖励。'
        : '将同时<b>停用</b>该订单产生的激活码与权益，并退回邀请奖励。',
      okText: offlineRefund ? '确认已线下退款' : '确认退款',
    });
    if (!ok) return;
  }
  try {

    await api(`/orders/${orderNo}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ note: '后台操作' }),
    });
    toast(
      `订单已${action === 'mark-paid' ? '标记支付（不计营收）' : action === 'fulfill' ? '履约' : offlineRefund ? '按线下退款记账' : '退款'}`,
    );
    await Promise.all([loadOrders(), host.loadOverview?.()]);
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});
