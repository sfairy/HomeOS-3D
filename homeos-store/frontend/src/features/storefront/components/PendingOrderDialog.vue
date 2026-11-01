<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useOrderStore, orderCountdownText } from "@store/features/storefront/stores/order";
import { useConfirmStore } from "@store/shared/stores/confirm";
import { api } from "@store/shared/api/http";
import { formatCentsPlain as moneyAmount } from "@store/shared/utils/money";
import { errorMessage, type StoreOrder } from "@store/shared/types/store";
import { useStoreToast } from "@store/shared/stores/toast";

const order = useOrderStore();
const confirm = useConfirmStore();
const toast = useStoreToast();
const dialog = ref<HTMLDialogElement | null>(null);
const now = ref(Date.now());
const continued = ref(false);
const TITLE_ID = "pending-order-title";
const DESC_ID = "pending-order-desc";
const NOTE_ID = "pending-order-note";
const DESCRIBED_BY = `${DESC_ID} ${NOTE_ID}`;
let timer: number | undefined;

const pending = computed(() => order.pendingOrder);
const countdown = computed(() => {
  void now.value;
  return orderCountdownText(pending.value?.expiresAt);
});

watch(
  () => order.pendingOpen,
  (open) => {
    const node = dialog.value;
    if (!node) return;
    if (open) {
      if (!node.open) node.showModal();
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        now.value = Date.now();
      }, 1000);
    } else if (node.open) {
      node.close();
      window.clearInterval(timer);
    }
  },
);

onBeforeUnmount(() => window.clearInterval(timer));

async function cancel() {
  const ok = await confirm.confirm({
    kicker: "Cancel Order",
    title: "取消这笔待支付订单？",
    message: "取消后订单立即关闭，占用的库存和优惠码会释放。",
    detail: "如果还需要这份授权，需要重新下单；付款码也会同时作废。",
    confirmLabel: "取消订单",
    cancelLabel: "继续支付",
    tone: "danger",
  });
  if (!ok) return;
  await order.cancelOrder(pending.value);
}

async function continuePayment() {
  const target = pending.value;
  if (!target) return;
  continued.value = true;
  try {
    const refreshed = (await api<StoreOrder>(
      `/orders/${encodeURIComponent(target.orderNo || "")}?reconcile=1`,
      { headers: target.lookupToken ? { "X-Order-Token": target.lookupToken } : {} },
    )) as StoreOrder;
    const status = String(refreshed.status || "");
    // 先看状态，再看二维码：`payment.qrCode` 在 paid / cancelled / expired 之后仍留在
    // 载荷里（建单时写入的），只判「有没有二维码」会把已结清的订单重新弹出可扫的付款码。
    if (!status || status === "pending") {
      if (!refreshed.payment?.qrCode) {
        toast.show("这笔订单暂时没有可用的付款二维码，请稍后刷新重试。", "err");
        return;
      }
      order.closePendingOrder();
      await order.showPayment(refreshed);
      return;
    }
    // 终态（已支付 / 已完成 / 已关闭 / 已过期）：交给 showPayment 统一收尾并给出准确文案
    order.closePendingOrder();
    await order.showPayment(refreshed);
  } catch (error) {
    toast.show(errorMessage(error), "err");
  } finally {
    continued.value = false;
  }
}
</script>

<template>
  <!-- 与支付弹窗一致：Esc 只收起提醒，不动订单状态。 -->
  <dialog
    ref="dialog"
    class="hb-dialog hb-pending-dialog"
    :aria-labelledby="TITLE_ID"
    :aria-describedby="DESCRIBED_BY"
    @cancel.prevent="order.closePendingOrder()"
  >
    <div class="hb-dialog__head">
      <button type="button" class="hb-dialog__close" aria-label="关闭" @click="order.closePendingOrder()">
        <i class="fa-duotone fa-regular fa-xmark"></i>
      </button>
      <span class="hb-kicker hb-kicker--plain">Pending Order</span>
      <h2 :id="TITLE_ID">已有待支付订单</h2>
      <p :id="DESC_ID">订单「<strong>{{ pending?.productName }}</strong>」尚未完成，可以继续支付或取消后重新下单。</p>
    </div>
    <div class="hb-dialog__body">
      <div class="hb-pay-amount">
        <span>应付金额</span>
        <strong class="hb-pay-amount__value"><i>¥</i><span>{{ moneyAmount(pending?.amountCents || 0) }}</span></strong>
      </div>
      <div class="hb-pay-timer">
        <span class="hb-pay-timer__status">
          <i class="hb-pay-timer__dot" aria-hidden="true"></i><b role="status" aria-live="polite">等待支付，超时后自动关闭</b>
        </span>
        <span class="hb-pay-timer__clock">
          <!-- 倒计时逐秒变化，不进 live region；状态行负责播报。 -->
          <i class="fa-duotone fa-regular fa-clock" aria-hidden="true"></i><b aria-live="off">{{ countdown }}</b>
        </span>
      </div>
      <p :id="NOTE_ID" class="hb-pay-note">超时后订单自动关闭，并释放库存和优惠码。</p>
      <div class="hb-pay-order">
        <span>订单号</span>
        <code>{{ pending?.orderNo }}</code>
      </div>
    </div>
    <div class="hb-dialog__foot hb-dialog__foot--split">
      <button type="button" class="hb-button hb-button--secondary" @click="cancel">取消支付</button>
      <button
        type="button"
        class="hb-button hb-button--primary"
        :disabled="continued"
        :aria-busy="continued ? 'true' : 'false'"
        @click="continuePayment"
      >
        {{ continued ? "正在打开…" : "继续支付" }}
      </button>
    </div>
  </dialog>
</template>
