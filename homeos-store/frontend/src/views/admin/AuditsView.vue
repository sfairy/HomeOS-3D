<script setup lang="ts">
/** 审计日志面板：列表 + 批量清理。 */

import { computed, ref } from "vue";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { dt } from "../../utils/format.js";
import { useAdminTabs, type AdminTabItem } from "../../composables/useAdminTabs.js";

interface AuditItem {
  id: string;
  createdAt?: string;
  actor?: string;
  action?: string;
  target?: string;
  detail?: string;
}

const COLUMNS = [
  { key: "createdAt", label: "时间", nowrap: true },
  { key: "actor", label: "操作人" },
  { key: "action", label: "动作" },
  { key: "target", label: "对象" },
  { key: "detail", label: "详情" },
  { key: "actions", label: "操作", nowrap: true },
];

const toast = useToastStore();
const confirm = useConfirmStore();
const refresh = useAdminRefreshStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const purgeDays = ref("90");
const purging = ref(false);

function asAudits(items: unknown[]): AuditItem[] {
  return items as AuditItem[];
}

const tabs: AdminTabItem[] = [
  { key: "list", label: "审计列表" },
  { key: "purge", label: "批量清理" },
];

const { active, pick } = useAdminTabs("audits", computed(() => tabs));

function reload() {
  return table.value?.search();
}

async function remove(item: AuditItem) {
  const label = `${item.action || ""} ${item.target || ""}`.trim() || item.id;
  const ok = await confirm.confirm({
    title: "删除审计记录",
    message: `将删除这条审计记录（${label}）。`,
    detail: "删除操作<b>不可恢复</b>，本次删除本身会写入一条新的审计记录。",
    confirmLabel: "删除",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/audit-logs/${item.id}`, { method: "DELETE" });
    toast.push("审计记录已删除");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function purge() {
  const days = Number(purgeDays.value || 0);
  if (!Number.isInteger(days) || days < 1) {
    toast.push("清理天数必须是不小于 1 的整数。", "warning");
    return;
  }
  const ok = await confirm.confirm({
    title: "批量清理审计日志",
    message: `将删除 ${days} 天之前的所有审计记录。`,
    detail: "记录一旦清理<b>无法恢复</b>；本次清理会留下一条 <code>audit.purge</code> 记录作为凭据。",
    confirmLabel: "执行清理",
    tone: "danger",
  });
  if (!ok) return;
  purging.value = true;
  try {
    const result = await adminApi<{ deleted?: number }>(
      `/audit-logs?older_than_days=${encodeURIComponent(days)}`,
      { method: "DELETE" },
    );
    toast.push(
      result.deleted ? `已清理 ${result.deleted} 条审计记录` : "没有需要清理的记录",
      result.deleted ? "success" : "warning",
    );
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    purging.value = false;
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="system">
    <PanelHead title="审计日志" desc="后台所有写操作的追溯记录，可单条删除或按时间批量清理" domain="系统">
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">刷新</button>
    </PanelHead>

    <div class="admin-tabs" role="tablist" aria-label="审计日志分区">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="admin-tabs__tab"
        type="button"
        role="tab"
        :aria-selected="tab.key === active ? 'true' : 'false'"
        :tabindex="tab.key === active ? 0 : -1"
        @click="pick(tab.key)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-show="active === 'list'" class="admin-tab-pane" role="tabpanel">
      <DataTable ref="table" path="/audit-logs" :columns="COLUMNS" empty-text="暂无审计记录">
        <template #default="{ items }">
          <tr v-for="item in asAudits(items)" :key="item.id">
            <td class="nowrap">{{ dt(item.createdAt) }}</td>
            <td class="nowrap">
              <span v-if="item.actor" :title="item.actor">{{ item.actor }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ item.action }}</td>
            <td class="mono">
              <span v-if="item.target" :title="item.target">{{ item.target }}</span>
              <template v-else>—</template>
            </td>
            <td>
              <span v-if="item.detail" :title="item.detail">{{ item.detail }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--danger hb-button--sm" @click="remove(item)">删除</button>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'purge'" class="admin-tab-pane" role="tabpanel">
      <div class="danger-zone">
        <h3>批量清理</h3>
        <p>
          按天数清理历史审计日志，用于控制表体积。<strong>清理动作本身也会被记录</strong>，
          但被清掉的记录无法恢复，请先确认天数再执行。
        </p>
        <div class="danger-zone__row">
          <label class="hb-field">
            <span>清理多少天之前的记录</span>
            <input v-model="purgeDays" class="hb-input purge-days" type="number" min="1" step="1" />
          </label>
          <button class="hb-button hb-button--danger hb-button--sm" :disabled="purging" @click="purge">
            {{ purging ? "清理中…" : "执行清理" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
