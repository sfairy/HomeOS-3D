/** 前台下单与支付流程。 */

import { defineStore } from "pinia";
import { ref } from "vue";
import QRCode from "qrcode";
import { api } from "@store/shared/api/http";
import { errorMessage, type StoreOrder } from "@store/shared/types/store";
import { retryAfterSeconds, withRetryHint } from "@store/shared/api/error";
import { createEpochGuard } from "@store/features/storefront/utils/async-guard";
import { logAndIgnore } from "@store/shared/utils/best-effort";
import { useSessionStore } from "@store/shared/stores/session";
import { useStoreToast } from "@store/shared/stores/toast";

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

/**
 * 支付弹窗的渠道化文案：`kicker` / `title` / `hint` 由**渠道**决定，不是订单上的字段。
 *
 * 此前这三段文案被临时挂在订单对象上（`(order as StoreOrder & { kicker?: string }).kicker = …`），
 * 模板再用 `(current as any)?.kicker` 读回来。代价有两个，都是静默的：
 *
 * 1. 模板里的 `as any` 让**键名打错也照样编译**（`kickerr` 只会永远走 `|| "Payment"` 兜底）；
 * 2. 那三个键落在 API 载荷对象上，于是「服务端某天在订单里加一个 `title`」会被
 *    `pollOrder` 的 `{ ...currentOrder, ...order }` 展开覆盖掉，弹窗文案悄悄变成订单标题。
 *
 * 改成 store 上的显式状态后，键名由类型保证，也不再往 API 载荷里塞字段。
 */
