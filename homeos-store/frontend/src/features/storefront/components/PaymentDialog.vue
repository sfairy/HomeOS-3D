<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useOrderStore, orderCountdownText } from "@store/features/storefront/stores/order";
import { useConfirmStore } from "@store/shared/stores/confirm";
import { formatCentsPlain as moneyAmount } from "@store/shared/utils/money";

const order = useOrderStore();
const confirm = useConfirmStore();
const dialog = ref<HTMLDialogElement | null>(null);
const now = ref(Date.now());
const refreshing = ref(false);
const TITLE_ID = "payment-dialog-title";
const SCAN_ID = "payment-dialog-scan";
const NOTE_ID = "payment-dialog-note";
const DESCRIBED_BY = `${SCAN_ID} ${NOTE_ID}`;
let timer: number | undefined;

const current = computed(() => order.currentOrder);
const countdown = computed(() => {
  // 依赖 now 触发每秒重算。
  void now.value;
  return orderCountdownText(current.value?.expiresAt);
});

watch(
  () => order.paymentOpen,
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
  await order.cancelOrder(current.value);
}

async function refresh() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await order.pollOrder(current.value?.orderNo || "", current.value?.lookupToken, {
      reconcile: true,
    });
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <!-- Esc 只收起弹窗、不动订单（@cancel）：取消订单是显式按钮 + 二次确认的动作，
       键盘误触 Esc 不应该造成关单后果。 -->
  <dialog
    ref="dialog"
    class="hb-dialog hb-payment-dialog"
    :aria-labelledby="TITLE_ID"
    :aria-describedby="DESCRIBED_BY"
    @cancel.prevent="order.closePayment()"
  >
    <div class="hb-dialog__head">
      <button type="button" class="hb-dialog__close hb-payment-close" aria-label="关闭" @click="order.closePayment()">
        <i class="fa-duotone fa-regular fa-xmark"></i>
      </button>
      <span class="hb-kicker hb-kicker--plain">{{ order.paymentKicker }}</span>
      <h2 :id="TITLE_ID">{{ order.paymentTitle }}</h2>
      <p>{{ current?.productName }}</p>
    </div>
    <div class="hb-dialog__body">
      <div class="hb-pay-scan">
        <div id="payment-qr">
          <img v-if="order.qrDataUrl" :src="order.qrDataUrl" alt="支付二维码" width="198" height="198" />
        </div>
        <p :id="SCAN_ID" class="hb-pay-scan__hint">
          <i class="fa-duotone fa-regular fa-mobile-notch" aria-hidden="true"></i>
          <span>{{ order.paymentHint || "打开支付宝「扫一扫」完成付款" }}</span>
        </p>
      </div>
      <div class="hb-pay-amount">
        <span>应付金额</span>
        <strong class="hb-pay-amount__value"><i>¥</i><span>{{ moneyAmount(current?.amountCents || 0) }}</span></strong>
      </div>
      <div class="hb-pay-timer">
        <span class="hb-pay-timer__status">
          <i class="hb-pay-timer__dot" aria-hidden="true"></i><b role="status" aria-live="polite">{{ order.paymentStatus }}</b>
        </span>
        <span class="hb-pay-timer__clock">
          <!-- 倒计时每秒都在变，不能进 live region（否则读屏会被逐秒播报淹掉），只播报状态行。 -->
          <i class="fa-duotone fa-regular fa-clock" aria-hidden="true"></i><b aria-live="off">{{ countdown }}</b>
        </span>
      </div>
      <p :id="NOTE_ID" class="hb-pay-note">倒计时结束后订单自动关闭，并释放库存和优惠码。</p>
      <p class="hb-pay-closed">
        这张订单已关闭。如果你刚刚已经付款，请点下方「我已完成支付」再确认一次，付款成功的话激活码会自动补发。
      </p>
      <div class="hb-pay-order">
        <span>订单号</span>
        <code>{{ current?.orderNo }}</code>
      </div>
    </div>
    <div class="hb-dialog__foot hb-dialog__foot--split">
      <button type="button" class="hb-button hb-button--secondary" @click="cancel">取消支付</button>
      <button
        type="button"
        class="hb-button hb-button--primary"
        :disabled="refreshing"
        :aria-busy="refreshing ? 'true' : 'false'"
        @click="refresh"
      >
        {{ refreshing ? "确认中…" : "我已完成支付" }}
      </button>
    </div>
  </dialog>
</template>
