/**
 * 站点配置与诊断。
 *
 * 站点配置的读写闸门、支付宝与邮件凭据的校验与自检，以及诊断面板的批量清理。
 *
 * 面板里最大的一块：站点配置的读写闸门、支付宝/邮件凭据的自检，以及诊断页七张表的批量
 * 清理。配置项多、互相牵扯，所以整块一个模块。
 */

import { $, $$, toast } from "../dom.js?v=2609230040";
import { state } from "../state.js?v=2609230040";
import { api, withBusy } from "../api.js?v=2609230040";
import { askConfirm, askPurge } from "../dialogs.js?v=2609230040";
import { pageState } from "../table.js?v=2609230040";
import { host } from "../host.js?v=2609230040";

/**
 * 站点配置的「读到了吗」闸门：读失败时表单只是没回填（既非空也非对），此时保存会把支付渠道等
 * 写空、而界面只显示「保存成功」，所以读不到就把保存按钮闸住并说清原因。
 */
function setSettingsLoadState(phase, message = '') {
  const chip = $('#settings-load-status');
  // 保存按钮常驻在面板头部、落在表单之外（``form="settings-form"``），所以不能按
  // ``'#settings-form button[type="submit"]'`` 找 —— 那样一个都找不到，闸门形同虚设。
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
 * 提交动作的 finally 再无条件放行就等于把闸门顶开（没回填的表单 + 亮着的按钮）。
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
  // 不再回填成 'mock'：空串是「跟随环境变量」，把它写成 mock 等于运营随手保存一次
  // 就把渠道固化成了模拟收银台（而它默认是被禁用的，下单会 503）。
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
  // 输入框必须是**空的**，否则运营看到的「28800」会被当成一个显式设置，随手一保存
  // 就把「跟随环境变量」钉死成一个具体秒数 —— 那正是这次要修掉的那个 bug。
  form.elements.deviceReleaseCooldownSeconds.value = data.deviceReleaseCooldownSeconds ?? '';
  form.elements.deviceReleaseCooldownSeconds.placeholder =
    `跟随环境变量（当前 ${data.deviceReleaseCooldownEffectiveSeconds ?? 0}）`;
  loadAlipayCredentials(data.alipay || {});
  loadMailSettings(data.mail || {});
  setSettingsLoadState('ready');
}

/**
 * 渲染逐项诊断清单：**不把 `skip` / `warn` 渲染成绿色**。后端把「通过 / 没测到 / 需要留意 / 失败」
 * 分四级，只做「ok ? 绿 : 红」会让「投递方式是 log，压根没测」显示成和「SMTP 全通」一样的绿。
 * 每一条都带 title，避免长说明撑破版面。
 */
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

/** 清空诊断清单（重新加载配置时用，避免上一轮的结论挂在界面上误导人）。 */
export function clearDiagnostics(selector) {
  const list = $(selector);
  if (list) list.textContent = '';
}

/**
 * 回填支付宝凭据区块，三条铁律：密钥输入框永不回填（只把打码值放进 placeholder）；
 * 只回填「来源是后台」的字段（否则环境变量值会被随手保存固化进数据库）；清除勾选框每次复位。
 */
function loadAlipayCredentials(alipay) {
  const form = $('#settings-form');
  const envHint = (configured) => (configured ? '跟随环境变量（已配置）' : '跟随环境变量');
  form.elements.alipayAppId.value = alipay.appIdFromDatabase ? alipay.appId || '' : '';
  form.elements.alipaySellerId.value = alipay.sellerIdFromDatabase ? alipay.sellerId || '' : '';
  form.elements.alipayGatewayUrl.value = alipay.gatewayUrlFromDatabase ? alipay.gatewayUrl || '' : '';
  form.elements.alipayNotifyUrl.value = alipay.notifyUrlFromDatabase ? alipay.notifyUrl || '' : '';
  form.elements.alipayReturnUrl.value = alipay.returnUrlFromDatabase ? alipay.returnUrl || '' : '';
  form.elements.alipaySandbox.checked = Boolean(alipay.sandbox);
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
  $('#alipay-test-result').textContent = '';
  $('#alipay-test-result').className = 'admin-hint';
  clearDiagnostics('#alipay-diagnostic-list');
}

