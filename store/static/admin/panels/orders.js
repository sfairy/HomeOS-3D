/**
 * 订单面板。
 *
 * 订单列表与逐行动作（标记支付、履约、退款、取消、删除、复核）；状态词表由服务端下发。
 *
 * 订单列表与逐行动作。状态词表由服务端下发（服务端是权威），这里只做展示映射与缓存。
 */

import { $, emptyRow, esc, toast } from "../dom.js?v=2609222006";
import { PENDING_FILTER_VALUES, actions, cell, menuItem, menuNote, pageState, pagedFetch, renderPager, resetFilters, resetPage, rowMenu } from "../table.js?v=2609222006";
import { api } from "../api.js?v=2609222006";
import { dayEndUtc, dayStartUtc, dt, money, statusBadge } from "../format.js?v=2609222006";
import { LICENSE_ACTION, ORDER_TYPE } from "../vocab.js?v=2609222006";
import { askConfirm } from "../dialogs.js?v=2609222006";
import { host } from "../host.js?v=2609222006";

// 订单状态词表与动作集合：**由服务端下发**（`/order-status-meta`，取自
// store/commerce/order_status.py）。手写这两样的代价是静默的：动作数组漏掉
// fulfillment_failed / partially_refunded，于是概览待办让运营「去订单里重试履约或退款」，
// 点进筛选列表却一排操作按钮都没有；筛选下拉漏掉 partially_refunded，跳转退化成全部。
let orderStatusMetaPromise = null;

// 选项是否已按词表填过：只填一次，之后刷新列表不重建 DOM（重建会丢掉当前选中项）。
let orderStatusOptionsApplied = false;

function applyOrderStatusOptions(meta) {
  if (orderStatusOptionsApplied) return;
  orderStatusOptionsApplied = true;
  const select = $('#order-status');
  select.append(...meta.choices.map(code => new Option(meta.labels[code] || code, code)));
  const pendingValue = PENDING_FILTER_VALUES.get('#order-status');
  if (pendingValue !== undefined) {
    PENDING_FILTER_VALUES.delete('#order-status');
    select.value = pendingValue;
  }
}

