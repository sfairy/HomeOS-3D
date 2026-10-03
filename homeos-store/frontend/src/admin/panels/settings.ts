/** 站点配置与诊断。 */

import { errorMessage } from "../../store-types.js";
import { $, $$, toast } from "../dom.js";
import { state } from "../state.js";
import { api, withBusy } from "../api.js";
import { askConfirm, askPurge } from "../dialogs.js";
import { pageState } from "../table.js";
import { host } from "../host.js";

type SettingsLoadPhase = 'loading' | 'ready' | 'error';

type SettingsFormControls = HTMLFormControlsCollection & {
  siteName: HTMLInputElement;
  siteTitle: HTMLInputElement;
  supportEmail: HTMLInputElement;
  logoUrl: HTMLInputElement;
  deployBaseUrl: HTMLInputElement;
  description: HTMLTextAreaElement;
  announcement: HTMLTextAreaElement;
  paymentProvider: HTMLSelectElement;
  paymentDisplayName: HTMLInputElement;
  paymentTransactionDescription: HTMLInputElement;
  paymentEnabled: HTMLInputElement;
  paymentChannelAlipay: HTMLInputElement;
  paymentChannelWechat: HTMLInputElement;
  maintenanceMode: HTMLInputElement;
  maintenanceMessage: HTMLTextAreaElement;
  referralEnabled: HTMLInputElement;
  referralRatePercent: HTMLInputElement;
  referralWithdrawalFeePercent: HTMLInputElement;
  referralWithdrawalMinPoints: HTMLInputElement;
  deviceReleaseCooldownSeconds: HTMLInputElement;
  alipayAppId: HTMLInputElement;
  alipaySellerId: HTMLInputElement;
  alipayGatewayUrl: HTMLInputElement;
  alipayNotifyUrl: HTMLInputElement;
  alipayReturnUrl: HTMLInputElement;
  alipayClearPrivateKey: HTMLInputElement;
  alipayClearPublicKey: HTMLInputElement;
  alipayAppPrivateKey: HTMLTextAreaElement;
  alipayPublicKey: HTMLTextAreaElement;
  wechatMchId: HTMLInputElement;
  wechatAppId: HTMLInputElement;
  wechatMerchantSerialNo: HTMLInputElement;
  wechatGatewayUrl: HTMLInputElement;
  wechatNotifyUrl: HTMLInputElement;
  wechatPlatformPublicKeyId: HTMLInputElement;
  wechatClearApiV3Key: HTMLInputElement;
  wechatClearMerchantPrivateKey: HTMLInputElement;
  wechatClearPlatformPublicKey: HTMLInputElement;
  wechatApiV3Key: HTMLInputElement;
  wechatMerchantPrivateKey: HTMLTextAreaElement;
  wechatPlatformPublicKey: HTMLTextAreaElement;
  mailMode: HTMLSelectElement;
  smtpSecurity: HTMLSelectElement;
  smtpHost: HTMLInputElement;
  smtpUsername: HTMLInputElement;
  mailFrom: HTMLInputElement;
  smtpPort: HTMLInputElement;
  smtpClearPassword: HTMLInputElement;
  smtpPassword: HTMLInputElement;
  verificationTtlSeconds: HTMLInputElement;
  verificationCooldownSeconds: HTMLInputElement;
  verificationGlobalHourlyLimit: HTMLInputElement;
  deliveryEmailEnabled: HTMLInputElement;
  mailTestEmail: HTMLInputElement;
};

type SettingsForm = HTMLFormElement & { elements: SettingsFormControls };

type DiagnosticLevel = 'pass' | 'warn' | 'fail' | 'skip';

type DiagnosticCheck = {
  level?: string;
  label?: string;
  id?: string;
  detail?: string;
  [key: string]: unknown;
};

type MailPreset = {
  id: string;
  label?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpSecurity?: string;
  domains?: string[];
  hint?: string;
  [key: string]: unknown;
};

type MailSettings = {
  mode?: string;
  smtpHost?: string;
  smtpPort?: string | number;
  smtpUsername?: string;
  fromAddress?: string;
  smtpSecurity?: string;
  smtpPasswordConfigured?: boolean;
  smtpPasswordFromDatabase?: boolean;
  smtpPasswordMasked?: string;
  smtpReady?: boolean;
  smtpMisconfigured?: boolean;
  modeFromDatabase?: boolean;
  smtpSecurityFromDatabase?: boolean;
  smtpHostFromDatabase?: boolean;
  smtpUsernameFromDatabase?: boolean;
  fromAddressFromDatabase?: boolean;
  smtpPortFromDatabase?: boolean;
  verificationTtlFromDatabase?: boolean;
  verificationTtlSeconds?: number;
  verificationCooldownFromDatabase?: boolean;
  verificationCooldownSeconds?: number;
  verificationGlobalHourlyLimitFromDatabase?: boolean;
  verificationGlobalHourlyLimit?: number;
  deliveryEmailEnabled?: boolean;
  defaultEmail?: string;
  presets?: MailPreset[];
  [key: string]: unknown;
};

type AlipaySettings = {
  configured?: boolean;
  appId?: string;
  sellerId?: string;
  gatewayUrl?: string;
  notifyUrl?: string;
  returnUrl?: string;
  signType?: string;
  verifyResponseSign?: boolean;
  appIdFromDatabase?: boolean;
  sellerIdFromDatabase?: boolean;
  gatewayUrlFromDatabase?: boolean;
  notifyUrlFromDatabase?: boolean;
  returnUrlFromDatabase?: boolean;
  applicationPrivateKeyFromDatabase?: boolean;
  applicationPrivateKeyMasked?: string;
  applicationPrivateKeyConfigured?: boolean;
  alipayPublicKeyFromDatabase?: boolean;
  alipayPublicKeyMasked?: string;
  alipayPublicKeyConfigured?: boolean;
  [key: string]: unknown;
};

type WechatSettings = {
  configured?: boolean;
  mchId?: string;
  appId?: string;
  merchantSerialNo?: string;
  gatewayUrl?: string;
  notifyUrl?: string;
  platformPublicKeyId?: string;
  mchIdFromDatabase?: boolean;
  appIdFromDatabase?: boolean;
  merchantSerialNoFromDatabase?: boolean;
  gatewayUrlFromDatabase?: boolean;
  notifyUrlFromDatabase?: boolean;
  platformPublicKeyIdFromDatabase?: boolean;
  apiV3KeyFromDatabase?: boolean;
  apiV3KeyMasked?: string;
  apiV3KeyConfigured?: boolean;
  merchantPrivateKeyFromDatabase?: boolean;
  merchantPrivateKeyMasked?: string;
  merchantPrivateKeyConfigured?: boolean;
  platformPublicKeyFromDatabase?: boolean;
  platformPublicKeyMasked?: string;
  platformPublicKeyConfigured?: boolean;
  [key: string]: unknown;
};

