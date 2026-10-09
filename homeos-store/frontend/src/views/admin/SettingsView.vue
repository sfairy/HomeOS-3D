<script setup lang="ts">
/** 站点配置面板：站点信息、支付与维护、渠道凭据、注册邮件、邀请规则与站点配色。 */

import { computed, reactive, ref, watch } from "vue";
import type { AdminTabItem } from "../../composables/useAdminTabs.js";
import { useAdminTabs } from "../../composables/useAdminTabs.js";
import PanelHead from "../../components/admin/PanelHead.vue";
import AdminTabs from "../../components/admin/AdminTabs.vue";
import { adminApi } from "../../api/http.js";
import { errorMessage } from "../../store-types.js";
import { useToastStore } from "../../stores/toast.js";
import { useAdminRefreshStore } from "../../stores/adminRefresh.js";
import InvitePanel from "./settings/InvitePanel.vue";
import MailPanel from "./settings/MailPanel.vue";
import PaletteSettings from "./settings/PaletteSettings.vue";
import PaymentsPanel from "./settings/PaymentsPanel.vue";
import SitePanel from "./settings/SitePanel.vue";
import {
  asText,
  type SettingsForm,
  type SettingsPayload,
  type SettingsPlaceholders,
} from "./settings/types.js";

const TABS: AdminTabItem[] = [
  { key: "site", label: "站点信息", tone: "accent" },
  { key: "payment", label: "支付与维护", tone: "lumen" },
  { key: "alipay", label: "支付宝凭据", tone: "cool" },
  { key: "wechat", label: "微信支付凭据", tone: "cool" },
  { key: "mail", label: "注册邮件", tone: "aura" },
  { key: "invite", label: "邀请与解绑", tone: "eco" },
  { key: "palette", label: "站点配色", tone: "aura" },
];

const toast = useToastStore();
const refresh = useAdminRefreshStore();
const { active, pick } = useAdminTabs("settings", computed(() => TABS));

const saved = ref<SettingsPayload | null>(null);
const phase = ref<"loading" | "ready" | "error">("loading");
const phaseMessage = ref("");
const saving = ref(false);

