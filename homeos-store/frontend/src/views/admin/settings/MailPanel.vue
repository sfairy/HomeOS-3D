<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { adminApi } from "../../../api/http.js";
import { errorMessage } from "../../../store-types.js";
import { useToastStore } from "../../../stores/toast.js";
import DiagnosticList from "./DiagnosticList.vue";
import {
  asText,
  type DiagnosticCheck,
  type MailPreset,
  type SettingsForm,
  type SettingsPayload,
  type SettingsPlaceholders,
} from "./types.js";

const props = defineProps<{
  form: SettingsForm;
  ph: SettingsPlaceholders;
  saved: SettingsPayload | null;
}>();

const toast = useToastStore();
const presetProvider = ref("");
const presetEmail = ref("");
const mailChecks = ref<DiagnosticCheck[]>([]);
const mailTestMessage = ref("");
const mailTestOk = ref(true);
const mailTesting = ref(false);

function mail(): Record<string, unknown> {
  return (props.saved?.mail || {}) as Record<string, unknown>;
}

const mailPresets = computed<MailPreset[]>(() =>
  Array.isArray(mail().presets) ? (mail().presets as MailPreset[]) : [],
);

function presetById(id: unknown): MailPreset | null {
  const wanted = asText(id).trim().toLowerCase();
  if (!wanted) return null;
  return mailPresets.value.find((item) => item.id === wanted) || null;
}

function presetEmailDomain(email: unknown): string {
  const address = asText(email).trim();
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
  return byEmail || (presetProvider.value ? null : presetForEmail(asText(mail().defaultEmail)));
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
  const raw = (props.form.siteName || "").trim() || "HomeOS";
  return raw.replace(/[<>",;:]/g, "").trim() || "HomeOS";
}

function applyPreset(preset: MailPreset | null, overwrite: boolean) {
  if (!preset) return false;
  const email = (presetEmail.value.trim() || asText(mail().defaultEmail)).trim();
  const set = (
    target: "mailMode" | "smtpHost" | "smtpSecurity" | "smtpPort" | "smtpUsername" | "mailFrom",
    value: unknown,
  ) => {
    if (!overwrite && String(props.form[target] || "").trim()) return;
    props.form[target] = value == null ? "" : String(value);
  };
  set("mailMode", "smtp");
  set("smtpHost", preset.smtpHost);
  set("smtpSecurity", preset.smtpSecurity);
  set("smtpPort", preset.smtpPort);
  if (email) {
    set("smtpUsername", email);
    set("mailFrom", `${displayName()} <${email}>`);
    if (!props.form.supportEmail.trim()) props.form.supportEmail = email;
  }
  if (!props.form.mailTestEmail.trim() && email) props.form.mailTestEmail = email;
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

const mailBadge = computed(() => {
  const source = mail();
  const mode = props.form.mailMode || asText(source.mode) || "log";
  const host = props.form.smtpHost.trim() || asText(source.smtpHost);
  const username = props.form.smtpUsername.trim() || asText(source.smtpUsername);
  const passwordConfigured = Boolean(source.smtpPasswordConfigured) || Boolean(props.form.smtpPassword.trim());
  const ready = mode === "smtp" && Boolean(host) && (!username || passwordConfigured);
  const dirty =
    mode !== (asText(source.mode) || "log") ||
    host !== asText(source.smtpHost) ||
    username !== asText(source.smtpUsername) ||
    Boolean(props.form.smtpPassword.trim());
  const suffix = dirty ? "（表单已改，未保存）" : "";
  if (mode === "smtp" && !ready) {
    return {
      text: "smtp 凭据不全 · 验证码只会写日志，用户收不到" + suffix,
      className: "admin-status-chip is-danger",
    };
  }
  if (mode === "smtp") {
    const port = props.form.smtpPort || asText(source.smtpPort);
    return { text: `SMTP 就绪 · ${host}:${port}${suffix}`, className: "admin-status-chip" };
  }
  return {
    text: "log 模式 · 验证码不会真正发出（生产请切到 smtp）" + suffix,
    className: "admin-status-chip is-muted",
  };
});

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
      body: JSON.stringify({ email: props.form.mailTestEmail.trim() || null }),
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

watch(
  () => props.saved,
  (payload) => {
    if (!payload) return;
    const mailSource = mail();
    presetProvider.value = "";
    presetEmail.value = asText(mailSource.defaultEmail);
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
      (asText(mailSource.mode) || "log") !== "smtp";
    if (unconfigured) {
      applyPreset(presetForEmail(asText(mailSource.defaultEmail)), false);
    }
  },
);
</script>

<template>
  <div class="admin-tab-pane" role="tabpanel" data-tone="aura">
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
    <DiagnosticList :checks="mailChecks" />
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
</template>