type PaymentChannel = { provider?: string; [key: string]: unknown };

type SettingsPayload = {
  store?: Record<string, unknown>;
  payment?: {
    provider?: string;
    displayName?: string;
    transactionDescription?: string;
    transactionDescriptionFromDatabase?: boolean;
    enabled?: boolean;
    channels?: PaymentChannel[];
    [key: string]: unknown;
  };
  referral?: Record<string, unknown>;
  announcement?: string;
  deviceReleaseCooldownSeconds?: number | string | null;
  deviceReleaseCooldownEffectiveSeconds?: number;
  orderTtlSeconds?: number;
  orderTtlRecommendedSeconds?: number;
  alipay?: AlipaySettings;
  wechat?: WechatSettings;
  mail?: MailSettings;
  channels?: string[];
  [key: string]: unknown;
};

function settingsForm(): SettingsForm {
  const form = $('#settings-form') as SettingsForm | null;
  if (!form) throw new Error('settings form missing');
  return form;
}

function control(form: SettingsForm, name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}


/** 站点配置的「读到了吗」闸门：读失败时表单只是没回填（既非空也非对），此时保存会把支付渠道等 */
function setSettingsLoadState(phase: SettingsLoadPhase, message = '') {
  const chip = $('#settings-load-status');
  const submit = $('#settings-save') as HTMLButtonElement | null;
  state.settingsLoaded = phase === 'ready';
  state.settingsLoadPhase = phase;
  state.settingsLoadMessage = message;
  if (submit) {
    submit.disabled = phase !== 'ready';
    submit.title = phase === 'ready' ? '' : '配置未读到，暂时不能保存';
  }
  if (!chip) return;
  if (phase === 'loading') {
    chip.textContent = '正在读取配置…';
    chip.className = 'admin-status-chip is-muted';
  } else if (phase === 'error') {
    chip.textContent = `配置读取失败：${message || '未知原因'}（已禁用保存）`;
    chip.className = 'admin-status-chip is-danger';
  } else {
    chip.textContent = '配置已就绪';
    chip.className = 'admin-status-chip';
  }
}

/** 按**上一次**的结论把闸门重新落到界面上：「忙状态」会把按钮重新启用，保存后的重载若失败， */
 function syncSettingsGate() {
  setSettingsLoadState(state.settingsLoadPhase || 'loading', state.settingsLoadMessage || '');
}

export async function loadSettings() {
  setSettingsLoadState('loading');
  let data: SettingsPayload;
  try {
    data = await api('/settings') as SettingsPayload;
  } catch (error) {
    setSettingsLoadState('error', errorMessage(error, '操作失败'));
    throw error;
  }
  state.settings = data;
  const form = settingsForm();
  const store = (data.store || {}) as Record<string, unknown>;
  const payment = data.payment || {};
  const referral = (data.referral || {}) as Record<string, unknown>;
  form.elements.siteName.value = String(store.siteName || '');
  form.elements.siteTitle.value = String(store.siteTitle || '');
  form.elements.supportEmail.value = String(store.supportEmail || '');

  form.elements.logoUrl.value = String(store.logoUrl || '');

  form.elements.deployBaseUrl.value = String(store.deployBaseUrl || '');
  form.elements.description.value = String(store.description || '');
  form.elements.announcement.value = data.announcement || '';

  form.elements.paymentProvider.value = payment.provider || '';
  form.elements.paymentDisplayName.value = payment.displayName || '';

  form.elements.paymentTransactionDescription.value = payment.transactionDescriptionFromDatabase
    ? payment.transactionDescription || ''
    : '';
  form.elements.paymentEnabled.checked = Boolean(payment.enabled);
  form.elements.maintenanceMode.checked = Boolean(store.maintenanceMode);
  form.elements.maintenanceMessage.value = String(store.maintenanceMessage || '');
  form.elements.referralEnabled.checked = Boolean(referral.enabled);
  form.elements.referralRatePercent.value = String(referral.ratePercent ?? 0);
  form.elements.referralWithdrawalFeePercent.value = String(referral.withdrawalFeePercent ?? 0);
  form.elements.referralWithdrawalMinPoints.value = String(referral.withdrawalMinPoints ?? 0);

  form.elements.deviceReleaseCooldownSeconds.value = data.deviceReleaseCooldownSeconds == null ? '' : String(data.deviceReleaseCooldownSeconds);
  form.elements.deviceReleaseCooldownSeconds.placeholder =
    `跟随环境变量（当前 ${data.deviceReleaseCooldownEffectiveSeconds ?? 0}）`;
  loadAlipayCredentials(data.alipay || {});
  loadMailSettings(data.mail || {});
  renderOrderTtlWarning(data);
  setSettingsLoadState('ready');
}

 function renderDiagnostics(selector: string, checks: DiagnosticCheck[] | unknown) {
  const list = $(selector);
  if (!list) return;
  list.textContent = '';
  if (!Array.isArray(checks) || !checks.length) return;
  const LEVEL_CLASS = { pass: 'is-pass', warn: 'is-warn', fail: 'is-fail', skip: 'is-skip' };
  const LEVEL_ICON = { pass: '✓', warn: '!', fail: '×', skip: '·' };
  (checks as DiagnosticCheck[]).forEach((item) => {
    const raw = String(item.level || '');
    const level: DiagnosticLevel = raw in LEVEL_CLASS ? (raw as DiagnosticLevel) : 'skip';
    const row = document.createElement('li');
    row.className = `admin-diagnostic ${LEVEL_CLASS[level]}`;
    const icon = document.createElement('span');
    icon.className = 'admin-diagnostic__icon';
    icon.textContent = LEVEL_ICON[level];
    const label = document.createElement('strong');
    label.className = 'admin-diagnostic__label';
    label.textContent = item.label || item.id || '';
    const detail = document.createElement('span');
    detail.className = 'admin-diagnostic__detail';
    detail.textContent = item.detail || '';
    row.title = `${item.label || ''}：${item.detail || ''}`;
    row.append(icon, label, detail);
    list.append(row);
  });
}

 function clearDiagnostics(selector: string) {
  const list = $(selector);
  if (list) list.textContent = '';
}

