/**
 * 确认类弹窗。
 *
 * 确认、人工调账、修改密码、批量清理四个 <dialog> 的开合与结算。
 *
 * 四个 <dialog> 的开关与结算集中在一处：确认、人工调账、改密码、批量清理。调账结算后要回刷
 * 面板列表，这类跨面板的引用走 host。
 */

import { $, toast } from "./dom.js?v=2609220052";
import { api, storeApi } from "./api.js?v=2609220052";
import { host } from "./host.js?v=2609220052";

// --------------------------------------------------------------------------- //
// 确认弹窗（替代原生 confirm，可展示影响面）
// --------------------------------------------------------------------------- //
export const confirmDialog = $('#confirm-dialog');

let confirmResolver = null;

// 三种语气：danger=不可恢复的删除，warning=会降级成可恢复的停用/下架，
// success=正向确认（如通过提现）。图标与按钮配色都跟着语气走。
const CONFIRM_TONES = {
  danger: { icon: '!', button: 'danger' },
  warning: { icon: '!', button: 'warning' },
  success: { icon: '?', button: 'success' },
};

export function askConfirm({ title, message, impact = '', tone = 'danger', okText = '确认' }) {
  const skin = CONFIRM_TONES[tone] || CONFIRM_TONES.danger;
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-icon').textContent = skin.icon;
  $('#confirm-ok').textContent = okText;
  $('#confirm-ok').className = `hb-button hb-button--sm hb-button--${skin.button}`;
  confirmDialog.classList.toggle('is-danger', tone === 'danger');
  confirmDialog.classList.toggle('is-warning', tone === 'warning');
  const impactBox = $('#confirm-impact');
  if (impact) { impactBox.innerHTML = impact; impactBox.hidden = false; }
  else { impactBox.hidden = true; impactBox.innerHTML = ''; }
  confirmDialog.showModal();
  return new Promise((resolve) => { confirmResolver = resolve; });
}

export function settleConfirm(value) {
  if (confirmDialog.open) confirmDialog.close();
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(value);
}

$('#confirm-ok').addEventListener('click', () => settleConfirm(true));

$('#confirm-cancel').addEventListener('click', () => settleConfirm(false));

// 点遮罩或按 Esc 都视为取消
confirmDialog.addEventListener('cancel', (event) => { event.preventDefault(); settleConfirm(false); });

confirmDialog.addEventListener('click', (event) => { if (event.target === confirmDialog) settleConfirm(false); });

// --------------------------------------------------------------------------- //
// 人工调账弹窗（有资金影响）
// --------------------------------------------------------------------------- //
export const adjustDialog = $('#adjust-dialog');

let adjustResolver = null;

export function openAdjustDialog(accountId, email) {
  $('#adjust-account').textContent = email || accountId;
  $('#adjust-delta').value = '0';
  $('#adjust-frozen').value = '0';
  $('#adjust-note').value = '';
  adjustDialog.dataset.accountId = accountId;
  adjustDialog.showModal();
  return new Promise((resolve) => { adjustResolver = resolve; });
}

export function settleAdjust(value) {
  if (adjustDialog.open) adjustDialog.close();
  const resolve = adjustResolver;
  adjustResolver = null;
  if (resolve) resolve(value);
}

$('#adjust-cancel').addEventListener('click', () => settleAdjust(null));

adjustDialog.addEventListener('cancel', (event) => { event.preventDefault(); settleAdjust(null); });

adjustDialog.addEventListener('click', (event) => { if (event.target === adjustDialog) settleAdjust(null); });

