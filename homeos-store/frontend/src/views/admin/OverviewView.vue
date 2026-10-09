<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import PanelHead from "../../components/admin/PanelHead.vue";
import AdminTabs from "../../components/admin/AdminTabs.vue";
import { useAdminTabs, type AdminTabItem } from "../../composables/useAdminTabs.js";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useAdminStore } from "../../stores/admin.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { d, dt, money, num, valueSize, STATUS_HUES } from "../../utils/format.js";

interface StatCard {
  label: string;
  value: string;
  note: string;
  tone: string;
}

interface FunnelItem {
  status: string;
  label: string;
  count: number;
  amountCents: number;
}

interface OverviewPayload {
  revenue?: {
    totalCents?: number;
    totalGrossCents?: number;
    totalRefundCents?: number;
    totalManualCents?: number;
    windows?: Array<{ key: string; netCents: number; paidOrders: number; manualOrders?: number }>;
  };
  orderFunnel?: FunnelItem[];
  attention?: Record<string, number | undefined>;
  lowStockProducts?: Array<{ name?: string; stockQuantity?: unknown; reservedStock?: unknown; availableStock?: unknown }>;
  expiringLicenses?: Array<{ codeHint?: string; activationCodeId?: string; productName?: string; accessExpiresAt?: string }>;
  referral?: { balancePoints?: unknown; availablePoints?: unknown; frozenPoints?: unknown };
  accounts?: unknown;
  products?: unknown;
  activeLicenses?: unknown;
  licenses?: unknown;
  activeEntitlements?: unknown;
  entitlements?: unknown;
  pendingOrders?: unknown;
  fulfilledOrders?: unknown;
  deviceBindings?: unknown;
  maintenanceMode?: boolean;
  pendingWithdrawals?: number;
  paymentSweep?: Sweep | null;
  incidents?: Incidents | null;
  serverTime?: string;
}

interface Sweep {
  health?: string;
  healthLabel?: string;
  intervalSeconds?: number;
  rounds?: number;
  consecutiveFailures?: number;
  lastResult?: { queried?: unknown; settled?: unknown; closed?: unknown; failed?: unknown };
  lastError?: string;
  secondsSinceSuccess?: number;
  lastSuccessAt?: string;
}

interface Incidents {
  total?: number;
  kinds?: Array<{ label?: string; count?: unknown; lastAt?: string; lastOrderNo?: string; lastError?: string }>;
  clearedAt?: string;
  clearedTotal?: unknown;
}

const REVENUE_WINDOW_LABELS: Record<string, string> = {
  last24h: "近 24 小时",
  last7d: "近 7 天",
  last30d: "近 30 天",
};

const SWEEP_HEALTH_TONE: Record<string, string> = {
  ok: "hb-tag--success",
  disabled: "hb-tag--warning",
  pending: "hb-tag--warning",
  never: "hb-tag--danger",
  failing: "hb-tag--danger",
  stopped: "hb-tag--danger",
};

interface OverviewJump {
  page: string;
  tab?: string;
  query?: Record<string, string>;
}

const TODOS: Array<{
  key: string;
  label: string;
  tone: string;
  hint: string;
  jump: OverviewJump;
}> = [
  {
    key: "awaitingFulfillment",
    label: "待发货",
    tone: "is-alert",
    hint: "已付款但还没发出的自动发货订单",
    jump: { page: "orders", query: { status_filter: "paid" } },
  },
  {
    key: "fulfillmentFailed",
    label: "发货失败",
    tone: "is-danger",
    hint: "自动发货报错，需要人工重试或退款",
    jump: { page: "orders", query: { status_filter: "fulfillment_failed" } },
  },
  {
    key: "paymentFailed",
    label: "支付失败",
    tone: "is-alert",
    hint: "支付渠道拒单，库存预留已归还",
    jump: { page: "orders", query: { status_filter: "payment_failed" } },
  },
  {
    key: "needsReview",
    label: "待人工复核",
    tone: "is-danger",
    hint: "超时后仍收到款等异常入账，需人工确认",
    jump: { page: "orders", query: { needs_review: "true" } },
  },
  {
    key: "pendingWithdrawals",
    label: "待审提现",
    tone: "is-alert",
    hint: "用户已申请、等待审核打款",
    jump: { page: "withdrawals", query: { status_filter: "pending" } },
  },
  {
    key: "expiringLicenses",
    label: "临期授权",
    tone: "is-alert",
    hint: "30 天内到期，可提前提醒续费",
    jump: { page: "licenses", tab: "list", query: { expiring_days: "30" } },
  },
  {
    key: "soldOut",
    label: "售罄商品",
    tone: "is-danger",
    hint: "库存为 0 且仍在售，下单会被拒",
    jump: { page: "products", tab: "list", query: { status_filter: "soldout" } },
  },
  {
    key: "lowStock",
    label: "低库存商品",
    tone: "is-alert",
    hint: "库存有限（含已被预留的部分）",
    jump: { page: "products", tab: "list", query: { status_filter: "lowstock" } },
  },
];

