<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { api } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useStoreToast } from "../../stores/toast.js";
import { formatPoints, formatCentsPlain } from "../../money.js";

const toast = useStoreToast();

interface ReferralSettings {
  enabled?: boolean;
  ratePercent?: number;
  withdrawalFeePercent?: number;
  withdrawalMinPoints?: number;
}
interface ReferralWallet {
  code?: string;
  balance?: number;
  frozen?: number;
  earned?: number;
  withdrawn?: number;
}
interface ReferralData {
  invitedCount?: number;
  settings?: ReferralSettings;
  wallet?: ReferralWallet;
}
interface HistoryItem {
  createdAt?: string;
  kind?: string;
  delta?: unknown;
  frozenDelta?: unknown;
  balanceAfter?: unknown;
  note?: string;
  reference?: string;
  id?: string;
  points?: unknown;
  feePoints?: unknown;
  feePercent?: unknown;
  netPoints?: unknown;
  status?: string;
  resolvedAt?: string;
}

const LABELS: Record<string, string> = {
  reward: "邀请奖励",
  reversal: "邀请失败",
  freeze: "提现冻结",
  withdrawal: "提现完成",
  release: "退回积分",
  manual_adjust: "人工调账",
  pending: "待审核",
  paid: "已提现",
  rejected: "已驳回 / 撤销",
};

const HISTORY_PAGE_SIZE = 20;

const data = ref<ReferralData | null>(null);
const errorText = ref("");
const kind = ref<"ledger" | "withdrawals">("ledger");
const page = ref(1);
const total = ref(0);
const items = ref<HistoryItem[]>([]);
const withdrawPoints = ref("");
const application = ref("");
const busy = ref(false);
let requestKey = randomKey();

function randomKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const settings = computed(() => data.value?.settings || {});
const wallet = computed(() => data.value?.wallet || null);
const minPoints = computed(() => Math.max(0, Number(settings.value.withdrawalMinPoints ?? 0)));
const available = computed(() =>
  Math.max(0, Number(wallet.value?.balance || 0) - Number(wallet.value?.frozen || 0)),
);
const rateText = computed(() =>
  settings.value.enabled
    ? `好友每笔实付订单，奖励 ${settings.value.ratePercent}% 积分。`
    : "邀请活动暂时关闭，已有积分仍可查看和申请提现。",
);
const inviteLink = computed(
  () => `${location.origin}/user/authentication/register?invite=${wallet.value?.code || ""}`,
);
const canWithdraw = computed(
  () => Boolean(wallet.value) && available.value >= minPoints.value && Number(wallet.value?.frozen || 0) <= 0,
);

const stats = computed(() => [
  { label: "可用积分", value: available.value, tone: "eco" },
  { label: "提现中积分", value: Number(wallet.value?.frozen || 0), tone: "lumen" },
  { label: "累计净奖励", value: Number(wallet.value?.earned || 0), tone: "accent" },
  { label: "已提现积分", value: Number(wallet.value?.withdrawn || 0), tone: "aura" },
]);

const feePreview = computed(() => {
  const percent = Number(settings.value.withdrawalFeePercent) || 0;
  const points = withdrawPoints.value === "" ? minPoints.value : Number(withdrawPoints.value);
  const { fee, net } = breakdown(points, percent);
  return `手续费 ${percent}%：${formatPoints(fee)} 积分；预计到账 ${formatCentsPlain(net)} 元。`;
});

const guideReward = computed(
  () =>
    `好友注册后，实际支付成功的订单，按实付金额的 ${settings.value.ratePercent}% 奖励积分。注册本身不发积分，支付成功后自动入账。`,
);
const guideFee = computed(() => {
  const percent = Number(settings.value.withdrawalFeePercent) || 0;
  const calc = breakdown(minPoints.value, percent);
  return `1 积分等于 1 元，满 ${minPoints.value} 积分可以申请提现。当前手续费 ${percent}%，申请 ${minPoints.value} 积分，扣除 ${formatPoints(calc.fee)} 积分手续费，实际到账 ${formatCentsPlain(calc.net)} 元。手续费不足 0.01 部分舍去。`;
});

function breakdown(pointsValue: unknown, percent: unknown) {
  const cents = Math.max(0, Math.round((Number(pointsValue) || 0) * 100));
  const bps = Math.max(0, Math.round((Number(percent) || 0) * 100));
  const fee = cents > 0 ? (bps >= 10000 ? cents : Math.floor((cents * bps) / 10000)) : 0;
  return { cents, fee, net: Math.max(0, cents - fee) };
}

