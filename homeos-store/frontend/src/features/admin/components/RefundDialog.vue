<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAdminDialogsStore } from "@store/features/admin/stores/adminDialogs";
import { useToastStore } from "@store/shared/stores/toast";
import { formatCents } from "@store/shared/utils/money";

/**
 * 订单退款弹窗。
 *
 * 存在的理由（ST-FE-03）：后台原来点「退款」直接发 `{note}`，后端
 * `requested_cents is None` 就按 `remaining_cents` 退 —— 每次都是全额，等于
 * 把「部分退款」这个后端能力藏起来了。金额必须由操作者显式确认，
 * 默认值是**可退余额**（不是订单金额），上限也用可退余额。
 */
const dialogs = useAdminDialogsStore();
const toast = useToastStore();

const dialog = ref<HTMLDialogElement | null>(null);
const amount = ref("");
const note = ref("");

const target = computed(() => dialogs.refund);
const refundableCents = computed(() => Math.max(0, Number(target.value?.refundableCents || 0)));
/** 0 元订单（免费 / 全抵扣）：后端按免费单处理，不需要也不允许传金额（schema 要求 > 0）。 */
const freeOrder = computed(() => Number(target.value?.totalCents || 0) === 0);
const amountCents = computed(() => {
  const yuan = Number(amount.value);
  if (!Number.isFinite(yuan)) return null;
  return Math.round(yuan * 100);
});
const validation = computed(() => {
  if (freeOrder.value) return "";
  const cents = amountCents.value;
  if (cents === null || amount.value.trim() === "") return "请填写退款金额";
  if (!Number.isFinite(cents) || cents <= 0) return "退款金额必须大于 0";
  if (cents > refundableCents.value) {
    return `退款金额不能超过可退余额 ${formatCents(refundableCents.value)}`;
  }
  return "";
});

watch(
  () => dialogs.refund,
  (next) => {
    const node = dialog.value;
    if (!node) return;
    if (next) {
      // 默认全额退：这是最常见的操作，但仍需操作者看清金额再点确认
      amount.value = (Math.max(0, next.refundableCents) / 100).toFixed(2);
      note.value = "";
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
    }
  },
);

function confirm() {
  if (validation.value) {
    toast.push(validation.value, "danger");
    return;
  }
  if (freeOrder.value) {
    dialogs.settleRefund({ amountCents: 0, note: note.value.trim() });
    return;
  }
  const cents = amountCents.value;
  if (cents === null) return;
  dialogs.settleRefund({ amountCents: cents, note: note.value.trim() });
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog is-danger"
    aria-labelledby="refund-dialog-title"
    aria-describedby="refund-dialog-desc"
    @close="dialogs.settleRefund(null)"
    @cancel.prevent="dialogs.settleRefund(null)"
  >
    <div class="confirm-dialog__body">
      <div class="confirm-dialog__icon">¥</div>
      <h2 id="refund-dialog-title">{{ target?.offline ? "订单退款（线下）" : "订单退款" }}</h2>
      <p>订单 <span class="mono">{{ target?.orderNo }}</span></p>
      <div id="refund-dialog-desc" class="confirm-dialog__impact">
        订单金额 <b>{{ formatCents(Number(target?.totalCents || 0)) }}</b>，
        已退 <b>{{ formatCents(Number(target?.refundedCents || 0)) }}</b>，
        本次最多可退 <b>{{ formatCents(refundableCents) }}</b>。
        <template v-if="target?.offline">
          该订单在支付渠道侧没有可退交易：系统不会（也无法）把钱退回去，
          确认后按<b>线下退款</b>记账 —— 请先自行在渠道外把钱退给用户。
        </template>
        全额退款会同时<b>停用</b>该订单产生的激活码与权益，并退回邀请奖励；
        部分退款只记退款金额。
      </div>
      <p v-if="freeOrder">免费订单没有资金往来，确认后将收回该订单产生的权益。</p>
      <label v-if="!freeOrder" class="hb-field">
        <span>本次退款金额（元）</span>
        <input
          v-model="amount"
          class="hb-input"
          type="number"
          min="0.01"
          step="0.01"
          inputmode="decimal"
        />
      </label>
      <label class="hb-field">
        <span>备注（可选，写入退款原因与审计）</span>
        <input v-model="note" class="hb-input" maxlength="200" placeholder="例如：用户申请部分退款" />
      </label>
      <p v-if="validation" class="confirm-dialog__warn" role="alert">{{ validation }}</p>
    </div>
    <div class="confirm-dialog__actions">
      <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="dialogs.settleRefund(null)">
        取消
      </button>
      <button
        class="hb-button hb-button--danger hb-button--sm"
        type="button"
        :disabled="Boolean(validation)"
        @click="confirm"
      >
        {{ target?.offline ? "确认已线下退款" : "确认退款" }}
      </button>
    </div>
  </dialog>
</template>