const router = useRouter();
const toast = useToastStore();
const admin = useAdminStore();
const confirm = useConfirmStore();

const tabs: AdminTabItem[] = [
  { key: "dashboard", label: "经营看板" },
  { key: "risk", label: "风险与待办" },
  { key: "tools", label: "维护工具" },
];
const { active, pick } = useAdminTabs("overview", computed(() => tabs));

const data = ref<OverviewPayload>({});
const loading = ref(false);

function humanAge(seconds: unknown) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 60) return `${Math.round(value)} 秒前`;
  if (value < 3600) return `${Math.round(value / 60)} 分钟前`;
  if (value < 86400) return `${Math.round(value / 3600)} 小时前`;
  return `${Math.round(value / 86400)} 天前`;
}

const sweepPill = computed(() => {
  const sweep = data.value.paymentSweep;
  if (!sweep) return { text: "未知", cls: "hb-tag hb-tag--warning" };
  const tone = SWEEP_HEALTH_TONE[sweep.health || ""] || "hb-tag--warning";
  return { text: sweep.healthLabel || "未知", cls: `hb-tag ${tone}` };
});

const sweepDetail = computed(() => {
  const sweep = data.value.paymentSweep;
  if (!sweep) return "这个版本的服务端没有上报巡检状态。";
  const interval = Number(sweep.intervalSeconds || 0);
  const rounds = Number(sweep.rounds || 0);
  const failures = Number(sweep.consecutiveFailures || 0);
  const result = sweep.lastResult;
  const lastRun = result
    ? `上一轮：查单 ${num(result.queried)} · 入账 ${num(result.settled)} · 关单 ${num(result.closed)} · 失败 ${num(result.failed)}`
    : "";
  let text: string;
  if (sweep.health === "disabled") {
    text =
      "站点配置里把巡检间隔设成了 0，也就是关掉了：付了款但异步通知丢掉的订单不会再被认领，超时订单的渠道交易也不会被关闭。";
  } else if (sweep.health === "stopped") {
    text =
      "巡检循环已经退出，但服务还在运行。这段时间里没有任何订单在被对账。请重启服务，并确认日志里没有反复出现的巡检异常。";
  } else if (sweep.health === "pending") {
    text = "巡检循环还没跑完第一轮（首轮会稍作延后，避免启动瞬间去抢数据库）。稍后刷新即可。";
  } else if (sweep.health === "never") {
    text = `本进程启动后已经跑了 ${num(rounds)} 轮，一次都没成功，最近一次错误：${sweep.lastError || "（没有记录）"}`;
  } else if (sweep.health === "failing") {
    text = `最近一次成功在 ${humanAge(sweep.secondsSinceSuccess)}，之后连续失败 ${num(failures)} 轮，最近一次错误：${sweep.lastError || "（没有记录）"}`;
  } else {
    text = sweep.lastSuccessAt
      ? `最近一次成功 ${humanAge(sweep.secondsSinceSuccess)}，已跑 ${num(rounds)} 轮。${lastRun}`
      : `已跑 ${num(rounds)} 轮。${lastRun}`;
  }
  if (interval > 0 && sweep.health !== "disabled" && sweep.health !== "stopped") {
    text += `（间隔 ${interval} 秒）`;
  }
  return text;
});

