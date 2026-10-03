/** 商店前台的订单与支付流程：下单确认、支付面板、待支付提示、轮询与取消/归档。 */

import { loadAccount } from "./store.js";
import { $, api, currentPage, state, toast } from "./store-shared.js";
import { formatCentsPlain as moneyAmount } from "./money.js";
import type { StoreOrder } from "./store-types.js";


const CHANNEL_KICKERS: Record<string, string> = {
  alipay: 'Alipay',
  wechat: 'WeChat Pay',
};


const CHANNEL_TITLES: Record<string, string> = {
  alipay: '支付宝扫码支付',
  wechat: '微信扫码支付',
};

function channelOf(order: StoreOrder) {
  return String(order.payment?.provider || order.payment?.type || '').toLowerCase();
}

function asDialog(node: HTMLElement | null) {
  return node as HTMLDialogElement | null;
}

export function showPayment(order: StoreOrder) {
  if (!order.payment?.qrCode) {
    toast('该订单暂无可用付款二维码。');
    return;
  }
  const dialog = asDialog($('#payment-dialog'));
  if (!dialog) return;
  state.currentOrder = order;

  dialog.classList.remove('is-closed');
  const channel = channelOf(order);
  const channelName = order.payment.displayName || '';
  const kicker = $('#payment-kicker');
  if (kicker) kicker.textContent = CHANNEL_KICKERS[channel] || 'Payment';
  const title = $('#payment-title');
  if (title) {
    title.textContent =
      CHANNEL_TITLES[channel] ||
      (channelName ? `${channelName}扫码支付` : '扫码支付');
  }
  const product = $('#payment-product');
  if (product) product.textContent = order.productName || '';
  const price = $('#payment-price');
  if (price) price.textContent = moneyAmount(order.amountCents);


  const hint = $('#payment-hint');
  if (hint) {
    hint.textContent =
      order.payment.note ||
      `打开${channelName || '支付宝'}「扫一扫」完成付款，付款后本页会自动确认。`;
  }
  const orderNo = $('#payment-order');
  if (orderNo) orderNo.textContent = order.orderNo || '';
  const status = $('#payment-status');
  if (status) {
    status.textContent = '等待支付';
    status.classList.remove('done');
  }
  const qr = $('#payment-qr');
  if (qr) {
    qr.replaceChildren();
    window.jQuery(qr).qrcode?.({ width: 198, height: 198, text: order.payment.qrCode });
  }
  dialog.showModal();
  stopPaymentTimers();
  const updateCountdown = () => {
    const remaining = orderRemainingSeconds(
      state.currentOrder?.expiresAt || order.expiresAt,
    );
    const countdown = $('#payment-countdown');
    if (countdown) {
      countdown.textContent = orderCountdownText(
        state.currentOrder?.expiresAt || order.expiresAt,
      );
    }
    if (remaining > 0) return;
    clearInterval(state.paymentCountdownTimer ?? undefined);
    state.paymentCountdownTimer = null;
    if (status) status.textContent = '正在自动关闭订单…';
    pollOrder(order.orderNo || '', order.lookupToken);
  };
  updateCountdown();
  state.paymentCountdownTimer = setInterval(updateCountdown, 1000);
  const pollStartedAt = Date.now();
  const scheduleNextPoll = () => {
    if (state.pollTimer !== null) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
    const orderStatus = state.currentOrder?.status;
    if (orderStatus && orderStatus !== 'pending') {
      return;
    }
    const elapsed = Date.now() - pollStartedAt;
    const delayMs = elapsed < 60_000 ? 3000 : 8000;
    state.pollTimer = setTimeout(async () => {
      state.pollTimer = null;
      if (!document.hidden) {
        await pollOrder(order.orderNo || '', order.lookupToken, {
          reconcile: false,
        });
      }
      scheduleNextPoll();
    }, delayMs);
  };
  scheduleNextPoll();
  const onVisibility = () => {
    if (!document.hidden && state.currentOrder?.status === 'pending') {
      pollOrder(order.orderNo || '', order.lookupToken, { reconcile: false });
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  state._paymentVisibilityHandler = onVisibility;
}

export function showPendingOrderNotice(order: StoreOrder) {
  state.pendingOrder = order;
  const product = $('#pending-order-product');
  if (product) product.textContent = order.productName || '';
  const price = $('#pending-order-price');
  if (price) price.textContent = moneyAmount(order.amountCents);
  const orderNo = $('#pending-order-no');
  if (orderNo) orderNo.textContent = order.orderNo || '';
  const dialog = asDialog($('#pending-order-dialog'));
  if (!dialog) return;
  const updateCountdown = () => {
    const remaining = orderRemainingSeconds(order.expiresAt);
    const countdown = $('#pending-order-countdown');
    if (countdown) countdown.textContent = orderCountdownText(order.expiresAt);
    if (remaining > 0) return;
    clearInterval(state.pendingCountdownTimer ?? undefined);
    state.pendingCountdownTimer = null;
    const copy = $('#pending-order-copy');
    if (copy) copy.textContent = '已到期，正在释放库存和优惠码…';
    api(`/orders/${encodeURIComponent(order.orderNo || '')}`)
      .catch(() => null)
      .finally(() => {
        state.pendingOrder = null;
        dialog.close();
        toast('原订单已自动关闭，现在可以重新下单。');
        if (currentPage() === 'account') loadAccount().catch(() => null);
      });
  };
  clearInterval(state.pendingCountdownTimer ?? undefined);
  const copy = $('#pending-order-copy');
  if (copy) copy.textContent = '等待支付，超时后自动关闭';
  updateCountdown();
  state.pendingCountdownTimer = setInterval(updateCountdown, 1000);
  dialog.showModal();
}


export function confirmAction({
  kicker = 'Confirm',
  title,
  message,
  detail = '',
  confirmLabel = '确定',
  cancelLabel = '取消',
  tone = 'default',
}: {
  kicker?: string;
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: string;
}) {
  const dialog = asDialog($('#confirm-dialog'));
  if (!dialog) return Promise.resolve(false);
  const kickerEl = $('#confirm-kicker');
  if (kickerEl) kickerEl.textContent = kicker;
  const titleEl = $('#confirm-title');
  if (titleEl) titleEl.textContent = title;
  const messageEl = $('#confirm-message');
  if (messageEl) messageEl.textContent = message;

  const accept = $('#confirm-accept') as HTMLButtonElement | null;
  if (accept) {
    accept.textContent = confirmLabel;
    accept.className = `hb-button hb-button--${tone === 'danger' ? 'danger' : 'primary'}`;
  }
  const cancelEl = $('#confirm-cancel');
  if (cancelEl) cancelEl.textContent = cancelLabel;
  const detailNode = $('#confirm-detail');
  if (detailNode) {
    detailNode.textContent = detail;
    detailNode.hidden = !detail;
  }

  const modal = typeof dialog.showModal === 'function';
  if (modal) dialog.showModal();
  else {
    dialog.classList.add('is-fallback');
    dialog.setAttribute('open', '');
  }

  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      if (accept) accept.onclick = null;
      if (cancelEl) cancelEl.onclick = null;
      dialog.oncancel = null;
      if (dialog.open) {

        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
      dialog.classList.remove('is-fallback');
      resolve(ok);
    };
    if (accept) accept.onclick = () => finish(true);
    if (cancelEl) cancelEl.onclick = () => finish(false);

    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    accept?.focus();
  });
}

