/** 前台下单与支付流程。 */

import { defineStore } from "pinia";
import { ref } from "vue";
import QRCode from "qrcode";
import { api } from "../api/http.js";
import { errorMessage, type StoreOrder } from "../store-types.js";
import { useSessionStore } from "./session.js";
import { useStoreToast } from "./toast.js";

const CHANNEL_KICKERS: Record<string, string> = {
  alipay: "Alipay",
  wechat: "WeChat Pay",
};

const CHANNEL_TITLES: Record<string, string> = {
  alipay: "支付宝扫码支付",
  wechat: "微信扫码支付",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "等待支付",
  paid: "支付已确认",
  fulfilled: "激活码已生成，请到账号中心查看",
  cancelled: "订单已取消",
  expired: "订单已过期",
  payment_failed: "支付下单失败",
  fulfillment_failed: "已支付，正在人工处理",
};

function orderRemainingSeconds(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000));
}

export function orderCountdownText(expiresAt?: string | null) {
  const remaining = orderRemainingSeconds(expiresAt);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function channelOf(order: StoreOrder) {
  return String(order.payment?.provider || order.payment?.type || "").toLowerCase();
}

export const useOrderStore = defineStore("order", () => {
  const session = useSessionStore();
  const toast = useStoreToast();

  const paymentOpen = ref(false);
  const pendingOpen = ref(false);
  const currentOrder = ref<StoreOrder | null>(null);
  const pendingOrder = ref<StoreOrder | null>(null);
  const qrDataUrl = ref("");
  const paymentStatus = ref("等待支付");
  const statusDone = ref(false);

  let pollTimer: number | null = null;
  let countdownTimer: number | null = null;
  let pendingTimer: number | null = null;

  function stopPolling() {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    if (countdownTimer !== null) window.clearInterval(countdownTimer);
    pollTimer = null;
    countdownTimer = null;
  }

  function stopPendingCountdown() {
    if (pendingTimer !== null) window.clearInterval(pendingTimer);
    pendingTimer = null;
  }

  async function showPayment(order: StoreOrder) {
    if (!order.payment?.qrCode) {
      toast.show("该订单暂无可用付款二维码。", "err");
      return;
    }
    currentOrder.value = order;
    statusDone.value = false;
    paymentStatus.value = "等待支付";
    const channel = channelOf(order);
    const channelName = order.payment.displayName || "";
    const title =
      CHANNEL_TITLES[channel] || (channelName ? `${channelName}扫码支付` : "扫码支付");
    const hint =
      order.payment.note ||
      `打开${channelName || "支付宝"}「扫一扫」完成付款，付款后本页会自动确认。`;
    (order as StoreOrder & { kicker?: string; title?: string; hint?: string }).kicker =
      CHANNEL_KICKERS[channel] || "Payment";
    (order as StoreOrder & { title?: string }).title = title;
    (order as StoreOrder & { hint?: string }).hint = hint;
    qrDataUrl.value = await QRCode.toDataURL(order.payment.qrCode, {
      width: 396,
      margin: 1,
      color: { dark: "#0b1220", light: "#ffffff" },
    });
    paymentOpen.value = true;

    stopPolling();
    const updateCountdown = () => {
      const remaining = orderRemainingSeconds(currentOrder.value?.expiresAt || order.expiresAt);
      if (remaining > 0) return;
      if (countdownTimer !== null) window.clearInterval(countdownTimer);
      countdownTimer = null;
      paymentStatus.value = "正在自动关闭订单…";
      void pollOrder(order.orderNo || "", order.lookupToken);
    };
    countdownTimer = window.setInterval(updateCountdown, 1000);

    const pollStartedAt = Date.now();
    const scheduleNextPoll = () => {
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      const status = currentOrder.value?.status;
      if (status && status !== "pending") return;
      const elapsed = Date.now() - pollStartedAt;
      const delay = elapsed < 60_000 ? 3000 : 8000;
      pollTimer = window.setTimeout(async () => {
        pollTimer = null;
        if (!document.hidden) {
          await pollOrder(order.orderNo || "", order.lookupToken, { reconcile: false });
        }
        scheduleNextPoll();
      }, delay);
    };
    scheduleNextPoll();
  }

  function closePayment() {
    paymentOpen.value = false;
    stopPolling();
    currentOrder.value = null;
  }

  async function pollOrder(
    orderNo: string,
    token?: string | null,
    { reconcile = true }: { reconcile?: boolean } = {},
  ) {
    try {
      const query = reconcile ? "?reconcile=1" : "";
      const order = (await api<StoreOrder>(`/orders/${encodeURIComponent(orderNo)}${query}`, {
        headers: token ? { "X-Order-Token": token } : {},
      })) as StoreOrder;
      let label = STATUS_LABELS[order.status || ""] || order.statusLabel || order.status || "";
      if (order.status === "paid" && order.fulfillmentMode === "manual") {
        label = "支付成功，等待管理员发卡";
      }
      if (order.status === "fulfilled" && order.orderType === "addon") {
        label = "增量包已开通";
      }
      if (order.status === "fulfilled" && order.orderType !== "addon") {
        label = "激活码已生成，请到账号中心查看";
      }
      paymentStatus.value = label;
      currentOrder.value = { ...(currentOrder.value || {}), ...order };
      if (order.status === "fulfilled") {
        statusDone.value = true;
        stopPolling();
        toast.show(label);
        window.setTimeout(() => {
          window.location.assign("/user/dashboard/index");
        }, 800);
      }
      if (["expired", "payment_failed", "cancelled"].includes(order.status || "")) {
        stopPolling();
        paymentOpen.value = false;
        if (order.status === "expired") toast.show("订单已超时关闭，库存和优惠码已释放。", "err");
      }
      return true;
    } catch {
      return false;
    }
  }

  function showPendingOrder(order: StoreOrder) {
    pendingOrder.value = order;
    pendingOpen.value = true;
    stopPendingCountdown();
    const update = () => {
      const remaining = orderRemainingSeconds(order.expiresAt);
      if (remaining > 0) return;
      stopPendingCountdown();
      void api(`/orders/${encodeURIComponent(order.orderNo || "")}`)
        .catch(() => null)
        .finally(() => {
          pendingOpen.value = false;
          pendingOrder.value = null;
          toast.show("原订单已自动关闭，现在可以重新下单。");
          void session.load().catch(() => null);
        });
    };
    update();
    pendingTimer = window.setInterval(update, 1000);
  }

  function closePendingOrder() {
    pendingOpen.value = false;
    pendingOrder.value = null;
    stopPendingCountdown();
  }

  async function cancelOrder(order: StoreOrder | null | undefined) {
    if (!order) return;
    await api(`/orders/${encodeURIComponent(order.orderNo || "")}/cancel`, {
      method: "POST",
      headers: order.lookupToken ? { "X-Order-Token": order.lookupToken } : {},
    });
    toast.show("订单已取消，库存和优惠码已释放。");
    closePayment();
    closePendingOrder();
    await session.load().catch(() => null);
  }

  async function archiveOrder(orderNo: string) {
    await api(`/orders/${encodeURIComponent(orderNo)}/archive`, { method: "POST" });
    toast.show("订单记录已清除。");
    await session.load().catch(() => null);
  }

  async function createOrder(productId: string, payload: Record<string, unknown>) {
    const accountPayload = await api<{ orders?: StoreOrder[] }>("/account");
    const pending = (accountPayload.orders || []).find((item) => item.status === "pending");
    if (pending) {
      showPendingOrder(pending);
      return null;
    }
    try {
      const order = await api<StoreOrder>("/orders", {
        method: "POST",
        body: JSON.stringify({ productId, ...payload }),
      });
      await showPayment(order);
      return order;
    } catch (error) {
      const err = error as { status?: number };
      if (err.status === 409) {
        const retry = await api<{ orders?: StoreOrder[] }>("/account").catch(() => null);
        const conflict = retry?.orders?.find((item) => item.status === "pending");
        if (conflict) {
          showPendingOrder(conflict);
          return null;
        }
      }
      toast.show(errorMessage(error), "err");
      throw error;
    }
  }

  return {
    paymentOpen,
    pendingOpen,
    currentOrder,
    pendingOrder,
    qrDataUrl,
    paymentStatus,
    statusDone,
    showPayment,
    closePayment,
    showPendingOrder,
    closePendingOrder,
    cancelOrder,
    archiveOrder,
    createOrder,
    pollOrder,
  };
});