const incidentsPill = computed(() => {
  const incidents = data.value.incidents;
  if (!incidents) return { text: "未知", cls: "hb-tag hb-tag--warning" };
  const total = Number(incidents.total || 0);
  return {
    text: total ? `${num(total)} 次` : "无异常",
    cls: `hb-tag ${total ? "hb-tag--danger" : "hb-tag--success"}`,
  };
});

const incidentsDetail = computed(() => {
  const incidents = data.value.incidents;
  if (!incidents) return "这个版本的服务端没有上报异常计数。";
  const total = Number(incidents.total || 0);
  const kinds = incidents.kinds || [];
  if (!total) {
    const clearedNote = incidents.clearedAt
      ? `上次确认在 ${humanAge((Date.now() - Date.parse(incidents.clearedAt)) / 1000)}（当时 ${num(incidents.clearedTotal)} 次）`
      : "本进程启动以来没有出现过。";
    return (
      `${clearedNote}这些异常会被服务刻意吞掉：对账失败不能把用户的支付页打成 500，` +
      "入账后履约失败不能给渠道回失败（否则渠道会无限重推）。所以它们不会体现在任何报错里，只能靠这里看。"
    );
  }
  const lines = kinds.map((item) => {
    const when = item.lastAt ? humanAge((Date.now() - Date.parse(item.lastAt)) / 1000) : "（无时间记录）";
    const order = item.lastOrderNo ? `订单 ${item.lastOrderNo}` : "（没有关联订单）";
    const error = item.lastError || "（没有记录错误信息）";
    return `${item.label} ${num(item.count)} 次，最近一次 ${when}，${order}：${error}`;
  });
  return (
    `${lines.join("；")}。这些异常不会让接口报错：钱可能已经收到，` +
    "但发码 / 查单没有走完。请到「订单」里按状态 fulfillment_failed 处理（重试履约或退款）。"
  );
});

const incidentsTotal = computed(() => Number(data.value.incidents?.total || 0));

const revenueCards = computed<StatCard[]>(() => {
  const revenue = data.value.revenue || {};
  const manualNote = revenue.totalManualCents
    ? ` · 人工补记 ${money(revenue.totalManualCents)} 不计营收`
    : "";
  return [
    {
      label: "净营收（累计）",
      value: money(revenue.totalCents ?? 0),
      note: `收款 ${money(revenue.totalGrossCents ?? 0)} · 退款 ${money(revenue.totalRefundCents ?? 0)}${manualNote}`,
      tone: "is-tone-amber",
    },
    ...(revenue.windows || []).map((bucket) => ({
      label: REVENUE_WINDOW_LABELS[bucket.key] || bucket.key,
      value: money(bucket.netCents),
      note:
        `${bucket.paidOrders} 单付款` +
        (bucket.manualOrders ? ` · 人工补记 ${bucket.manualOrders} 单不计营收` : ""),
      tone: "is-tone-amber",
    })),
  ];
});

const funnel = computed(() => data.value.orderFunnel || []);
const maxCount = computed(() => Math.max(1, ...funnel.value.map((item) => Number(item.count || 0))));

const todos = computed(() => {
  const attention = data.value.attention || {};
  return TODOS.filter((todo) => Number(attention[todo.key] || 0) > 0);
});

const stock = computed(() => data.value.lowStockProducts || []);
const expiring = computed(() => data.value.expiringLicenses || []);
const expiringWindow = computed(() => Number(data.value.attention?.expiringWindowDays || 30));

