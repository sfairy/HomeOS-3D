<script setup lang="ts">
import { computed, ref } from "vue";
import { adminApi } from "../../../api/http.js";
import { errorMessage } from "../../../store-types.js";
import { useToastStore } from "../../../stores/toast.js";
import DiagnosticList from "./DiagnosticList.vue";
import { asText, type DiagnosticCheck, type SettingsForm, type SettingsPayload, type SettingsPlaceholders } from "./types.js";

const props = defineProps<{
  form: SettingsForm;
  ph: SettingsPlaceholders;
  saved: SettingsPayload | null;
  active: string;
}>();

const toast = useToastStore();

function alipaySettings(): Record<string, unknown> {
  return (props.saved?.alipay || {}) as Record<string, unknown>;
}
function wechatSettings(): Record<string, unknown> {
  return (props.saved?.wechat || {}) as Record<string, unknown>;
}

const channels = computed<string[]>(() => {
  const list: string[] = [];
  if (props.form.paymentChannelAlipay) list.push("alipay");
  if (props.form.paymentChannelWechat) list.push("wechat");
  return list;
});

const channelSummary = computed(() => {
  const labels: Record<string, string> = { alipay: "支付宝", wechat: "微信支付" };
  const checked = channels.value;
  const fallback = props.form.paymentProvider;
  if (!checked.length && fallback) {
    return (
      `未勾选任何渠道：当前只启用默认渠道「${labels[fallback] || fallback}」，` +
      "顾客在支付页只会看到一个付款按钮。要同时支持两个渠道，请把两个都勾上。"
    );
  }
  if (!checked.length) {
    return "未勾选任何渠道，也没有默认渠道：前台会收起支付入口，顾客无法下单。";
  }
  const names = checked.map((name) => labels[name] || name).join("、");
  return checked.length === 1
    ? `顾客在支付页会看到 1 个付款按钮：${names}。要同时支持支付宝和微信，把两个都勾上。`
    : `顾客在支付页会看到 ${checked.length} 个付款按钮，可以自己选：${names}。`;
});

function channelBadge(configured: boolean, fromDatabase: boolean, channel: string) {
  if (!channels.value.includes(channel)) {
    return { text: "未启用（前台不会显示）", className: "admin-status-chip is-muted" };
  }
  if (!configured) {
    return { text: "未配置凭据 · 下单会失败", className: "admin-status-chip is-danger" };
  }
  return {
    text: `已配置 · ${fromDatabase ? "后台配置" : "环境变量"}`,
    className: "admin-status-chip",
  };
}

const alipayBadge = computed(() =>
  channelBadge(
    Boolean(alipaySettings().configured),
    Boolean(alipaySettings().appIdFromDatabase),
    "alipay",
  ),
);
const wechatBadge = computed(() =>
  channelBadge(
    Boolean(wechatSettings().configured),
    Boolean(wechatSettings().mchIdFromDatabase),
    "wechat",
  ),
);

const alipayEffectiveUrls = computed(() => {
  const source = alipaySettings();
  const notify = asText(source.notifyUrl) || "（未配置，将按 STORE_BASE_URL 推导）";
  const back = asText(source.returnUrl) || "（未配置，将按 STORE_BASE_URL 推导）";
  const signature = `${asText(source.signType) || "RSA2"}${
    source.verifyResponseSign === false ? "（响应验签已关闭，不建议）" : ""
  }`;
  return `当前生效 · 异步通知 ${notify} · 同步跳转 ${back} · 签名 ${signature}`;
});

const wechatEffectiveUrls = computed(() => {
  const notify = asText(wechatSettings().notifyUrl);
  return notify
    ? `当前生效的异步通知地址：${notify}`
    : "异步通知地址未配置，将按 STORE_BASE_URL 推导。没有它也能收款（轮询 + 巡检兜底），但会慢一些。";
});

