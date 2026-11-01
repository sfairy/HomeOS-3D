<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import PanelHead from "@store/features/admin/components/PanelHead.vue";
import DataTable from "@store/features/admin/components/DataTable.vue";
import RowMenu from "@store/features/admin/components/RowMenu.vue";
import StatusPill from "@store/features/admin/components/StatusPill.vue";
import { adminApi } from "@store/shared/api/http";
import { asListItems, errorMessage } from "@store/shared/types/store";
import { useToastStore } from "@store/shared/stores/toast";
import { useConfirmStore } from "@store/shared/stores/confirm";
import { useAdminDialogsStore } from "@store/features/admin/stores/adminDialogs";
import { useAdminRefreshStore } from "@store/features/admin/stores/adminRefresh";
import { dayEndUtc, dayStartUtc, dt, money } from "@store/features/admin/utils/format";
import { LICENSE_ACTION, ORDER_TYPE } from "@store/features/admin/utils/vocab";

interface OrderStatusMeta {
  choices: string[];
  labels: Record<string, string>;
  fulfillable: string[];
  refundable: string[];
}

interface AdminOrder {
  orderNo: string;
  email?: string;
  productName?: string;
  orderType?: string;
  licenseAction?: string;
  amountCents: number;
  /** 累计已退金额（后端 order_payload 的 refundAmountCents） */
  refundAmountCents?: number;
  /** 剩余可退金额（后端算好的可退余额，已被「已退」扣减） */
  refundableCents?: number;
  paymentProvider?: string;
  paymentProviderLabel?: string;
  status?: string;
  statusLabel?: string;
  createdAt?: string;
  paidAt?: string | null;
  needsReview?: boolean;
  licenseId?: string | null;
  targetLicenseModified?: boolean;
  channelPayable?: boolean;
  manualSettlement?: boolean;
  [key: string]: unknown;
}

const COLUMNS = [
  { key: "orderNo", label: "订单号" },
  { key: "email", label: "邮箱", nowrap: true },
  { key: "productName", label: "商品" },
  { key: "orderType", label: "类型" },
  { key: "amountCents", label: "金额", nowrap: true },
  { key: "refund", label: "已退 / 可退", nowrap: true },
  { key: "provider", label: "支付渠道", nowrap: true },
  { key: "status", label: "状态", nowrap: true },
  { key: "createdAt", label: "创建", nowrap: true },
  { key: "actions", label: "操作", nowrap: true },
];

const route = useRoute();
const toast = useToastStore();
const confirm = useConfirmStore();
const dialogs = useAdminDialogsStore();
const refresh = useAdminRefreshStore();

const table = ref<InstanceType<typeof DataTable> | null>(null);
const statusMeta = ref<OrderStatusMeta | null>(null);

const status = ref(String(route.query.status_filter || ""));
const keyword = ref(String(route.query.keyword || ""));
const dateFrom = ref("");
const dateTo = ref("");
const reviewOnly = ref(String(route.query.needs_review || "") === "true");

const params = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (status.value) next.status_filter = status.value;
  if (keyword.value.trim()) next.keyword = keyword.value.trim();
  const from = dayStartUtc(dateFrom.value);
  const to = dayEndUtc(dateTo.value);
  if (from) next.date_from = from;
  if (to) next.date_to = to;
  if (reviewOnly.value) next.needs_review = "true";
  return next;
});

const statusOptions = computed(() =>
  (statusMeta.value?.choices || []).map((code) => ({
    code,
    label: statusMeta.value?.labels?.[code] || code,
  })),
);