/** 回填支付宝凭据区块，三条铁律：密钥输入框永不回填（只把打码值放进 placeholder）； */
function loadAlipayCredentials(alipay: AlipaySettings) {
  const form = settingsForm();
  const envHint = (configured: boolean | undefined) => (configured ? '跟随环境变量（已配置）' : '跟随环境变量');
  form.elements.alipayAppId.value = alipay.appIdFromDatabase ? alipay.appId || '' : '';
  form.elements.alipaySellerId.value = alipay.sellerIdFromDatabase ? alipay.sellerId || '' : '';
  form.elements.alipayGatewayUrl.value = alipay.gatewayUrlFromDatabase ? alipay.gatewayUrl || '' : '';
  form.elements.alipayNotifyUrl.value = alipay.notifyUrlFromDatabase ? alipay.notifyUrl || '' : '';
  form.elements.alipayReturnUrl.value = alipay.returnUrlFromDatabase ? alipay.returnUrl || '' : '';
  form.elements.alipayClearPrivateKey.checked = false;
  form.elements.alipayClearPublicKey.checked = false;
  form.elements.alipayAppPrivateKey.value = '';
  form.elements.alipayPublicKey.value = '';
  form.elements.alipayAppPrivateKey.placeholder = alipay.applicationPrivateKeyFromDatabase
    ? `已保存 ${alipay.applicationPrivateKeyMasked || '••••'}（留空不改动）`
    : envHint(alipay.applicationPrivateKeyConfigured);
  form.elements.alipayPublicKey.placeholder = alipay.alipayPublicKeyFromDatabase
    ? `已保存 ${alipay.alipayPublicKeyMasked || '••••'}（留空不改动）`
    : envHint(alipay.alipayPublicKeyConfigured);
  syncAlipaySecretInputs();
  renderAlipayBadge(alipay);
  renderAlipayEffectiveUrls(alipay);
  loadWechatCredentials(((state.settings as SettingsPayload | null)?.wechat || {}) as WechatSettings);
  loadPaymentChannels((state.settings as SettingsPayload | null)?.channels || []);
  updateChannelSummary();
  const alipayTest = $('#alipay-test-result');
  if (alipayTest) { alipayTest.textContent = ''; alipayTest.className = 'admin-hint'; }
  clearDiagnostics('#alipay-diagnostic-list');
}

/** 订单有效期与支付宝二维码寿命不匹配时的常驻提示。 */
function renderOrderTtlWarning(payload: SettingsPayload) {
  const node = $('#order-ttl-warning');
  if (!node) return;
  const ttl = Number(payload.orderTtlSeconds || 0);
  const floor = Number(payload.orderTtlRecommendedSeconds || 300);


  const qrChannels = (payload.payment?.channels || []).map((item: PaymentChannel) => item.provider);
  const hasQrChannel = qrChannels.length > 0 || Boolean(payload.payment?.provider);
  const mismatch = hasQrChannel && ttl > 0 && ttl < floor;
  node.hidden = !mismatch;
  if (!mismatch) return;
  node.textContent =
    `当前订单有效期 ${ttl} 秒，短于付款码在渠道侧的有效期（约 2 小时）：` +
    '用户扫码稍慢就会在订单过期后才付款，变成需要人工核对的复活单。' +
    `建议把 STORE_ORDER_TTL_SECONDS 调到 ${floor}~900 秒。`;
}


/** 把「当前实际生效」的回调地址与签名配置念出来。 */
function renderAlipayEffectiveUrls(alipay: AlipaySettings) {
  const target = $('#alipay-effective-urls');
  if (!target) return;
  const notify = alipay.notifyUrl || '（未配置，将按 STORE_BASE_URL 推导）';
  const back = alipay.returnUrl || '（未配置，将按 STORE_BASE_URL 推导）';
  target.textContent = `当前生效 · 异步通知 ${notify} · 同步跳转 ${back} · 签名 ${alipay.signType || 'RSA2'}${alipay.verifyResponseSign === false ? '（响应验签已关闭，不建议）' : ''}`;
}

/** 回填注册邮箱验证码区块，与支付宝区块共用同三条铁律（授权码永不回填、只回填后台来源、清除勾选复位）。 */
function loadMailSettings(mail: MailSettings) {
  const form = settingsForm();
  const envText = (fromDatabase: boolean | undefined, value: unknown) =>
    fromDatabase ? String(value || '') : '';
  const defaultEmail = mail.defaultEmail || '';
  renderMailPresetOptions(mail);
  const presetEmail = $('#mail-preset-email') as HTMLInputElement | null;
  if (presetEmail && !presetEmail.value.trim()) presetEmail.value = defaultEmail;
  form.elements.mailMode.value = mail.modeFromDatabase ? mail.mode || '' : '';
  form.elements.smtpSecurity.value = mail.smtpSecurityFromDatabase ? mail.smtpSecurity || '' : '';
  form.elements.smtpHost.value = envText(mail.smtpHostFromDatabase, mail.smtpHost);
  form.elements.smtpUsername.value = envText(mail.smtpUsernameFromDatabase, mail.smtpUsername);
  form.elements.mailFrom.value = envText(mail.fromAddressFromDatabase, mail.fromAddress);
  form.elements.smtpPort.value = mail.smtpPortFromDatabase ? String(mail.smtpPort ?? '') : '';
  form.elements.smtpPort.placeholder = mail.smtpPortFromDatabase
    ? ''
    : `跟随环境变量（当前 ${mail.smtpPort || 465}）`;
  form.elements.smtpClearPassword.checked = false;
  form.elements.smtpPassword.value = '';
  form.elements.smtpPassword.placeholder = mail.smtpPasswordFromDatabase
    ? `已保存 ${mail.smtpPasswordMasked || '••••'}（留空不改动）`
    : mail.smtpPasswordConfigured
      ? '跟随环境变量（已配置）'
      : '跟随环境变量';
  form.elements.verificationTtlSeconds.value = mail.verificationTtlFromDatabase
    ? String(mail.verificationTtlSeconds ?? '')
    : '';
  form.elements.verificationTtlSeconds.placeholder =
    `跟随环境变量（当前 ${mail.verificationTtlSeconds}）`;
  form.elements.verificationCooldownSeconds.value = mail.verificationCooldownFromDatabase
    ? String(mail.verificationCooldownSeconds ?? '')
    : '';
  form.elements.verificationCooldownSeconds.placeholder =
    `跟随环境变量（当前 ${mail.verificationCooldownSeconds}）`;
  form.elements.verificationGlobalHourlyLimit.value =
    mail.verificationGlobalHourlyLimitFromDatabase
      ? String(mail.verificationGlobalHourlyLimit ?? '')
      : '';
  form.elements.verificationGlobalHourlyLimit.placeholder =
    `跟随环境变量（当前 ${mail.verificationGlobalHourlyLimit}）`;
  form.elements.deliveryEmailEnabled.checked = mail.deliveryEmailEnabled !== false;
  syncMailSecretInput();
  if (!form.elements.mailTestEmail.value.trim()) {
    form.elements.mailTestEmail.value = defaultEmail;
  }
  if (mailLooksUnconfigured(mail)) {
    applyMailPreset(presetForEmail(defaultEmail, mail), mail, { overwrite: false });
  }
  syncMailPresetHint(mail);
  refreshMailBadge();
  const mailTest = $('#mail-test-result');
  if (mailTest) { mailTest.textContent = ''; mailTest.className = 'admin-hint'; }
  clearDiagnostics('#mail-diagnostic-list');
}