$('#adjust-ok').addEventListener('click', async () => {
  const accountId = adjustDialog.dataset.accountId;
  const delta = Number($('#adjust-delta').value || 0);
  const frozenDelta = Number($('#adjust-frozen').value || 0);
  const note = $('#adjust-note').value.trim();
  // 校验不通过就保持弹窗打开，让运营接着改，别把输入一起清掉
  if (!note) return toast('人工调账必须填写备注。', 'danger');
  if (!delta && !frozenDelta) return toast('余额与冻结金额不能同时为 0。', 'danger');
  // 失败之前**不能**关窗、也不能清 resolver：过去这里是「先 settleAdjust(null) 再发请求」，
  // 于是接口一失败（权限、NaN、账号不存在），刚填好的金额与备注就随窗口一起消失了，
  // 运营只能凭记忆重填一遍。现在改成「成功才关窗」，失败原地保留输入。
  try {
    const result = await api(`/referral-wallets/${accountId}/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta, frozenDelta, note }),
    });
    toast(`调账完成，当前余额 ${result.balance} 积分`);
    settleAdjust(null);
    await Promise.all([host.loadAccounts(), host.loadLedger(), host.loadOverview()]);
  } catch (error) { toast(error.message, 'danger'); }
});

// --------------------------------------------------------------------------- //
// 修改密码弹窗
// --------------------------------------------------------------------------- //
export const changePwDialog = $('#change-pw-dialog');

export function openChangePw() {
  $('#pw-old').value = '';
  $('#pw-new').value = '';
  $('#pw-confirm').value = '';
  const err = $('#pw-error'); err.hidden = true; err.textContent = '';
  changePwDialog.showModal();
  setTimeout(() => $('#pw-old').focus(), 50);
}

export function closeChangePw() {
  if (changePwDialog.open) changePwDialog.close();
}

$('#admin-change-pw').addEventListener('click', openChangePw);

$('#pw-cancel').addEventListener('click', closeChangePw);

changePwDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeChangePw(); });

changePwDialog.addEventListener('click', (event) => { if (event.target === changePwDialog) closeChangePw(); });

$('#pw-submit').addEventListener('click', async () => {
  const oldPw = $('#pw-old').value.trim();
  const newPw = $('#pw-new').value.trim();
  const confirmPw = $('#pw-confirm').value.trim();
  const err = $('#pw-error');

  if (!oldPw) { err.textContent = '请输入当前密码。'; err.hidden = false; return; }
  if (newPw.length < 8) { err.textContent = '新密码至少 8 位。'; err.hidden = false; return; }
  if (newPw !== confirmPw) { err.textContent = '两次输入的新密码不一致。'; err.hidden = false; return; }
  if (newPw === oldPw) { err.textContent = '新密码与当前密码相同。'; err.hidden = false; return; }
  err.hidden = true;

  const btn = $('#pw-submit');
  btn.disabled = true;
  btn.textContent = '正在修改…';
  try {
    await storeApi('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw, confirmPassword: confirmPw }),
    });
    toast('密码修改成功。其它设备上的会话已被踢出。');
    closeChangePw();
  } catch (error) {
    err.textContent = error.message || '修改失败，请稍后重试。';
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = '确认修改';
  }
});

export let purgeResolver = null;

export const purgeDialog = $('#purge-dialog');

// 所有批量清理走同一个弹窗：影响面 + 必填的天数，缺一不可。
export function askPurge({ title, message, impact }) {
  $('#purge-title').textContent = title;
  $('#purge-message').textContent = message;
  $('#purge-impact').innerHTML = impact;
  $('#purge-days').value = 30;
  purgeDialog.showModal();
  return new Promise(resolve => { purgeResolver = resolve; });
}

$('#purge-cancel').addEventListener('click', () => purgeDialog.close());

// <dialog> 的原生关闭路径不止「取消」按钮：Esc、点遮罩都会直接关掉它，而 close()
// 不会动 purgeResolver —— 少了这条监听，askPurge() 的调用方会挂住（「点了清理没反应」），
// 且上一轮的 promise 一直等待。统一在 close 事件里收口：无论谁关窗，等待方都拿到「取消」。
purgeDialog.addEventListener('close', () => {
  const resolve = purgeResolver;
  purgeResolver = null;
  if (resolve) resolve(null);
});

$('#purge-ok').addEventListener('click', () => {
  const days = Number($('#purge-days').value || 0);
  if (!Number.isInteger(days) || days < 1) {
    toast('清理天数必须是不小于 1 的整数。', 'danger');
    return;
  }
  // 先摘 resolver 再关窗：close 监听会把「还没人接」当成取消，
  // 不摘的话这里刚算好的天数会被 null 覆盖掉。
  const resolve = purgeResolver;
  purgeResolver = null;
  purgeDialog.close();
  if (resolve) resolve(days);
});
