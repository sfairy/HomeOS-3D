<script setup lang="ts">
/** 积分流水面板。 */

import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import { asListItems } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useAdminDialogsStore } from "../../stores/adminDialogs.js";
import { dt } from "../../utils/format.js";

interface LedgerKind {
  value: string;
  label: string;
}

interface LedgerEntry {
  createdAt?: string;
  accountEmail?: string;
  accountId?: string;
  kind?: string;
  delta?: unknown;
  frozenDelta?: unknown;
  balanceAfter?: unknown;
  note?: string;
  reference?: string;
}

const COLUMNS = [
  { key: "createdAt", label: "时间", nowrap: true },
  { key: "account", label: "账号" },
  { key: "kind", label: "类型", nowrap: true },
  { key: "delta", label: "变动", nowrap: true },
  { key: "frozenDelta", label: "冻结变动", nowrap: true },
  { key: "balanceAfter", label: "余额", nowrap: true },
  { key: "note", label: "备注" },
];

const route = useRoute();
const toast = useToastStore();
const dialogs = useAdminDialogsStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const accountId = ref(String(route.query.account_id || ""));
const kind = ref("");
const kinds = ref<LedgerKind[]>([]);
const kindLabels = computed(() =>
  Object.fromEntries(kinds.value.map((item) => [item.value, item.label])),
);

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (accountId.value.trim()) next.account_id = accountId.value.trim();
  if (kind.value) next.kind = kind.value;
  return next;
});

function reload() {
  return table.value?.search();
}

function onLoaded(data: { kinds?: unknown; [key: string]: unknown }) {
  if (!Array.isArray(data.kinds) || !data.kinds.length) return;
  kinds.value = data.kinds as LedgerKind[];
}

function adjust() {
  const id = accountId.value.trim();
  if (!id) {
    toast.push("请先在左侧填入账号 ID，或从「账号」页的『人工调账』进入。", "warning");
    return;
  }
  void dialogs.askAdjust({ accountId: id, label: id });
}

function kindLabel(entry: LedgerEntry): string {
  return kindLabels.value[entry.kind || ""] || entry.kind || "—";
}
</script>

<template>
  <section class="admin-panel active" data-domain="data">
    <PanelHead
      title="积分流水"
      desc="余额由流水汇总而来，这张表是对账的唯一依据；人工调账也必须留痕在这里"
      domain="数据"
    >
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">刷新</button>
    </PanelHead>

    <div class="panel-toolbar">
      <input
        v-model="accountId"
        class="hb-input"
        placeholder="账号 ID（从「账号」页的『查看积分流水』带上）"
      />
      <select v-model="kind" class="hb-select">
        <option value="">全部类型</option>
        <option v-for="item in kinds" :key="item.value" :value="item.value">{{ item.label }}</option>
      </select>
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
      <button class="hb-button hb-button--warning hb-button--sm" @click="adjust">人工调账</button>
    </div>

    <DataTable
      ref="table"
      path="/referral-ledger"
      :columns="COLUMNS"
      :params="params"
      empty-text="暂无积分流水"
      @loaded="onLoaded"
    >
      <template #default="{ items }">
        <tr v-for="entry in asListItems<LedgerEntry>(items)" :key="`${entry.createdAt}-${entry.accountId}-${entry.kind}`">
          <td class="nowrap">{{ dt(entry.createdAt) }}</td>
          <td>
            <span v-if="entry.accountEmail || entry.accountId" :title="String(entry.accountEmail || entry.accountId)">
              {{ entry.accountEmail || entry.accountId }}
            </span>
            <template v-else>—</template>
          </td>
          <td class="nowrap">{{ kindLabel(entry) }}</td>
          <td class="nowrap" :class="{ 'is-negative': Number(entry.delta) < 0 }">{{ entry.delta }}</td>
          <td class="nowrap">{{ entry.frozenDelta }}</td>
          <td class="nowrap">{{ entry.balanceAfter }}</td>
          <td>
            <span v-if="entry.note || entry.reference" :title="String(entry.note || entry.reference)">
              {{ entry.note || entry.reference }}
            </span>
            <template v-else>—</template>
          </td>
        </tr>
      </template>
    </DataTable>
  </section>
</template>
