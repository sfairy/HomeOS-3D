/**
 * 确认类弹窗。
 */

import { $, toast } from "./dom.js";
import { api, storeApi } from "./api.js";
import { host } from "./host.js";

// --------------------------------------------------------------------------- //
// 确认弹窗（替代原生 confirm，可展示影响面）
// --------------------------------------------------------------------------- //
 const confirmDialog = $('#confirm-dialog') as HTMLDialogElement | null;

let confirmResolver: ((value: boolean) => void) | null = null;

// 三种语气：danger=不可恢复的删除，warning=会降级成可恢复的停用/下架，
const CONFIRM_TONES: Record<string, { icon: string; button: string }> = {
  danger: { icon: '!', button: 'danger' },
  warning: { icon: '!', button: 'warning' },
  success: { icon: '?', button: 'success' },
};

 type ConfirmOptions = {
  title: string;
  message: string;
  impact?: string;
  tone?: string;
  okText?: string;
};

export function askConfirm({
  title,
  message,
  impact = '',
  tone = 'danger',
  okText = '确认',
}: ConfirmOptions) {
  const skin = CONFIRM_TONES[tone] || CONFIRM_TONES.danger!;
  const titleEl = $('#confirm-title');
  const messageEl = $('#confirm-message');
  const iconEl = $('#confirm-icon');
  const okEl = $('#confirm-ok');
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (iconEl) iconEl.textContent = skin.icon;
  if (okEl) {
    okEl.textContent = okText;
    okEl.className = `hb-button hb-button--sm hb-button--${skin.button}`;
  }
  confirmDialog?.classList.toggle('is-danger', tone === 'danger');
  confirmDialog?.classList.toggle('is-warning', tone === 'warning');
  const impactBox = $('#confirm-impact');
  if (impactBox) {
    if (impact) {
      impactBox.innerHTML = impact;
      impactBox.hidden = false;
    } else {
      impactBox.hidden = true;
      impactBox.innerHTML = '';
    }
  }
  confirmDialog?.showModal();
  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve;
  });
}

 function settleConfirm(value: boolean) {
  if (confirmDialog?.open) confirmDialog.close();
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(value);
}

$('#confirm-ok')?.addEventListener('click', () => settleConfirm(true));

$('#confirm-cancel')?.addEventListener('click', () => settleConfirm(false));

// 点遮罩或按 Esc 都视为取消
confirmDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  settleConfirm(false);
});

confirmDialog?.addEventListener('click', (event) => {
  if (event.target === confirmDialog) settleConfirm(false);
});

// --------------------------------------------------------------------------- //
// 人工调账弹窗（有资金影响）
// --------------------------------------------------------------------------- //
 const adjustDialog = $('#adjust-dialog') as HTMLDialogElement | null;

let adjustResolver: ((value: unknown) => void) | null = null;

export function openAdjustDialog(accountId: string, email?: string | null) {
  const accountEl = $('#adjust-account');
  const deltaEl = $('#adjust-delta') as HTMLInputElement | null;
  const frozenEl = $('#adjust-frozen') as HTMLInputElement | null;
  const noteEl = $('#adjust-note') as HTMLInputElement | null;
  if (accountEl) accountEl.textContent = email || accountId;
  if (deltaEl) deltaEl.value = '0';
  if (frozenEl) frozenEl.value = '0';
  if (noteEl) noteEl.value = '';
  if (adjustDialog) adjustDialog.dataset.accountId = accountId;
  adjustDialog?.showModal();
  return new Promise<unknown>((resolve) => {
    adjustResolver = resolve;
  });
}

 function settleAdjust(value: unknown) {
  if (adjustDialog?.open) adjustDialog.close();
  const resolve = adjustResolver;
  adjustResolver = null;
  if (resolve) resolve(value);
}

$('#adjust-cancel')?.addEventListener('click', () => settleAdjust(null));

adjustDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  settleAdjust(null);
});

adjustDialog?.addEventListener('click', (event) => {
  if (event.target === adjustDialog) settleAdjust(null);
});

