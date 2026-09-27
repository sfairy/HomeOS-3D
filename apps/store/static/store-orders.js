/**
 * 商店前台的订单与支付流程：下单确认、支付面板、待支付提示、轮询与取消/归档。
 *
 * 从 store.js 拆出来：那一份只留页面编排与账号/授权区，这一份是「一笔订单从下单到落定」的全过程。
 * 共享状态与请求原语在 store-shared.js。
 */

import { loadAccount } from "./store.js?v=2609271208";
import { $, api, currentPage, state, toast } from "./store-shared.js?v=2609271208";
import { formatCentsPlain as moneyAmount } from "./money.js?v=2609271208";

export function showPayment(order) {
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

export function showPendingOrderNotice(order) {
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

// 行为严格对齐：遮罩 / Esc 按「取消」（false）且不下发写操作，只有明确点确认才 resolve(true)。
export function confirmAction({
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

// （否则二维码还能继续扫付），再归还库存预留与优惠码名额；各写一份迟早分叉。
export async function cancelPendingOrderFrom(button, order) {
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
export async function pollOrder(orderNo, token) {
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

export async function archiveOrder(orderNo) {
  await api(`/orders/${encodeURIComponent(orderNo)}/archive`, { method: 'POST' });
  toast('订单记录已清除。');
  await loadAccount();
}


export function orderRemainingSeconds(expiresAt) {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function orderCountdownText(expiresAt) {
  const remaining = orderRemainingSeconds(expiresAt);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function stopPaymentTimers() {
  if (state.pollTimer !== null) clearInterval(state.pollTimer);
  if (state.paymentCountdownTimer !== null) clearInterval(state.paymentCountdownTimer);
  state.pollTimer = null;
  state.paymentCountdownTimer = null;
}