/** 渲染邮件投递的状态徽标：这个徽标存在的唯一理由是「填了 SMTP 但授权码漏了」不会报错 —— */
function renderMailBadge(mail: MailSettings, unsaved = false) {
  const badge = $('#mail-delivery-status');
  const mode = mail.mode || 'log';
  const suffix = unsaved ? '（表单已改，未保存）' : '';
  let text;
  let tone = '';
  if (mail.smtpMisconfigured) {
    text = 'smtp 凭据不全 · 验证码只会写日志，用户收不到';
    tone = 'is-danger';
  } else if (mode === 'smtp' && mail.smtpReady) {
    text = `SMTP 就绪 · ${mail.smtpHost}:${mail.smtpPort}`;
  } else if (mode === 'smtp') {
    text = 'smtp 模式但缺少服务器地址，验证码只会写日志';
    tone = 'is-danger';
  } else {
    text = 'log 模式 · 验证码不会真正发出（生产请切到 smtp）';
    tone = 'is-muted';
  }
  if (!badge) return;
  badge.textContent = text + suffix;
  badge.className = `admin-status-chip${tone ? ` ${tone}` : ''}`;
}

 function syncMailSecretInput() {
  const form = settingsForm();
  const clear = form.elements.smtpClearPassword;
  const input = form.elements.smtpPassword;
  input.disabled = clear.checked;
  if (clear.checked) input.value = '';
}

function mailPresets(mail: MailSettings | null | undefined): MailPreset[] {
  return Array.isArray(mail?.presets) ? mail.presets : [];
}

 function presetById(id: unknown, mail: MailSettings): MailPreset | null {
  const wanted = String(id || '').trim().toLowerCase();
  if (!wanted) return null;
  return mailPresets(mail).find(item => item.id === wanted) || null;
}

/** 取邮箱的域名部分（小写）。 */
function presetEmailDomain(email: unknown): string {
  const address = String(email || '').trim();
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1).trim().toLowerCase() : '';
}

/** 按邮箱域名反查预设。 */
function presetForEmail(email: unknown, mail: MailSettings): MailPreset | null {
  const domain = presetEmailDomain(email);
  if (!domain) return null;
  return mailPresets(mail).find(item => (item.domains || []).includes(domain)) || null;
}

/** 当前该用哪个预设：优先运营在下拉框里的显式选择，其次按邮箱地址识别。 */
 function selectedMailPreset(mail: MailSettings): MailPreset | null {
  const select = $('#mail-preset-provider') as HTMLSelectElement | null;
  const email = $('#mail-preset-email') as HTMLInputElement | null;
  return presetById(select?.value, mail) || presetForEmail(email?.value, mail);
}

/** 把预设清单灌进下拉框（保留第一项「自动识别」，重复加载不会越堆越多）。 */
function renderMailPresetOptions(mail: MailSettings) {
  const select = $('#mail-preset-provider') as HTMLSelectElement | null;
  if (!select) return;
  const current = select.value;
  $$('option', select).slice(1).forEach(option => option.remove());
  mailPresets(mail).forEach((preset) => {
    const option = document.createElement('option');
    option.value = preset.id;
    option.textContent = `${preset.label} · ${preset.smtpHost}:${preset.smtpPort}`;
    select.append(option);
  });
  select.value = current;
}

/** 只更新「选中哪个服务商」与一行提示，**不写任何表单字段**。 */
 function syncMailPresetHint(mail: MailSettings) {
  const select = $('#mail-preset-provider') as HTMLSelectElement | null;
  const emailInput = $('#mail-preset-email') as HTMLInputElement | null;
  if (!select || !emailInput) return;
  const email = emailInput.value.trim();
  const explicit = presetById(select.value, mail);
  const preset = explicit || presetForEmail(email, mail);
  if (preset && !explicit) select.value = preset.id;
  const hint = $('#mail-preset-hint');
  if (!hint) return;
  if (!preset) {
    hint.textContent = email
      ? `没认出 ${email} 用的哪家邮局（自有域名刻意不猜）：请手动填服务器、加密方式与端口，参数问邮箱管理员。`
      : '填一个邮箱地址就能带出服务器 / 加密 / 端口；也可以直接选服务商。';
    return;
  }
  hint.textContent =
    `${preset.label}：${preset.smtpHost} · 端口 ${preset.smtpPort} · ${String(preset.smtpSecurity || '').toUpperCase()}。${preset.hint || ''}`;
}

