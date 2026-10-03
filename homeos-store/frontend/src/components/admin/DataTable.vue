<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";

interface Column {
  key: string;
  label: string;
  nowrap?: boolean;
}

interface TableData {
  items?: unknown[];
  total?: number;
  limit?: number;
  offset?: number;
  [key: string]: unknown;
}

const props = withDefaults(
  defineProps<{
    path: string;
    columns: Column[];
    params?: Record<string, string>;
    emptyText?: string;
    pageSize?: number;
  }>(),
  { params: () => ({}), emptyText: "暂无数据", pageSize: 50 },
);

const emit = defineEmits<{ loaded: [TableData]; failed: [string] }>();

const items = ref<unknown[]>([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const error = ref("");
let seq = 0;

const pages = computed(() => Math.max(1, Math.ceil(total.value / props.pageSize)));
const page = computed(() => Math.floor(offset.value / props.pageSize) + 1);
const from = computed(() => (total.value === 0 ? 0 : offset.value + 1));
const to = computed(() => Math.min(offset.value + props.pageSize, total.value));
const atLast = computed(() => offset.value + props.pageSize >= total.value);
const lastOffset = computed(() => Math.max(0, (pages.value - 1) * props.pageSize));

async function reload(reset = false) {
  if (reset) offset.value = 0;
  const current = ++seq;
  loading.value = true;
  error.value = "";
  const query = new URLSearchParams({
    ...props.params,
    limit: String(props.pageSize),
    offset: String(offset.value),
  });
  try {
    const data = (await adminApi(`${props.path}?${query.toString()}`)) as TableData;
    if (current !== seq) return;
    items.value = data.items || [];
    total.value = Number(data.total || 0);
    emit("loaded", data);
  } catch (err) {
    if (current !== seq) return;
    error.value = errorMessage(err, "请稍后重试");
    items.value = [];
    total.value = 0;
    emit("failed", error.value);
  } finally {
    if (current === seq) loading.value = false;
  }
}

watch(
  () => props.params,
  () => {
    void reload(true);
  },
  { deep: true },
);

onMounted(() => reload());

function goto(direction: "first" | "prev" | "next" | "last") {
  if (direction === "first") offset.value = 0;
  else if (direction === "prev") offset.value = Math.max(0, offset.value - props.pageSize);
  else if (direction === "last") offset.value = lastOffset.value;
  else offset.value = Math.min(lastOffset.value, offset.value + props.pageSize);
  void reload();
}

/** 供父组件在改完筛选后手动重置页码再拉一次。 */
function search() {
  offset.value = 0;
  void reload();
}

defineExpose({ reload, search });
</script>

<template>
  <div class="table-wrap" :class="{ 'is-busy': loading }">
    <table class="hb-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" :class="{ nowrap: column.nowrap }">
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && !items.length">
          <td :colspan="columns.length">
            <div class="table-state is-loading">
              <span class="table-state__spinner" aria-hidden="true"></span>正在读取…
            </div>
          </td>
        </tr>
        <tr v-else-if="error">
          <td :colspan="columns.length">
            <div class="table-state is-error">
              <i class="fa-duotone fa-regular fa-triangle-exclamation"></i>
              <div class="table-state__text">
                <strong>读取出错</strong><small>{{ error }}</small>
              </div>
              <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="reload()">
                重试
              </button>
            </div>
          </td>
        </tr>
        <tr v-else-if="!items.length">
          <td :colspan="columns.length">
            <div class="table-empty"><span>◌</span>{{ emptyText }}</div>
          </td>
        </tr>
        <slot v-else :items="items"></slot>
      </tbody>
    </table>
  </div>
  <div class="admin-pager">
    <span class="admin-pager__info">第 {{ page }}/{{ pages }} 页 · 显示 {{ from }}–{{ to }} / 共 {{ total }} 条</span>
    <button class="hb-button hb-button--secondary hb-button--sm" :disabled="offset <= 0" @click="goto('first')">首页</button>
    <button class="hb-button hb-button--secondary hb-button--sm" :disabled="offset <= 0" @click="goto('prev')">上一页</button>
    <button class="hb-button hb-button--secondary hb-button--sm" :disabled="atLast" @click="goto('next')">下一页</button>
    <button class="hb-button hb-button--secondary hb-button--sm" :disabled="atLast" @click="goto('last')">末页</button>
  </div>
</template>
