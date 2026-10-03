<script setup lang="ts">
/** 站点配置面板：站点信息、支付与维护、渠道凭据、注册邮件、邀请规则与站点配色。 */

import { computed, reactive, ref, watch } from "vue";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import AdminTabs from "../../components/admin/AdminTabs.vue";
import PalettePanel from "../../components/admin/PalettePanel.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";

interface DiagnosticCheck {
  level?: string;
  label?: string;
  id?: string;
  detail?: string;
}

interface MailPreset {
  id: string;
  label?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpSecurity?: string;
  domains?: string[];
  hint?: string;
}

interface SettingsPayload {
  store?: Record<string, unknown>;
  payment?: {
    provider?: string;
    displayName?: string;
    transactionDescription?: string;
    transactionDescriptionFromDatabase?: boolean;
    enabled?: boolean;
    channels?: { provider?: string }[];
    [key: string]: unknown;
  };
  referral?: Record<string, unknown>;
  announcement?: string;
  deviceReleaseCooldownSeconds?: number | string | null;
  deviceReleaseCooldownEffectiveSeconds?: number;
  orderTtlSeconds?: number;
  orderTtlRecommendedSeconds?: number;
  alipay?: Record<string, unknown>;
  wechat?: Record<string, unknown>;
  mail?: Record<string, unknown>;
  channels?: string[];
}

const TABS: AdminTabItem[] = [
  { key: "site", label: "站点信息", tone: "accent" },
  { key: "payment", label: "支付与维护", tone: "lumen" },
  { key: "alipay", label: "支付宝凭据", tone: "cool" },
  { key: "wechat", label: "微信支付凭据", tone: "cool" },
  { key: "mail", label: "注册邮件", tone: "aura" },
  { key: "invite", label: "邀请与解绑", tone: "eco" },
  { key: "palette", label: "站点配色", tone: "aura" },
];

const LEVEL_CLASS: Record<string, string> = {
  pass: "is-pass",
  warn: "is-warn",
  fail: "is-fail",
  skip: "is-skip",
};
const LEVEL_ICON: Record<string, string> = { pass: "✓", warn: "!", fail: "✕", skip: "·" };

const toast = useToastStore();
const refresh = useAdminRefreshStore();

const { active, pick } = useAdminTabs("settings", computed(() => TABS));

const saved = ref<SettingsPayload | null>(null);
const phase = ref<"loading" | "ready" | "error">("loading");
const phaseMessage = ref("");
const saving = ref(false);

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

const form = reactive({
  siteName: "",
  siteTitle: "",
  supportEmail: "",
  logoUrl: "",
  deployBaseUrl: "",
  description: "",
  announcement: "",
  paymentChannelAlipay: false,
  paymentChannelWechat: false,
  paymentProvider: "",
  paymentDisplayName: "",
  paymentTransactionDescription: "",
  paymentEnabled: false,
  maintenanceMode: false,
  maintenanceMessage: "",
  alipayAppId: "",
  alipaySellerId: "",
  alipayGatewayUrl: "",
  alipayAppPrivateKey: "",
  alipayPublicKey: "",
  alipayNotifyUrl: "",
  alipayReturnUrl: "",
  alipayClearPrivateKey: false,
  alipayClearPublicKey: false,
  wechatMchId: "",
  wechatAppId: "",
  wechatMerchantSerialNo: "",
  wechatApiV3Key: "",
  wechatMerchantPrivateKey: "",
  wechatPlatformPublicKey: "",
  wechatPlatformPublicKeyId: "",
  wechatGatewayUrl: "",
  wechatNotifyUrl: "",
  wechatClearApiV3Key: false,
  wechatClearMerchantPrivateKey: false,
  wechatClearPlatformPublicKey: false,
  mailMode: "",
  smtpSecurity: "",
  smtpHost: "",
  smtpUsername: "",
  mailFrom: "",
  smtpPort: "",
  smtpPassword: "",
  smtpClearPassword: false,
  verificationTtlSeconds: "",
  verificationCooldownSeconds: "",
  verificationGlobalHourlyLimit: "",
  deliveryEmailEnabled: true,
  mailTestEmail: "",
  referralEnabled: false,
  referralRatePercent: "0",
  referralWithdrawalFeePercent: "0",
  referralWithdrawalMinPoints: "0",
  deviceReleaseCooldownSeconds: "",
});

const ph = reactive({
  alipayAppPrivateKey: "",
  alipayPublicKey: "",
  wechatApiV3Key: "",
  wechatMerchantPrivateKey: "",
  wechatPlatformPublicKey: "",
  smtpPassword: "",
  smtpPort: "",
  verificationTtlSeconds: "",
  verificationCooldownSeconds: "",
  verificationGlobalHourlyLimit: "",
  deviceReleaseCooldownSeconds: "",
});