/** 发件人的显示名：站点名（去掉邮件头里有特殊含义的字符），没填就用 HomeOS。 */
function mailFromDisplayName(form: SettingsForm) {
  const raw = (form.elements.siteName.value || '').trim() || 'HomeOS';
  return raw.replace(/[<>",;:]/g, '').trim() || 'HomeOS';
}

 function applyMailPreset(preset: MailPreset | null | undefined, mail: MailSettings, { overwrite = true }: { overwrite?: boolean } = {}) {
  if (!preset) return false;
  const form = settingsForm();
  const email = (($('#mail-preset-email') as HTMLInputElement | null)?.value.trim() || (mail.defaultEmail || '').trim());
  const set = (name: string, value: string | number | undefined) => {
    const field = control(form, name);
    if (!field) return;
    if (!overwrite && String(field.value || '').trim()) return;
    field.value = String(value ?? '');
  };
  set('mailMode', 'smtp');
  set('smtpHost', preset.smtpHost);
  set('smtpSecurity', preset.smtpSecurity);
  set('smtpPort', preset.smtpPort);
  if (email) {
    set('smtpUsername', email);
    set('mailFrom', `${mailFromDisplayName(form)} <${email}>`);

    const support = form.elements.supportEmail;
    if (!String(support.value || '').trim()) support.value = email;
  }
  if (!form.elements.mailTestEmail.value.trim() && email) {
    form.elements.mailTestEmail.value = email;
  }
  refreshMailBadge();
  syncMailPresetHint(mail);
  return true;
}

/** 按**当前表单**重算徽标：「切到 smtp 但授权码没填」会让用户收不到验证码，必须在切换当下就变色提醒， */
 function refreshMailBadge() {
  const form = settingsForm();
  const saved = ((state.settings as SettingsPayload | null)?.mail || {}) as MailSettings;
  const mode = form.elements.mailMode.value || saved.mode || 'log';
  const smtpHostValue = form.elements.smtpHost.value.trim() || saved.smtpHost || '';
  const username = form.elements.smtpUsername.value.trim() || saved.smtpUsername || '';
  const passwordConfigured = Boolean(saved.smtpPasswordConfigured)
    || Boolean(form.elements.smtpPassword.value.trim());
  const ready = mode === 'smtp' && Boolean(smtpHostValue) && (!username || passwordConfigured);
  const dirty = mode !== (saved.mode || 'log')
    || smtpHostValue !== (saved.smtpHost || '')
    || username !== (saved.smtpUsername || '')
    || Boolean(form.elements.smtpPassword.value.trim());
  renderMailBadge(
    {
      ...saved,
      mode,
      smtpHost: smtpHostValue,
      smtpPort: form.elements.smtpPort.value || saved.smtpPort,
      smtpReady: ready,
      smtpMisconfigured: mode === 'smtp' && !ready,
    },
    dirty,
  );
}

/** 当前有没有「一份可能真的能发信」的邮件配置。 */
function mailLooksUnconfigured(mail: MailSettings) {
  return !mail.modeFromDatabase
    && !mail.smtpHostFromDatabase
    && !mail.smtpPortFromDatabase
    && !mail.smtpUsernameFromDatabase
    && !mail.fromAddressFromDatabase
    && !mail.smtpPasswordConfigured
    && !mail.smtpHost
    && !mail.smtpUsername
    && (mail.mode || 'log') !== 'smtp';
}

settingsForm().elements.smtpClearPassword.addEventListener('change', syncMailSecretInput);

settingsForm().elements.mailMode.addEventListener('change', refreshMailBadge);

$('#mail-preset-apply')?.addEventListener('click', () => {
  const mail = ((state.settings as SettingsPayload | null)?.mail || {}) as MailSettings;
  const preset = selectedMailPreset(mail);
  if (!preset) {
    toast('先填一个邮箱地址，或在下拉框里选一个服务商。', 'danger');
    return;
  }
  applyMailPreset(preset, mail, { overwrite: true });
  toast(`已按 ${preset.label} 填入预设，保存后生效；还差 SMTP 授权码。`, 'success');
});

$('#mail-preset-provider')?.addEventListener('change', (event) => {
  const mail = ((state.settings as SettingsPayload | null)?.mail || {}) as MailSettings;
  const preset = presetById((event.target as HTMLSelectElement).value, mail);
  if (preset) applyMailPreset(preset, mail, { overwrite: true });
  else syncMailPresetHint(mail);
});

$('#mail-preset-email')?.addEventListener('input', () => {
  const select = $('#mail-preset-provider') as HTMLSelectElement | null;
  if (select) select.value = '';
  syncMailPresetHint(((state.settings as SettingsPayload | null)?.mail || {}) as MailSettings);
});

 function mailPasswordPayload(form: SettingsForm) {
  if (form.elements.smtpClearPassword.checked) return { smtpClearPassword: true };
  const value = form.elements.smtpPassword.value.trim();
  return value ? { smtpPassword: value } : {};
}

/** 渲染「凭据是否可用」的结论徽标。 */
/** 渠道徽标：**每个渠道各报各的**。 */
function renderChannelBadge({ selector, channel, configured, fromDatabase }: { selector: string; channel: string; configured: boolean; fromDatabase: boolean }) {
  const badge = $(selector);
  if (!badge) return;
  const form = settingsForm();
  const enabled = paymentChannelsPayload(form).includes(channel);
  if (!enabled) {
    badge.textContent = '未启用（前台不会显示）';
    badge.className = 'admin-status-chip is-muted';
    return;
  }
  if (!configured) {
    badge.textContent = '未配置凭据 · 下单会失败';
    badge.className = 'admin-status-chip is-danger';
    return;
  }
  badge.textContent = `已配置 · ${fromDatabase ? '后台配置' : '环境变量'}`;
  badge.className = 'admin-status-chip';
}

 function renderAlipayBadge(alipay: AlipaySettings) {
  renderChannelBadge({
    selector: '#alipay-credential-status',
    channel: 'alipay',
    configured: Boolean(alipay.configured),
    fromDatabase: Boolean(alipay.appIdFromDatabase),
  });
}

/** 回填微信支付凭据区块。 */
function loadWechatCredentials(wechat: WechatSettings) {
  const form = settingsForm();
  const envHint = (configured: boolean | undefined) => (configured ? '跟随环境变量（已配置）' : '跟随环境变量');
  form.elements.wechatMchId.value = wechat.mchIdFromDatabase ? wechat.mchId || '' : '';
  form.elements.wechatAppId.value = wechat.appIdFromDatabase ? wechat.appId || '' : '';
  form.elements.wechatMerchantSerialNo.value = wechat.merchantSerialNoFromDatabase
    ? wechat.merchantSerialNo || ''
    : '';
  form.elements.wechatGatewayUrl.value = wechat.gatewayUrlFromDatabase
    ? wechat.gatewayUrl || ''
    : '';
  form.elements.wechatNotifyUrl.value = wechat.notifyUrlFromDatabase ? wechat.notifyUrl || '' : '';
  form.elements.wechatPlatformPublicKeyId.value = wechat.platformPublicKeyIdFromDatabase
    ? wechat.platformPublicKeyId || ''
    : '';
  ['wechatClearApiV3Key', 'wechatClearMerchantPrivateKey', 'wechatClearPlatformPublicKey']
    .forEach((name) => { control(form, name).checked = false; });
  form.elements.wechatApiV3Key.value = '';
  form.elements.wechatMerchantPrivateKey.value = '';
  form.elements.wechatPlatformPublicKey.value = '';
  form.elements.wechatApiV3Key.placeholder = wechat.apiV3KeyFromDatabase
    ? `已保存 ${wechat.apiV3KeyMasked || '••••'}（留空不改动）`
    : envHint(wechat.apiV3KeyConfigured);
  form.elements.wechatMerchantPrivateKey.placeholder = wechat.merchantPrivateKeyFromDatabase
    ? `已保存 ${wechat.merchantPrivateKeyMasked || '••••'}（留空不改动）`
    : envHint(wechat.merchantPrivateKeyConfigured);
  form.elements.wechatPlatformPublicKey.placeholder = wechat.platformPublicKeyFromDatabase
    ? `已保存 ${wechat.platformPublicKeyMasked || '••••'}（留空不改动）`
    : envHint(wechat.platformPublicKeyConfigured);
  syncWechatSecretInputs();
  renderWechatBadge(wechat);
  const wechatUrls = $('#wechat-effective-urls');
  if (wechatUrls) {
    wechatUrls.textContent = wechat.notifyUrl
      ? `当前生效的异步通知地址：${wechat.notifyUrl}`
      : '异步通知地址未配置，将按 STORE_BASE_URL 推导。没有它也能收款（轮询 + 巡检兜底），但会慢一些。';
  }
  const wechatTest = $('#wechat-test-result');
  if (wechatTest) { wechatTest.textContent = ''; wechatTest.className = 'admin-hint'; }
  clearDiagnostics('#wechat-diagnostic-list');
}

function renderWechatBadge(wechat: WechatSettings) {
  renderChannelBadge({
    selector: '#wechat-credential-status',
    channel: 'wechat',
    configured: Boolean(wechat.configured),
    fromDatabase: Boolean(wechat.mchIdFromDatabase),
  });
}

/** 「顾客会看到几个支付方式」的实时摘要。 */
function updateChannelSummary() {
  const node = $('#payment-channel-summary');
  if (!node) return;
  const form = settingsForm();
  const checked = paymentChannelsPayload(form);
  const fallback = form.elements.paymentProvider.value;
  const labels: Record<string, string> = { alipay: '支付宝', wechat: '微信支付' };

  if (!checked.length && fallback) {
    node.textContent =
      `未勾选任何渠道：当前只启用默认渠道「${labels[fallback] || fallback}」，`
      + '顾客在支付页只会看到一个付款按钮。要同时支持两个渠道，请把两个都勾上。';
    return;
  }
  if (!checked.length) {
    node.textContent = '未勾选任何渠道，也没有默认渠道：前台会收起支付入口，顾客无法下单。';
    return;
  }
  const names = checked.map(name => labels[name] || name).join('、');
  node.textContent = checked.length === 1
    ? `顾客在支付页会看到 1 个付款按钮：${names}。要同时支持支付宝和微信，把两个都勾上。`
    : `顾客在支付页会看到 ${checked.length} 个付款按钮，可以自己选：${names}。`;
}

/** 渠道相关的所有界面（两个徽标 + 摘要）一起刷新，避免只更新一半。 */
function refreshChannelUi() {
  const settings = (state.settings || {}) as SettingsPayload;
  renderAlipayBadge((settings.alipay || {}) as AlipaySettings);
  renderWechatBadge((settings.wechat || {}) as WechatSettings);
  updateChannelSummary();
}

 function syncWechatSecretInputs() {
  const form = settingsForm();
  const pairs = [
    ['wechatClearApiV3Key', 'wechatApiV3Key'],
    ['wechatClearMerchantPrivateKey', 'wechatMerchantPrivateKey'],
    ['wechatClearPlatformPublicKey', 'wechatPlatformPublicKey'],
  ];
  pairs.forEach(([clearName, inputName]) => {
    const clear = control(form, clearName);
    const input = control(form, inputName);
    input.disabled = clear.checked;
    if (clear.checked) input.value = '';
  });
}

['wechatClearApiV3Key', 'wechatClearMerchantPrivateKey', 'wechatClearPlatformPublicKey']
  .forEach((name) => {
    control(settingsForm(), name).addEventListener('change', syncWechatSecretInputs);
  });

/** 组装微信支付的密钥字段（口径与支付宝一致：空 = 不改动，勾清除 = 显式传空串）。 */
 function wechatSecretPayload(form: SettingsForm): Record<string, string> {
  const payload: Record<string, string> = {};
  const pairs = [
    ['wechatClearApiV3Key', 'wechatApiV3Key'],
    ['wechatClearMerchantPrivateKey', 'wechatMerchantPrivateKey'],
    ['wechatClearPlatformPublicKey', 'wechatPlatformPublicKey'],
  ];
  pairs.forEach(([clearName, inputName]) => {
    if (control(form, clearName).checked) payload[inputName] = '';
    else if (control(form, inputName).value.trim()) {
      payload[inputName] = control(form, inputName).value.trim();
    }
  });
  return payload;
}

/** 启用的渠道 ↔ 两个复选框。 */
function loadPaymentChannels(channels: unknown) {
  const form = settingsForm();
  const enabled = new Set(Array.isArray(channels) ? channels : []);
  form.elements.paymentChannelAlipay.checked = enabled.has('alipay');
  form.elements.paymentChannelWechat.checked = enabled.has('wechat');
}

 function paymentChannelsPayload(form: SettingsForm): string[] {
  const channels = [];
  if (form.elements.paymentChannelAlipay.checked) channels.push('alipay');
  if (form.elements.paymentChannelWechat.checked) channels.push('wechat');
  return channels;
}

 function syncAlipaySecretInputs() {
  const form = settingsForm();
  const pairs = [
    ['alipayClearPrivateKey', 'alipayAppPrivateKey'],
    ['alipayClearPublicKey', 'alipayPublicKey'],
  ];
  pairs.forEach(([clearName, inputName]) => {
    const clear = control(form, clearName);
    const input = control(form, inputName);
    input.disabled = clear.checked;
    if (clear.checked) input.value = '';
  });
}

['alipayClearPrivateKey', 'alipayClearPublicKey'].forEach((name) => {
  control(settingsForm(), name).addEventListener('change', syncAlipaySecretInputs);
});


settingsForm().elements.paymentProvider.addEventListener('change', () => {
  const form = settingsForm();
  const chosen = form.elements.paymentProvider.value;
  if (chosen === 'alipay') form.elements.paymentChannelAlipay.checked = true;
  if (chosen === 'wechat') form.elements.paymentChannelWechat.checked = true;
  refreshChannelUi();
});

['paymentChannelAlipay', 'paymentChannelWechat'].forEach((name) => {
  control(settingsForm(), name).addEventListener('change', refreshChannelUi);
});

/** 组装密钥字段：只有「确实要改」时才把字段放进请求体。 */
 function alipaySecretPayload(form: SettingsForm): Record<string, string> {
  const payload: Record<string, string> = {};
  if (form.elements.alipayClearPrivateKey.checked) payload.alipayAppPrivateKey = '';
  else if (form.elements.alipayAppPrivateKey.value.trim()) {
    payload.alipayAppPrivateKey = form.elements.alipayAppPrivateKey.value.trim();
  }
  if (form.elements.alipayClearPublicKey.checked) payload.alipayPublicKey = '';
  else if (form.elements.alipayPublicKey.value.trim()) {
    payload.alipayPublicKey = form.elements.alipayPublicKey.value.trim();
  }
  return payload;
}

settingsForm().addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target as SettingsForm;

  if (!state.settingsLoaded) {
    toast('站点配置还没读到，保存已被拦下。请先点侧栏的「站点配置」重新加载。', 'danger');
    return;
  }
  try {
    await withBusy(form, async () => {
      await api('/settings', {
      method: 'PUT',
      body: JSON.stringify({
        siteName: form.elements.siteName.value.trim(),
        siteTitle: form.elements.siteTitle.value.trim(),
        supportEmail: form.elements.supportEmail.value.trim(),
        logoUrl: form.elements.logoUrl.value.trim(),
        deployBaseUrl: form.elements.deployBaseUrl.value.trim(),
        description: form.elements.description.value.trim(),
        announcement: form.elements.announcement.value.trim(),
        paymentProvider: form.elements.paymentProvider.value,
        paymentDisplayName: form.elements.paymentDisplayName.value.trim(),
        paymentTransactionDescription: form.elements.paymentTransactionDescription.value.trim(),
        paymentEnabled: form.elements.paymentEnabled.checked,
        maintenanceMode: form.elements.maintenanceMode.checked,
        maintenanceMessage: form.elements.maintenanceMessage.value.trim(),
        referralEnabled: form.elements.referralEnabled.checked,
        referralRatePercent: Number(form.elements.referralRatePercent.value || 0),
        referralWithdrawalFeePercent: Number(form.elements.referralWithdrawalFeePercent.value || 0),
        referralWithdrawalMinPoints: Number(form.elements.referralWithdrawalMinPoints.value || 0),

        deviceReleaseCooldownSeconds: form.elements.deviceReleaseCooldownSeconds.value === ''
          ? null
          : Number(form.elements.deviceReleaseCooldownSeconds.value),
        alipayAppId: form.elements.alipayAppId.value.trim(),
        alipaySellerId: form.elements.alipaySellerId.value.trim(),
        alipayGatewayUrl: form.elements.alipayGatewayUrl.value.trim(),
        alipayNotifyUrl: form.elements.alipayNotifyUrl.value.trim(),
        alipayReturnUrl: form.elements.alipayReturnUrl.value.trim(),
        ...alipaySecretPayload(form),


        wechatMchId: form.elements.wechatMchId.value.trim(),
        wechatAppId: form.elements.wechatAppId.value.trim(),
        wechatMerchantSerialNo: form.elements.wechatMerchantSerialNo.value.trim(),
        wechatPlatformPublicKeyId: form.elements.wechatPlatformPublicKeyId.value.trim(),
        wechatGatewayUrl: form.elements.wechatGatewayUrl.value.trim(),
        wechatNotifyUrl: form.elements.wechatNotifyUrl.value.trim(),
        ...wechatSecretPayload(form),

        paymentChannels: paymentChannelsPayload(form),

        mailMode: form.elements.mailMode.value,
        smtpSecurity: form.elements.smtpSecurity.value,
        smtpHost: form.elements.smtpHost.value.trim(),
        smtpUsername: form.elements.smtpUsername.value.trim(),
        mailFrom: form.elements.mailFrom.value.trim(),
        smtpPort: Number(form.elements.smtpPort.value || 0),
        verificationTtlSeconds: Number(form.elements.verificationTtlSeconds.value || 0),
        verificationCooldownSeconds: Number(form.elements.verificationCooldownSeconds.value || 0),
        verificationGlobalHourlyLimit: Number(
          form.elements.verificationGlobalHourlyLimit.value || 0
        ),

        deliveryEmailEnabled: form.elements.deliveryEmailEnabled.checked,
        ...mailPasswordPayload(form),
      }),
      });
      toast('站点配置已保存');
      await Promise.all([loadSettings(), host.loadOverview?.()]);
    }, '保存中…');
  } catch (error) { toast(errorMessage(error, '操作失败'), 'danger'); }
  finally {

    syncSettingsGate();
  }
});

