<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { adminApi } from "@store/shared/api/http";
import { errorMessage } from "@store/shared/types/store";

interface Column {
  key: string;
  label: string;
  nowrap?: boolean;
}

/** 表格的无障碍名称：DataTable 被 11 个后台页面复用，逐页传 label 太啰嗦，按接口路径兜底。 */
const PATH_LABELS: Record<string, string> = {
  "/sessions": "登录会话列表",
  "/license-sessions": "授权会话列表",
  "/recovery-tokens": "找回令牌列表",
  "/login-attempts": "登录尝试记录",
  "/email-verifications": "邮箱验证码记录",
  "/device-release-events": "设备解绑记录",
  "/coupon-redemptions": "优惠码核销记录",
  "/withdrawals": "提现申请列表",
  "/bindings": "设备绑定列表",
  "/coupons": "优惠码列表",
  "/customers": "客户列表",
  "/entitlements": "权益列表",
  "/audit-logs": "审计日志",
  "/accounts": "账号列表",
  "/referral-ledger": "邀请积分流水",
  "/orders": "订单列表",
  "/licenses": "授权列表",
  "/products": "商品列表",
};

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
    /** 表格的无障碍名称；不传时按 path 查 PATH_LABELS。 */
    label?: string;
    /** 可选的可见表标题（caption）；一般用不到，留作将来说明性的表格。 */
    caption?: string;
  }>(),
  { params: () => ({}), emptyText: "暂无数据", pageSize: 50 },
);

const tableLabel = computed(() => {
  if (props.label) return props.label;
  const path = props.path.split("?")[0].replace(/\/$/, "");
  return PATH_LABELS[path] ?? "数据表格";
});

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
  } catch (caughtError) {
    if (current !== seq) return;
    error.value = errorMessage(caughtError, "请稍后重试");
    items.value = [];
    total.value = 0;
    emit("failed", error.value);
  } finally {
    if (current === seq) loading.value = false;
  }
}

/**
 * 参数指纹：只比较筛选值的组合。
 *
 * 原实现是 `watch(() => props.params, ..., { deep: true })` —— 父组件一旦改成内联对象
 * （每次渲染都是新引用、内容却一样）就会触发一次多余的整页重拉，深监听还会把参数对象
 * 完整遍历一遍。指纹方案下只有筛选值真的变了才会重置到第一页并重拉。
 */
const paramsKey = computed(() =>
  Object.entries(props.params ?? {})
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value ?? ""}`)
    .join("&"),
);

watch(paramsKey, () => {
  void reload(true);
});

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
  <div class="table-wrap" :class="{ 'is-busy': loading }" :aria-busy="loading ? 'true' : 'false'">
    <table class="hb-table" :aria-label="caption ? undefined : tableLabel">
      <caption v-if="caption" class="hb-table__caption">{{ caption }}</caption>
      <thead>
        <tr>
          <th v-for="column in columns" :key="column.key" scope="col" :class="{ nowrap: column.nowrap }">
            {{ column.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && !items.length">
          <td :colspan="columns.length">
            <div class="table-state is-loading" role="status" aria-live="polite">
              <span class="table-state__spinner" aria-hidden="true"></span>正在读取…
            </div>
          </td>
        </tr>
        <tr v-else-if="error">
          <td :colspan="columns.length">
            <div class="table-state is-error" role="alert">
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
            <div class="table-empty" role="status"><span aria-hidden="true">◌</span>{{ emptyText }}</div>
          </td>
        </tr>
        <slot v-else :items="items"></slot>
      </tbody>
    </table>
  </div>
  <nav class="admin-pager" aria-label="分页">
    <span class="admin-pager__info" aria-live="polite">
      第 {{ page }}/{{ pages }} 页 · 显示 {{ from }}–{{ to }} / 共 {{ total }} 条
    </span>
    <button class="hb-button hb-button--secondary hb-button--sm" type="button" :disabled="offset <= 0" @click="goto('first')">
      首页
    </button>
    <button class="hb-button hb-button--secondary hb-button--sm" type="button" :disabled="offset <= 0" @click="goto('prev')">
      上一页
    </button>
    <button class="hb-button hb-button--secondary hb-button--sm" type="button" :disabled="atLast" @click="goto('next')">
      下一页
    </button>
    <button class="hb-button hb-button--secondary hb-button--sm" type="button" :disabled="atLast" @click="goto('last')">
      末页
    </button>
  </nav>
</template>