/**
 * 把「当前实际生效」的回调地址与签名配置念出来。
 * 「用户付了钱、订单不到账」几乎全是通知地址的问题，过去这个值只在服务端拼接逻辑里，
 * 展示解析结果能让排障第一步就自证，不用翻代码或猜支付宝往哪个地址推。
 */
function renderAlipayEffectiveUrls(alipay) {
  const target = $('#alipay-effective-urls');
  const notify = alipay.notifyUrl || '（未配置，将按 STORE_BASE_URL 推导）';
  const back = alipay.returnUrl || '（未配置，将按 STORE_BASE_URL 推导）';
  target.textContent = `当前生效 · 异步通知 ${notify} · 同步跳转 ${back} · 签名 ${alipay.signType || 'RSA2'}${alipay.verifyResponseSign === false ? '（响应验签已关闭，不建议）' : ''}`;
}

/**
 * 回填注册邮箱验证码区块，与支付宝区块共用同三条铁律（授权码永不回填、只回填后台来源、清除勾选复位）。
 * 有效期 / 冷却的 placeholder 写出当前生效数值（可能来自后台或环境变量）；「测试收件邮箱」不落库、每次按默认邮箱补齐；
 * 完全没有可用配置时按默认邮箱预设预填 SMTP 整块（判据 mailLooksUnconfigured：预填不会覆盖任何现有配置）。
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
  form.elements.exposeVerificationCode.value = mail.exposeVerificationCodeFromDatabase
    ? String(Boolean(mail.exposeVerificationCode))
    : '';
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
 * 系统安静退化成写日志，用户收不到验证码而后台看起来都填好了。unsaved 表示描述的是表单里刚改完、
 * 还没保存的组合，避免切到 smtp 的当下就显示「SMTP 就绪」。
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
  } else if (mode === 'echo') {
    text = 'echo 模式 · 验证码在接口响应里回显，仅限本地';
    tone = 'is-warning';
  } else {
    text = 'log 模式 · 验证码不会真正发出（生产请切到 smtp）';
    tone = 'is-muted';
  }
  badge.textContent = text + suffix;
  badge.className = `admin-status-chip${tone ? ` ${tone}` : ''}`;
}

/** 勾了「清除授权码」就把输入框禁掉，避免「又填又清」这种自相矛盾的提交。 */
export function syncMailSecretInput() {
  const form = $('#settings-form');
  const clear = form.elements.smtpClearPassword;
  const input = form.elements.smtpPassword;
  input.disabled = clear.checked;
  if (clear.checked) input.value = '';
}

/**
 * 邮箱服务商预设：清单随 ``/settings`` 的 ``mail.presets`` 下发（后端 ``mail_settings.SMTP_PRESETS``），
 * **刻意不在这里抄一份** —— 两份清单漂移后页面会拿旧参数去填已改过接入方式的服务商，只有「测试邮件」会失败。
 */
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
 * 刻意不猜：猜错的话运营会照着填完、点了「测试凭据」才发现登录被拒，
 * 而正确参数只有他们自己的邮箱管理员知道。
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
 * 打字过程中就把预设念出来，运营才知道「填入预设」会写进去什么；直接认成某个
 * 服务商并静默覆盖他手填的服务器，是更糟的行为。
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

