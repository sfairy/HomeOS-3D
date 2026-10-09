<script setup lang="ts">
/** 设备绑定面板。 */

import { computed, ref } from "vue";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import RowMenu from "../../components/admin/RowMenu.vue";
import { adminApi } from "../../api/http.js";
import { asListItems, errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { dt } from "../../utils/format.js";

interface Binding {
  bindingId: string;
  instanceId?: string;
  activationCodeHint?: string;
  clientVersion?: string;
  lastHeartbeatAt?: string;
  bound?: boolean;
  [key: string]: unknown;
}

const COLUMNS = [
  { key: "instanceId", label: "硬件指纹 / 实例 ID" },
  { key: "code", label: "激活码" },
  { key: "clientVersion", label: "客户端版本", nowrap: true },
  { key: "lastHeartbeatAt", label: "最近心跳", nowrap: true },
  { key: "bound", label: "状态", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const toast = useToastStore();
const confirm = useConfirmStore();
const refresh = useAdminRefreshStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const keyword = ref("");
const activeOnly = ref(false);

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (activeOnly.value) next.active_only = "true";
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  return next;
});

function reload() {
  return table.value?.search();
}

function reset() {
  keyword.value = "";
  activeOnly.value = false;
  void reload();
}

async function release(binding: Binding) {
  const ok = await confirm.confirm({
    title: "强制解绑设备",
    message: "确认强制解绑该设备？",
    detail: "该客户端下次心跳将转为<b>吊销</b>。它现在可以立即重新激活；冷却约束的只是<b>下一次解绑</b>。",
    confirmLabel: "强制解绑",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/bindings/${binding.bindingId}/release`, {
      method: "POST",
      body: JSON.stringify({ note: "后台强制解绑" }),
    });
    toast.push("已强制解绑");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function removeBinding(binding: Binding) {
  const instanceId = binding.instanceId || binding.bindingId;
  const ok = await confirm.confirm({
    title: "彻底删除绑定记录",
    message: `将永久删除实例 ${instanceId} 的绑定记录。`,
    detail:
      "与「强制解绑」的差别是<b>不留绑定行</b>：记录整条删除，该实例的会话与找回令牌一并清掉。<br>" +
      "<b>解绑事件与解绑冷却不受影响</b> —— 事件挂在授权上，不在这行绑定上，所以别指望这一步能顺带解除冷却。<br>" +
      "重新激活不受影响 —— 解绑后本来就能立刻激活，冷却约束的是下一次解绑。<br>仅用于清理测试机、重复绑定这类脏数据。",
    confirmLabel: "永久删除",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/bindings/${binding.bindingId}`, { method: "DELETE" });
    toast.push("绑定记录已删除");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="licensing">
    <PanelHead title="设备绑定" desc="解绑后可立即重新激活；冷却只约束下一次解绑" domain="授权" />

    <div class="panel-toolbar">
      <input
        v-model="keyword"
        class="hb-input"
        aria-label="实例号、客户端版本、IP 或激活码提示关键字"
        placeholder="实例号 / 版本 / IP / 激活码"
      />
      <label class="hb-check"><input v-model="activeOnly" type="checkbox" /> 仅有效</label>
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
      <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
    </div>

    <DataTable ref="table" path="/bindings" :columns="COLUMNS" :params="params" empty-text="没有符合条件的设备绑定">
      <template #default="{ items }">
        <tr v-for="binding in asListItems<Binding>(items)" :key="binding.bindingId">
          <td class="mono">
            <span v-if="binding.instanceId" :title="binding.instanceId">{{ binding.instanceId }}</span>
            <template v-else>—</template>
          </td>
          <td class="mono">
            <span v-if="binding.activationCodeHint" :title="binding.activationCodeHint">{{ binding.activationCodeHint }}</span>
            <template v-else>—</template>
          </td>
          <td class="nowrap">{{ binding.clientVersion || "—" }}</td>
          <td class="nowrap">{{ dt(binding.lastHeartbeatAt) }}</td>
          <td class="nowrap">
            <span v-if="binding.bound" class="pill pill--success">绑定中</span>
            <span v-else class="pill pill--muted">已解绑</span>
          </td>
          <td class="nowrap">
            <div class="row-actions">
              <button
                v-if="binding.bound"
                class="hb-button hb-button--danger hb-button--sm"
                @click="release(binding)"
              >
                强制解绑
              </button>
              <RowMenu>
                <button class="menu__item is-danger" type="button" @click="removeBinding(binding)">
                  彻底删除记录
                </button>
              </RowMenu>
            </div>
          </td>
        </tr>
      </template>
    </DataTable>
  </section>
</template>
