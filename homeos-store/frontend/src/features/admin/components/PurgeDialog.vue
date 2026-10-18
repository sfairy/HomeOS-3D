<script setup lang="ts">
import { ref, watch } from "vue";
import { useAdminDialogsStore } from "@store/features/admin/stores/adminDialogs";
import { useToastStore } from "@store/shared/stores/toast";

const dialogs = useAdminDialogsStore();
const toast = useToastStore();
const dialog = ref<HTMLDialogElement | null>(null);
const days = ref("30");
const TITLE_ID = "purge-dialog-title";
const MESSAGE_ID = "purge-dialog-message";
const IMPACT_ID = "purge-dialog-impact";

watch(
  () => dialogs.purge,
  (request) => {
    const node = dialog.value;
    if (!node) return;
    if (request) {
      days.value = "30";
      if (!node.open) node.showModal();
    } else if (node.open) {
      node.close();
    }
  },
);

function confirm() {
  const value = Number(days.value || 0);
  if (!Number.isInteger(value) || value < 1) {
    toast.push("清理天数必须是不小于 1 的整数。", "danger");
    return;
  }
  dialogs.settlePurge(value);
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm-dialog"
    :aria-labelledby="TITLE_ID"
    :aria-describedby="`${MESSAGE_ID} ${IMPACT_ID}`"
    @close="dialogs.settlePurge(null)"
    @cancel.prevent="dialogs.settlePurge(null)"
  >
    <div class="confirm-dialog__body">
      <div class="confirm-dialog__icon">⌫</div>
      <h2 :id="TITLE_ID">{{ dialogs.purge?.title || "清理历史数据" }}</h2>
      <p :id="MESSAGE_ID">{{ dialogs.purge?.message }}</p>
      <!-- impact 由 DiagnosticsView 传入，是源码里的静态字面量（含 <b>/<code> 强调），
           没有任何动态输入拼入，因此 v-html 不构成注入面。 -->
      <div :id="IMPACT_ID" class="confirm-dialog__impact" v-html="dialogs.purge?.impact"></div>
      <label class="hb-field">
        <span>清理多少天以前的记录（至少 1 天）</span>
        <input v-model="days" class="hb-input" type="number" min="1" inputmode="numeric" />
      </label>
    </div>
    <div class="confirm-dialog__actions">
      <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="dialogs.settlePurge(null)">取消</button>
      <button class="hb-button hb-button--danger hb-button--sm" type="button" @click="confirm">确认清理</button>
    </div>
  </dialog>
</template>