const orderTtlWarning = computed(() => {
  const payload = props.saved;
  if (!payload) return "";
  const ttl = Number(payload.orderTtlSeconds || 0);
  const floor = Number(payload.orderTtlRecommendedSeconds || 300);
  const qrChannels = (payload.payment?.channels || []).map((item) => item.provider);
  const hasQrChannel = qrChannels.length > 0 || Boolean(payload.payment?.provider);
  if (!(hasQrChannel && ttl > 0 && ttl < floor)) return "";
  return (
    `当前订单有效期 ${ttl} 秒，短于付款码在渠道侧的有效期（约 2 小时）：` +
    "用户扫码稍慢就会在订单过期后才付款，变成需要人工核对的复活单。" +
    `建议把 STORE_ORDER_TTL_SECONDS 调到 ${floor}~900 秒。`
  );
});

const alipayChecks = ref<DiagnosticCheck[]>([]);
const wechatChecks = ref<DiagnosticCheck[]>([]);
const alipayTestMessage = ref("");
const wechatTestMessage = ref("");
const alipayTestOk = ref(true);
const wechatTestOk = ref(true);
const alipayTesting = ref(false);
const wechatTesting = ref(false);

async function runChannelProbe(channel: "alipay" | "wechat") {
  const testing = channel === "alipay" ? alipayTesting : wechatTesting;
  const messageRef = channel === "alipay" ? alipayTestMessage : wechatTestMessage;
  const okRef = channel === "alipay" ? alipayTestOk : wechatTestOk;
  const checksRef = channel === "alipay" ? alipayChecks : wechatChecks;
  messageRef.value = "";
  checksRef.value = [];
  testing.value = true;
  try {
    const result = await adminApi<{ message?: string; ok?: boolean; checks?: DiagnosticCheck[] }>(
      `/settings/alipay/test?channel=${encodeURIComponent(channel)}`,
      { method: "POST" },
    );
    messageRef.value = result.message || "";
    okRef.value = Boolean(result.ok);
    checksRef.value = result.checks || [];
    toast.push(result.ok ? "凭据可用" : "凭据不可用", result.ok ? "success" : "danger");
  } catch (error) {
    messageRef.value = errorMessage(error, "操作失败");
    okRef.value = false;
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    testing.value = false;
  }
}

function onProviderChange() {
  if (props.form.paymentProvider === "alipay") props.form.paymentChannelAlipay = true;
  if (props.form.paymentProvider === "wechat") props.form.paymentChannelWechat = true;
}
</script>

