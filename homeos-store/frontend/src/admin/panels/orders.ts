/**
 * 订单面板。
 */

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
  amountCents?: number;
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

// 订单状态词表与动作集合：**由服务端下发**（`/order-status-meta`，取自
let orderStatusMetaPromise: Promise<OrderStatusMeta> | null = null;

// 选项是否已按词表填过：只填一次，之后刷新列表不重建 DOM（重建会丢掉当前选中项）。
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

/**
 * 支付渠道单元格。
 *
 * 中文名**由服务端给**（``paymentProviderLabel``，口径见 payments/channels.py）：
 * 前端再写一份映射的话，加渠道时就会出现「订单表显示 alipay、报错文案显示支付宝」。
 *
 * 存量订单里的值可能是历史渠道名（已删除的 mock）或 ``manual``（人工/线下入账）——
 * 两者都如实显示：运营需要看出这笔钱是怎么进来的。
 */
function providerCell(order: AdminOrder) {
  const raw = String(order.paymentProvider || '').trim();
  if (!raw) {
    // 空值 = 还没走到「选渠道」这一步就被关掉了（下单前失败 / 未支付就取消）。
    // 基类 .hb-meta-chip 本身就是中性灰，没有 --muted 变体（见 theme.css）。
    return '<span class="hb-meta-chip" title="这笔订单没有渠道信息">—</span>';
  }
  const label = order.paymentProviderLabel || raw;
  const known = ['alipay', 'wechat'].includes(raw.toLowerCase());
  // 认不出来的（历史渠道名，如已删除的 mock）用警示色而不是中性色：它意味着这笔
  // 订单的渠道今天**收不到钱**，是排障时要一眼看见的事实，不该和 alipay 长一样。
  return known
    ? `<span class="hb-meta-chip" title="${esc(raw)}">${esc(label)}</span>`
    : `<span class="hb-meta-chip hb-meta-chip--warning" title="不是当前受支持的渠道：${esc(raw)}">${esc(label)}</span>`;
}

function orderStatusMeta() {
  // 面板每次加载都问它，但词表在页面生命周期内不变，故只取一次（并发调用共享同一个 Promise）。
  if (!orderStatusMetaPromise) {
    orderStatusMetaPromise = api('/order-status-meta')
      .then((meta) => {
        const typed = meta as OrderStatusMeta;
        applyOrderStatusOptions(typed);
        return typed;
      })
      .catch((error) => {
        // 失败必须允许下次重试：不清掉缓存的 Promise，一次网络抖动会让订单面板永久不可用。
        orderStatusMetaPromise = null;
        throw error;
      });
  }
  return orderStatusMetaPromise;
}

// --------------------------------------------------------------------------- //
// 订单
// --------------------------------------------------------------------------- //
export async function loadOrders() {
  // 词表先到位：下面要用它填筛选下拉并给按钮做门禁，缺了它会渲染出一排没有操作的订单。
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
          // 与后端 admin.py 的 _FULFILLABLE_STATUSES 一致：只有仍持有库存预留、未进终态的
          const canMarkPaid =
            orderStatus.fulfillable.includes(order.status || '') && !order.paidAt;
          const canFulfill = orderStatus.fulfillable.includes(order.status || '');
          const canRefund = orderStatus.refundable.includes(order.status || '');
          const canCancel = order.status === 'pending';
          // 「标记已处理」只在订单确实挂着待复核时出现（needsReview 由后端返回），
          const canReview = Boolean(order.needsReview) && order.status !== 'pending';
          // 删除守卫与后端 admin_delete_order 逐条对齐：终态 + 没发过码（licenseId）+
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
          // 人工补记的标记：这类订单的「已支付」是人写的、钱还没确认收到，因此
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
          // 人工补记（不计营收）与线下收款入账（计营收）分成两个入口：一个布尔参数
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
    // 线下收款入账：钱确实收到了（转账/现金），人工确认后计入营收。
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
    // 这个按钮**只**放行订单，不认钱。「客户催单先给码」「赠送/补偿」都走它，
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
    // 是否线下退款的**唯一裁决方在服务端**（admin_orders._offline_refund_reason：
    // manual / 空渠道 / 历史失效渠道才线下；alipay、wechat 必须走渠道真实退款）。
    // 这里只按同一口径计算弹窗文案，请求体不再传 offline，避免前端误判导致只记账不退钱。
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
    // offline 不传：由后端按订单渠道权威判定是否线下（schema 默认 false）。
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
