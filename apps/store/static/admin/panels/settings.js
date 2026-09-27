/**
 * 站点配置与诊断。
 */

import { $, $$, toast } from "../dom.js?v=2609271411";
import { state } from "../state.js?v=2609271411";
import { api, withBusy } from "../api.js?v=2609271411";
import { askConfirm, askPurge } from "../dialogs.js?v=2609271411";
import { pageState } from "../table.js?v=2609271411";
import { host } from "../host.js?v=2609271411";

/**
 * 站点配置的「读到了吗」闸门：读失败时表单只是没回填（既非空也非对），此时保存会把支付渠道等
 */
function setSettingsLoadState(phase, message = '') {
  const chip = $('#settings-load-status');
  const submit = $('#settings-save');
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

/**
 * 按**上一次**的结论把闸门重新落到界面上：「忙状态」会把按钮重新启用，保存后的重载若失败，
 */
export function syncSettingsGate() {
  setSettingsLoadState(state.settingsLoadPhase || 'loading', state.settingsLoadMessage || '');
}

export async function loadSettings() {
  setSettingsLoadState('loading');
  let data;
  try {
    data = await api('/settings');
  } catch (error) {
    setSettingsLoadState('error', error.message);
    throw error;
  }
  state.settings = data;
  const form = $('#settings-form');
  const store = data.store || {};
  const payment = data.payment || {};
  const referral = data.referral || {};
  form.elements.siteName.value = store.siteName || '';
  form.elements.siteTitle.value = store.siteTitle || '';
  form.elements.supportEmail.value = store.supportEmail || '';
  // logoUrl 在响应里嵌在 store 下，写入时却是顶层字段（AdminSettingsRequest 的口径）
  form.elements.logoUrl.value = store.logoUrl || '';
  // 留空 = 账号中心的部署块整块不显示（不是回落默认值，见 admin.html 该字段的注释）
  form.elements.deployBaseUrl.value = store.deployBaseUrl || '';
  form.elements.description.value = store.description || '';
  form.elements.announcement.value = data.announcement || '';
  // 空串必须保持空串（= 跟随环境变量）：随手保存一次就把它写成一个具体渠道，
  form.elements.paymentProvider.value = payment.provider || '';
  form.elements.paymentDisplayName.value = payment.displayName || '';
  // 交易标题只在「来源是后台」时回填：留空即跟随环境变量（与支付宝凭据同款口径）。
  form.elements.paymentTransactionDescription.value = payment.transactionDescriptionFromDatabase
    ? payment.transactionDescription || ''
    : '';
  form.elements.paymentEnabled.checked = Boolean(payment.enabled);
  form.elements.maintenanceMode.checked = Boolean(store.maintenanceMode);
  form.elements.maintenanceMessage.value = store.maintenanceMessage || '';
  form.elements.referralEnabled.checked = Boolean(referral.enabled);
  form.elements.referralRatePercent.value = referral.ratePercent ?? 0;
  form.elements.referralWithdrawalFeePercent.value = referral.withdrawalFeePercent ?? 0;
  form.elements.referralWithdrawalMinPoints.value = referral.withdrawalMinPoints ?? 0;
  // 留空 = 跟随环境变量（与 smtpPort / verificationTtl 同款口径）：库里是 NULL 时
  form.elements.deviceReleaseCooldownSeconds.value = data.deviceReleaseCooldownSeconds ?? '';
  form.elements.deviceReleaseCooldownSeconds.placeholder =
    `跟随环境变量（当前 ${data.deviceReleaseCooldownEffectiveSeconds ?? 0}）`;
  loadAlipayCredentials(data.alipay || {});
  loadMailSettings(data.mail || {});
  renderOrderTtlWarning(data);
  setSettingsLoadState('ready');
}

export function renderDiagnostics(selector, checks) {
  const list = $(selector);
  list.textContent = '';
  if (!Array.isArray(checks) || !checks.length) return;
  const LEVEL_CLASS = { pass: 'is-pass', warn: 'is-warn', fail: 'is-fail', skip: 'is-skip' };
  const LEVEL_ICON = { pass: '✓', warn: '!', fail: '×', skip: '·' };
  checks.forEach((item) => {
    const level = LEVEL_CLASS[item.level] ? item.level : 'skip';
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

export function clearDiagnostics(selector) {
  const list = $(selector);
  if (list) list.textContent = '';
}

/**
 * 回填支付宝凭据区块，三条铁律：密钥输入框永不回填（只把打码值放进 placeholder）；
 */
function loadAlipayCredentials(alipay) {
  const form = $('#settings-form');
  const envHint = (configured) => (configured ? '跟随环境变量（已配置）' : '跟随环境变量');
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
  loadWechatCredentials((state.settings || {}).wechat || {});
  loadPaymentChannels((state.settings || {}).channels || []);
  updateChannelSummary();
  $('#alipay-test-result').textContent = '';
  $('#alipay-test-result').className = 'admin-hint';
  clearDiagnostics('#alipay-diagnostic-list');
}

/**
 * 订单有效期与支付宝二维码寿命不匹配时的常驻提示。
 *
 * 二维码在渠道侧约两小时有效；本地订单 TTL 短于它时，用户扫码稍慢就会变成
 * 「订单已过期后才到账」的复活单 —— 每笔都要人工核对库存。这条提示常驻，
 * 不用一闪而过的 toast：运营是在事后改配置时才需要看到它。
 */
function renderOrderTtlWarning(payload) {
  const node = $('#order-ttl-warning');
  if (!node) return;
  const ttl = Number(payload.orderTtlSeconds || 0);
  const floor = Number(payload.orderTtlRecommendedSeconds || 300);
  // 这条约束对**所有扫码渠道**都成立：支付宝与微信的付款码在渠道侧都活约两小时。
  // 从前它只判 'alipay'，两个渠道并存后会漏报（微信渠道下 TTL 太短同样是复活单）。
  const qrChannels = (payload.payment?.channels || []).map(item => item.provider);
  const hasQrChannel = qrChannels.length > 0 || Boolean(payload.payment?.provider);
  const mismatch = hasQrChannel && ttl > 0 && ttl < floor;
  node.hidden = !mismatch;
  if (!mismatch) return;
  node.textContent =
    `当前订单有效期 ${ttl} 秒，短于付款码在渠道侧的有效期（约 2 小时）：` +
    '用户扫码稍慢就会在订单过期后才付款，变成需要人工核对的复活单。' +
    `建议把 STORE_ORDER_TTL_SECONDS 调到 ${floor}~900 秒。`;
}


/**
 * 把「当前实际生效」的回调地址与签名配置念出来。
 */
function renderAlipayEffectiveUrls(alipay) {
  const target = $('#alipay-effective-urls');
  const notify = alipay.notifyUrl || '（未配置，将按 STORE_BASE_URL 推导）';
  const back = alipay.returnUrl || '（未配置，将按 STORE_BASE_URL 推导）';
  target.textContent = `当前生效 · 异步通知 ${notify} · 同步跳转 ${back} · 签名 ${alipay.signType || 'RSA2'}${alipay.verifyResponseSign === false ? '（响应验签已关闭，不建议）' : ''}`;
}

/**
 * 回填注册邮箱验证码区块，与支付宝区块共用同三条铁律（授权码永不回填、只回填后台来源、清除勾选复位）。
 */
function loadMailSettings(mail) {
  const form = $('#settings-form');
  const envText = (fromDatabase, value) =>
    fromDatabase ? value || '' : '';
  const defaultEmail = mail.defaultEmail || '';
  renderMailPresetOptions(mail);
  if (!$('#mail-preset-email').value.trim()) $('#mail-preset-email').value = defaultEmail;
  form.elements.mailMode.value = mail.modeFromDatabase ? mail.mode || '' : '';
  form.elements.smtpSecurity.value = mail.smtpSecurityFromDatabase ? mail.smtpSecurity || '' : '';
  form.elements.smtpHost.value = envText(mail.smtpHostFromDatabase, mail.smtpHost);
  form.elements.smtpUsername.value = envText(mail.smtpUsernameFromDatabase, mail.smtpUsername);
  form.elements.mailFrom.value = envText(mail.fromAddressFromDatabase, mail.fromAddress);
  form.elements.smtpPort.value = mail.smtpPortFromDatabase ? mail.smtpPort : '';
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
    ? mail.verificationTtlSeconds
    : '';
  form.elements.verificationTtlSeconds.placeholder =
    `跟随环境变量（当前 ${mail.verificationTtlSeconds}）`;
  form.elements.verificationCooldownSeconds.value = mail.verificationCooldownFromDatabase
    ? mail.verificationCooldownSeconds
    : '';
  form.elements.verificationCooldownSeconds.placeholder =
    `跟随环境变量（当前 ${mail.verificationCooldownSeconds}）`;
  form.elements.verificationGlobalHourlyLimit.value =
    mail.verificationGlobalHourlyLimitFromDatabase
      ? mail.verificationGlobalHourlyLimit
      : '';
  form.elements.verificationGlobalHourlyLimit.placeholder =
    `跟随环境变量（当前 ${mail.verificationGlobalHourlyLimit}）`;
  form.elements.deliveryEmailEnabled.checked = mail.deliveryEmailEnabled !== false;
  // 验证码回显开关已整块删除（见 config.py），这里不再有可回填的控件。
  syncMailSecretInput();
  if (!form.elements.mailTestEmail.value.trim()) {
    form.elements.mailTestEmail.value = defaultEmail;
  }
  if (mailLooksUnconfigured(mail)) {
    applyMailPreset(presetForEmail(defaultEmail, mail), mail, { overwrite: false });
  }
  syncMailPresetHint(mail);
  refreshMailBadge();
  $('#mail-test-result').textContent = '';
  $('#mail-test-result').className = 'admin-hint';
  clearDiagnostics('#mail-diagnostic-list');
}

/**
 * 渲染邮件投递的状态徽标：这个徽标存在的唯一理由是「填了 SMTP 但授权码漏了」不会报错 ——
 */
function renderMailBadge(mail, unsaved = false) {
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
  badge.textContent = text + suffix;
  badge.className = `admin-status-chip${tone ? ` ${tone}` : ''}`;
}

export function syncMailSecretInput() {
  const form = $('#settings-form');
  const clear = form.elements.smtpClearPassword;
  const input = form.elements.smtpPassword;
  input.disabled = clear.checked;
  if (clear.checked) input.value = '';
}

function mailPresets(mail) {
  return Array.isArray(mail && mail.presets) ? mail.presets : [];
}

export function presetById(id, mail) {
  const wanted = String(id || '').trim().toLowerCase();
  if (!wanted) return null;
  return mailPresets(mail).find(item => item.id === wanted) || null;
}

/** 取邮箱的域名部分（小写）。 */
function presetEmailDomain(email) {
  const address = String(email || '').trim();
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1).trim().toLowerCase() : '';
}

/**
 * 按邮箱域名反查预设。自定义域名（企业邮局、自有域名）返回 ``null`` ——
 */
function presetForEmail(email, mail) {
  const domain = presetEmailDomain(email);
  if (!domain) return null;
  return mailPresets(mail).find(item => (item.domains || []).includes(domain)) || null;
}

/** 当前该用哪个预设：优先运营在下拉框里的显式选择，其次按邮箱地址识别。 */
export function selectedMailPreset(mail) {
  const select = $('#mail-preset-provider');
  return presetById(select.value, mail) || presetForEmail($('#mail-preset-email').value, mail);
}

/** 把预设清单灌进下拉框（保留第一项「自动识别」，重复加载不会越堆越多）。 */
function renderMailPresetOptions(mail) {
  const select = $('#mail-preset-provider');
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

/**
 * 只更新「选中哪个服务商」与一行提示，**不写任何表单字段**。
 */
export function syncMailPresetHint(mail) {
  const select = $('#mail-preset-provider');
  const email = $('#mail-preset-email').value.trim();
  const explicit = presetById(select.value, mail);
  const preset = explicit || presetForEmail(email, mail);
  if (preset && !explicit) select.value = preset.id;
  const hint = $('#mail-preset-hint');
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
function mailFromDisplayName(form) {
  const raw = (form.elements.siteName.value || '').trim() || 'HomeOS';
  return raw.replace(/[<>",;:]/g, '').trim() || 'HomeOS';
}

export function applyMailPreset(preset, mail, { overwrite = true } = {}) {
  if (!preset) return false;
  const form = $('#settings-form');
  const email = $('#mail-preset-email').value.trim() || (mail.defaultEmail || '').trim();
  const set = (name, value) => {
    const field = form.elements[name];
    if (!field) return;
    if (!overwrite && String(field.value || '').trim()) return;
    field.value = value;
  };
  set('mailMode', 'smtp');
  set('smtpHost', preset.smtpHost);
  set('smtpSecurity', preset.smtpSecurity);
  set('smtpPort', preset.smtpPort);
  if (email) {
    set('smtpUsername', email);
    set('mailFrom', `${mailFromDisplayName(form)} <${email}>`);
    // 客服邮箱（在「站点信息」分区）**只在它空着时**才补上，且不受 overwrite 影响：
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

/**
 * 按**当前表单**重算徽标：「切到 smtp 但授权码没填」会让用户收不到验证码，必须在切换当下就变色提醒，
 */
export function refreshMailBadge() {
  const form = $('#settings-form');
  const saved = (state.settings || {}).mail || {};
  const mode = form.elements.mailMode.value || saved.mode || 'log';
  const host = form.elements.smtpHost.value.trim() || saved.smtpHost || '';
  const username = form.elements.smtpUsername.value.trim() || saved.smtpUsername || '';
  const passwordConfigured = Boolean(saved.smtpPasswordConfigured)
    || Boolean(form.elements.smtpPassword.value.trim());
  const ready = mode === 'smtp' && Boolean(host) && (!username || passwordConfigured);
  const dirty = mode !== (saved.mode || 'log')
    || host !== (saved.smtpHost || '')
    || username !== (saved.smtpUsername || '')
    || Boolean(form.elements.smtpPassword.value.trim());
  renderMailBadge(
    {
      ...saved,
      mode,
      smtpHost: host,
      smtpPort: form.elements.smtpPort.value || saved.smtpPort,
      smtpReady: ready,
      smtpMisconfigured: mode === 'smtp' && !ready,
    },
    dirty,
  );
}

/** 当前有没有「一份可能真的能发信」的邮件配置。 */
function mailLooksUnconfigured(mail) {
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

$('#settings-form').elements.smtpClearPassword.addEventListener('change', syncMailSecretInput);

$('#settings-form').elements.mailMode.addEventListener('change', refreshMailBadge);

$('#mail-preset-apply').addEventListener('click', () => {
  const mail = (state.settings || {}).mail || {};
  const preset = selectedMailPreset(mail);
  if (!preset) {
    toast('先填一个邮箱地址，或在下拉框里选一个服务商。', 'danger');
    return;
  }
  applyMailPreset(preset, mail, { overwrite: true });
  toast(`已按 ${preset.label} 填入预设，保存后生效；还差 SMTP 授权码。`, 'success');
});

$('#mail-preset-provider').addEventListener('change', (event) => {
  const mail = (state.settings || {}).mail || {};
  const preset = presetById(event.target.value, mail);
  if (preset) applyMailPreset(preset, mail, { overwrite: true });
  else syncMailPresetHint(mail);
});

$('#mail-preset-email').addEventListener('input', () => {
  $('#mail-preset-provider').value = '';
  syncMailPresetHint((state.settings || {}).mail || {});
});

export function mailPasswordPayload(form) {
  if (form.elements.smtpClearPassword.checked) return { smtpClearPassword: true };
  const value = form.elements.smtpPassword.value.trim();
  return value ? { smtpPassword: value } : {};
}

/**
 * 渲染「凭据是否可用」的结论徽标。
 */
/**
 * 渠道徽标：**每个渠道各报各的**。
 *
 * 从前这个徽标只看「当前选中的渠道是不是 alipay」，非 alipay 一律报红「不再受支持」——
 * 两个渠道并存后，这句话会把好好的微信支付说成「下单会失败」。现在它只回答一个
 * 问题：**这个**渠道有没有被启用、凭据齐不齐。
 */
function renderChannelBadge({ selector, channel, configured, fromDatabase }) {
  const badge = $(selector);
  if (!badge) return;
  const form = $('#settings-form');
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

export function renderAlipayBadge(alipay) {
  renderChannelBadge({
    selector: '#alipay-credential-status',
    channel: 'alipay',
    configured: Boolean(alipay.configured),
    fromDatabase: Boolean(alipay.appIdFromDatabase),
  });
}

/**
 * 回填微信支付凭据区块。与支付宝同一套铁律：密钥输入框永不回填（只把打码值放进
 * placeholder），且**只回填来源为后台的字段** —— 把环境变量的值回填进来，保存时就会
 * 把它当成后台值写回数据库，等于把环境变量抄进库。
 */
function loadWechatCredentials(wechat) {
  const form = $('#settings-form');
  const envHint = (configured) => (configured ? '跟随环境变量（已配置）' : '跟随环境变量');
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
    .forEach((name) => { form.elements[name].checked = false; });
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
  $('#wechat-effective-urls').textContent = wechat.notifyUrl
    ? `当前生效的异步通知地址：${wechat.notifyUrl}`
    : '异步通知地址未配置，将按 STORE_BASE_URL 推导。没有它也能收款（轮询 + 巡检兜底），但会慢一些。';
  $('#wechat-test-result').textContent = '';
  $('#wechat-test-result').className = 'admin-hint';
  clearDiagnostics('#wechat-diagnostic-list');
}

function renderWechatBadge(wechat) {
  renderChannelBadge({
    selector: '#wechat-credential-status',
    channel: 'wechat',
    configured: Boolean(wechat.configured),
    fromDatabase: Boolean(wechat.mchIdFromDatabase),
  });
}

/**
 * 「顾客会看到几个支付方式」的实时摘要。
 *
 * 存在的理由很实在：启用集合是**复选框**、默认渠道是**下拉框**，只动下拉框的人会
 * 以为已经支持了那个渠道，实际只启用了它一个（另几个仍是未勾选）。这句话把
 * 服务端的口径原样说出来，让「同时支持支付宝和微信」变成一件看得见的事。
 */
function updateChannelSummary() {
  const node = $('#payment-channel-summary');
  if (!node) return;
  const form = $('#settings-form');
  const checked = paymentChannelsPayload(form);
  const fallback = form.elements.paymentProvider.value;
  const labels = { alipay: '支付宝', wechat: '微信支付' };

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
  const settings = state.settings || {};
  renderAlipayBadge(settings.alipay || {});
  renderWechatBadge(settings.wechat || {});
  updateChannelSummary();
}

export function syncWechatSecretInputs() {
  const form = $('#settings-form');
  const pairs = [
    ['wechatClearApiV3Key', 'wechatApiV3Key'],
    ['wechatClearMerchantPrivateKey', 'wechatMerchantPrivateKey'],
    ['wechatClearPlatformPublicKey', 'wechatPlatformPublicKey'],
  ];
  pairs.forEach(([clearName, inputName]) => {
    const clear = form.elements[clearName];
    const input = form.elements[inputName];
    input.disabled = clear.checked;
    if (clear.checked) input.value = '';
  });
}

['wechatClearApiV3Key', 'wechatClearMerchantPrivateKey', 'wechatClearPlatformPublicKey']
  .forEach((name) => {
    $('#settings-form').elements[name].addEventListener('change', syncWechatSecretInputs);
  });

/** 组装微信支付的密钥字段（口径与支付宝一致：空 = 不改动，勾清除 = 显式传空串）。 */
export function wechatSecretPayload(form) {
  const payload = {};
  const pairs = [
    ['wechatClearApiV3Key', 'wechatApiV3Key'],
    ['wechatClearMerchantPrivateKey', 'wechatMerchantPrivateKey'],
    ['wechatClearPlatformPublicKey', 'wechatPlatformPublicKey'],
  ];
  pairs.forEach(([clearName, inputName]) => {
    if (form.elements[clearName].checked) payload[inputName] = '';
    else if (form.elements[inputName].value.trim()) {
      payload[inputName] = form.elements[inputName].value.trim();
    }
  });
  return payload;
}

/** 启用的渠道 ↔ 两个复选框。只认受支持的两个名字，别的忽略。 */
function loadPaymentChannels(channels) {
  const form = $('#settings-form');
  const enabled = new Set(Array.isArray(channels) ? channels : []);
  form.elements.paymentChannelAlipay.checked = enabled.has('alipay');
  form.elements.paymentChannelWechat.checked = enabled.has('wechat');
}

export function paymentChannelsPayload(form) {
  const channels = [];
  if (form.elements.paymentChannelAlipay.checked) channels.push('alipay');
  if (form.elements.paymentChannelWechat.checked) channels.push('wechat');
  return channels;
}

export function syncAlipaySecretInputs() {
  const form = $('#settings-form');
  const pairs = [
    ['alipayClearPrivateKey', 'alipayAppPrivateKey'],
    ['alipayClearPublicKey', 'alipayPublicKey'],
  ];
  pairs.forEach(([clearName, inputName]) => {
    const clear = form.elements[clearName];
    const input = form.elements[inputName];
    input.disabled = clear.checked;
    if (clear.checked) input.value = '';
  });
}

['alipayClearPrivateKey', 'alipayClearPublicKey'].forEach((name) => {
  $(`#settings-form`).elements[name].addEventListener('change', syncAlipaySecretInputs);
});

// 渠道下拉框一变：① 自动把该渠道的复选框勾上（选了默认渠道却忘了勾，是最常见的
// 误配置 —— 表现就是「明明选了微信，前台还是只有支付宝」）；② 重算全部渠道界面。
$('#settings-form').elements.paymentProvider.addEventListener('change', () => {
  const form = $('#settings-form');
  const chosen = form.elements.paymentProvider.value;
  if (chosen === 'alipay') form.elements.paymentChannelAlipay.checked = true;
  if (chosen === 'wechat') form.elements.paymentChannelWechat.checked = true;
  refreshChannelUi();
});

['paymentChannelAlipay', 'paymentChannelWechat'].forEach((name) => {
  $('#settings-form').elements[name].addEventListener('change', refreshChannelUi);
});

/** 组装密钥字段：只有「确实要改」时才把字段放进请求体。
 *  空输入 = 不改动（否则改个站点名就会顺手清掉密钥），勾选「清除」= 显式传空串。 */
export function alipaySecretPayload(form) {
  const payload = {};
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

$('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  // 第二道闸：按钮已经禁用了，但回车提交、脚本触发都不看 disabled。
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
        // 留空 = 清回「跟随环境变量」（null）。必须显式发 null 而不是发 0：
        deviceReleaseCooldownSeconds: form.elements.deviceReleaseCooldownSeconds.value === ''
          ? null
          : Number(form.elements.deviceReleaseCooldownSeconds.value),
        alipayAppId: form.elements.alipayAppId.value.trim(),
        alipaySellerId: form.elements.alipaySellerId.value.trim(),
        alipayGatewayUrl: form.elements.alipayGatewayUrl.value.trim(),
        alipayNotifyUrl: form.elements.alipayNotifyUrl.value.trim(),
        alipayReturnUrl: form.elements.alipayReturnUrl.value.trim(),
        ...alipaySecretPayload(form),
        // 微信支付的**文本**字段必须逐个列出：只有密钥那几个是条件提交的
        // （空 = 不改动），其余字段留空就表示「清回跟随环境变量」，必须原样发出去。
        wechatMchId: form.elements.wechatMchId.value.trim(),
        wechatAppId: form.elements.wechatAppId.value.trim(),
        wechatMerchantSerialNo: form.elements.wechatMerchantSerialNo.value.trim(),
        wechatPlatformPublicKeyId: form.elements.wechatPlatformPublicKeyId.value.trim(),
        wechatGatewayUrl: form.elements.wechatGatewayUrl.value.trim(),
        wechatNotifyUrl: form.elements.wechatNotifyUrl.value.trim(),
        ...wechatSecretPayload(form),
        // 启用的渠道清单：复选框的勾选状态就是运营的意图，直接提交。
        paymentChannels: paymentChannelsPayload(form),
        // 邮件 / 验证码：留空或 0 表示「跟随环境变量」，原样提交即可 ——
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
        // 发货邮件是纯布尔（没有「跟随环境变量」这一态），直接提交勾选状态。
        deliveryEmailEnabled: form.elements.deliveryEmailEnabled.checked,
        ...mailPasswordPayload(form),
        // 验证码回显开关已删除，不再提交这个字段。
      }),
      });
      toast('站点配置已保存');
      await Promise.all([loadSettings(), host.loadOverview()]);
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
  finally {
    // 忙状态结束后必须按闸门重新校准：上面的 loadSettings() 失败时已经关掉了保存
    syncSettingsGate();
  }
});

/** 渠道自检按钮的公共实现：只有测试目标、结果节点与诊断列表不同。 */
async function runChannelProbe(event, { channel, resultId, listId }) {
  const button = event.currentTarget;
  const output = $(resultId);
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
    });
    output.textContent = result.message;
    output.className = `admin-hint ${result.ok ? 'is-success' : 'is-danger'}`;
    renderDiagnostics(listId, result.checks);
    toast(result.ok ? '凭据可用' : '凭据不可用', result.ok ? 'success' : 'danger');
  } catch (error) {
    output.textContent = error.message;
    output.className = 'admin-hint is-danger';
    toast(error.message, 'danger');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
}

$('#wechat-test-button').addEventListener('click', (event) =>
  runChannelProbe(event, {
    channel: 'wechat',
    resultId: '#wechat-test-result',
    listId: '#wechat-diagnostic-list',
  })
);

$('#alipay-test-button').addEventListener('click', (event) =>
  runChannelProbe(event, {
    channel: 'alipay',
    resultId: '#alipay-test-result',
    listId: '#alipay-diagnostic-list',
  })
);

/**
 * 邮件诊断 / 发送测试邮件：按**已保存**的配置先做连接诊断，给了收件人再真发一封（先保存、再测试）。
 */
$('#mail-test-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const output = $('#mail-test-result');
  const form = $('#settings-form');
  const email = form.elements.mailTestEmail.value.trim();
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
    });
    output.textContent = result.message;
    output.className = `admin-hint ${result.ok ? 'is-success' : 'is-danger'}`;
    renderDiagnostics('#mail-diagnostic-list', result.checks);
    toast(
      result.ok ? (result.email ? '测试邮件已投递' : '连接诊断通过') : '邮件链路未通过',
      result.ok ? 'success' : 'danger',
    );
  } catch (error) {
    output.textContent = error.message;
    output.className = 'admin-hint is-danger';
    toast(error.message, 'danger');
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = label;
  }
});

// 「刷新」与「清理」要重拉的那几张诊断表
export const DIAGNOSTIC_KEYS = [
  'sessions', 'license-sessions', 'recovery-tokens',
  'login-attempts', 'email-verifications', 'device-release-events', 'coupon-redemptions',
];

// 清理入口的「安全谓词」说明。每一条都要如实写清「什么会被删、什么一定不会」，
const PURGE_SPECS = {
  sessions: {
    path: '/sessions',
    message: '将删除这些天以前就已经失效的登录会话（后台与商店前台）。',
    impact: '只删 <b>到期时间早于截止时间</b> 的会话，也就是早就登不进去的记录；仍在有效期内的会话一条都不会动，没人会被踢下线。',
    reload: () => host.loadSessions(),
  },
  'license-sessions': {
    path: '/license-sessions',
    message: '将删除这些天以前就已经失效的客户端会话。',
    impact: '只删 <b>到期时间早于截止时间</b> 的会话记录（客户端侧早已重新激活）。未过期的会话保留，在线客户端不受影响。',
    reload: () => host.loadLicenseSessions(),
  },
  'recovery-tokens': {
    path: '/recovery-tokens',
    message: '将删除这些天以前就已经失效的设备找回令牌。',
    impact: '只删<b>已过期</b>的令牌。仍在有效期内的找回令牌保留，否则用户换机时会凭空失败。',
    reload: () => host.loadRecoveryTokens(),
  },
  'login-attempts': {
    path: '/login-attempts',
    message: '将删除这些天以前的登录尝试记录。',
    impact: '纯日志，删掉不影响任何判定。但排查「是不是被撞库了」靠的正是翻这些记录，建议至少保留 30 天。',
    reload: () => host.loadLoginAttempts(),
  },
  'email-verifications': {
    path: '/email-verifications',
    message: '将删除这些天以前的邮箱验证码记录。',
    impact: '只删<b>已消费或已过期</b>的验证码；仍在有效期内、还没被用过的验证码一律保留，否则用户正在走的注册/改密流程会凭空失败。',
    reload: () => host.loadEmailVerifications(),
  },
  'device-release-events': {
    path: '/device-release-events',
    message: '将删除这些天以前的设备解绑记录。',
    impact: '自助解绑的冷却判定读的是「每条授权最近一次解绑时间」，所以<b>每条授权的最新一条永远保留</b>，只有历史记录会被清掉。',
    reload: () => host.loadReleaseEvents(),
  },
};

export async function runPurge(key) {
  const spec = PURGE_SPECS[key];
  if (!spec) return;
  const days = await askPurge({
    title: '清理历史数据',
    message: spec.message,
    impact: spec.impact,
  });
  if (days === null) return;
  try {
    const result = await api(`${spec.path}?older_than_days=${days}`, { method: 'DELETE' });
    toast(result.deleted ? `已清理 ${result.deleted} 条` : '没有符合条件的记录，未做改动', result.deleted ? 'success' : 'warning');
    pageState(key).offset = 0;
    await spec.reload();
  } catch (error) { toast(error.message, 'danger'); }
}

export async function loadDiagnostics() {
  // 七张表互不依赖，并发取；各支自己 catch，不让一个接口报错吞掉整页诊断信息。
  await Promise.all(DIAGNOSTIC_KEYS.map(key => host.PAGED_LOADERS[key]()));
}

$('#diagnostics-refresh').addEventListener('click', () => {
  DIAGNOSTIC_KEYS.forEach(key => { pageState(key).offset = 0; });
  loadDiagnostics();
});

$('#panel-diagnostics').addEventListener('click', async (event) => {
  const purge = event.target.closest('[data-purge]');
  if (purge) {
    await runPurge(purge.dataset.purge);
    return;
  }

  // 筛选胶囊：点一下回到「全部核销记录」
  if (event.target.closest('#redemption-filter')) {
    state.redemptionFilter = null;
    pageState('coupon-redemptions').offset = 0;
    await host.loadRedemptions();
    return;
  }

  const kick = event.target.closest('[data-session-revoke]');
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
      await api(`/sessions/${encodeURIComponent(kick.dataset.sessionRevoke)}`, { method: 'DELETE' });
      toast('会话已撤销');
      await host.loadSessions();
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  const licenseKick = event.target.closest('[data-license-session-revoke]');
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
      await api(`/license-sessions/${encodeURIComponent(licenseKick.dataset.licenseSessionRevoke)}`, { method: 'DELETE' });
      toast('客户端会话已撤销');
      await host.loadLicenseSessions();
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  const tokenKick = event.target.closest('[data-recovery-token-revoke]');
  if (tokenKick) {
    const ok = await askConfirm({
      title: '作废找回令牌',
      message: `将作废激活码「${tokenKick.dataset.licenseCode}」的一条找回令牌。`,
      impact: '持有该令牌的设备无法再凭它恢复绑定，需要走完整激活流程。此操作不可撤销。',
      okText: '作废',
    });
    if (!ok) return;
    try {
      await api(`/recovery-tokens/${encodeURIComponent(tokenKick.dataset.recoveryTokenRevoke)}`, { method: 'DELETE' });
      toast('找回令牌已作废');
      await host.loadRecoveryTokens();
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  const voidRow = event.target.closest('[data-redemption-void]');  if (voidRow) {
    const ok = await askConfirm({
      title: '作废核销记录',
      message: `将作废「${voidRow.dataset.redemptionCode}」的一条核销记录（账号 ${voidRow.dataset.redemptionEmail}）。`,
      impact: '该账号会因此<b>重新获得一个名额</b>，优惠码的「已占用名额」也会重新统计。如果这条记录对应的订单还在成交状态，等于凭空放出了一个名额 —— 请只在重复核销、测试单或误发折扣时使用。记录本身会保留（标记为已作废），审计与对账仍可追溯。',
      okText: '作废',
    });
    if (!ok) return;
    try {
      const result = await api(`/coupon-redemptions/${voidRow.dataset.redemptionVoid}`, { method: 'DELETE' });
      toast(result.alreadyVoided ? '该记录此前已作废过' : `已作废，该优惠码当前占用 ${result.redeemedCount} 个名额`);
      await Promise.all([host.loadRedemptions(), host.loadCoupons()]);
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }
});