function paymentChannelCopy(order: StoreOrder) {
  const channel = channelOf(order);
  const channelName = order.payment?.displayName || "";
  return {
    kicker: CHANNEL_KICKERS[channel] || "Payment",
    title: CHANNEL_TITLES[channel] || (channelName ? `${channelName}扫码支付` : "扫码支付"),
    hint:
      order.payment?.note ||
      `打开${channelName || "支付宝"}「扫一扫」完成付款，付款后本页会自动确认。`,
  };
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
  /** 支付弹窗的渠道化文案（见 `paymentChannelCopy`）：由下单时的渠道决定，不落在订单对象上。 */
  const paymentKicker = ref("Payment");
  const paymentTitle = ref("扫码支付");
  const paymentHint = ref("");

  let pollTimer: number | null = null;
  let countdownTimer: number | null = null;
  let pendingTimer: number | null = null;
  /**
   * 连续查询失败次数：用于「失败很多次但仍一声不吭」的场景给一次非阻塞提示。
   * 只在拿到一次成功响应时归零。
   */
  let pollFailures = 0;
  /**
   * 轮询世代守卫：开始/关闭一次支付会话时换代。
   * 在途的订单查询响应会带上取号时的世代，世代不一致说明弹窗已关闭或已换单，
   * 该响应必须整体丢弃——否则会出现「用户已关闭支付弹窗，仍在途的轮询把订单写回
   * currentOrder，并在 fulfilled 时把整页跳转到账号中心」。
   * 判定本身在 `utils/async-guard.ts`（纯函数，冒烟直接驱动它，不需要浏览器）。
   */
  const pollGuard = createEpochGuard();

  function stopPolling() {
    pollGuard.invalidate();
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
    const copy = paymentChannelCopy(order);
    paymentKicker.value = copy.kicker;
    paymentTitle.value = copy.title;
    paymentHint.value = copy.hint;
    qrDataUrl.value = await QRCode.toDataURL(order.payment.qrCode, {
      width: 396,
      margin: 1,
      color: { dark: "#0b1220", light: "#ffffff" },
    });
    paymentOpen.value = true;

    stopPolling();
    pollFailures = 0;
    const epoch = pollGuard.begin();
    const updateCountdown = () => {
      const remaining = orderRemainingSeconds(currentOrder.value?.expiresAt || order.expiresAt);
      if (remaining > 0) return;
      if (countdownTimer !== null) window.clearInterval(countdownTimer);
      countdownTimer = null;
      paymentStatus.value = "正在自动关闭订单…";
      void pollOrder(order.orderNo || "", order.lookupToken, { epoch });
    };
    countdownTimer = window.setInterval(updateCountdown, 1000);

    const pollStartedAt = Date.now();
    const scheduleNextPoll = () => {
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      if (!pollGuard.isCurrent(epoch)) return;
      const status = currentOrder.value?.status;
      if (status && status !== "pending") return;
      const elapsed = Date.now() - pollStartedAt;
      const delay = elapsed < 60_000 ? 3000 : 8000;
      pollTimer = window.setTimeout(async () => {
        pollTimer = null;
        if (!pollGuard.isCurrent(epoch)) return;
        if (!document.hidden) {
          await pollOrder(order.orderNo || "", order.lookupToken, {
            reconcile: false,
            epoch,
          });
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
    // 文案随订单走：清空订单时一并复位，避免下一次下单前有上一单的渠道文案残留。
    paymentKicker.value = "Payment";
    paymentTitle.value = "扫码支付";
    paymentHint.value = "";
  }

  async function pollOrder(
    orderNo: string,
    token?: string | null,
    { reconcile = true, epoch }: { reconcile?: boolean; epoch?: number } = {},
  ) {
    const startEpoch = epoch ?? pollGuard.begin();
    try {
      const query = reconcile ? "?reconcile=1" : "";
      const order = (await api<StoreOrder>(`/orders/${encodeURIComponent(orderNo)}${query}`, {
        headers: token ? { "X-Order-Token": token } : {},
      })) as StoreOrder;
      // 响应到达时若支付会话已结束（用户关闭弹窗 / 换单），整体丢弃本次结果
      if (!pollGuard.isCurrent(startEpoch)) return false;
      pollFailures = 0;
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
    } catch (error) {
      // 网络抖动 / 429 / 5xx 不再静默吞掉：否则用户明明已付款，弹窗却一直停在
      // 「等待支付」，看不出是查询失败。提示只给一次，轮询照旧继续。
      if (!pollGuard.isCurrent(startEpoch)) return false;
      pollFailures += 1;
      if (pollFailures === 3) {
        toast.show(
          withRetryHint("暂时查不到支付状态，将自动重试。", retryAfterSeconds(error)),
          "err",
        );
      }
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
      void (async () => {
        let latest: StoreOrder | null = null;
        try {
          latest = (await api(
            `/orders/${encodeURIComponent(order.orderNo || "")}`,
          )) as StoreOrder;
        } catch (error) {
          logAndIgnore("PendingOrderDialog 关闭后的订单复查")(error);
        }
        pendingOpen.value = false;
        pendingOrder.value = null;
        // 倒计时归零只说明「本地到点」，订单到底怎么收场必须看服务端状态：
        // 支付回调可能刚好在这一刻把它结清，一律喊「已自动关闭」会误导用户重新下单。
        if (!latest) {
          // 状态未知（查询失败）：不谎报结论，下次进入页面时会重新查询。
          return;
        }
        const status = latest.status || "";
        if (status === "fulfilled") {
          toast.show("订单已完成，请到账号中心查看激活码。");
        } else if (status === "paid") {
          toast.show("订单已支付，正在处理，请到账号中心查看进度。");
        } else if (["expired", "cancelled", "payment_failed"].includes(status)) {
          toast.show("原订单已自动关闭，现在可以重新下单。");
        }
        void session.load().catch(logAndIgnore("订单关闭后刷新账号数据"));
      })();
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
    await session.load().catch(logAndIgnore("取消订单后刷新账号数据"));
  }

  async function archiveOrder(orderNo: string) {
    await api(`/orders/${encodeURIComponent(orderNo)}/archive`, { method: "POST" });
    toast.show("订单记录已清除。");
    await session.load().catch(logAndIgnore("归档订单后刷新账号数据"));
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
      const apiError = error as { status?: number };
      if (apiError.status === 409) {
        const retry = await api<{ orders?: StoreOrder[] }>("/account").catch(logAndIgnore("下单冲突后复查待支付订单"));
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
    paymentKicker,
    paymentTitle,
    paymentHint,
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
