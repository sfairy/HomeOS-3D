<script setup lang="ts">
/** 诊断数据面板：会话、令牌与解绑、登录与验证码、优惠码核销。 */

import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import DataTable from "../../components/admin/DataTable.vue";
import { adminApi } from "../../api/http.js";
import { asListItems, errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useConfirmStore } from "../../stores/confirm.js";
import { useAdminDialogsStore } from "../../stores/adminDialogs.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import { dt, money, num } from "../../utils/format.js";

interface Column {
  key: string;
  label: string;
  nowrap?: boolean;
}

const COLUMNS: Record<string, Column[]> = {
  sessions: [
    { key: "ref", label: "令牌提示", nowrap: true },
    { key: "account", label: "账号" },
    { key: "kind", label: "类型", nowrap: true },
    { key: "ip", label: "IP" },
    { key: "lastSeenAt", label: "最近活动", nowrap: true },
    { key: "expiresAt", label: "到期", nowrap: true },
    { key: "state", label: "状态", nowrap: true },
    { key: "actions", label: "操作", nowrap: true },
  ],
  licenseSessions: [
    { key: "ref", label: "会话提示", nowrap: true },
    { key: "code", label: "激活码", nowrap: true },
    { key: "instanceId", label: "实例 ID" },
    { key: "binding", label: "绑定状态", nowrap: true },
    { key: "lastUsedAt", label: "最近使用", nowrap: true },
    { key: "expiresAt", label: "到期", nowrap: true },
    { key: "actions", label: "操作", nowrap: true },
  ],
  recoveryTokens: [
    { key: "ref", label: "令牌提示", nowrap: true },
    { key: "code", label: "激活码", nowrap: true },
    { key: "instanceId", label: "实例 ID" },
    { key: "createdAt", label: "签发时间", nowrap: true },
    { key: "expiresAt", label: "到期", nowrap: true },
    { key: "state", label: "状态", nowrap: true },
    { key: "actions", label: "操作", nowrap: true },
  ],
  attempts: [
    { key: "createdAt", label: "时间", nowrap: true },
    { key: "scope", label: "范围" },
    { key: "result", label: "结果", nowrap: true },
  ],
  verifications: [
    { key: "createdAt", label: "时间", nowrap: true },
    { key: "email", label: "邮箱" },
    { key: "purpose", label: "用途", nowrap: true },
    { key: "attempts", label: "尝试次数", nowrap: true },
    { key: "consumed", label: "已使用", nowrap: true },
    { key: "expiresAt", label: "到期", nowrap: true },
    { key: "state", label: "状态", nowrap: true },
  ],
  releaseEvents: [
    { key: "createdAt", label: "时间", nowrap: true },
    { key: "code", label: "激活码", nowrap: true },
    { key: "instanceId", label: "实例 ID" },
    { key: "source", label: "来源", nowrap: true },
  ],
  redemptions: [
    { key: "createdAt", label: "时间", nowrap: true },
    { key: "couponCode", label: "优惠码", nowrap: true },
    { key: "account", label: "账号" },
    { key: "discount", label: "抵扣", nowrap: true },
    { key: "order", label: "订单" },
    { key: "quota", label: "名额", nowrap: true },
    { key: "actions", label: "操作", nowrap: true },
  ],
};

type ListKey =
  | "sessions"
  | "licenseSessions"
  | "recoveryTokens"
  | "attempts"
  | "verifications"
  | "releaseEvents"
  | "redemptions";

const PURGE_SPECS: Record<
  string,
  { key: ListKey; path: string; message: string; impact: string }