const totalCards = computed<StatCard[]>(() => {
  const referral = data.value.referral || {};
  const pointsTotal = Number(referral.balancePoints || 0);
  const payload = data.value;
  return [
    { label: "账号", value: num(payload.accounts), note: "", tone: "is-tone-blue" },
    { label: "商品", value: num(payload.products), note: "", tone: "is-tone-violet" },
    { label: "有效授权", value: `${num(payload.activeLicenses)}/${num(payload.licenses)}`, note: "", tone: "is-tone-accent" },
    { label: "权限项", value: `${num(payload.activeEntitlements)}/${num(payload.entitlements)}`, note: "", tone: "is-tone-violet" },
    { label: "待支付订单", value: num(payload.pendingOrders), note: "", tone: payload.pendingOrders ? "is-alert" : "is-tone-accent" },
    { label: "已履约订单", value: num(payload.fulfilledOrders), note: "", tone: "is-tone-emerald" },
    { label: "在线设备", value: num(payload.deviceBindings), note: "", tone: "is-tone-accent" },
    {
      label: "积分负债",
      value: num(pointsTotal),
      note: `可用 ${num(referral.availablePoints)} · 冻结 ${num(referral.frozenPoints)}`,
      tone: "is-tone-blue",
    },
    {
      label: "维护模式",
      value: payload.maintenanceMode ? "开启" : "关闭",
      note: payload.maintenanceMode ? "前台已拦截下单" : "前台正常营业",
      tone: payload.maintenanceMode ? "is-danger" : "is-tone-emerald",
    },
  ];
});

const stamp = computed(() => `数据时间 ${dt(data.value.serverTime)}`);

async function load() {
  loading.value = true;
  try {
    data.value = (await adminApi("/overview")) as OverviewPayload;
    admin.setNavBadge("orders", data.value.pendingOrders);
    admin.setNavBadge("withdrawals", data.value.pendingWithdrawals);
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    loading.value = false;
  }
}

function jump(target: OverviewJump) {
  void router.push({
    path: `/admin/${target.page}${target.tab ? `/${target.tab}` : ""}`,
    query: target.query || {},
  });
}