/** 渠道自检按钮的公共实现：只有测试目标、结果节点与诊断列表不同。 */
async function runChannelProbe(event: Event, { channel, resultId, listId }: { channel: string; resultId: string; listId: string }) {
  const button = event.currentTarget as HTMLButtonElement;
  const output = $(resultId);
  if (!output) return;
  const label = button.textContent;
  output.textContent = '';
  output.className = 'admin-hint';
  clearDiagnostics(listId);
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '测试中…';
  try {
    const result = await api(`/settings/alipay/test?channel=${encodeURIComponent(channel)}`, {
      method: 'POST',
    }) as { message?: string; ok?: boolean; checks?: DiagnosticCheck[] };
    output.textContent = result.message || '';
    output.className = `admin-hint ${result.ok ? 'is-success' : 'is-danger'}`;
    renderDiagnostics(listId, result.checks || []);
    toast(result.ok ? '凭据可用' : '凭据不可用', result.ok ? 'success' : 'danger');
  } catch (error) {
    output.textContent = errorMessage(error, '操作失败');
    output.className = 'admin-hint is-danger';
    toast(errorMessage(error, '操作失败'), 'danger');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
}

$('#wechat-test-button')?.addEventListener('click', (event) =>
  runChannelProbe(event, {
    channel: 'wechat',
    resultId: '#wechat-test-result',
    listId: '#wechat-diagnostic-list',
  })
);

$('#alipay-test-button')?.addEventListener('click', (event) =>
  runChannelProbe(event, {
    channel: 'alipay',
    resultId: '#alipay-test-result',
    listId: '#alipay-diagnostic-list',
  })
);

/** 邮件诊断 / 发送测试邮件：按**已保存**的配置先做连接诊断，给了收件人再真发一封（先保存、再测试）。 */
$('#mail-test-button')?.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement;
  const output = $('#mail-test-result');
  const form = settingsForm();
  const email = form.elements.mailTestEmail.value.trim();
  if (!output) return;
  output.textContent = '';
  output.className = 'admin-hint';
  clearDiagnostics('#mail-diagnostic-list');
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '检测中…';
  try {
    const result = await api('/settings/mail/test', {
      method: 'POST',
      body: JSON.stringify({ email: email || null }),
    }) as { message?: string; ok?: boolean; checks?: DiagnosticCheck[]; email?: string };
    output.textContent = result.message || '';
    output.className = `admin-hint ${result.ok ? 'is-success' : 'is-danger'}`;
    renderDiagnostics('#mail-diagnostic-list', result.checks || []);
    toast(
      result.ok ? (result.email ? '测试邮件已投递' : '连接诊断通过') : '邮件链路未通过',
      result.ok ? 'success' : 'danger',
    );
  } catch (error) {
    output.textContent = errorMessage(error, '操作失败');
    output.className = 'admin-hint is-danger';
    toast(errorMessage(error, '操作失败'), 'danger');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
});


 const DIAGNOSTIC_KEYS = [
  'sessions', 'license-sessions', 'recovery-tokens',
  'login-attempts', 'email-verifications', 'device-release-events', 'coupon-redemptions',
];


