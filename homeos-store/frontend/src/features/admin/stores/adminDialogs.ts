/** 后台带输入的弹窗（人工调账 / 批量清理 / 订单退款）的 Promise 化状态。 */

import { defineStore } from "pinia";
import { ref } from "vue";

interface AdjustTarget {
  accountId: string;
  label: string;
}

interface PurgeRequest {
  title: string;
  message: string;
  impact: string;
}

/**
 * 退款弹窗的目标订单。
 *
 * `refundableCents` 是后端 `order_payload` 算好的可退余额（已扣掉历史退款），
 * 弹窗用它做默认值与上限 —— 前端不再自己按 `amountCents` 猜「还剩多少能退」。
 */
interface RefundTarget {
  orderNo: string;
  totalCents: number;
  refundedCents: number;
  refundableCents: number;
  /** 渠道侧没有可退交易（人工标记支付 / 历史失效渠道 / 免费单）：按线下退款记账 */
  offline: boolean;
}

interface RefundDecision {
  amountCents: number;
  note: string;
}

export const useAdminDialogsStore = defineStore("adminDialogs", () => {
  const adjust = ref<AdjustTarget | null>(null);
  const purge = ref<PurgeRequest | null>(null);
  const refund = ref<RefundTarget | null>(null);
  let adjustResolver: ((value: { delta: number; frozenDelta: number; note: string } | null) => void) | null = null;
  let purgeResolver: ((value: number | null) => void) | null = null;
  let refundResolver: ((value: RefundDecision | null) => void) | null = null;

  function askAdjust(target: AdjustTarget) {
    // 同 confirm.ts：覆盖 resolver 前先把旧的按“取消”收敛，避免旧 await 永久悬挂。
    adjustResolver?.(null);
    adjust.value = target;
    return new Promise<{ delta: number; frozenDelta: number; note: string } | null>((resolve) => {
      adjustResolver = resolve;
    });
  }

  function settleAdjust(value: { delta: number; frozenDelta: number; note: string } | null) {
    adjust.value = null;
    adjustResolver?.(value);
    adjustResolver = null;
  }

  function askPurge(request: PurgeRequest) {
    // 同上：重复打开时旧请求按“取消”收敛。
    purgeResolver?.(null);
    purge.value = request;
    return new Promise<number | null>((resolve) => {
      purgeResolver = resolve;
    });
  }

  function settlePurge(days: number | null) {
    purge.value = null;
    purgeResolver?.(days);
    purgeResolver = null;
  }

  function askRefund(target: RefundTarget) {
    // 同上：重复打开时旧请求按“取消”收敛。
    refundResolver?.(null);
    refund.value = target;
    return new Promise<RefundDecision | null>((resolve) => {
      refundResolver = resolve;
    });
  }

  function settleRefund(value: RefundDecision | null) {
    refund.value = null;
    refundResolver?.(value);
    refundResolver = null;
  }

  return {
    adjust,
    purge,
    refund,
    askAdjust,
    settleAdjust,
    askPurge,
    settlePurge,
    askRefund,
    settleRefund,
  };
});