function mail(): Record<string, unknown> {
  return (saved.value?.mail || {}) as Record<string, unknown>;
}
function alipaySettings(): Record<string, unknown> {
  return (saved.value?.alipay || {}) as Record<string, unknown>;
}
function wechatSettings(): Record<string, unknown> {
  return (saved.value?.wechat || {}) as Record<string, unknown>;
}

const statusChip = computed(() => {
  if (phase.value === "loading") {
    return { text: "正在读取配置…", className: "admin-status-chip is-muted" };
  }
  if (phase.value === "error") {
    return {
      text: `配置读取失败：${phaseMessage.value || "未知原因"}（已禁用保存）`,
      className: "admin-status-chip is-danger",
    };
  }
  return { text: "配置已就绪", className: "admin-status-chip" };
});

const channels = computed<string[]>(() => {
  const list: string[] = [];
  if (form.paymentChannelAlipay) list.push("alipay");
  if (form.paymentChannelWechat) list.push("wechat");
  return list;
});

const channelSummary = computed(() => {
  const labels: Record<string, string> = { alipay: "支付宝", wechat: "微信支付" };
  const checked = channels.value;
  const fallback = form.paymentProvider;
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
  const notify = text(source.notifyUrl) || "（未配置，将按 STORE_BASE_URL 推导）";
  const back = text(source.returnUrl) || "（未配置，将按 STORE_BASE_URL 推导）";
  const signature = `${text(source.signType) || "RSA2"}${
    source.verifyResponseSign === false ? "（响应验签已关闭，不建议）" : ""
  }`;
  return `当前生效 · 异步通知 ${notify} · 同步跳转 ${back} · 签名 ${signature}`;
});

const wechatEffectiveUrls = computed(() => {
  const notify = text(wechatSettings().notifyUrl);
  return notify
    ? `当前生效的异步通知地址：${notify}`
    : "异步通知地址未配置，将按 STORE_BASE_URL 推导。没有它也能收款（轮询 + 巡检兜底），但会慢一些。";
});