const form = reactive<SettingsForm>({
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

const ph = reactive<SettingsPlaceholders>({
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

function envHint(configured: unknown): string {
  return configured ? "跟随环境变量（已配置）" : "跟随环境变量";
}

function fill(payload: SettingsPayload) {
  const store = (payload.store || {}) as Record<string, unknown>;
  const payment = payload.payment || {};
  const referral = (payload.referral || {}) as Record<string, unknown>;
  const alipaySource = (payload.alipay || {}) as Record<string, unknown>;
  const wechatSource = (payload.wechat || {}) as Record<string, unknown>;
  const mailSource = (payload.mail || {}) as Record<string, unknown>;

  form.siteName = asText(store.siteName);
  form.siteTitle = asText(store.siteTitle);
  form.supportEmail = asText(store.supportEmail);
  form.logoUrl = asText(store.logoUrl);
  form.deployBaseUrl = asText(store.deployBaseUrl);
  form.description = asText(store.description);
  form.announcement = asText(payload.announcement);

  form.paymentProvider = payment.provider || "";
  form.paymentDisplayName = payment.displayName || "";
  form.paymentTransactionDescription = payment.transactionDescriptionFromDatabase
    ? asText(payment.transactionDescription)
    : "";
  form.paymentEnabled = Boolean(payment.enabled);
  form.maintenanceMode = Boolean(store.maintenanceMode);
  form.maintenanceMessage = asText(store.maintenanceMessage);
  form.referralEnabled = Boolean(referral.enabled);
  form.referralRatePercent = asText(referral.ratePercent ?? 0);
  form.referralWithdrawalFeePercent = asText(referral.withdrawalFeePercent ?? 0);
  form.referralWithdrawalMinPoints = asText(referral.withdrawalMinPoints ?? 0);
  form.deviceReleaseCooldownSeconds = payload.deviceReleaseCooldownSeconds == null
    ? ""
    : asText(payload.deviceReleaseCooldownSeconds);
  ph.deviceReleaseCooldownSeconds = `跟随环境变量（当前 ${
    payload.deviceReleaseCooldownEffectiveSeconds ?? 0
  }）`;

  const enabledChannels = new Set(Array.isArray(payload.channels) ? payload.channels : []);
  form.paymentChannelAlipay = enabledChannels.has("alipay");
  form.paymentChannelWechat = enabledChannels.has("wechat");

  form.alipayAppId = alipaySource.appIdFromDatabase ? asText(alipaySource.appId) : "";
  form.alipaySellerId = alipaySource.sellerIdFromDatabase ? asText(alipaySource.sellerId) : "";
  form.alipayGatewayUrl = alipaySource.gatewayUrlFromDatabase ? asText(alipaySource.gatewayUrl) : "";
  form.alipayNotifyUrl = alipaySource.notifyUrlFromDatabase ? asText(alipaySource.notifyUrl) : "";
  form.alipayReturnUrl = alipaySource.returnUrlFromDatabase ? asText(alipaySource.returnUrl) : "";
  form.alipayClearPrivateKey = false;
  form.alipayClearPublicKey = false;
  form.alipayAppPrivateKey = "";
  form.alipayPublicKey = "";
  ph.alipayAppPrivateKey = alipaySource.applicationPrivateKeyFromDatabase
    ? `已保存 ${asText(alipaySource.applicationPrivateKeyMasked) || "••••"}（留空不改动）`
    : envHint(alipaySource.applicationPrivateKeyConfigured);
  ph.alipayPublicKey = alipaySource.alipayPublicKeyFromDatabase
    ? `已保存 ${asText(alipaySource.alipayPublicKeyMasked) || "••••"}（留空不改动）`
    : envHint(alipaySource.alipayPublicKeyConfigured);

  form.wechatMchId = wechatSource.mchIdFromDatabase ? asText(wechatSource.mchId) : "";
  form.wechatAppId = wechatSource.appIdFromDatabase ? asText(wechatSource.appId) : "";
  form.wechatMerchantSerialNo = wechatSource.merchantSerialNoFromDatabase
    ? asText(wechatSource.merchantSerialNo)
    : "";
  form.wechatGatewayUrl = wechatSource.gatewayUrlFromDatabase ? asText(wechatSource.gatewayUrl) : "";
  form.wechatNotifyUrl = wechatSource.notifyUrlFromDatabase ? asText(wechatSource.notifyUrl) : "";
  form.wechatPlatformPublicKeyId = wechatSource.platformPublicKeyIdFromDatabase
    ? asText(wechatSource.platformPublicKeyId)
    : "";
  form.wechatClearApiV3Key = false;
  form.wechatClearMerchantPrivateKey = false;
  form.wechatClearPlatformPublicKey = false;
  form.wechatApiV3Key = "";
  form.wechatMerchantPrivateKey = "";
  form.wechatPlatformPublicKey = "";
  ph.wechatApiV3Key = wechatSource.apiV3KeyFromDatabase
    ? `已保存 ${asText(wechatSource.apiV3KeyMasked) || "••••"}（留空不改动）`
    : envHint(wechatSource.apiV3KeyConfigured);
  ph.wechatMerchantPrivateKey = wechatSource.merchantPrivateKeyFromDatabase
    ? `已保存 ${asText(wechatSource.merchantPrivateKeyMasked) || "••••"}（留空不改动）`
    : envHint(wechatSource.merchantPrivateKeyConfigured);
  ph.wechatPlatformPublicKey = wechatSource.platformPublicKeyFromDatabase
    ? `已保存 ${asText(wechatSource.platformPublicKeyMasked) || "••••"}（留空不改动）`
    : envHint(wechatSource.platformPublicKeyConfigured);

  const envText = (fromDatabase: unknown, value: unknown) => (fromDatabase ? asText(value) : "");
  form.mailMode = mailSource.modeFromDatabase ? asText(mailSource.mode) : "";
  form.smtpSecurity = mailSource.smtpSecurityFromDatabase ? asText(mailSource.smtpSecurity) : "";
  form.smtpHost = envText(mailSource.smtpHostFromDatabase, mailSource.smtpHost);
  form.smtpUsername = envText(mailSource.smtpUsernameFromDatabase, mailSource.smtpUsername);
  form.mailFrom = envText(mailSource.fromAddressFromDatabase, mailSource.fromAddress);
  form.smtpPort = mailSource.smtpPortFromDatabase ? asText(mailSource.smtpPort) : "";
  ph.smtpPort = mailSource.smtpPortFromDatabase ? "" : `跟随环境变量（当前 ${mailSource.smtpPort || 465}）`;
  form.smtpClearPassword = false;
  form.smtpPassword = "";
  ph.smtpPassword = mailSource.smtpPasswordFromDatabase
    ? `已保存 ${asText(mailSource.smtpPasswordMasked) || "••••"}（留空不改动）`
    : mailSource.smtpPasswordConfigured
      ? "跟随环境变量（已配置）"
      : "跟随环境变量";
  form.verificationTtlSeconds = mailSource.verificationTtlFromDatabase
    ? asText(mailSource.verificationTtlSeconds)
    : "";
  ph.verificationTtlSeconds = `跟随环境变量（当前 ${mailSource.verificationTtlSeconds}）`;
  form.verificationCooldownSeconds = mailSource.verificationCooldownFromDatabase
    ? asText(mailSource.verificationCooldownSeconds)
    : "";
  ph.verificationCooldownSeconds = `跟随环境变量（当前 ${mailSource.verificationCooldownSeconds}）`;
  form.verificationGlobalHourlyLimit = mailSource.verificationGlobalHourlyLimitFromDatabase
    ? asText(mailSource.verificationGlobalHourlyLimit)
    : "";
  ph.verificationGlobalHourlyLimit = `跟随环境变量（当前 ${mailSource.verificationGlobalHourlyLimit}）`;
  form.deliveryEmailEnabled = mailSource.deliveryEmailEnabled !== false;
  form.mailTestEmail = asText(mailSource.defaultEmail);
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
          <SitePanel v-show="active === 'site'" :form="form" />
          <PaymentsPanel :form="form" :ph="ph" :saved="saved" :active="active" />
          <MailPanel v-show="active === 'mail'" :form="form" :ph="ph" :saved="saved" />
          <InvitePanel v-show="active === 'invite'" :form="form" :ph="ph" />
        </form>
        <PaletteSettings v-show="active === 'palette'" />
      </div>
    </div>
  </section>
</template>