async function loadMeta() {
  try {
    statusMeta.value = await adminApi<OrderStatusMeta>("/order-status-meta");
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

function canMarkPaid(order: AdminOrder) {
  const meta = statusMeta.value;
  return Boolean(meta?.fulfillable.includes(order.status || "")) && !order.paidAt;
}
function canFulfill(order: AdminOrder) {
  return Boolean(statusMeta.value?.fulfillable.includes(order.status || ""));
}
function canRefund(order: AdminOrder) {
  return Boolean(statusMeta.value?.refundable.includes(order.status || ""));
}
function canCancel(order: AdminOrder) {
  return order.status === "pending";
}
function canReview(order: AdminOrder) {
  return Boolean(order.needsReview) && order.status !== "pending";
}
function isTerminal(order: AdminOrder) {
  return ["cancelled", "expired"].includes(order.status || "");
}
function untouchedLicense(order: AdminOrder) {
  return !order.licenseId && !order.targetLicenseModified;
}
function canDelete(order: AdminOrder) {
  return isTerminal(order) && untouchedLicense(order) && !order.channelPayable;
}
function deleteHeldByChannel(order: AdminOrder) {
  return isTerminal(order) && untouchedLicense(order) && Boolean(order.channelPayable);
}

function providerLabel(order: AdminOrder) {
  const raw = String(order.paymentProvider || "").trim();
  if (!raw) return "";
  return order.paymentProviderLabel || raw;
}
function providerKnown(order: AdminOrder) {
  return ["alipay", "wechat"].includes(String(order.paymentProvider || "").toLowerCase());
}

function reset() {
  status.value = "";
  keyword.value = "";
  dateFrom.value = "";
  dateTo.value = "";
  reviewOnly.value = false;
  void table.value?.search();
}

async function reload() {
  await table.value?.search();
}

async function settleOffline(order: AdminOrder) {
  const ok = await confirm.confirm({
    title: "线下收款入账",
    message: `确认订单 ${order.orderNo} 的款项已经收到（银行转账 / 现金等）？`,
    detail:
      "这笔金额将<b>计入营收</b>，并记录操作人。" +
      "若钱还没到账、只是先把订单放行，请改用<b>标记支付</b> —— 那样照常发码但不计营收。",
    tone: "warning",
    confirmLabel: "确认已收到钱",
  });
  if (!ok) return;
  try {
    await adminApi(`/orders/${order.orderNo}/settle-offline`, { method: "POST", body: JSON.stringify({}) });
    toast.push("已按线下收款入账");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function markReview(order: AdminOrder) {
  const ok = await confirm.confirm({
    title: "标记复核完成",
    message: `确认订单 ${order.orderNo} 的待复核事项已处理？`,
    detail: "清除后台概览页的待办提醒，并记录处理时间与操作人。<b>不影响</b>订单与授权本身。",
    tone: "success",
    confirmLabel: "标记已处理",
  });
  if (!ok) return;
  try {
    await adminApi(`/orders/${order.orderNo}/review`, {
      method: "POST",
      body: JSON.stringify({ note: "后台标记为已处理" }),
    });
    toast.push("已标记为处理完成");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function removeOrder(order: AdminOrder) {
  const ok = await confirm.confirm({
    title: "删除订单",
    message: `将彻底删除订单 ${order.orderNo}。仅限已取消/已过期且没有产生授权的订单。`,
    confirmLabel: "删除",
  });
  if (!ok) return;
  try {
    await adminApi(`/orders/${order.orderNo}`, { method: "DELETE" });
    toast.push("订单已删除");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function cancelOrder(order: AdminOrder) {
  const ok = await confirm.confirm({
    title: "取消订单",
    message: `确认取消订单 ${order.orderNo}？取消后会释放占用的库存。`,
    detail: "取消后该订单才会变成可<b>删除</b>的终态。",
    confirmLabel: "取消订单",
  });
  if (!ok) return;
  try {
    await adminApi(`/orders/${order.orderNo}/cancel`, {
      method: "POST",
      body: JSON.stringify({ note: "后台操作" }),
    });
    toast.push("订单已取消");
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function markPaid(order: AdminOrder) {
  const ok = await confirm.confirm({
    title: "标记支付",
    message: `确认订单 ${order.orderNo} 已支付并放行？`,
    detail:
      "订单照常发码 / 进入待履约，但<b>不计入营收</b>（营收只统计渠道确认收款" +
      "与人工线下入账）。若这笔钱确实已经收到（转账 / 现金），" +
      "请改用 ⋯ 菜单里的<b>线下收款入账</b>。",
    tone: "warning",
    confirmLabel: "标记支付（不计营收）",
  });
  if (!ok) return;
  await runAction(order, "mark-paid", "标记支付（不计营收）");
}

async function fulfill(order: AdminOrder) {
  await runAction(order, "fulfill", "履约");
}

async function refund(order: AdminOrder) {
  const provider = String(order.paymentProvider || "").toLowerCase();
  const offline = !["alipay", "wechat"].includes(provider);
  const totalCents = Number(order.amountCents || 0);
  const refundedCents = Number(order.refundAmountCents || 0);
  const refundable = Number(order.refundableCents ?? Math.max(0, totalCents - refundedCents));
  // 金额必须由操作者确认：后端在 amountCents 缺省时按「可退余额」全额退款，
  // 固定发 {note} 等于把部分退款能力藏起来，每次点退款都是全额。
  const decision = await dialogs.askRefund({
    orderNo: order.orderNo,
    totalCents,
    refundedCents,
    refundableCents: refundable,
    offline,
  });
  if (!decision) return;
  await runAction(order, "refund", offline ? "按线下退款记账" : "退款", {
    // 免费订单（0 元）不传金额：schema 要求 amountCents > 0，后端自己按 0 元处理
    ...(decision.amountCents > 0 ? { amountCents: decision.amountCents } : {}),
    offline,
    note: decision.note || (offline ? "后台线下退款" : "后台操作"),
  });
}

async function runAction(
  order: AdminOrder,
  action: string,
  label: string,
  extra: Record<string, unknown> = {},
) {
  try {
    await adminApi(`/orders/${order.orderNo}/${action}`, {
      method: "POST",
      body: JSON.stringify({ note: "后台操作", ...extra }),
    });
    toast.push(`订单已${label}`);
    refresh.bump("overview");
    await reload();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

loadMeta();
</script>

<template>
  <section class="admin-panel active" data-domain="operations">
    <PanelHead
      title="订单"
      desc="待支付可取消；已支付请走退款；已取消/已过期且未发码的订单可删除"
      domain="运营"
    />

    <div class="panel-toolbar">
      <select v-model="status" class="hb-select" aria-label="按订单状态筛选">
        <option value="">全部状态</option>
        <option v-for="option in statusOptions" :key="option.code" :value="option.code">
          {{ option.label }}
        </option>
      </select>
      <input v-model="keyword" class="hb-input" aria-label="订单号或邮箱关键字" placeholder="订单号 / 邮箱" />
      <label class="hb-field panel-toolbar__field">
        <span class="panel-toolbar__label">下单时间</span>
        <input v-model="dateFrom" class="hb-input" type="date" aria-label="下单时间起" />
      </label>
      <span class="panel-toolbar__sep">–</span>
      <label class="hb-field panel-toolbar__field">
        <span class="panel-toolbar__label">至</span>
        <input v-model="dateTo" class="hb-input" type="date" aria-label="下单时间止" />
      </label>
      <label class="hb-check"><input v-model="reviewOnly" type="checkbox" /> 仅待人工复核</label>
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reload">查询</button>
      <button class="hb-button hb-button--ghost hb-button--sm" @click="reset">重置</button>
    </div>

    <DataTable
      ref="table"
      path="/orders"
      :columns="COLUMNS"
      :params="params"
      empty-text="没有符合条件的订单"
    >
      <template #default="{ items }">
        <tr v-for="order in asListItems<AdminOrder>(items)" :key="order.orderNo">
          <td class="mono">
            <span :title="order.orderNo">{{ order.orderNo }}</span>
          </td>
          <td class="nowrap">
            <span v-if="order.email" :title="order.email">{{ order.email }}</span>
            <template v-else>—</template>
          </td>
          <td>
            <span v-if="order.productName" :title="order.productName">{{ order.productName }}</span>
            <template v-else>—</template>
          </td>
          <td class="nowrap">
            {{ ORDER_TYPE[order.orderType || ""] || order.orderType }} · {{ LICENSE_ACTION[order.licenseAction || ""] || order.licenseAction }}
          </td>
          <td class="nowrap">{{ money(order.amountCents) }}</td>
          <td class="nowrap">
            <span v-if="(order.refundAmountCents || 0) > 0">已退 {{ money(order.refundAmountCents || 0) }}</span>
            <span v-else>—</span>
            <span> · 可退 {{ money(order.refundableCents ?? 0) }}</span>
          </td>
          <td class="nowrap">
            <span
              v-if="order.paymentProvider"
              class="hb-chip"
              :data-tone="providerKnown(order) ? undefined : 'warning'"
              :title="providerKnown(order) ? String(order.paymentProvider) : `不是当前受支持的渠道：${order.paymentProvider}`"
            >
              {{ providerLabel(order) }}
            </span>
            <span v-else class="hb-chip" title="这笔订单没有渠道信息">—</span>
          </td>
          <td class="nowrap">
            <StatusPill :status="order.status" :label="order.statusLabel" />
            <span
              v-if="order.manualSettlement"
              class="hb-chip"
              data-tone="warning"
              title="人工补记：钱未经渠道确认，不计入营收"
            >人工补记</span>
          </td>
          <td class="nowrap">{{ dt(order.createdAt) }}</td>
          <td class="nowrap">
            <div class="row-actions">
              <button
                v-if="canMarkPaid(order)"
                class="hb-button hb-button--primary hb-button--sm"
                @click="markPaid(order)"
              >
                标记支付
              </button>
              <button
                v-else-if="canFulfill(order)"
                class="hb-button hb-button--secondary hb-button--sm"
                @click="fulfill(order)"
              >
                履约
              </button>
              <RowMenu>
                <button v-if="canFulfill(order) && canMarkPaid(order)" class="menu__item" type="button" @click="fulfill(order)">履约</button>
                <button v-if="canMarkPaid(order)" class="menu__item" type="button" @click="settleOffline(order)">线下收款入账</button>
                <button v-if="canRefund(order)" class="menu__item is-danger" type="button" @click="refund(order)">退款</button>
                <button v-if="canCancel(order)" class="menu__item" type="button" @click="cancelOrder(order)">取消订单</button>
                <button v-if="canReview(order)" class="menu__item" type="button" @click="markReview(order)">标记已处理</button>
                <button v-if="canDelete(order)" class="menu__item is-danger" type="button" @click="removeOrder(order)">删除订单</button>
                <p v-else-if="deleteHeldByChannel(order)" class="menu__note">渠道交易未关闭，暂不可删除</p>
              </RowMenu>
            </div>
          </td>
        </tr>
      </template>
    </DataTable>
  </section>
</template>