const orderTtlWarning = computed(() => {
  const payload = saved.value;
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

/* ---------- 邮件预设 ---------- */
const presetProvider = ref("");
const presetEmail = ref("");

const mailPresets = computed<MailPreset[]>(() =>
  Array.isArray(mail().presets) ? (mail().presets as MailPreset[]) : [],
);

function presetById(id: unknown): MailPreset | null {
  const wanted = text(id).trim().toLowerCase();
  if (!wanted) return null;
  return mailPresets.value.find((item) => item.id === wanted) || null;
}

function presetEmailDomain(email: unknown): string {
  const address = text(email).trim();
  const at = address.lastIndexOf("@");
  return at > 0 ? address.slice(at + 1).trim().toLowerCase() : "";
}

function presetForEmail(email: unknown): MailPreset | null {
  const domain = presetEmailDomain(email);
  if (!domain) return null;
  return mailPresets.value.find((item) => (item.domains || []).includes(domain)) || null;
}

const selectedPreset = computed<MailPreset | null>(() => {
  const explicit = presetById(presetProvider.value);
  if (explicit) return explicit;
  const byEmail = presetForEmail(presetEmail.value);
  return byEmail || (presetProvider.value ? null : presetForEmail(text(mail().defaultEmail)));
});

const mailPresetHint = computed(() => {
  const preset = selectedPreset.value;
  const email = presetEmail.value.trim();
  if (!preset) {
    return email
      ? `没认出 ${email} 用的哪家邮局（自有域名刻意不猜）：请手动填服务器、加密方式与端口，参数问邮箱管理员。`
      : "填一个邮箱地址就能带出服务器 / 加密 / 端口；也可以直接选服务商。";
  }
  return `${preset.label}：${preset.smtpHost} · 端口 ${preset.smtpPort} · ${String(
    preset.smtpSecurity || "",
  ).toUpperCase()}。${preset.hint || ""}`;
});

function displayName(): string {
  const raw = (form.siteName || "").trim() || "HomeOS";
  return raw.replace(/[<>",;:]/g, "").trim() || "HomeOS";
}

function applyPreset(preset: MailPreset | null, overwrite: boolean) {
  if (!preset) return false;
  const email = (presetEmail.value.trim() || text(mail().defaultEmail)).trim();
  const set = (target: "mailMode" | "smtpHost" | "smtpSecurity" | "smtpPort" | "smtpUsername" | "mailFrom", value: unknown) => {
    if (!overwrite && String(form[target] || "").trim()) return;
    form[target] = value == null ? "" : String(value);
  };
  set("mailMode", "smtp");
  set("smtpHost", preset.smtpHost);
  set("smtpSecurity", preset.smtpSecurity);
  set("smtpPort", preset.smtpPort);
  if (email) {
    set("smtpUsername", email);
    set("mailFrom", `${displayName()} <${email}>`);
    if (!form.supportEmail.trim()) form.supportEmail = email;
  }
  if (!form.mailTestEmail.trim() && email) form.mailTestEmail = email;
  return true;
}

function onPresetProviderChange() {
  const preset = presetById(presetProvider.value);
  if (preset) applyPreset(preset, true);
}

function onPresetEmailInput() {
  presetProvider.value = "";
}

function applyPresetClick() {
  const preset = selectedPreset.value;
  if (!preset) {
    toast.push("先填一个邮箱地址，或在下拉框里选一个服务商。", "danger");
    return;
  }
  applyPreset(preset, true);
  toast.push(`已按 ${preset.label} 填入预设，保存后生效；还差 SMTP 授权码。`, "success");
}

/* ---------- 邮件徽标 ---------- */
const mailBadge = computed(() => {
  const source = mail();
  const mode = form.mailMode || text(source.mode) || "log";
  const host = form.smtpHost.trim() || text(source.smtpHost);
  const username = form.smtpUsername.trim() || text(source.smtpUsername);
  const passwordConfigured = Boolean(source.smtpPasswordConfigured) || Boolean(form.smtpPassword.trim());
  const ready = mode === "smtp" && Boolean(host) && (!username || passwordConfigured);
  const dirty =
    mode !== (text(source.mode) || "log") ||
    host !== text(source.smtpHost) ||
    username !== text(source.smtpUsername) ||
    Boolean(form.smtpPassword.trim());
  const suffix = dirty ? "（表单已改，未保存）" : "";
  if (mode === "smtp" && !ready) {
    return {
      text: "smtp 凭据不全 · 验证码只会写日志，用户收不到" + suffix,
      className: "admin-status-chip is-danger",
    };
  }
  if (mode === "smtp") {
    const port = form.smtpPort || text(source.smtpPort);
    return { text: `SMTP 就绪 · ${host}:${port}${suffix}`, className: "admin-status-chip" };
  }
  return {
    text: "log 模式 · 验证码不会真正发出（生产请切到 smtp）" + suffix,
    className: "admin-status-chip is-muted",
  };
});

/* ---------- 自检 ---------- */
const alipayChecks = ref<DiagnosticCheck[]>([]);
const wechatChecks = ref<DiagnosticCheck[]>([]);
const mailChecks = ref<DiagnosticCheck[]>([]);
const alipayTestMessage = ref("");
const wechatTestMessage = ref("");
const mailTestMessage = ref("");
const alipayTestOk = ref(true);
const wechatTestOk = ref(true);
const mailTestOk = ref(true);
const alipayTesting = ref(false);
const wechatTesting = ref(false);
const mailTesting = ref(false);

function levelClass(level: unknown): string {
  const raw = text(level);
  return LEVEL_CLASS[raw] || LEVEL_CLASS.skip!;
}
function levelIcon(level: unknown): string {
  const raw = text(level);
  return LEVEL_ICON[raw] || LEVEL_ICON.skip!;
}

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

async function testMail() {
  mailTestMessage.value = "";
  mailChecks.value = [];
  mailTesting.value = true;
  try {
    const result = await adminApi<{
      message?: string;
      ok?: boolean;
      checks?: DiagnosticCheck[];
      email?: string;
    }>("/settings/mail/test", {
      method: "POST",
      body: JSON.stringify({ email: form.mailTestEmail.trim() || null }),
    });
    mailTestMessage.value = result.message || "";
    mailTestOk.value = Boolean(result.ok);
    mailChecks.value = result.checks || [];
    toast.push(
      result.ok ? (result.email ? "测试邮件已投递" : "连接诊断通过") : "邮件链路未通过",
      result.ok ? "success" : "danger",
    );
  } catch (error) {
    mailTestMessage.value = errorMessage(error, "操作失败");
    mailTestOk.value = false;
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    mailTesting.value = false;
  }
}

/* ---------- 载入 ---------- */
function envHint(configured: unknown): string {
  return configured ? "跟随环境变量（已配置）" : "跟随环境变量";
}

function fill(payload: SettingsPayload) {
  const store = (payload.store || {}) as Record<string, unknown>;
  const payment = payload.payment || {};
  const referral = (payload.referral || {}) as Record<string, unknown>;
  const alipaySource = alipaySettings();
  const wechatSource = wechatSettings();
  const mailSource = mail();

  form.siteName = text(store.siteName);
  form.siteTitle = text(store.siteTitle);
  form.supportEmail = text(store.supportEmail);
  form.logoUrl = text(store.logoUrl);
  form.deployBaseUrl = text(store.deployBaseUrl);
  form.description = text(store.description);
  form.announcement = text(payload.announcement);

  form.paymentProvider = payment.provider || "";
  form.paymentDisplayName = payment.displayName || "";
  form.paymentTransactionDescription = payment.transactionDescriptionFromDatabase
    ? text(payment.transactionDescription)
    : "";
  form.paymentEnabled = Boolean(payment.enabled);
  form.maintenanceMode = Boolean(store.maintenanceMode);
  form.maintenanceMessage = text(store.maintenanceMessage);
  form.referralEnabled = Boolean(referral.enabled);
  form.referralRatePercent = text(referral.ratePercent ?? 0);
  form.referralWithdrawalFeePercent = text(referral.withdrawalFeePercent ?? 0);
  form.referralWithdrawalMinPoints = text(referral.withdrawalMinPoints ?? 0);
  form.deviceReleaseCooldownSeconds = payload.deviceReleaseCooldownSeconds == null
    ? ""
    : text(payload.deviceReleaseCooldownSeconds);
  ph.deviceReleaseCooldownSeconds = `跟随环境变量（当前 ${
    payload.deviceReleaseCooldownEffectiveSeconds ?? 0
  }）`;

  const enabledChannels = new Set(Array.isArray(payload.channels) ? payload.channels : []);
  form.paymentChannelAlipay = enabledChannels.has("alipay");
  form.paymentChannelWechat = enabledChannels.has("wechat");

  // 支付宝
  form.alipayAppId = alipaySource.appIdFromDatabase ? text(alipaySource.appId) : "";
  form.alipaySellerId = alipaySource.sellerIdFromDatabase ? text(alipaySource.sellerId) : "";
  form.alipayGatewayUrl = alipaySource.gatewayUrlFromDatabase ? text(alipaySource.gatewayUrl) : "";
  form.alipayNotifyUrl = alipaySource.notifyUrlFromDatabase ? text(alipaySource.notifyUrl) : "";
  form.alipayReturnUrl = alipaySource.returnUrlFromDatabase ? text(alipaySource.returnUrl) : "";
  form.alipayClearPrivateKey = false;
  form.alipayClearPublicKey = false;
  form.alipayAppPrivateKey = "";
  form.alipayPublicKey = "";
  ph.alipayAppPrivateKey = alipaySource.applicationPrivateKeyFromDatabase
    ? `已保存 ${text(alipaySource.applicationPrivateKeyMasked) || "••••"}（留空不改动）`
    : envHint(alipaySource.applicationPrivateKeyConfigured);
  ph.alipayPublicKey = alipaySource.alipayPublicKeyFromDatabase
    ? `已保存 ${text(alipaySource.alipayPublicKeyMasked) || "••••"}（留空不改动）`
    : envHint(alipaySource.alipayPublicKeyConfigured);
  alipayTestMessage.value = "";
  alipayChecks.value = [];

  // 微信
  form.wechatMchId = wechatSource.mchIdFromDatabase ? text(wechatSource.mchId) : "";
  form.wechatAppId = wechatSource.appIdFromDatabase ? text(wechatSource.appId) : "";
  form.wechatMerchantSerialNo = wechatSource.merchantSerialNoFromDatabase
    ? text(wechatSource.merchantSerialNo)
    : "";
  form.wechatGatewayUrl = wechatSource.gatewayUrlFromDatabase ? text(wechatSource.gatewayUrl) : "";
  form.wechatNotifyUrl = wechatSource.notifyUrlFromDatabase ? text(wechatSource.notifyUrl) : "";
  form.wechatPlatformPublicKeyId = wechatSource.platformPublicKeyIdFromDatabase
    ? text(wechatSource.platformPublicKeyId)
    : "";
  form.wechatClearApiV3Key = false;
  form.wechatClearMerchantPrivateKey = false;
  form.wechatClearPlatformPublicKey = false;
  form.wechatApiV3Key = "";
  form.wechatMerchantPrivateKey = "";
  form.wechatPlatformPublicKey = "";
  ph.wechatApiV3Key = wechatSource.apiV3KeyFromDatabase
    ? `已保存 ${text(wechatSource.apiV3KeyMasked) || "••••"}（留空不改动）`
    : envHint(wechatSource.apiV3KeyConfigured);
  ph.wechatMerchantPrivateKey = wechatSource.merchantPrivateKeyFromDatabase
    ? `已保存 ${text(wechatSource.merchantPrivateKeyMasked) || "••••"}（留空不改动）`
    : envHint(wechatSource.merchantPrivateKeyConfigured);
  ph.wechatPlatformPublicKey = wechatSource.platformPublicKeyFromDatabase
    ? `已保存 ${text(wechatSource.platformPublicKeyMasked) || "••••"}（留空不改动）`
    : envHint(wechatSource.platformPublicKeyConfigured);
  wechatTestMessage.value = "";
  wechatChecks.value = [];

  // 邮件
  const envText = (fromDatabase: unknown, value: unknown) => (fromDatabase ? text(value) : "");
  presetProvider.value = "";
  presetEmail.value = text(mailSource.defaultEmail);
  form.mailMode = mailSource.modeFromDatabase ? text(mailSource.mode) : "";
  form.smtpSecurity = mailSource.smtpSecurityFromDatabase ? text(mailSource.smtpSecurity) : "";
  form.smtpHost = envText(mailSource.smtpHostFromDatabase, mailSource.smtpHost);
  form.smtpUsername = envText(mailSource.smtpUsernameFromDatabase, mailSource.smtpUsername);
  form.mailFrom = envText(mailSource.fromAddressFromDatabase, mailSource.fromAddress);
  form.smtpPort = mailSource.smtpPortFromDatabase ? text(mailSource.smtpPort) : "";
  ph.smtpPort = mailSource.smtpPortFromDatabase ? "" : `跟随环境变量（当前 ${mailSource.smtpPort || 465}）`;
  form.smtpClearPassword = false;
  form.smtpPassword = "";
  ph.smtpPassword = mailSource.smtpPasswordFromDatabase
    ? `已保存 ${text(mailSource.smtpPasswordMasked) || "••••"}（留空不改动）`
    : mailSource.smtpPasswordConfigured
      ? "跟随环境变量（已配置）"
      : "跟随环境变量";
  form.verificationTtlSeconds = mailSource.verificationTtlFromDatabase
    ? text(mailSource.verificationTtlSeconds)
    : "";
  ph.verificationTtlSeconds = `跟随环境变量（当前 ${mailSource.verificationTtlSeconds}）`;
  form.verificationCooldownSeconds = mailSource.verificationCooldownFromDatabase
    ? text(mailSource.verificationCooldownSeconds)
    : "";
  ph.verificationCooldownSeconds = `跟随环境变量（当前 ${mailSource.verificationCooldownSeconds}）`;
  form.verificationGlobalHourlyLimit = mailSource.verificationGlobalHourlyLimitFromDatabase
    ? text(mailSource.verificationGlobalHourlyLimit)
    : "";
  ph.verificationGlobalHourlyLimit = `跟随环境变量（当前 ${mailSource.verificationGlobalHourlyLimit}）`;
  form.deliveryEmailEnabled = mailSource.deliveryEmailEnabled !== false;
  form.mailTestEmail = text(mailSource.defaultEmail);
  mailTestMessage.value = "";
  mailChecks.value = [];

  const unconfigured =
    !mailSource.modeFromDatabase &&
    !mailSource.smtpHostFromDatabase &&
    !mailSource.smtpPortFromDatabase &&
    !mailSource.smtpUsernameFromDatabase &&
    !mailSource.fromAddressFromDatabase &&
    !mailSource.smtpPasswordConfigured &&
    !mailSource.smtpHost &&
    !mailSource.smtpUsername &&
    (text(mailSource.mode) || "log") !== "smtp";
  if (unconfigured) {
    applyPreset(presetForEmail(text(mailSource.defaultEmail)), false);
  }
}

async function load() {
  phase.value = "loading";
  try {
    const payload = await adminApi<SettingsPayload>("/settings");
    saved.value = payload;
    fill(payload);
    phase.value = "ready";
  } catch (error) {
    phase.value = "error";
    phaseMessage.value = errorMessage(error, "操作失败");
  }
}

void load();

watch(
  () => form.smtpClearPassword,
  (clear) => {
    if (clear) form.smtpPassword = "";
  },
);
watch(
  () => [form.alipayClearPrivateKey, form.alipayClearPublicKey],
  ([clearPrivate, clearPublic]) => {
    if (clearPrivate) form.alipayAppPrivateKey = "";
    if (clearPublic) form.alipayPublicKey = "";
  },
);
watch(
  () => [form.wechatClearApiV3Key, form.wechatClearMerchantPrivateKey, form.wechatClearPlatformPublicKey],
  ([clearV3, clearPrivate, clearPublic]) => {
    if (clearV3) form.wechatApiV3Key = "";
    if (clearPrivate) form.wechatMerchantPrivateKey = "";
    if (clearPublic) form.wechatPlatformPublicKey = "";
  },
);

function onProviderChange() {
  if (form.paymentProvider === "alipay") form.paymentChannelAlipay = true;
  if (form.paymentProvider === "wechat") form.paymentChannelWechat = true;
}

/* ---------- 保存 ---------- */
function alipaySecretPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  if (form.alipayClearPrivateKey) payload.alipayAppPrivateKey = "";
  else if (form.alipayAppPrivateKey.trim()) payload.alipayAppPrivateKey = form.alipayAppPrivateKey.trim();
  if (form.alipayClearPublicKey) payload.alipayPublicKey = "";
  else if (form.alipayPublicKey.trim()) payload.alipayPublicKey = form.alipayPublicKey.trim();
  return payload;
}

function wechatSecretPayload(): Record<string, string> {
  const payload: Record<string, string> = {};
  const pairs: [boolean, string, string][] = [
    [form.wechatClearApiV3Key, "wechatApiV3Key", form.wechatApiV3Key],
    [form.wechatClearMerchantPrivateKey, "wechatMerchantPrivateKey", form.wechatMerchantPrivateKey],
    [form.wechatClearPlatformPublicKey, "wechatPlatformPublicKey", form.wechatPlatformPublicKey],
  ];
  for (const [clear, name, value] of pairs) {
    if (clear) payload[name] = "";
    else if (value.trim()) payload[name] = value.trim();
  }
  return payload;
}

function mailPasswordPayload(): Record<string, unknown> {
  if (form.smtpClearPassword) return { smtpClearPassword: true };
  const value = form.smtpPassword.trim();
  return value ? { smtpPassword: value } : {};
}

async function save() {
  if (phase.value !== "ready") {
    toast.push("站点配置还没读到，保存已被拦下。请先点侧栏的「站点配置」重新加载。", "danger");
    return;
  }
  saving.value = true;
  try {
    await adminApi("/settings", {
      method: "PUT",
      body: JSON.stringify({
        siteName: form.siteName.trim(),
        siteTitle: form.siteTitle.trim(),
        supportEmail: form.supportEmail.trim(),
        logoUrl: form.logoUrl.trim(),
        deployBaseUrl: form.deployBaseUrl.trim(),
        description: form.description.trim(),
        announcement: form.announcement.trim(),
        paymentProvider: form.paymentProvider,
        paymentDisplayName: form.paymentDisplayName.trim(),
        paymentTransactionDescription: form.paymentTransactionDescription.trim(),
        paymentEnabled: form.paymentEnabled,
        maintenanceMode: form.maintenanceMode,
        maintenanceMessage: form.maintenanceMessage.trim(),
        referralEnabled: form.referralEnabled,
        referralRatePercent: Number(form.referralRatePercent || 0),
        referralWithdrawalFeePercent: Number(form.referralWithdrawalFeePercent || 0),
        referralWithdrawalMinPoints: Number(form.referralWithdrawalMinPoints || 0),
        deviceReleaseCooldownSeconds:
          form.deviceReleaseCooldownSeconds === "" ? null : Number(form.deviceReleaseCooldownSeconds),
        alipayAppId: form.alipayAppId.trim(),
        alipaySellerId: form.alipaySellerId.trim(),
        alipayGatewayUrl: form.alipayGatewayUrl.trim(),
        alipayNotifyUrl: form.alipayNotifyUrl.trim(),
        alipayReturnUrl: form.alipayReturnUrl.trim(),
        ...alipaySecretPayload(),
        wechatMchId: form.wechatMchId.trim(),
        wechatAppId: form.wechatAppId.trim(),
        wechatMerchantSerialNo: form.wechatMerchantSerialNo.trim(),
        wechatPlatformPublicKeyId: form.wechatPlatformPublicKeyId.trim(),
        wechatGatewayUrl: form.wechatGatewayUrl.trim(),
        wechatNotifyUrl: form.wechatNotifyUrl.trim(),
        ...wechatSecretPayload(),
        paymentChannels: channels.value,
        mailMode: form.mailMode,
        smtpSecurity: form.smtpSecurity,
        smtpHost: form.smtpHost.trim(),
        smtpUsername: form.smtpUsername.trim(),
        mailFrom: form.mailFrom.trim(),
        smtpPort: Number(form.smtpPort || 0),
        verificationTtlSeconds: Number(form.verificationTtlSeconds || 0),
        verificationCooldownSeconds: Number(form.verificationCooldownSeconds || 0),
        verificationGlobalHourlyLimit: Number(form.verificationGlobalHourlyLimit || 0),
        deliveryEmailEnabled: form.deliveryEmailEnabled,
        ...mailPasswordPayload(),
      }),
    });
    toast.push("站点配置已保存");
    refresh.bump("overview");
    await load();
  } catch (error) {
    toast.push(errorMessage(error, "操作失败"), "danger");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="admin-panel active" data-domain="system">
    <PanelHead title="站点配置" desc="站点信息、支付渠道、维护模式与邀请规则" domain="系统">
      <span :class="statusChip.className">{{ statusChip.text }}</span>
      <button
        class="hb-button hb-button--primary hb-button--sm"
        type="submit"
        form="settings-form"
        :disabled="phase !== 'ready' || saving"
        :title="phase === 'ready' ? '' : '配置未读到，暂时不能保存'"
      >
        {{ saving ? "保存中…" : "保存配置" }}
      </button>
    </PanelHead>

    <div class="hb-card">
      <div class="hb-card__body">
        <form id="settings-form" @submit.prevent="save">
          <AdminTabs label="站点配置分区" :tabs="TABS" :active="active" @pick="pick" />

          <div v-show="active === 'site'" class="admin-tab-pane" role="tabpanel" data-tone="accent">
            <label class="hb-field"><span>站点名</span><input v-model="form.siteName" class="hb-input" /></label>
            <label class="hb-field"><span>站点标题</span><input v-model="form.siteTitle" class="hb-input" /></label>
            <label class="hb-field"><span>客服邮箱</span><input v-model="form.supportEmail" class="hb-input" /></label>
            <label class="hb-field">
              <span>品牌标识 URL（留空回落系统默认标识）</span>
              <input v-model="form.logoUrl" class="hb-input is-mono" />
            </label>
            <label class="hb-field admin-grid__wide">
              <span>一键部署脚本地址（账号中心授权卡展示；留空则不显示，无结尾斜杠）</span>
              <input v-model="form.deployBaseUrl" class="hb-input is-mono" placeholder="https://example.com/deploy" />
            </label>
            <label class="hb-field admin-grid__full">
              <span>站点描述</span><input v-model="form.description" class="hb-input" />
            </label>
            <label class="hb-field admin-grid__full">
              <span>公告（前台 toast 展示）</span><input v-model="form.announcement" class="hb-input" />
            </label>
          </div>

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
              <span>支付显示名</span>
              <input v-model="form.paymentDisplayName" class="hb-input" />
              <small class="admin-field-hint">只作用于默认支付方式；另一个用渠道自己的名字。</small>
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
            <ul class="admin-diagnostic-list admin-grid__full">
              <li
                v-for="(check, index) in alipayChecks"
                :key="index"
                class="admin-diagnostic"
                :class="levelClass(check.level)"
                :title="`${check.label || ''}：${check.detail || ''}`"
              >
                <span class="admin-diagnostic__icon">{{ levelIcon(check.level) }}</span>
                <strong class="admin-diagnostic__label">{{ check.label || check.id }}</strong>
                <span class="admin-diagnostic__detail">{{ check.detail }}</span>
              </li>
            </ul>
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
            <ul class="admin-diagnostic-list admin-grid__full">
              <li
                v-for="(check, index) in wechatChecks"
                :key="index"
                class="admin-diagnostic"
                :class="levelClass(check.level)"
                :title="`${check.label || ''}：${check.detail || ''}`"
              >
                <span class="admin-diagnostic__icon">{{ levelIcon(check.level) }}</span>
                <strong class="admin-diagnostic__label">{{ check.label || check.id }}</strong>
                <span class="admin-diagnostic__detail">{{ check.detail }}</span>
              </li>
            </ul>
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

          <div v-show="active === 'mail'" class="admin-tab-pane" role="tabpanel" data-tone="aura">
            <h4 class="admin-grid__section">邮箱预设与自检</h4>
            <p class="admin-hint admin-grid__full">
              留空即跟随环境变量；填写后立即生效，无需重启。SMTP 授权码只打码回显，接口响应与审核日志都不落明文。
            </p>
            <div class="admin-form-actions admin-form-actions--fielded admin-grid__full">
              <label class="hb-field">
                <span>邮箱服务商</span>
                <select v-model="presetProvider" class="hb-select" @change="onPresetProviderChange">
                  <option value="">自动识别（按邮箱地址）</option>
                  <option v-for="preset in mailPresets" :key="preset.id" :value="preset.id">
                    {{ preset.label }} · {{ preset.smtpHost }}:{{ preset.smtpPort }}
                  </option>
                </select>
              </label>
              <label class="hb-field">
                <span>邮箱账号</span>
                <input
                  v-model="presetEmail"
                  class="hb-input is-mono"
                  placeholder="you@example.com"
                  @input="onPresetEmailInput"
                />
              </label>
              <button class="hb-button hb-button--secondary hb-button--sm" type="button" @click="applyPresetClick">
                填入预设
              </button>
            </div>
            <p class="admin-hint admin-grid__full">{{ mailPresetHint }}</p>
            <div class="admin-form-actions admin-grid__full">
              <span :class="mailBadge.className">{{ mailBadge.text }}</span>
              <button
                class="hb-button hb-button--ghost hb-button--sm"
                type="button"
                :disabled="mailTesting"
                @click="testMail"
              >
                {{ mailTesting ? "检测中…" : "发送测试邮件" }}
              </button>
              <span class="admin-hint" :class="{ 'is-success': mailTestOk, 'is-danger': !mailTestOk }">
                {{ mailTestMessage }}
              </span>
            </div>
            <ul class="admin-diagnostic-list admin-grid__full">
              <li
                v-for="(check, index) in mailChecks"
                :key="index"
                class="admin-diagnostic"
                :class="levelClass(check.level)"
                :title="`${check.label || ''}：${check.detail || ''}`"
              >
                <span class="admin-diagnostic__icon">{{ levelIcon(check.level) }}</span>
                <strong class="admin-diagnostic__label">{{ check.label || check.id }}</strong>
                <span class="admin-diagnostic__detail">{{ check.detail }}</span>
              </li>
            </ul>
            <label class="hb-field admin-grid__full">
              <span>测试收件邮箱（留空则只做连接诊断，不发信）</span>
              <input
                v-model="form.mailTestEmail"
                class="hb-input is-mono"
                placeholder="you@example.com（留空 = 只诊断，不发信）"
              />
            </label>
            <h4 class="admin-grid__section">SMTP 参数</h4>
            <label class="hb-field">
              <span>投递方式</span>
              <select v-model="form.mailMode" class="hb-select">
                <option value="">跟随环境变量</option>
                <option value="log">log · 只写日志</option>
                <option value="smtp">smtp · 真实发信</option>
              </select>
            </label>
            <label class="hb-field">
              <span>SMTP 加密</span>
              <select v-model="form.smtpSecurity" class="hb-select">
                <option value="">跟随环境变量</option>
                <option value="ssl">SSL（端口 465）</option>
                <option value="starttls">STARTTLS（端口 587）</option>
                <option value="plain">不加密（端口 25）</option>
              </select>
            </label>
            <label class="hb-field">
              <span>SMTP 端口</span>
              <input v-model="form.smtpPort" class="hb-input" type="number" :placeholder="ph.smtpPort" />
            </label>
            <label class="hb-field">
              <span>SMTP 服务器</span>
              <input v-model="form.smtpHost" class="hb-input is-mono" placeholder="跟随环境变量" />
            </label>
            <label class="hb-field">
              <span>SMTP 用户名</span>
              <input v-model="form.smtpUsername" class="hb-input is-mono" placeholder="跟随环境变量" />
            </label>
            <label class="hb-field">
              <span>发件人</span>
              <input v-model="form.mailFrom" class="hb-input is-mono" placeholder="跟随环境变量" />
              <small class="admin-field-hint">
                带显示名时写成 <code>HomeOS &lt;no-reply@example.com&gt;</code>
              </small>
            </label>
            <label class="hb-field admin-grid__full">
              <span>SMTP 授权码（一般是邮箱的 SMTP 授权码，不是登录密码）</span>
              <input
                v-model="form.smtpPassword"
                class="hb-input is-mono"
                type="password"
                autocomplete="new-password"
                :placeholder="ph.smtpPassword"
                :disabled="form.smtpClearPassword"
              />
            </label>
            <div class="hb-check-group admin-grid__full">
              <label class="hb-check">
                <input v-model="form.smtpClearPassword" type="checkbox" /> 清除已保存的 SMTP 授权码
              </label>
            </div>
            <h4 class="admin-grid__section">验证码策略</h4>
            <label class="hb-field">
              <span>验证码有效期（秒）</span>
              <input
                v-model="form.verificationTtlSeconds"
                class="hb-input"
                type="number"
                :placeholder="ph.verificationTtlSeconds"
              />
            </label>
            <label class="hb-field">
              <span>重发冷却（秒）</span>
              <input
                v-model="form.verificationCooldownSeconds"
                class="hb-input"
                type="number"
                :placeholder="ph.verificationCooldownSeconds"
              />
            </label>
            <label class="hb-field">
              <span>全站小时发信上限</span>
              <input
                v-model="form.verificationGlobalHourlyLimit"
                class="hb-input"
                type="number"
                :placeholder="ph.verificationGlobalHourlyLimit"
              />
              <small class="admin-field-hint">
                所有来源合计。触顶时**所有人**都收不到验证码，所以它能在这里直接调大。
              </small>
            </label>
            <h4 class="admin-grid__section">发货邮件</h4>
            <div class="hb-check-group admin-grid__full">
              <label class="hb-check">
                <input v-model="form.deliveryEmailEnabled" type="checkbox" /> 支付成功后把激活码邮件发给买家
                <small class="admin-field-hint">
                  复用上面的 SMTP 配置。邮件失败不会影响发码：激活码始终在买家账号中心的授权卡上，必要时买家可自助重发。
                </small>
              </label>
            </div>
          </div>

          <div v-show="active === 'invite'" class="admin-tab-pane" role="tabpanel" data-tone="eco">
            <div class="hb-check-group admin-grid__full">
              <label class="hb-check"><input v-model="form.referralEnabled" type="checkbox" /> 邀请有礼</label>
            </div>
            <label class="hb-field">
              <span>奖励比例 %</span>
              <input v-model="form.referralRatePercent" class="hb-input" type="number" step="0.01" />
            </label>
            <label class="hb-field">
              <span>提现手续费 %</span>
              <input v-model="form.referralWithdrawalFeePercent" class="hb-input" type="number" step="0.01" />
            </label>
            <label class="hb-field admin-grid__fill-2col">
              <span>最低提现积分</span>
              <input v-model="form.referralWithdrawalMinPoints" class="hb-input" type="number" step="0.01" />
            </label>
            <label class="hb-field admin-grid__full">
              <span>解绑冷却（秒）</span>
              <input
                v-model="form.deviceReleaseCooldownSeconds"
                class="hb-input"
                type="number"
                min="0"
                :placeholder="ph.deviceReleaseCooldownSeconds"
              />
              <small class="admin-field-hint">
                两次<b>解绑</b>之间的间隔。<b>留空 = 跟随环境变量</b>，填 0 = 不限间隔。解绑之后可以立即重新激活（同机或换机都行）；这个值只约束「下一次解绑」，不拦激活。
              </small>
            </label>
          </div>
        </form>

        <PalettePanel v-show="active === 'palette'" />
      </div>
    </div>
  </section>
</template>
