<script setup lang="ts">
/** 提现审核面板。 */

import { computed, ref } from "vue";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import RowMenu from "../../components/admin/RowMenu.vue";
import StatusPill from "../../components/admin/StatusPill.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { dt } from "../../utils/format.js";

interface Withdrawal {
  id: string;
  email?: string;
  accountId?: string;
  points?: unknown;
  feePoints?: unknown;
  netPoints?: unknown;
  status?: string;
  statusLabel?: string;
  createdAt?: string;
}

const COLUMNS = [
  { key: "account", label: "账号" },
  { key: "points", label: "积分", nowrap: true },
  { key: "feePoints", label: "手续费", nowrap: true },
  { key: "netPoints", label: "到账", nowrap: true },
  { key: "status", label: "状态", nowrap: true },
  { key: "createdAt", label: "申请时间", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const toast = useToastStore();
const confirm = useConfirmStore();
const refresh = useAdminRefreshStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const status = ref("");
const keyword = ref("");

function asWithdrawals(items: unknown[]): Withdrawal[] {
  return items as Withdrawal[];
}

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (status.value) next.status_filter = status.value;
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  return next;
});

function reload() {
  return table.value?.search();
}

function reset() {
  status.value = "";
  keyword.value = "";
  void reload();
}

function who(item: Withdrawal): string {
  return item.email || item.accountId || item.id;
}

async function resolve(item: Withdrawal, approve: boolean) {
  const ok = await confirm.confirm({
    title: approve ? "通过提现" : "驳回提现",
    message: approve ? "确认通过该提现申请？" : "确认驳回该提现申请？",
    detail: approve
      ? "将按申请金额结算，冻结积分转为已支出。"
      : "驳回后会<b>退回冻结积分</b>到账号余额。",
    tone: approve ? "success" : "danger",
    confirmLabel: approve ? "通过" : "驳回",
  });
  if (!ok) return;
  try {
    await adminApi(`/withdrawals/${item.id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ approve, note: approve ? "后台通过" : "后台驳回" }),
    });
    toast.push(approve ? "已通过提现" : "已驳回并退回积分");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function remove(item: Withdrawal) {
  const ok = await confirm.confirm({
    title: "删除提现记录",
    message: `将删除 ${who(item)} 的这条提现申请记录。`,
    detail: "积分流水（账本）<b>仍然保留</b>，财务审计不受影响。",
    confirmLabel: "删除",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/withdrawals/${item.id}`, { method: "DELETE" });
    toast.push("提现记录已删除");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="operations">
    <PanelHead
      title="提现审核"
      desc="待审申请必须通过或驳回以释放冻结积分；已结算的记录可删除"
      domain="运营"
    />

    <div class="panel-toolbar">
      <select v-model="status" class="hb-select" aria-label="按提现状态筛选">
        <option value="">全部</option>
        <option value="pending">待审核</option>
        <option value="paid">已提现</option>
        <option value="rejected">已驳回</option>
      </select>
      <input v-model="keyword" class="hb-input" aria-label="账号邮箱关键字" placeholder="邮箱" />
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
      <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
    </div>

    <DataTable
      ref="table"
      path="/withdrawals"
      :columns="COLUMNS"
      :params="params"
      empty-text="没有任何提现申请"
    >
      <template #default="{ items }">
        <tr v-for="item in asWithdrawals(items)" :key="item.id">
          <td class="nowrap">{{ who(item) }}</td>
          <td class="nowrap">{{ item.points }}</td>
          <td class="nowrap">{{ item.feePoints }}</td>
          <td class="nowrap">{{ item.netPoints }}</td>
          <td class="nowrap"><StatusPill :status="item.status" :label="item.statusLabel" /></td>
          <td class="nowrap">{{ dt(item.createdAt) }}</td>
          <td class="nowrap">
            <div class="row-actions">
              <button
                v-if="item.status === 'pending'"
                class="hb-button hb-button--success hb-button--sm"
                @click="resolve(item, true)"
              >
                通过
              </button>
              <button
                v-if="item.status === 'pending'"
                class="hb-button hb-button--danger hb-button--sm"
                @click="resolve(item, false)"
              >
                驳回
              </button>
              <RowMenu>
                <button
                  v-if="item.status !== 'pending'"
                  class="menu__item is-danger"
                  type="button"
                  @click="remove(item)"
                >
                  删除
                </button>
              </RowMenu>
            </div>
          </td>
        </tr>
      </template>
    </DataTable>
  </section>
</template>