const PURGE_SPECS: Record<string, { path: string; message: string; impact: string; reload: () => Promise<unknown> | unknown }> = {
  sessions: {
    path: '/sessions',
    message: '将删除这些天以前就已经失效的登录会话（后台与商店前台）。',
    impact: '只删 <b>到期时间早于截止时间</b> 的会话，也就是早就登不进去的记录；仍在有效期内的会话一条都不会动，没人会被踢下线。',
    reload: () => host.loadSessions?.(),
  },
  'license-sessions': {
    path: '/license-sessions',
    message: '将删除这些天以前就已经失效的客户端会话。',
    impact: '只删 <b>到期时间早于截止时间</b> 的会话记录（客户端侧早已重新激活）。未过期的会话保留，在线客户端不受影响。',
    reload: () => host.loadLicenseSessions?.(),
  },
  'recovery-tokens': {
    path: '/recovery-tokens',
    message: '将删除这些天以前就已经失效的设备找回令牌。',
    impact: '只删<b>已过期</b>的令牌。仍在有效期内的找回令牌保留，否则用户换机时会凭空失败。',
    reload: () => host.loadRecoveryTokens?.(),
  },
  'login-attempts': {
    path: '/login-attempts',
    message: '将删除这些天以前的登录尝试记录。',
    impact: '纯日志，删掉不影响任何判定。但排查「是不是被撞库了」靠的正是翻这些记录，建议至少保留 30 天。',
    reload: () => host.loadLoginAttempts?.(),
  },
  'email-verifications': {
    path: '/email-verifications',
    message: '将删除这些天以前的邮箱验证码记录。',
    impact: '只删<b>已消费或已过期</b>的验证码；仍在有效期内、还没被用过的验证码一律保留，否则用户正在走的注册/改密流程会凭空失败。',
    reload: () => host.loadEmailVerifications?.(),
  },
  'device-release-events': {
    path: '/device-release-events',
    message: '将删除这些天以前的设备解绑记录。',
    impact: '自助解绑的冷却判定读的是「每条授权最近一次解绑时间」，所以<b>每条授权的最新一条永远保留</b>，只有历史记录会被清掉。',
    reload: () => host.loadReleaseEvents?.(),
  },
};

 async function runPurge(key: string) {
  const spec = PURGE_SPECS[key];
  if (!spec) return;
  const days = await askPurge({
    title: '清理历史数据',
    message: spec.message,
    impact: spec.impact,
  });
  if (days === null) return;
  try {
    const result = await api(`${spec.path}?older_than_days=${days}`, { method: 'DELETE' }) as { deleted?: number };
    toast(result.deleted ? `已清理 ${result.deleted} 条` : '没有符合条件的记录，未做改动', result.deleted ? 'success' : 'warning');
    pageState(key).offset = 0;
    await spec.reload();
  } catch (error) { toast(errorMessage(error, '操作失败'), 'danger'); }
}