function formatDate(value: unknown) {
  return value ? new Date(String(value)).toLocaleString("zh-CN", { hour12: false }) : "—";
}

async function refresh() {
  data.value = await api<ReferralData>("/referrals");
}

async function loadHistory() {
  const result = await api<{ items?: HistoryItem[]; total?: number }>(
    `/referrals/history?kind=${kind.value}&page=${page.value}`,
  );
  items.value = result.items || [];
  total.value = Number(result.total || 0);
}

async function run(action: () => Promise<void>) {
  errorText.value = "";
  try {
    await action();
  } catch (error) {
    errorText.value = errorMessage(error);
    toast.show(errorMessage(error), "err");
  }
}

onMounted(() =>
  run(async () => {
    await refresh();
    await loadHistory();
  }),
);

async function generate() {
  if (busy.value) return;
  busy.value = true;
  await run(async () => {
    await api("/referrals/code", { method: "POST" });
    await refresh();
  });
  busy.value = false;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show("已复制");
  } catch {
    toast.show("复制失败，请手动选中复制。", "err");
  }
}

async function switchHistory(next: "ledger" | "withdrawals") {
  kind.value = next;
  page.value = 1;
  await run(loadHistory);
}

async function prevPage() {
  if (page.value <= 1) return;
  page.value -= 1;
  await run(loadHistory);
}

async function nextPage() {
  if (page.value * HISTORY_PAGE_SIZE >= total.value) return;
  page.value += 1;
  await run(loadHistory);
}

async function submitWithdraw() {
  if (busy.value || !canWithdraw.value) return;
  busy.value = true;
  await run(async () => {
    const item = await api<{ id?: string }>("/referrals/withdrawals", {
      method: "POST",
      body: JSON.stringify({
        points: withdrawPoints.value,
        requestKey,
        expectedFeePercent: settings.value.withdrawalFeePercent,
      }),
    });
    requestKey = randomKey();
    application.value = `申请已提交，编号：${item.id}。请联系客服办理提现。`;
    kind.value = "withdrawals";
    page.value = 1;
    await refresh();
    await loadHistory();
  });
  busy.value = false;
}
</script>