/**
 * 把服务商预设写进表单：``overwrite=false`` 时只补空着的字段（首次加载预填时可能已有运营在编辑的内容）。
 * 写入字段刻意包含「投递方式 = smtp」，否则地址填好了验证码还是只进日志，运营会以为预设没生效。
 */
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
    // 它是给用户回信用的地址，和 SMTP 账号不一定是同一个信箱 —— 运营拿
    // no-reply@qq.com 当发信账号，不该顺手把客服邮箱也改成它。
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
 * 故把未保存的值也算进来，并用「（表单已改，未保存）」说明结论描述的是保存之后的样子。
 * 就绪判定与后端 StoreSettings.smtp_ready 同口径：smtp 模式 + 有服务器 + 用户名与授权码成对。
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
  // 判据刻意保守：只要环境变量或后台配置里出现过任何一个 SMTP 字段，就不再预填 ——
  // 预填的值会随下一次保存落库，静默覆盖掉一份本来能用的配置。
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
  // 手输了地址 = 「按这个地址重新识别」，所以要把下拉框上的**显式选择**清掉：
  // 不清的话，上一次识别出的服务商会一直粘着 —— 界面提示写着 QQ，运营以为
  // 「填入预设」会填 Gmail，点下去才发现填的是 QQ。
  $('#mail-preset-provider').value = '';
  syncMailPresetHint((state.settings || {}).mail || {});
});

/** 组装 SMTP 授权码：空输入 = 不改动（否则改个站点名就会顺手清掉授权码）。 */
export function mailPasswordPayload(form) {
  if (form.elements.smtpClearPassword.checked) return { smtpClearPassword: true };
  const value = form.elements.smtpPassword.value.trim();
  return value ? { smtpPassword: value } : {};
}

/**
 * 渲染「凭据是否可用」的结论徽标。
 * 单独抽出是因为有两个触发点：加载配置时，以及运营**改了支付渠道下拉框**时 ——
 * 「切到 alipay 但凭据还没配」会直接导致下单 503，必须在切换当下变色提醒，而非等保存后。
 */
export function renderAlipayBadge(alipay) {
  const form = $('#settings-form');
  const badge = $('#alipay-credential-status');
  // 下拉框为空表示「跟随环境变量」，此时以后端回报的**实际生效**渠道为准。
  const effective = form.elements.paymentProvider.value || alipay.provider || '';
  const mockAllowed = Boolean(alipay.mockPaymentsAllowed);

  // 模拟收银台单独判：它的问题从来不是「凭据没配」，而是「服务端有没有显式打开」。
  // 打开时它点一下就发码，必须一直是黄色告警；没打开时下单直接 503，要报红。
  if (effective === 'mock') {
    badge.textContent = mockAllowed
      ? '模拟收银台已启用 · 无需真实付款即发码，切勿用于生产收款'
      : '模拟收银台已被服务端禁用 · 下单会失败（需 STORE_ALLOW_MOCK_PAYMENTS=1）';
    badge.className = `admin-status-chip${mockAllowed ? ' is-warning' : ' is-danger'}`;
    return;
  }

  if (!effective) {
    badge.textContent = '未配置支付渠道 · 下单会失败';
    badge.className = 'admin-status-chip is-danger';
    return;
  }

  if (!alipay.configured) {
    badge.textContent = effective === 'alipay' ? '未配置 · 渠道选了 alipay，下单会失败' : '未配置';
    badge.className = `admin-status-chip${effective === 'alipay' ? ' is-danger' : ' is-muted'}`;
    return;
  }
  const source = alipay.appIdFromDatabase ? '后台配置' : '环境变量';
  badge.textContent = `已配置 · ${source}${alipay.sandbox ? ' · 沙箱' : ''}`;
  badge.className = `admin-status-chip${alipay.sandbox ? ' is-warning' : ''}`;
}

/** 勾了「清除」就把对应输入框禁掉，避免「又填又清」这种自相矛盾的提交。 */
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

