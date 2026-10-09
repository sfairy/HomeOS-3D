<script setup lang="ts">
/** 客户档案面板。 */

import { computed, ref } from "vue";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import { asListItems } from "../../store-types.js";
import { d, num } from "../../utils/format.js";

interface Customer {
  email?: string;
  name?: string;
  orderCount?: unknown;
  licenseCount?: unknown;
  createdAt?: string;
}

const COLUMNS = [
  { key: "email", label: "邮箱" },
  { key: "name", label: "姓名" },
  { key: "orderCount", label: "订单数", nowrap: true },
  { key: "licenseCount", label: "授权数", nowrap: true },
  { key: "createdAt", label: "创建", nowrap: true },
];

const table = ref<InstanceType<typeof DataTable> | null>(null);
const keyword = ref("");

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  const value = keyword.value.trim();
  if (value) next.keyword = value;
  return next;
});

function reload() {
  return table.value?.search();
}
</script>

<template>
  <section class="admin-panel active" data-domain="data">
    <PanelHead title="客户档案" desc="下单与开票用的客户记录；账号邮箱变更时这里会同步" domain="数据">
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">刷新</button>
    </PanelHead>

    <div class="panel-toolbar">
      <input v-model="keyword" class="hb-input" placeholder="邮箱 / 姓名关键字" />
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
    </div>

    <DataTable ref="table" path="/customers" :columns="COLUMNS" :params="params" empty-text="暂无客户档案">
      <template #default="{ items }">
        <tr v-for="customer in asListItems<Customer>(items)" :key="`${customer.email}-${customer.name}`">
          <td>
            <span v-if="customer.email" :title="customer.email">{{ customer.email }}</span>
            <template v-else>—</template>
          </td>
          <td>
            <span v-if="customer.name" :title="customer.name">{{ customer.name }}</span>
            <template v-else>—</template>
          </td>
          <td class="nowrap">{{ num(customer.orderCount) }}</td>
          <td class="nowrap">{{ num(customer.licenseCount) }}</td>
          <td class="nowrap">{{ d(customer.createdAt) }}</td>
        </tr>
      </template>
    </DataTable>
  </section>
</template>