export async function loadDiagnostics() {

  await Promise.all(DIAGNOSTIC_KEYS.map(key => host.PAGED_LOADERS?.[key]?.()));
}

$('#diagnostics-refresh')?.addEventListener('click', () => {
  DIAGNOSTIC_KEYS.forEach(key => { pageState(key).offset = 0; });
  loadDiagnostics();
});

$('#panel-diagnostics')?.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const purge = target.closest('[data-purge]') as HTMLElement | null;
  if (purge) {
    await runPurge(String(purge.dataset.purge || ''));
    return;
  }


  if (target.closest('#redemption-filter')) {
    state.redemptionFilter = null;
    pageState('coupon-redemptions').offset = 0;
    await host.loadRedemptions?.();
    return;
  }

  const kick = target.closest('[data-session-revoke]') as HTMLElement | null;
  if (kick) {
    const ok = await askConfirm({
      title: '踢下线',
      message: `将撤销账号「${kick.dataset.sessionEmail}」的这一条登录会话。`,
      impact: '该会话对应的浏览器下次请求即失效、需要重新登录。<b>其他会话不受影响</b>；如果这就是你自己正在用的会话，你会立刻被登出。',
      okText: '踢下线',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await api(`/sessions/${encodeURIComponent(String(kick.dataset.sessionRevoke || ''))}`, { method: 'DELETE' });
      toast('会话已撤销');
      await host.loadSessions?.();
    } catch (error) { toast(errorMessage(error, '操作失败'), 'danger'); }
    return;
  }

  const licenseKick = target.closest('[data-license-session-revoke]') as HTMLElement | null;
  if (licenseKick) {
    const ok = await askConfirm({
      title: '撤销客户端会话',
      message: `将撤销激活码「${licenseKick.dataset.licenseCode}」的这条客户端会话。`,
      impact: '该客户端下次心跳会收到「会话不存在」，需要重新激活。绑定关系本身保留。',
      okText: '撤销',
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await api(`/license-sessions/${encodeURIComponent(String(licenseKick.dataset.licenseSessionRevoke || ''))}`, { method: 'DELETE' });
      toast('客户端会话已撤销');
      await host.loadLicenseSessions?.();
    } catch (error) { toast(errorMessage(error, '操作失败'), 'danger'); }
    return;
  }

  const tokenKick = target.closest('[data-recovery-token-revoke]') as HTMLElement | null;
  if (tokenKick) {
    const ok = await askConfirm({
      title: '作废找回令牌',
      message: `将作废激活码「${tokenKick.dataset.licenseCode}」的一条找回令牌。`,
      impact: '持有该令牌的设备无法再凭它恢复绑定，需要走完整激活流程。此操作不可撤销。',
      okText: '作废',
    });
    if (!ok) return;
    try {
      await api(`/recovery-tokens/${encodeURIComponent(String(tokenKick.dataset.recoveryTokenRevoke || ''))}`, { method: 'DELETE' });
      toast('找回令牌已作废');
      await host.loadRecoveryTokens?.();
    } catch (error) { toast(errorMessage(error, '操作失败'), 'danger'); }
    return;
  }

  const voidRow = target.closest('[data-redemption-void]') as HTMLElement | null;
  if (voidRow) {
    const ok = await askConfirm({
      title: '作废核销记录',
      message: `将作废「${voidRow.dataset.redemptionCode}」的一条核销记录（账号 ${voidRow.dataset.redemptionEmail}）。`,
      impact: '该账号会因此<b>重新获得一个名额</b>，优惠码的「已占用名额」也会重新统计。如果这条记录对应的订单还在成交状态，等于凭空放出了一个名额 —— 请只在重复核销、测试单或误发折扣时使用。记录本身会保留（标记为已作废），审计与对账仍可追溯。',
      okText: '作废',
    });
    if (!ok) return;
    try {
      const result = await api(`/coupon-redemptions/${voidRow.dataset.redemptionVoid}`, { method: 'DELETE' }) as { alreadyVoided?: boolean; redeemedCount?: number };
      toast(result.alreadyVoided ? '该记录此前已作废过' : `已作废，该优惠码当前占用 ${result.redeemedCount} 个名额`);
      await Promise.all([host.loadRedemptions?.(), host.loadCoupons?.()]);
    } catch (error) { toast(errorMessage(error, '操作失败'), 'danger'); }
    return;
  }
});