export async function cancelPendingOrderFrom(
  button: HTMLButtonElement,
  order: StoreOrder | null | undefined,
) {
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
    await api(`/orders/${encodeURIComponent(order.orderNo || '')}/cancel`, {
      method: 'POST',
      headers: order.lookupToken ? { 'X-Order-Token': order.lookupToken } : {},
    });
    toast('订单已取消，库存和优惠码已释放。');
  } catch (error) {

    toast(error instanceof Error ? error.message : '取消失败，请刷新后重试。');
  }
  stopPaymentTimers();
  clearInterval(state.pendingCountdownTimer ?? undefined);
  state.pendingCountdownTimer = null;
  state.currentOrder = null;
  state.pendingOrder = null;
  asDialog($('#payment-dialog'))?.close();
  asDialog($('#pending-order-dialog'))?.close();

  if (currentPage() === 'account') loadAccount().catch(() => null);
  button.disabled = false;
  button.textContent = label;
}


export async function pollOrder(
  orderNo: string,
  token?: string | null,
  { reconcile = true }: { reconcile?: boolean } = {},
) {
  let order: StoreOrder | null = null;
  try {
    const query = reconcile ? '?reconcile=1' : '';
    order = (await api(`/orders/${encodeURIComponent(orderNo)}${query}`, {
      headers: token ? { 'X-Order-Token': token } : {},
    })) as StoreOrder;
    const labels: Record<string, string> = {
      pending: '等待支付',
      paid:
        order.fulfillmentMode === 'manual'
          ? '支付成功，等待管理员发卡'
          : '支付已确认',
      fulfilled:
        order.orderType === 'addon'
          ? '增量包已开通'
          : '激活码已生成，请到账号中心查看',
      cancelled: '订单已取消',
      expired: '订单已过期',
      payment_failed: '支付下单失败',
      fulfillment_failed: '已支付，正在人工处理',
    };


    const label = labels[order.status || ''] || order.statusLabel || order.status || '';
    const status = $('#payment-status');
    if (status) status.textContent = label;
    state.currentOrder = { ...(state.currentOrder || {}), ...order };
    if (order.status === 'fulfilled') {
      status?.classList.add('done');
      stopPaymentTimers();
      toast(label || '');
      setTimeout(() => location.replace('/user/dashboard/index'), 800);
    }
    if (['expired', 'payment_failed', 'cancelled'].includes(order.status || '')) {
      stopPaymentTimers();
      $('#payment-dialog')?.classList.add('is-closed');
      if (order.status === 'expired') {
        toast('订单已超时关闭，库存和优惠码已释放。');
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function archiveOrder(orderNo: string) {
  await api(`/orders/${encodeURIComponent(orderNo)}/archive`, { method: 'POST' });
  toast('订单记录已清除。');
  await loadAccount();
}

export function orderRemainingSeconds(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function orderCountdownText(expiresAt?: string | null) {
  const remaining = orderRemainingSeconds(expiresAt);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function stopPaymentTimers() {
  if (state.pollTimer !== null) {

    clearTimeout(state.pollTimer);
  }
  if (state.paymentCountdownTimer !== null) {
    clearInterval(state.paymentCountdownTimer);
  }
  state.pollTimer = null;
  state.paymentCountdownTimer = null;
  if (state._paymentVisibilityHandler) {
    document.removeEventListener(
      'visibilitychange',
      state._paymentVisibilityHandler,
    );
    state._paymentVisibilityHandler = null;
  }
}