async function toggleMaintenance() {
  try {
    const current = await adminApi<{ store?: { maintenanceMode?: boolean } }>("/settings");
    const next = !current.store?.maintenanceMode;
    await adminApi("/settings", { method: "PUT", body: JSON.stringify({ maintenanceMode: next }) });
    toast.push(next ? "已开启维护模式" : "已关闭维护模式");
    await load();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function recomputeStock() {
  const ok = await confirm.confirm({
    title: "重算库存预留",
    message: "将按当前仍占用库存的订单（待支付 / 已付款）重算每个商品的预留数。",
    detail:
      "这是一次<b>覆盖式修正</b>：只改「预留数」这个统计值，不动库存总量，也不会改动任何订单。",
    confirmLabel: "重算",
    tone: "warning",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ updated?: number; detail?: string }>("/maintenance/recompute-stock", {
      method: "POST",
      body: JSON.stringify({}),
    });
    toast.push(
      result.updated
        ? `已修正 ${result.updated} 个商品的预留数：${result.detail}`
        : "库存预留本来就是准的，无需修正",
      result.updated ? "success" : "warning",
    );
    await load();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function recomputeCoupons() {
  const ok = await confirm.confirm({
    title: "重算优惠码核销数",
    message: "将按优惠码核销记录重算每个码的「已核销」数量。",
    detail:
      "这是一次<b>覆盖式修正</b>：只改「已核销」这个统计值，不动优惠码本身，也不会改动任何订单。",
    confirmLabel: "重算",
    tone: "warning",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ updated?: number; detail?: string }>("/maintenance/recompute-coupons", {
      method: "POST",
      body: JSON.stringify({}),
    });
    toast.push(
      result.updated
        ? `已修正 ${result.updated} 个优惠码的核销数：${result.detail}`
        : "核销数本来就是准的，无需修正",
      result.updated ? "success" : "warning",
    );
    await load();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function ackIncidents() {
  const ok = await confirm.confirm({
    title: "确认已处理",
    message: "把「入账异常」计数清零。清零前会记进审计日志（谁确认的、确认掉了几次）。",
    detail:
      "这只是把计数器归零：<b>不会</b>修复任何订单。请先确认那些「入账后履约失败」的订单" +
      "已经重试发码或退款，否则真正的失败就不再显眼了。",
    confirmLabel: "清零计数",
    tone: "warning",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ cleared?: number; detail?: string; incidents?: Incidents }>(
      "/incidents/ack",
      { method: "POST", body: JSON.stringify({}) },
    );
    toast.push(
      result.cleared ? `已清零 ${result.cleared} 次异常计数：${result.detail}` : "本来就没有异常计数",
      result.cleared ? "success" : "warning",
    );
    if (result.incidents !== undefined) data.value = { ...data.value, incidents: result.incidents };
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

onMounted(load);
</script>

<template>
  <section class="admin-panel active" data-domain="operations">
    <PanelHead title="运营概览" desc="营收、订单漏斗、待办与风险项目的经营看板" domain="运营">
      <span class="overview-stamp">{{ stamp }}</span>
      <button class="hb-button hb-button--secondary hb-button--sm" :disabled="loading" @click="load">刷新</button>
    </PanelHead>

    <AdminTabs label="概览分区" :tabs="tabs" :active="active" @pick="pick" />

    <div class="admin-tab-pane" :hidden="active !== 'dashboard'" role="tabpanel">
      <div class="hb-card">
        <div class="hb-card__head">
          <h3>营收</h3>
          <p>按<b>付款时间</b>归属；净营收 = 实付合计 − 已退款。时间窗是滚动的（近 24 小时 / 近 7 天 / 近 30 天），与服务端时区无关。</p>
        </div>
        <div class="hb-card__body">
          <div class="stat-grid">
            <div v-for="card in revenueCards" :key="card.label" class="stat" :class="card.tone">
              <span class="stat__label">{{ card.label }}</span>
              <strong class="stat__value" :class="valueSize(card.value).trim()" :title="card.value">{{ card.value }}</strong>
              <span v-if="card.note" class="stat__note">{{ card.note }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="hb-card">
        <div class="hb-card__head">
          <h3>订单漏斗</h3>
          <p>各状态订单数与金额合计（含未付款订单，所以金额不等于营收）</p>
        </div>
        <div class="hb-card__body">
          <div class="funnel-grid">
            <button
              v-for="item in funnel"
              :key="item.status"
              class="funnel-item"
              :class="STATUS_HUES[item.status]"
              type="button"
              @click="jump({ page: 'orders', query: { status_filter: item.status } })"
            >
              <span class="funnel-item__top">
                <span class="funnel-item__label">{{ item.label }}</span>
                <span class="funnel-item__count">{{ item.count }}</span>
              </span>
              <span class="funnel-item__track">
                <span class="funnel-item__fill" :style="{ width: `${Math.round((Number(item.count || 0) / maxCount) * 100)}%` }"></span>
              </span>
              <span class="funnel-item__amount">{{ money(item.amountCents) }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="hb-card">
        <div class="hb-card__head">
          <h3>累计</h3>
          <p>站点开通至今的总量。营收为净营收（已减退款）</p>
        </div>
        <div class="hb-card__body">
          <div class="stat-grid">
            <div v-for="card in totalCards" :key="card.label" class="stat" :class="card.tone">
              <span class="stat__label">{{ card.label }}</span>
              <strong class="stat__value" :class="valueSize(card.value).trim()" :title="card.value">{{ card.value }}</strong>
              <span v-if="card.note" class="stat__note">{{ card.note }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="admin-tab-pane" :hidden="active !== 'risk'" role="tabpanel">
      <div class="hb-card">
        <div class="hb-card__body">
          <div class="setting-row">
            <div>
              <strong>支付巡检 <span :class="sweepPill.cls">{{ sweepPill.text }}</span></strong>
              <p>{{ sweepDetail }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="hb-card">
        <div class="hb-card__body">
          <div class="setting-row">
            <div>
              <strong>入账异常 <span :class="incidentsPill.cls">{{ incidentsPill.text }}</span></strong>
              <p>{{ incidentsDetail }}</p>
            </div>
            <button
              v-if="incidentsTotal > 0"
              class="hb-button hb-button--secondary hb-button--sm"
              @click="ackIncidents"
            >
              确认已处理
            </button>
          </div>
        </div>
      </div>

      <div v-if="todos.length" class="hb-card overview-todos">
        <div class="hb-card__head">
          <h3>需要处理</h3>
          <p>点任意一项跳到对应列表并带好筛选条件</p>
        </div>
        <div class="hb-card__body">
          <div class="overview-todos__grid">
            <button
              v-for="todo in todos"
              :key="todo.key"
              class="overview-todo"
              :class="todo.tone"
              type="button"
              @click="jump(todo.jump)"
            >
              <span class="overview-todo__count">{{ Number(data.attention?.[todo.key] || 0) }}</span>
              <span class="overview-todo__label">{{ todo.label }}</span>
              <span class="overview-todo__hint">{{ todo.hint }}</span>
            </button>
          </div>
        </div>
      </div>

      <div class="overview-cols">
        <div class="hb-card">
          <div class="hb-card__head">
            <h3>库存预警</h3>
            <p>可售 = 库存 − 已占用预留；已售罄或即将售罄的商品排在最前</p>
          </div>
          <div class="table-wrap">
            <table class="hb-table">
              <thead><tr><th>商品</th><th class="nowrap">库存</th><th class="nowrap">预留</th><th class="nowrap">可售</th></tr></thead>
              <tbody>
                <tr v-for="(item, index) in stock" :key="index">
                  <td>{{ item.name }}</td>
                  <td class="is-mono">{{ num(item.stockQuantity) }}</td>
                  <td class="is-mono">{{ num(item.reservedStock) }}</td>
                  <td>
                    <span class="hb-tag" :class="Number(item.availableStock || 0) <= 0 ? 'hb-tag--danger' : 'hb-tag--warning'">
                      <b>{{ Number(item.availableStock || 0) }}</b>
                    </span>
                  </td>
                </tr>
                <tr v-if="!stock.length">
                  <td colspan="4"><div class="table-empty"><span>◌</span>没有设置库存的商品，或库存都很充足。</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="hb-card">
          <div class="hb-card__head">
            <h3>30 天内到期授权</h3>
            <p>永久授权不在其中；列出最近到期的 20 条，供提前提醒续费</p>
          </div>
          <div class="table-wrap">
            <table class="hb-table">
              <thead><tr><th>授权</th><th>商品</th><th class="nowrap">到期</th></tr></thead>
              <tbody>
                <tr v-for="(item, index) in expiring" :key="index">
                  <td class="is-mono">{{ item.codeHint || item.activationCodeId }}</td>
                  <td>{{ item.productName }}</td>
                  <td class="nowrap">{{ d(item.accessExpiresAt) }}</td>
                </tr>
                <tr v-if="!expiring.length">
                  <td colspan="3"><div class="table-empty"><span>◌</span>未来 {{ expiringWindow }} 天内没有到期的授权。</div></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div class="admin-tab-pane" :hidden="active !== 'tools'" role="tabpanel">
      <div class="hb-card">
        <div class="hb-card__body">
          <div class="setting-row">
            <div>
              <strong>维护模式</strong>
              <p>开启后商店前台显示维护遮罩，下单会被拒绝。</p>
            </div>
            <button class="hb-button hb-button--danger hb-button--sm" @click="toggleMaintenance">切换维护模式</button>
          </div>
          <div class="setting-row">
            <div>
              <strong>重算库存预留</strong>
              <p>按「仍占用库存的订单」重新统计各商品的预留数。历史版本曾重复扣减预留，
              导致可用库存虚低甚至误报售罄；发现库存数字对不上时点这里修正。</p>
            </div>
            <button class="hb-button hb-button--secondary hb-button--sm" @click="recomputeStock">重算库存预留</button>
          </div>
          <div class="setting-row">
            <div>
              <strong>重算优惠码核销数</strong>
              <p>按优惠码核销记录重新统计各码的「已核销」数。名额计数是快照，改过名额、
              释放过订单或历史版本重复占用时可能与真实情况对不上，发现数字不对点这里修正。</p>
            </div>
            <button class="hb-button hb-button--secondary hb-button--sm" @click="recomputeCoupons">重算优惠码核销数</button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