> = {
  sessions: {
    key: "sessions",
    path: "/sessions",
    message: "将删除这些天以前就已经失效的登录会话（后台与商店前台）。",
    impact:
      "只删 <b>到期时间早于截止时间</b> 的会话，也就是早就登不进去的记录；仍在有效期内的会话一条都不会动，没人会被踢下线。",
  },
  "license-sessions": {
    key: "licenseSessions",
    path: "/license-sessions",
    message: "将删除这些天以前就已经失效的客户端会话。",
    impact:
      "只删 <b>到期时间早于截止时间</b> 的会话记录（客户端侧早已重新激活）。未过期的会话保留，在线客户端不受影响。",
  },
  "recovery-tokens": {
    key: "recoveryTokens",
    path: "/recovery-tokens",
    message: "将删除这些天以前就已经失效的设备找回令牌。",
    impact: "只删<b>已过期</b>的令牌。仍在有效期内的找回令牌保留，否则用户换机时会凭空失败。",
  },
  "login-attempts": {
    key: "attempts",
    path: "/login-attempts",
    message: "将删除这些天以前的登录尝试记录。",
    impact: "纯日志，删掉不影响任何判定。但排查「是不是被撞库了」靠的正是翻这些记录，建议至少保留 30 天。",
  },
  "email-verifications": {
    key: "verifications",
    path: "/email-verifications",
    message: "将删除这些天以前的邮箱验证码记录。",
    impact:
      "只删<b>已消费或已过期</b>的验证码；仍在有效期内、还没被用过的验证码一律保留，否则用户正在走的注册/改密流程会凭空失败。",
  },
  "device-release-events": {
    key: "releaseEvents",
    path: "/device-release-events",
    message: "将删除这些天以前的设备解绑记录。",
    impact:
      "自助解绑的冷却判定读的是「每条授权最近一次解绑时间」，所以<b>每条授权的最新一条永远保留</b>，只有历史记录会被清掉。",
  },
};

const route = useRoute();
const router = useRouter();
const toast = useToastStore();
const confirm = useConfirmStore();
const dialogs = useAdminDialogsStore();
const refresh = useAdminRefreshStore();

const sessionTable = ref<InstanceType<typeof DataTable> | null>(null);
const licenseSessionTable = ref<InstanceType<typeof DataTable> | null>(null);
const recoveryTokenTable = ref<InstanceType<typeof DataTable> | null>(null);
const attemptTable = ref<InstanceType<typeof DataTable> | null>(null);
const verificationTable = ref<InstanceType<typeof DataTable> | null>(null);
const releaseEventTable = ref<InstanceType<typeof DataTable> | null>(null);
const redemptionTable = ref<InstanceType<typeof DataTable> | null>(null);

const tables: Record<ListKey, typeof sessionTable> = {
  sessions: sessionTable,
  licenseSessions: licenseSessionTable,
  recoveryTokens: recoveryTokenTable,
  attempts: attemptTable,
  verifications: verificationTable,
  releaseEvents: releaseEventTable,
  redemptions: redemptionTable,
};

const tabs: AdminTabItem[] = [
  { key: "sessions", label: "登录会话" },
  { key: "tokens", label: "令牌与解绑" },
  { key: "logs", label: "登录与验证码" },
  { key: "redeem", label: "优惠码核销" },
];

const { active, pick } = useAdminTabs("diagnostics", computed(() => tabs));

const couponId = computed(() => String(route.query.coupon_id || ""));
const couponCode = computed(() => String(route.query.coupon_code || route.query.coupon_id || ""));

const redemptionParams = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {};
  if (couponId.value) next.coupon_id = couponId.value;
  return next;
});

async function reloadAll() {
  await Promise.all(
    Object.values(tables).map((table) => table.value?.search()),
  );
}

