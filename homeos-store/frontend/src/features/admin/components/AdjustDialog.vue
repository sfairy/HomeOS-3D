<script setup lang="ts">
import { ref, watch } from "vue";
import { useAdminDialogsStore } from "@store/features/admin/stores/adminDialogs";
import { useAdminRefreshStore } from "@store/features/admin/stores/adminRefresh";
import { useToastStore } from "@store/shared/stores/toast";
import { adminApi } from "@store/shared/api/http";
import { errorMessage } from "@store/shared/types/store";

const dialogs = useAdminDialogsStore();
const refresh = useAdminRefreshStore();
const toast = useToastStore();

const dialog = ref<HTMLDialogElement | null>(null);
const submitting = ref(false);
const delta = ref("0");
const frozen = ref("0");
const note = ref("");

watch(
  () => dialogs.adjust,
  (target) => {
    const node = dialog.value;
    if (!node) return;
    if (target) {
      delta.value = "0";
      frozen.value = "0";
      note.value = "";
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
    }
  },
);

async function submit() {
  if (submitting.value) return;
  const target = dialogs.adjust;
  if (!target) return;
  const deltaValue = Number(delta.value || 0);
  const frozenValue = Number(frozen.value || 0);
  const noteValue = note.value.trim();
  if (!noteValue) {
    toast.push("人工调账必须填写备注。", "danger");
    return;
  }
  if (!deltaValue && !frozenValue) {
    toast.push("余额与冻结金额不能同时为 0。", "danger");
    return;
  }
  submitting.value = true;
  try {
    const result = await adminApi<{ balance?: unknown }>(
      `/referral-wallets/${target.accountId}/adjust`,
      {
        method: "POST",
        body: JSON.stringify({ delta: deltaValue, frozenDelta: frozenValue, note: noteValue }),
      },
    );
    toast.push(`调账完成，当前余额 ${result.balance} 积分`);
    dialogs.settleAdjust(null);
    refresh.bump("accounts", "ledger", "overview");
  } catch (error) {
    toast.push(errorMessage(error, "调账失败"), "danger");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    aria-labelledby="adjust-dialog-title"
    aria-describedby="adjust-dialog-desc"
    @cancel.prevent="dialogs.settleAdjust(null)"
    @click="($event.target === dialog) && dialogs.settleAdjust(null)"
  >
    <form @submit.prevent="submit">
    <div class="confirm-dialog__body">
      <div class="confirm-dialog__icon" aria-hidden="true">¥</div>
      <h2 id="adjust-dialog-title">人工调账</h2>
      <p>账号 <span class="mono">{{ dialogs.adjust?.label }}</span></p>
      <div id="adjust-dialog-desc" class="confirm-dialog__impact">
        调账一律写入积分账本，余额与流水在同一个事务里更新，不会出现「改了余额对不上流水」。
        备注必填，它是这笔变动唯一能被后人读懂的解释。
      </div>
      <label class="hb-field"><span>余额变动（积分，可为负）</span>
        <input v-model="delta" class="hb-input" type="number" step="0.01" />
      </label>
      <label class="hb-field"><span>冻结金额变动（积分，一般留 0）</span>
        <input v-model="frozen" class="hb-input" type="number" step="0.01" />
      </label>
      <label class="hb-field"><span>备注（必填）</span>
        <input v-model="note" class="hb-input" maxlength="255" placeholder="例如：客服补偿 / 退回重复扣减" />
      </label>
    </div>
    <div class="confirm-dialog__actions">
      <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="dialogs.settleAdjust(null)">取消</button>
      <button class="hb-button hb-button--warning hb-button--sm" type="submit" :disabled="submitting">
        {{ submitting ? "提交中…" : "确认调账" }}
      </button>
    </div>
    </form>
  </dialog>
</template>