<template>
  <div v-show="active === 'payment'" class="admin-tab-pane" role="tabpanel" data-tone="lumen">
    <div class="hb-check-group admin-grid__full">
      <span class="admin-hint"><strong>启用的支付方式</strong>（勾几个，顾客就能看到几个）</span>
      <label class="hb-check"><input v-model="form.paymentChannelAlipay" type="checkbox" /> 支付宝</label>
      <label class="hb-check"><input v-model="form.paymentChannelWechat" type="checkbox" /> 微信支付</label>
    </div>
    <p class="admin-hint admin-grid__full" aria-live="polite">{{ channelSummary }}</p>
    <label class="hb-field">
      <span>默认支付方式（顾客没选时用）</span>
      <select v-model="form.paymentProvider" class="hb-select" @change="onProviderChange">
        <option value="">跟随环境变量</option>
        <option value="alipay">支付宝</option>
        <option value="wechat">微信支付</option>
      </select>
      <small class="admin-field-hint">选它会把上面那个也自动勾上。</small>
    </label>
    <label class="hb-field">
      <span>支付显示名（由渠道决定，只读）</span>
      <input v-model="form.paymentDisplayName" class="hb-input" readonly />
      <small class="admin-field-hint">
        默认支付方式在二维码弹窗上的名字；后台按渠道固定给出，不能单独改。
      </small>
    </label>
    <label class="hb-field admin-grid__fill-2col">
      <span>交易标题</span>
      <input
        v-model="form.paymentTransactionDescription"
        class="hb-input"
        placeholder="跟随环境变量"
      />
      <small class="admin-field-hint">
        出现在顾客账单的「商品名称」里（支付宝与微信支付都用它）；留空跟随环境变量。
      </small>
    </label>
    <div class="hb-check-group admin-grid__full">
      <label class="hb-check"><input v-model="form.paymentEnabled" type="checkbox" /> 启用支付</label>
      <label class="hb-check"><input v-model="form.maintenanceMode" type="checkbox" /> 维护模式</label>
    </div>
    <label class="hb-field admin-grid__full">
      <span>维护文案</span><input v-model="form.maintenanceMessage" class="hb-input" />
    </label>
  </div>

  <div v-show="active === 'alipay'" class="admin-tab-pane" role="tabpanel" data-tone="cool">
    <h4 class="admin-grid__section">凭据与自检</h4>
    <p class="admin-hint admin-grid__full">
      留空即跟随环境变量；填写后立即生效，无需重启。密钥只打码回显，接口响应与审核日志都不落明文。
    </p>
    <div class="admin-form-actions admin-grid__full">
      <span :class="alipayBadge.className">{{ alipayBadge.text }}</span>
      <button
        class="hb-button hb-button--ghost hb-button--sm"
        type="button"
        :disabled="alipayTesting"
        @click="runChannelProbe('alipay')"
      >
        {{ alipayTesting ? "测试中…" : "测试凭据" }}
      </button>
      <span
        class="admin-hint"
        :class="{ 'is-success': alipayTestOk, 'is-danger': !alipayTestOk }"
      >{{ alipayTestMessage }}</span>
    </div>
    <DiagnosticList :checks="alipayChecks" />
    <label class="hb-field">
      <span>AppID</span>
      <input v-model="form.alipayAppId" class="hb-input is-mono" placeholder="跟随环境变量" />
    </label>
    <label class="hb-field">
      <span>卖家 PID（校验异步通知的收款方）</span>
      <input v-model="form.alipaySellerId" class="hb-input is-mono" placeholder="跟随环境变量" />
    </label>
    <label class="hb-field admin-grid__fill-2col">
      <span>网关地址（留空即支付宝生产网关）</span>
      <input
        v-model="form.alipayGatewayUrl"
        class="hb-input is-mono"
        placeholder="https://openapi.alipay.com/gateway.do"
      />
    </label>
    <label class="hb-field admin-grid__full">
      <span>应用私钥（PEM，或密钥工具导出的纯 base64）</span>
      <input
        v-model="form.alipayAppPrivateKey"
        class="hb-input is-mono"
        type="password"
        autocomplete="new-password"
        :placeholder="ph.alipayAppPrivateKey"
        :disabled="form.alipayClearPrivateKey"
      />
    </label>
    <label class="hb-field admin-grid__full">
      <span>支付宝公钥（开放平台的「支付宝公钥」，不是应用公钥）</span>
      <input
        v-model="form.alipayPublicKey"
        class="hb-input is-mono"
        type="password"
        autocomplete="new-password"
        :placeholder="ph.alipayPublicKey"
        :disabled="form.alipayClearPublicKey"
      />
    </label>
    <h4 class="admin-grid__section">回调地址</h4>
    <p class="admin-hint admin-grid__full">{{ alipayEffectiveUrls }}</p>
    <p v-if="orderTtlWarning" class="admin-hint admin-grid__full">{{ orderTtlWarning }}</p>
    <label class="hb-field admin-grid__full">
      <span>异步通知地址（支付宝服务器回调的地址，必须是公网可达的 https）</span>
      <input
        v-model="form.alipayNotifyUrl"
        class="hb-input is-mono"
        placeholder="留空跟随环境变量；再没有就按 STORE_BASE_URL 推导"
      />
    </label>
    <label class="hb-field admin-grid__full">
      <span>同步跳转地址（用户付完款后浏览器回到的页面）</span>
      <input
        v-model="form.alipayReturnUrl"
        class="hb-input is-mono"
        placeholder="留空跟随环境变量；再没有就按 STORE_BASE_URL 推导"
      />
    </label>
    <div class="hb-check-group admin-grid__full">
      <label class="hb-check">
        <input v-model="form.alipayClearPrivateKey" type="checkbox" /> 清除已保存的应用私钥
      </label>
      <label class="hb-check">
        <input v-model="form.alipayClearPublicKey" type="checkbox" /> 清除已保存的支付宝公钥
      </label>
    </div>
  </div>

  <div v-show="active === 'wechat'" class="admin-tab-pane" role="tabpanel" data-tone="cool">
    <h4 class="admin-grid__section">凭据与自检</h4>
    <p class="admin-hint admin-grid__full">
      留空即跟随环境变量；填写后立即生效，无需重启。密钥只打码回显，接口响应与审核日志都不落明文。
    </p>
    <div class="admin-form-actions admin-grid__full">
      <span :class="wechatBadge.className">{{ wechatBadge.text }}</span>
      <button
        class="hb-button hb-button--ghost hb-button--sm"
        type="button"
        :disabled="wechatTesting"
        @click="runChannelProbe('wechat')"
      >
        {{ wechatTesting ? "测试中…" : "测试凭据" }}
      </button>
      <span
        class="admin-hint"
        :class="{ 'is-success': wechatTestOk, 'is-danger': !wechatTestOk }"
      >{{ wechatTestMessage }}</span>
    </div>
    <DiagnosticList :checks="wechatChecks" />
    <label class="hb-field">
      <span>商户号 mchid</span>
      <input v-model="form.wechatMchId" class="hb-input is-mono" placeholder="跟随环境变量" />
    </label>
    <label class="hb-field">
      <span>应用 appid</span>
      <input v-model="form.wechatAppId" class="hb-input is-mono" placeholder="跟随环境变量" />
    </label>
    <label class="hb-field">
      <span>商户证书序列号</span>
      <input v-model="form.wechatMerchantSerialNo" class="hb-input is-mono" placeholder="跟随环境变量" />
    </label>
    <label class="hb-field admin-grid__fill-2col">
      <span>APIv3 密钥（恰好 32 个字符）</span>
      <input
        v-model="form.wechatApiV3Key"
        class="hb-input is-mono"
        type="password"
        autocomplete="new-password"
        :placeholder="ph.wechatApiV3Key"
        :disabled="form.wechatClearApiV3Key"
      />
      <small class="admin-field-hint">
        在商户平台「API 安全」里自己设置的那串；它用来解密回调，不是证书。
      </small>
    </label>
    <label class="hb-field admin-grid__full">
      <span>商户 API 私钥（apiclient_key.pem 的内容）</span>
      <input
        v-model="form.wechatMerchantPrivateKey"
        class="hb-input is-mono"
        type="password"
        autocomplete="new-password"
        :placeholder="ph.wechatMerchantPrivateKey"
        :disabled="form.wechatClearMerchantPrivateKey"
      />
    </label>
    <label class="hb-field admin-grid__full">
      <span>微信支付公钥（商户平台「API 安全」里的公钥，或平台证书）</span>
      <input
        v-model="form.wechatPlatformPublicKey"
        class="hb-input is-mono"
        type="password"
        autocomplete="new-password"
        :placeholder="ph.wechatPlatformPublicKey"
        :disabled="form.wechatClearPlatformPublicKey"
      />
    </label>
    <h4 class="admin-grid__section">回调地址</h4>
    <p class="admin-hint admin-grid__full">{{ wechatEffectiveUrls }}</p>
    <label class="hb-field">
      <span>公钥 ID（可选）</span>
      <input v-model="form.wechatPlatformPublicKeyId" class="hb-input is-mono" placeholder="跟随环境变量" />
    </label>
    <label class="hb-field">
      <span>网关地址（留空即微信支付生产网关）</span>
      <input
        v-model="form.wechatGatewayUrl"
        class="hb-input is-mono"
        placeholder="https://api.mch.weixin.qq.com"
      />
    </label>
    <label class="hb-field admin-grid__full">
      <span>异步通知地址（微信服务器回调的地址，必须是公网可达的 https）</span>
      <input
        v-model="form.wechatNotifyUrl"
        class="hb-input is-mono"
        placeholder="留空跟随环境变量；再没有就按 STORE_BASE_URL 推导"
      />
    </label>
    <div class="hb-check-group admin-grid__full">
      <label class="hb-check">
        <input v-model="form.wechatClearApiV3Key" type="checkbox" /> 清除已保存的 APIv3 密钥
      </label>
      <label class="hb-check">
        <input v-model="form.wechatClearMerchantPrivateKey" type="checkbox" /> 清除已保存的商户 API 私钥
      </label>
      <label class="hb-check">
        <input v-model="form.wechatClearPlatformPublicKey" type="checkbox" /> 清除已保存的微信支付公钥
      </label>
    </div>
  </div>
</template>