// 渠道下拉框一变就重算徽标：切到 alipay 但凭据不全是最常见的误配置。
$('#settings-form').elements.paymentProvider.addEventListener('change', () => {
  renderAlipayBadge((state.settings || {}).alipay || {});
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
  // 配置没读到就提交，等于用一次「读取失败」把支付渠道和几个开关一起清掉。
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
        // 0 在这里是「不限间隔」这个显式设置，两者是不同状态。
        deviceReleaseCooldownSeconds: form.elements.deviceReleaseCooldownSeconds.value === ''
          ? null
          : Number(form.elements.deviceReleaseCooldownSeconds.value),
        alipayAppId: form.elements.alipayAppId.value.trim(),
        alipaySellerId: form.elements.alipaySellerId.value.trim(),
        alipayGatewayUrl: form.elements.alipayGatewayUrl.value.trim(),
        alipayNotifyUrl: form.elements.alipayNotifyUrl.value.trim(),
        alipayReturnUrl: form.elements.alipayReturnUrl.value.trim(),
        alipaySandbox: form.elements.alipaySandbox.checked,
        ...alipaySecretPayload(form),
        // 邮件 / 验证码：留空或 0 表示「跟随环境变量」，原样提交即可 ——
        // 后端对 0 与空串的解释就是「不覆盖环境变量」。
        mailMode: form.elements.mailMode.value,
        smtpSecurity: form.elements.smtpSecurity.value,
        smtpHost: form.elements.smtpHost.value.trim(),
        smtpUsername: form.elements.smtpUsername.value.trim(),
        mailFrom: form.elements.mailFrom.value.trim(),
        smtpPort: Number(form.elements.smtpPort.value || 0),
        verificationTtlSeconds: Number(form.elements.verificationTtlSeconds.value || 0),
        verificationCooldownSeconds: Number(form.elements.verificationCooldownSeconds.value || 0),
        ...mailPasswordPayload(form),
        // 三态：null = 清回「跟随环境变量」。必须显式发 null 而不是「不发这个键」，
        // 否则运营一旦点过这个下拉框就再也回不到「跟随环境变量」—— 后端区分
        // 「NULL（没配过）」和「false（生产上明确关掉）」，而两者都是有效状态。
        exposeVerificationCode: form.elements.exposeVerificationCode.value === ''
          ? null
          : form.elements.exposeVerificationCode.value === 'true',
      }),
      });
      toast('站点配置已保存');
      await Promise.all([loadSettings(), host.loadOverview()]);
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
  finally {
    // 忙状态结束后必须按闸门重新校准：上面的 loadSettings() 失败时已经关掉了保存
    // 按钮（表单没回填），而 withBusy 的收尾会无条件把它重新启用 —— 一次失败的
    // 重载就这样被一次保存「顶开」了，页面上是一份空表单加一个亮着的保存按钮。
    syncSettingsGate();
  }
});

/**
 * 测试凭据：用一笔不存在的交易探活。凭据填错的反馈原本只在用户下单时出现且很笼统，
 * 这里让网关直接回答「这套 app_id + 密钥认不认」且不产生资金动作 —— 测试的是已保存的配置，故先保存再测试。
 */
$('#alipay-test-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const output = $('#alipay-test-result');
  const label = button.textContent;
  output.textContent = '';
  output.className = 'admin-hint';
  clearDiagnostics('#alipay-diagnostic-list');
  // 这个按钮不是 submit，withBusy 抓不到它（它只会找表单里的 submit 按钮），
  // 所以忙状态在这里自己管。
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = '测试中…';
  try {
    const result = await api('/settings/alipay/test', { method: 'POST' });
    output.textContent = result.message;
    output.className = `admin-hint ${result.ok ? 'is-success' : 'is-danger'}`;
    renderDiagnostics('#alipay-diagnostic-list', result.checks);
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
});

/**
 * 邮件诊断 / 发送测试邮件：按**已保存**的配置先做连接诊断，给了收件人再真发一封（先保存、再测试）。
 * 收件人留空时只做连接诊断（域名解析 + TCP/TLS + 登录握手，不发信），可反复点且能在授权码错 /
 * 端口与加密方式不匹配上给到最具体的原因。
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
// 因为这是不可撤销的批量删除；接口侧的天数闸门（>=1 天）也靠这段文案解释。
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
  // 刷新时回到第一页，否则旧游标可能落在已经变短的列表之外
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