<template>
  <main class="hb-store-main" data-store-page="referrals">
    <div class="hb-container">
      <section class="hb-account-heading">
        <div>
          <div class="hb-account-heading__eyebrow">
            <span class="hb-kicker">Invite &amp; Earn</span>
            <span class="hb-account-heading__path">~/account/referrals</span>
          </div>
          <h1>邀请<strong>有礼</strong></h1>
          <p>分享 HomeOS，让每一份推荐都有回报。</p>
        </div>
        <div class="hb-account-heading__actions">
          <RouterLink class="hb-button hb-button--secondary hb-button--sm" to="/user/dashboard/index">返回账号中心</RouterLink>
        </div>
      </section>

      <p v-if="errorText" role="alert">{{ errorText }}</p>

      <section class="referral-share">
        <div>
          <h2>我的专属邀请</h2>
          <p>{{ rateText }}</p>
          <p>{{ wallet?.code || "生成邀请码，开始邀请好友。" }}</p>
          <div class="referral-actions">
            <button v-if="!wallet" class="hb-button hb-button--primary" :disabled="!settings.enabled || busy" @click="generate">
              生成我的邀请码
            </button>
            <button v-if="wallet" class="hb-button hb-button--secondary" @click="copyText(wallet.code || '')">复制邀请码</button>
            <button v-if="wallet" class="hb-button hb-button--secondary" @click="copyText(inviteLink)">复制邀请链接</button>
          </div>
          <input v-if="wallet" :value="inviteLink" aria-label="我的邀请链接" readonly />
        </div>
        <aside>
          <strong>{{ data?.invitedCount ?? 0 }}</strong>
          <span>已邀请注册</span>
          <small>新用户注册时绑定，后续每笔实付订单均可奖励。</small>
        </aside>
      </section>

      <section class="referral-stats" aria-label="我的积分">
        <article v-for="item in stats" :key="item.label" :data-tone="item.tone">
          <small>{{ item.label }}</small>
          <strong>{{ item.value.toFixed(2) }}</strong>
          <small>积分</small>
        </article>
      </section>

      <section class="hb-block">
        <div class="hb-section-heading hb-section-heading--compact">
          <h2>积分提现</h2>
        </div>
        <p class="hb-lead">1 积分等于 1 元，满 {{ minPoints }} 积分可申请提现。提交申请后凭申请编号联系客服人工办理。</p>
        <form class="referral-withdraw-form" @submit.prevent="submitWithdraw">
          <label>
            提现积分
            <input v-model="withdrawPoints" name="points" type="number" :min="minPoints" max="100000000" step="0.01" :placeholder="`最低 ${minPoints}`" required />
          </label>
          <button class="hb-button hb-button--primary" type="submit" :disabled="!canWithdraw || busy">申请提现</button>
        </form>
        <p>{{ feePreview }}</p>
        <p role="status">{{ application }}</p>
      </section>

      <section class="hb-block">
        <div class="referral-history-tabs" role="tablist" aria-label="积分明细与提现记录">
          <button type="button" class="hb-button" :class="kind === 'ledger' ? 'hb-button--primary' : 'hb-button--secondary'" @click="switchHistory('ledger')">积分明细</button>
          <button type="button" class="hb-button" :class="kind === 'withdrawals' ? 'hb-button--primary' : 'hb-button--secondary'" @click="switchHistory('withdrawals')">提现记录</button>
        </div>
        <div>
          <div v-if="items.length" class="referral-table-wrap">
            <table class="referral-table">
              <thead>
                <tr v-if="kind === 'ledger'">
                  <th>时间</th><th>类型</th><th>可用积分变化</th><th>冻结积分变化</th><th>余额</th><th>说明</th>
                </tr>
                <tr v-else>
                  <th>申请时间 / 编号</th><th>申请积分</th><th>手续费积分</th><th>实际到账（积分等值）</th><th>状态</th><th>处理说明</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in items" :key="index">
                  <template v-if="kind === 'ledger'">
                    <td>{{ formatDate(item.createdAt) }}</td>
                    <td>{{ LABELS[item.kind || ''] || item.kind }}</td>
                    <td>{{ item.delta }}</td>
                    <td>{{ item.frozenDelta }}</td>
                    <td>{{ item.balanceAfter }}</td>
                    <td>{{ item.note }}<code v-if="item.reference">{{ item.reference }}</code></td>
                  </template>
                  <template v-else>
                    <td>{{ formatDate(item.createdAt) }}<code>{{ item.id }}</code></td>
                    <td>{{ item.points }}</td>
                    <td>{{ item.feePoints }} ({{ item.feePercent }}%)</td>
                    <td>{{ item.netPoints }}</td>
                    <td>{{ LABELS[item.status || ''] || item.status }}</td>
                    <td>{{ item.note || "待处理" }}<small>{{ formatDate(item.resolvedAt) }}</small></td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="referral-empty">暂无记录。分享邀请链接，开始积累积分。</p>
        </div>
        <div class="referral-pagination">
          <button class="hb-button hb-button--secondary hb-button--sm" :disabled="page <= 1" @click="prevPage">上一页</button>
          <span>第 {{ page }} 页 · 共 {{ total }} 条</span>
          <button class="hb-button hb-button--secondary hb-button--sm" :disabled="page * 20 >= total" @click="nextPage">下一页</button>
        </div>
      </section>

      <section class="hb-block referral-guide">
        <details>
          <summary>邀请与提现说明</summary>
          <ol>
            <li>生成邀请码或复制邀请链接，分享给还没有注册的好友。邀请码只用于绑定邀请关系，不提供购买折扣；老用户不能补绑。</li>
            <li>{{ guideReward }}</li>
            <li>积分保留两位小数，不足 0.01 积分部分舍去。免费订单不参与邀请奖励。</li>
            <li>{{ guideFee }}</li>
            <li>提交申请后积分暂时冻结。请提供申请编号和账号邮箱，联系客服处理；提现完成后可在记录中查看结果，未通过的申请会退回积分。</li>
            <li>订单退款视为邀请失败，已发放的奖励积分将退回。</li>
            <li>不能自邀或更换邀请人。奖励比例以下单时为准，提现手续费以申请时为准，之后调整不影响已有记录。</li>
          </ol>
        </details>
      </section>
    </div>
  </main>
</template>