function orderStatusMeta() {
  // 面板每次加载都问它，但词表在页面生命周期内不变，故只取一次（并发调用共享同一个 Promise）。
  if (!orderStatusMetaPromise) {
    orderStatusMetaPromise = api('/order-status-meta')
      .then(meta => {
        applyOrderStatusOptions(meta);
        return meta;
      })
      .catch(error => {
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
  const orderStatus = await orderStatusMeta();
  const params = new URLSearchParams();
  const status = $('#order-status').value;
  const keyword = $('#order-keyword').value.trim();
  const from = dayStartUtc($('#order-date-from').value);
  const to = dayEndUtc($('#order-date-to').value);
  if (status) params.set('status_filter', status);
  if (keyword) params.set('keyword', keyword);
  if (from) params.set('date_from', from);
  if (to) params.set('date_to', to);
  if ($('#order-review').checked) params.set('needs_review', 'true');
  const data = await pagedFetch('orders', '/orders', Object.fromEntries(params));
  $('#order-rows').innerHTML = data.items.length ? data.items.map(order => {
    // 与后端 admin.py 的 _FULFILLABLE_STATUSES 一致：只有仍持有库存预留、未进终态的
    // 订单显示「标记支付 / 履约」。终态订单放行会凭空发码并重复扣预留造成超卖
    // （后端已一并返回 409，这里只是不让按钮误导人）。
    // 三组门禁一律取服务端集合（`order_status.py`）：手写数组与后端漂移过一次 ——
    // fulfillment_failed（自动发货炸了，等人工重试）与 partially_refunded（还能退第二次）
    // 都在服务端集合里，却都不在界面的数组里，于是「该出现的按钮」一个都没有。
    // 「标记支付」多一条 ``!order.paidAt``：它是给「钱还没记上」的订单补记（不计营收），
    // 已付过的订单只有「履约」这一个有意义的动作。
    const canMarkPaid = orderStatus.fulfillable.includes(order.status) && !order.paidAt;
    const canFulfill = orderStatus.fulfillable.includes(order.status);
    const canRefund = orderStatus.refundable.includes(order.status);
    const canCancel = order.status === 'pending';
    // 「标记已处理」只在订单确实挂着待复核时出现（needsReview 由后端返回），
    // 且未支付的单谈不上「已处理」。清标记刻意不自动发生：复活单的价值就在于
    // 让人看见「这单超卖过」，必须由人确认。
    const canReview = Boolean(order.needsReview) && order.status !== 'pending';
    // 删除守卫与后端 admin_delete_order 逐条对齐：终态 + 没发过码（licenseId）+
    // 没改过别人的授权（targetLicenseModified）+ 渠道交易已关单（channelPayable）。
    // **不能**用 targetLicenseId 判：增量包/升级单下单时就写上它，用它这类垃圾单永远删不掉。
    const terminalOrder = ['cancelled', 'expired'].includes(order.status);
    const untouchedLicense = !order.licenseId && !order.targetLicenseModified;
    const canDelete = terminalOrder && untouchedLicense && !order.channelPayable;
    // 只因「渠道那笔交易还没确认关闭」而删不了时，把原因写在菜单里。直接藏掉入口
    // 会让「操作」列变成空白 —— 运营只能靠猜，这比一句说明糟糕得多。
    const deleteHeldByChannel = terminalOrder && untouchedLicense && order.channelPayable;
    const primaryPaid = canMarkPaid;
    const primary = primaryPaid
      ? `<button class="hb-button hb-button--primary hb-button--sm" data-order-paid="${esc(order.orderNo)}">标记支付</button>`
      : canFulfill
        ? `<button class="hb-button hb-button--secondary hb-button--sm" data-order-fulfill="${esc(order.orderNo)}">履约</button>`
        : '';
    // 人工补记的标记：这类订单的「已支付」是人写的、钱还没确认收到，因此
    // **不计入营收**。必须在列表上看得见，否则运营会拿订单数去对营收，越对越糊涂。
    const manualBadge = order.manualSettlement
      ? ' <span class="hb-meta-chip hb-meta-chip--warning" title="人工补记：钱未经渠道确认，不计入营收">人工补记</span>'
      : '';
    return `
    <tr>
      <td class="mono">${cell(order.orderNo)}</td>
      <td class="nowrap">${cell(order.email)}</td>
      <td>${cell(order.productName)}</td>
      <td class="nowrap">${esc(ORDER_TYPE[order.orderType] || order.orderType)} · ${esc(LICENSE_ACTION[order.licenseAction] || order.licenseAction)}</td>
      <td class="nowrap">${money(order.amountCents)}</td>
      <td class="nowrap">${statusBadge(order.status, order.statusLabel)}${manualBadge}</td>
      <td class="nowrap">${dt(order.createdAt)}</td>
      <td class="nowrap">${actions(
        primary,
        rowMenu('更多操作',
          canFulfill && primaryPaid
            ? menuItem('履约', `data-order-fulfill="${esc(order.orderNo)}"`) : '',
          // 人工补记（不计营收）与线下收款入账（计营收）分成两个入口：一个布尔参数
          // 藏在请求体里的话，「这一下算不算营收」就没人看得见。
          primaryPaid
            ? menuItem('线下收款入账', `data-order-offline-settle="${esc(order.orderNo)}"`) : '',
          canRefund
            ? menuItem('退款', `data-order-refund="${esc(order.orderNo)}" data-order-provider="${esc(order.paymentProvider || '')}"`, { danger: true }) : '',
          canCancel
            ? menuItem('取消订单', `data-order-cancel="${esc(order.orderNo)}"`) : '',
          canReview
            ? menuItem('标记已处理', `data-order-review="${esc(order.orderNo)}"`) : '',
          canDelete
            ? menuItem('删除订单', `data-order-delete="${esc(order.orderNo)}"`, { danger: true })
            : deleteHeldByChannel
              ? menuNote('渠道交易未关闭，暂不可删除')
              : '',
        ),
      )}</td>
    </tr>`;
  }).join('') : emptyRow(8, pageState('orders').offset > 0 ? '本页无数据' : '没有符合条件的订单');
  renderPager('orders');
}

$('#order-refresh').addEventListener('click', () => { resetPage('orders'); loadOrders(); });

$('#order-reset').addEventListener('click', () => resetFilters(
  ['#order-status', '#order-keyword', '#order-date-from', '#order-date-to', '#order-review'], 'orders',
));

$('#order-rows').addEventListener('click', async (event) => {
  const { orderPaid, orderFulfill, orderRefund, orderCancel, orderDelete, orderReview, orderProvider, orderOfflineSettle } = event.target.dataset;
  const orderNo = orderPaid || orderFulfill || orderRefund || orderCancel || orderDelete || orderReview || orderOfflineSettle;
  if (!orderNo) return;

  if (orderOfflineSettle) {
    // 线下收款入账：钱确实收到了（转账/现金），人工确认后计入营收。
    const ok = await askConfirm({
      title: '线下收款入账',
      message: `确认订单 ${orderNo} 的款项已经收到（银行转账 / 现金等）？`,
      impact: '这笔金额将<b>计入营收</b>，并记录操作人。'
        + '若钱还没到账、只是先把订单放行，请改用<b>标记支付</b> —— 那样照常发码但不计营收。',
      tone: 'warning',
      okText: '确认已收到钱',
    });
    if (!ok) return;
    try {
      await api(`/orders/${orderNo}/settle-offline`, { method: 'POST', body: JSON.stringify({}) });
      toast('已按线下收款入账');
      await Promise.all([loadOrders(), host.loadOverview()]);
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  if (orderReview) {
    // 刻意不自动清除待复核：复活单的价值就在于让人看见「这单超卖过」，
    // 必须由人确认（哪怕结论是「无需处理」）。所以这里是与其它动作一致的确认框。
    const ok = await askConfirm({
      title: '标记复核完成',
      message: `确认订单 ${orderNo} 的待复核事项已处理？`,
      impact: '清除后台概览页的待办提醒，并记录处理时间与操作人。<b>不影响</b>订单与授权本身。',
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
      await Promise.all([loadOrders(), host.loadOverview()]);
    } catch (error) { toast(error.message, 'danger'); }
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
      await Promise.all([loadOrders(), host.loadOverview()]);
    } catch (error) { toast(error.message, 'danger'); }
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
      await api(`/orders/${orderNo}/cancel`, { method: 'POST', body: JSON.stringify({ note: '后台操作' }) });
      toast('订单已取消');
      await Promise.all([loadOrders(), host.loadOverview()]);
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  const action = orderPaid ? 'mark-paid' : orderFulfill ? 'fulfill' : 'refund';
  let offlineRefund = false;
  if (action === 'mark-paid') {
    // 这个按钮**只**放行订单，不认钱。「客户催单先给码」「赠送/补偿」都走它，
    // 所以它必须明确说出「不计营收」—— 用户以为在记账、系统却没记，比按钮点不动
    // 危险得多。钱真收到了就用 ⋯ 里的「线下收款入账」。
    const ok = await askConfirm({
      title: '标记支付',
      message: `确认订单 ${orderNo} 已支付并放行？`,
      impact: '订单照常发码 / 进入待履约，但<b>不计入营收</b>（营收只统计渠道确认收款'
        + '与人工线下入账）。若这笔钱确实已经收到（转账 / 现金），'
        + '请改用 ⋯ 菜单里的<b>线下收款入账</b>。',
      tone: 'warning',
      okText: '标记支付（不计营收）',
    });
    if (!ok) return;
  }
  if (action === 'refund') {
    // 人工标记支付的订单在渠道侧没有交易，服务端按**线下退款**记账；必须把话说全，
    // 否则运营以为「系统会去退钱」，点完就把订单记成已退款、用户却没收到钱。
    // 渠道名由订单行上的 data-order-provider 带过来（列表渲染时就写进了 DOM）。
    const provider = String(orderProvider || '').toLowerCase();
    offlineRefund = !['', 'mock', 'alipay'].includes(provider);
    const ok = await askConfirm({
      title: offlineRefund ? '订单退款（线下）' : '订单退款',
      message: `确认对订单 ${orderNo} 退款？`,
      impact: offlineRefund
        ? '该订单是<b>后台人工标记支付</b>的：渠道侧没有交易，系统不会（也无法）把钱退回去。'
          + '确认后按<b>线下退款</b>记账 —— 请先自行在渠道外把钱退给用户。'
          + '同时会<b>停用</b>该订单产生的激活码与权益，并退回邀请奖励。'
        : '将同时<b>停用</b>该订单产生的激活码与权益，并退回邀请奖励。',
      okText: offlineRefund ? '确认已线下退款' : '确认退款',
    });
    if (!ok) return;
  }
  try {
    await api(`/orders/${orderNo}/${action}`, {
      method: 'POST',
      body: JSON.stringify({ note: '后台操作', offline: offlineRefund }),
    });
    toast(`订单已${action === 'mark-paid' ? '标记支付（不计营收）' : action === 'fulfill' ? '履约' : offlineRefund ? '按线下退款记账' : '退款'}`);
    await Promise.all([loadOrders(), host.loadOverview()]);
  } catch (error) { toast(error.message, 'danger'); }
});