$('#adjust-ok')?.addEventListener('click', async () => {
  const accountId = adjustDialog?.dataset.accountId;
  const delta = Number(($('#adjust-delta') as HTMLInputElement | null)?.value || 0);
  const frozenDelta = Number(($('#adjust-frozen') as HTMLInputElement | null)?.value || 0);
  const note = (($('#adjust-note') as HTMLInputElement | null)?.value || '').trim();
  // 校验不通过就保持弹窗打开，让运营接着改，别把输入一起清掉
  if (!note) return toast('人工调账必须填写备注。', 'danger');
  if (!delta && !frozenDelta) return toast('余额与冻结金额不能同时为 0。', 'danger');
  try {
    const result = (await api(`/referral-wallets/${accountId}/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta, frozenDelta, note }),
    })) as { balance?: unknown };
    toast(`调账完成，当前余额 ${result.balance} 积分`);
    settleAdjust(null);
    await Promise.all([
      host.loadAccounts?.(),
      host.loadLedger?.(),
      host.loadOverview?.(),
    ]);
  } catch (error) {
    toast(error instanceof Error ? error.message : '调账失败', 'danger');
  }
});

// --------------------------------------------------------------------------- //
// 修改密码弹窗
// --------------------------------------------------------------------------- //
 const changePwDialog = $('#change-pw-dialog') as HTMLDialogElement | null;

 function openChangePw() {
  const oldEl = $('#pw-old') as HTMLInputElement | null;
  const newEl = $('#pw-new') as HTMLInputElement | null;
  const confirmEl = $('#pw-confirm') as HTMLInputElement | null;
  if (oldEl) oldEl.value = '';
  if (newEl) newEl.value = '';
  if (confirmEl) confirmEl.value = '';
  const err = $('#pw-error');
  if (err) {
    err.hidden = true;
    err.textContent = '';
  }
  changePwDialog?.showModal();
  setTimeout(() => oldEl?.focus(), 50);
}

 function closeChangePw() {
  if (changePwDialog?.open) changePwDialog.close();
}

$('#admin-change-pw')?.addEventListener('click', openChangePw);

$('#pw-cancel')?.addEventListener('click', closeChangePw);

changePwDialog?.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeChangePw();
});

changePwDialog?.addEventListener('click', (event) => {
  if (event.target === changePwDialog) closeChangePw();
});

$('#pw-submit')?.addEventListener('click', async () => {
  const oldPw = (($('#pw-old') as HTMLInputElement | null)?.value || '').trim();
  const newPw = (($('#pw-new') as HTMLInputElement | null)?.value || '').trim();
  const confirmPw = (($('#pw-confirm') as HTMLInputElement | null)?.value || '').trim();
  const err = $('#pw-error');

  if (!err) return;
  if (!oldPw) {
    err.textContent = '请输入当前密码。';
    err.hidden = false;
    return;
  }
  if (newPw.length < 8) {
    err.textContent = '新密码至少 8 位。';
    err.hidden = false;
    return;
  }
  if (newPw !== confirmPw) {
    err.textContent = '两次输入的新密码不一致。';
    err.hidden = false;
    return;
  }
  if (newPw === oldPw) {
    err.textContent = '新密码与当前密码相同。';
    err.hidden = false;
    return;
  }
  err.hidden = true;

  const btn = $('#pw-submit') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '正在修改…';
  }
  try {
    await storeApi('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({
        oldPassword: oldPw,
        newPassword: newPw,
        confirmPassword: confirmPw,
      }),
    });
    toast('密码修改成功。其它设备上的会话已被踢出。');
    closeChangePw();
  } catch (error) {
    err.textContent =
      (error instanceof Error && error.message) || '修改失败，请稍后重试。';
    err.hidden = false;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '确认修改';
    }
  }
});

 let purgeResolver: ((value: number | null) => void) | null = null;

 const purgeDialog = $('#purge-dialog') as HTMLDialogElement | null;

// 所有批量清理走同一个弹窗：影响面 + 必填的天数，缺一不可。
export function askPurge({
  title,
  message,
  impact,
}: {
  title: string;
  message: string;
  impact: string;
}) {
  const titleEl = $('#purge-title');
  const messageEl = $('#purge-message');
  const impactEl = $('#purge-impact');
  const daysEl = $('#purge-days') as HTMLInputElement | null;
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  if (impactEl) impactEl.innerHTML = impact;
  if (daysEl) daysEl.value = '30';
  purgeDialog?.showModal();
  return new Promise<number | null>((resolve) => {
    purgeResolver = resolve;
  });
}

$('#purge-cancel')?.addEventListener('click', () => purgeDialog?.close());

// <dialog> 的原生关闭路径不止「取消」按钮：Esc、点遮罩都会直接关掉它，而 close()
purgeDialog?.addEventListener('close', () => {
  const resolve = purgeResolver;
  purgeResolver = null;
  if (resolve) resolve(null);
});

$('#purge-ok')?.addEventListener('click', () => {
  const days = Number(($('#purge-days') as HTMLInputElement | null)?.value || 0);
  if (!Number.isInteger(days) || days < 1) {
    toast('清理天数必须是不小于 1 的整数。', 'danger');
    return;
  }
  // 先摘 resolver 再关窗：close 监听会把「还没人接」当成取消，
  const resolve = purgeResolver;
  purgeResolver = null;
  purgeDialog?.close();
  if (resolve) resolve(days);
});