async function purge(key: string) {
  const spec = PURGE_SPECS[key];
  if (!spec) return;
  const days = await dialogs.askPurge({
    title: "清理历史数据",
    message: spec.message,
    impact: spec.impact,
  });
  if (days === null) return;
  try {
    const result = await adminApi<{ deleted?: number }>(`${spec.path}?older_than_days=${days}`, {
      method: "DELETE",
    });
    toast.push(
      result.deleted ? `已清理 ${result.deleted} 条` : "没有符合条件的记录，未做改动",
      result.deleted ? "success" : "warning",
    );
    await tables[spec.key].value?.search();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function revokeSession(row: Record<string, unknown>) {
  const ok = await confirm.confirm({
    title: "踢下线",
    message: `将撤销账号「${row.accountEmail || row.accountId}」的这一条登录会话。`,
    detail:
      "该会话对应的浏览器下次请求即失效、需要重新登录。<b>其他会话不受影响</b>；如果这就是你自己正在用的会话，你会立刻被登出。",
    confirmLabel: "踢下线",
    tone: "warning",
  });
  if (!ok) return;
  try {
    await adminApi(`/sessions/${encodeURIComponent(String(row.ref || ""))}`, { method: "DELETE" });
    toast.push("会话已撤销");
    await tables.sessions.value?.search();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function revokeLicenseSession(row: Record<string, unknown>) {
  const ok = await confirm.confirm({
    title: "撤销客户端会话",
    message: `将撤销激活码「${row.codeHint}」的这条客户端会话。`,
    detail: "该客户端下次心跳会收到「会话不存在」，需要重新激活。绑定关系本身保留。",
    confirmLabel: "撤销",
    tone: "warning",
  });
  if (!ok) return;
  try {
    await adminApi(`/license-sessions/${encodeURIComponent(String(row.ref || ""))}`, {
      method: "DELETE",
    });
    toast.push("客户端会话已撤销");
    await tables.licenseSessions.value?.search();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function revokeRecoveryToken(row: Record<string, unknown>) {
  const ok = await confirm.confirm({
    title: "作废找回令牌",
    message: `将作废激活码「${row.codeHint}」的一条找回令牌。`,
    detail: "持有该令牌的设备无法再凭它恢复绑定，需要走完整激活流程。此操作不可撤销。",
    confirmLabel: "作废",
    tone: "danger",
  });
  if (!ok) return;
  try {
    await adminApi(`/recovery-tokens/${encodeURIComponent(String(row.ref || ""))}`, {
      method: "DELETE",
    });
    toast.push("找回令牌已作废");
    await tables.recoveryTokens.value?.search();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

async function voidRedemption(row: Record<string, unknown>) {
  const ok = await confirm.confirm({
    title: "作废核销记录",
    message: `将作废「${row.couponCode}」的一条核销记录（账号 ${row.accountEmail || row.accountId}）。`,
    detail:
      "该账号会因此<b>重新获得一个名额</b>，优惠码的「已占用名额」也会重新统计。如果这条记录对应的订单还在成交状态，等于凭空放出了一个名额 —— 请只在重复核销、测试单或误发折扣时使用。记录本身会保留（标记为已作废），审计与对账仍可追溯。",
    confirmLabel: "作废",
    tone: "danger",
  });
  if (!ok) return;
  try {
    const result = await adminApi<{ alreadyVoided?: boolean; redeemedCount?: number }>(
      `/coupon-redemptions/${row.id}`,
      { method: "DELETE" },
    );
    toast.push(
      result.alreadyVoided
        ? "该记录此前已作废过"
        : `已作废，该优惠码当前占用 ${result.redeemedCount} 个名额`,
    );
    await tables.redemptions.value?.search();
    refresh.bump("coupons");
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  }
}

function clearCouponFilter() {
  void router.replace({ path: "/admin/diagnostics/redeem" });
}
</script>

<template>
  <section class="admin-panel active" data-domain="data">
    <PanelHead
      title="诊断数据"
      desc="排查「是不是被撞库了」「验证码发没发出去」「冷却该不该放行」时看这里。列表可翻页；日志类可按天数清理（只清过期或已消费的记录，当前有效的永不删）"
      domain="数据"
    >
      <button class="hb-button hb-button--secondary hb-button--sm" @click="reloadAll">刷新</button>
    </PanelHead>

    <div class="admin-tabs" role="tablist" aria-label="诊断数据分区">
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

    <div v-show="active === 'sessions'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">登录会话</h3>
          <p class="admin-block__hint">
            后台与商店前台的网页会话。可单条踢下线 —— 过去只能改密码或停用账号，那会连带踢掉该账号的全部会话。
          </p>
        </div>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="purge('sessions')">
          清理已过期…
        </button>
      </div>
      <DataTable ref="sessionTable" path="/sessions" :columns="COLUMNS.sessions" empty-text="暂无登录会话">
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="`${String(row.ref)}-${index}`">
            <td class="nowrap mono">{{ row.ref }}</td>
            <td>
              <span v-if="row.accountEmail || row.accountId" :title="String(row.accountEmail || row.accountId)">
                {{ row.accountEmail || row.accountId }}
              </span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              <span v-if="row.isAdminSession" class="pill pill--warning">管理员</span>
              <template v-else>用户</template>
            </td>
            <td>
              <span v-if="row.ipAddress" :title="String(row.ipAddress)">{{ row.ipAddress }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ dt(row.lastSeenAt) }}</td>
            <td class="nowrap">{{ dt(row.expiresAt) }}</td>
            <td class="nowrap">
              <span v-if="row.expired" class="pill pill--muted">已过期</span>
              <span v-else class="pill pill--success">有效</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="revokeSession(row)">
                  踢下线
                </button>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'sessions'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">客户端会话</h3>
          <p class="admin-block__hint">
            谁在用哪张授权。撤销后该客户端下次心跳会要求重新激活。这张表过去在后台完全没有入口。
          </p>
        </div>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="purge('license-sessions')">
          清理已过期…
        </button>
      </div>
      <DataTable
        ref="licenseSessionTable"
        path="/license-sessions"
        :columns="COLUMNS.licenseSessions"
        empty-text="暂无客户端会话"
      >
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="`${String(row.ref)}-${index}`">
            <td class="nowrap mono">{{ row.ref }}</td>
            <td class="nowrap mono">
              <span v-if="row.codeHint" :title="String(row.codeHint)">{{ row.codeHint }}</span>
              <template v-else>—</template>
            </td>
            <td class="mono">
              <span v-if="row.instanceId" :title="String(row.instanceId)">{{ row.instanceId }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              <span v-if="row.bindingActive" class="pill pill--success">已绑定</span>
              <span v-else class="pill pill--muted">已解绑</span>
            </td>
            <td class="nowrap">{{ dt(row.lastUsedAt) }}</td>
            <td class="nowrap">{{ dt(row.expiresAt) }}</td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="revokeLicenseSession(row)">
                  撤销
                </button>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'tokens'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">设备找回令牌</h3>
          <p class="admin-block__hint">设备丢失后换机用的找回凭证。令牌疑似外泄时在这里作废。</p>
        </div>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="purge('recovery-tokens')">
          清理已过期…
        </button>
      </div>
      <DataTable
        ref="recoveryTokenTable"
        path="/recovery-tokens"
        :columns="COLUMNS.recoveryTokens"
        empty-text="暂无找回令牌"
      >
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="`${String(row.ref)}-${index}`">
            <td class="nowrap mono">{{ row.ref }}</td>
            <td class="nowrap mono">
              <span v-if="row.codeHint" :title="String(row.codeHint)">{{ row.codeHint }}</span>
              <template v-else>—</template>
            </td>
            <td class="mono">
              <span v-if="row.instanceId" :title="String(row.instanceId)">{{ row.instanceId }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ dt(row.createdAt) }}</td>
            <td class="nowrap">{{ dt(row.expiresAt) }}</td>
            <td class="nowrap">
              <span v-if="row.expired" class="pill pill--muted">已过期</span>
              <span v-else class="pill pill--warning">有效</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <button class="hb-button hb-button--secondary hb-button--sm" @click="revokeRecoveryToken(row)">
                  作废
                </button>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'logs'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">登录尝试</h3>
          <p class="admin-block__hint">纯日志，只记 scope 与成败，删了不影响任何判定。</p>
        </div>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="purge('login-attempts')">
          清理历史…
        </button>
      </div>
      <DataTable
        ref="attemptTable"
        path="/login-attempts"
        :columns="COLUMNS.attempts"
        empty-text="暂无登录尝试记录"
      >
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="index">
            <td class="nowrap">{{ dt(row.createdAt) }}</td>
            <td class="mono">
              <span v-if="row.scope" :title="String(row.scope)">{{ row.scope }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              <span v-if="row.succeeded" class="pill pill--success">成功</span>
              <span v-else class="pill pill--danger">失败</span>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'logs'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">邮箱验证码</h3>
          <p class="admin-block__hint">
            清理时只删「已消费或已过期」的：把用户正在走的注册/改密流程删掉会让他凭空失败。
          </p>
        </div>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="purge('email-verifications')">
          清理历史…
        </button>
      </div>
      <DataTable
        ref="verificationTable"
        path="/email-verifications"
        :columns="COLUMNS.verifications"
        empty-text="暂无邮箱验证码记录"
      >
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="index">
            <td class="nowrap">{{ dt(row.createdAt) }}</td>
            <td>
              <span v-if="row.email" :title="String(row.email)">{{ row.email }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ row.purpose }}</td>
            <td class="nowrap">{{ num(row.attempts) }}</td>
            <td class="nowrap">
              <span v-if="row.consumedAt" class="pill pill--success">已使用</span>
              <span v-else class="pill pill--warning">未使用</span>
            </td>
            <td class="nowrap">{{ dt(row.expiresAt) }}</td>
            <td class="nowrap">
              <span v-if="row.settled" class="pill pill--muted">可清理</span>
              <span v-else class="pill pill--warning">仍在用</span>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'tokens'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">设备解绑历史</h3>
          <p class="admin-block__hint">
            自助解绑的冷却判定读的是「每条授权最近一次解绑时间」，所以清理时每条授权的最新一条永远保留。
          </p>
        </div>
        <button class="hb-button hb-button--secondary hb-button--sm" @click="purge('device-release-events')">
          清理历史…
        </button>
      </div>
      <DataTable
        ref="releaseEventTable"
        path="/device-release-events"
        :columns="COLUMNS.releaseEvents"
        empty-text="暂无解绑历史"
      >
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="index">
            <td class="nowrap">{{ dt(row.createdAt) }}</td>
            <td class="nowrap mono">
              <span v-if="row.codeHint" :title="String(row.codeHint)">{{ row.codeHint }}</span>
              <template v-else>—</template>
            </td>
            <td class="mono">
              <span v-if="row.instanceId" :title="String(row.instanceId)">{{ row.instanceId }}</span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ row.source }}</td>
          </tr>
        </template>
      </DataTable>
    </div>

    <div v-show="active === 'redeem'" class="admin-block admin-tab-pane" role="tabpanel">
      <div class="admin-block__head">
        <div>
          <h3 class="admin-block-title">
            优惠码核销
            <button
              v-if="couponId"
              type="button"
              class="admin-filter-chip"
              title="点击清除筛选"
              @click="clearCouponFilter"
            >
              仅看 {{ couponCode }}（点击清除）
            </button>
          </h3>
          <p class="admin-block__hint">
            「占用中」才算在每人限用里；「已归还」只是对账凭证。这里没有批量清理 —— 删记录会重新开出名额，所以只能单条作废（会自动重算占用名额并记审计）。
          </p>
        </div>
      </div>
      <DataTable
        ref="redemptionTable"
        path="/coupon-redemptions"
        :columns="COLUMNS.redemptions"
        :params="redemptionParams"
        empty-text="暂无优惠码核销记录"
      >
        <template #default="{ items }">
          <tr v-for="(row, index) in asListItems<Record<string, unknown>>(items)" :key="`${String(row.id)}-${index}`">
            <td class="nowrap">{{ dt(row.createdAt) }}</td>
            <td class="nowrap mono">
              <span v-if="row.couponCode" :title="String(row.couponCode)">{{ row.couponCode }}</span>
              <template v-else>—</template>
            </td>
            <td>
              <span v-if="row.accountEmail || row.accountId" :title="String(row.accountEmail || row.accountId)">
                {{ row.accountEmail || row.accountId }}
              </span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">{{ money(Number(row.discountCents || 0)) }}</td>
            <td class="nowrap mono">
              <span v-if="row.orderNo || row.orderId" :title="String(row.orderNo || row.orderId)">
                {{ row.orderNo || row.orderId }}
              </span>
              <template v-else>—</template>
            </td>
            <td class="nowrap">
              <span v-if="row.voidedAt" class="pill pill--muted">已作废</span>
              <span v-else-if="row.holding" class="pill pill--warning">占用中</span>
              <span v-else class="pill pill--muted">已归还</span>
            </td>
            <td class="nowrap">
              <div class="row-actions">
                <span v-if="row.voidedAt" class="hb-muted" :title="String(row.voidReason || '已作废')">—</span>
                <button v-else class="hb-button hb-button--secondary hb-button--sm" @click="voidRedemption(row)">
                  作废
                </button>
              </div>
            </td>
          </tr>
        </template>
      </DataTable>
    </div>
  </section>
</template>
