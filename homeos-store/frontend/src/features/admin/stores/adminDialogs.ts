/** 后台两个带输入的弹窗（人工调账 / 批量清理）的 Promise 化状态。 */

import { defineStore } from "pinia";
import { ref } from "vue";

export interface AdjustTarget {
  accountId: string;
  label: string;
}

export interface PurgeRequest {
  title: string;
  message: string;
  impact: string;
}

export const useAdminDialogsStore = defineStore("adminDialogs", () => {
  const adjust = ref<AdjustTarget | null>(null);
  const purge = ref<PurgeRequest | null>(null);
  let adjustResolver: ((value: { delta: number; frozenDelta: number; note: string } | null) => void) | null = null;
  let purgeResolver: ((value: number | null) => void) | null = null;

  function askAdjust(target: AdjustTarget) {
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

  return { adjust, purge, askAdjust, settleAdjust, askPurge, settlePurge };
});
