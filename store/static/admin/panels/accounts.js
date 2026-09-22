/**
 * 提现与账号。
 *
 * 提现申请的处理，以及账号列表、新建与人工调账入口。
 */

import { $, emptyRow, esc, toast } from "../dom.js?v=2609221053";
import { actions, cell, menuItem, pageState, pagedFetch, renderPager, resetPage, rowMenu } from "../table.js?v=2609221053";
import { dt, num, pill, statusBadge } from "../format.js?v=2609221053";
import { askConfirm, openAdjustDialog } from "../dialogs.js?v=2609221053";
import { api, withBusy } from "../api.js?v=2609221053";
import { state } from "../state.js?v=2609221053";
import { host } from "../host.js?v=2609221053";

// --------------------------------------------------------------------------- //
// 提现
// --------------------------------------------------------------------------- //
export async function loadWithdrawals() {
  const params = new URLSearchParams();
  const status = $('#withdrawal-status').value;
  const keyword = $('#withdrawal-keyword').value.trim();
  if (status) params.set('status_filter', status);
  if (keyword) params.set('keyword', keyword);
  const data = await pagedFetch('withdrawals', '/withdrawals', Object.fromEntries(params));
  $('#withdrawal-rows').innerHTML = data.items.length ? data.items.map(item => `
    <tr>
      <td class="nowrap">${cell(item.email || item.accountId)}</td>
      <td class="nowrap">${esc(item.points)}</td>
      <td class="nowrap">${esc(item.feePoints)}</td>
      <td class="nowrap">${esc(item.netPoints)}</td>
      <td class="nowrap">${statusBadge(item.status, item.statusLabel)}</td>
      <td class="nowrap">${dt(item.createdAt)}</td>
      <td class="nowrap">${actions(
        // 通过/驳回是「提现审核」这个面板的核心决策，保留为同级主操作
        item.status === 'pending'
          ? `<button class="hb-button hb-button--success hb-button--sm" data-withdrawal-ok="${esc(item.id)}">通过</button>`
          : '',
        item.status === 'pending'
          ? `<button class="hb-button hb-button--danger hb-button--sm" data-withdrawal-no="${esc(item.id)}">驳回</button>`
          : '',
        rowMenu('更多操作',
          item.status !== 'pending'
            ? menuItem('删除', `data-withdrawal-delete="${esc(item.id)}" data-withdrawal-email="${esc(item.email || item.accountId)}"`, { danger: true }) : '',
        ),
      )}</td>
    </tr>`).join('') : emptyRow(7, pageState('withdrawals').offset > 0 ? '本页无数据' : '没有任何提现申请');
  renderPager('withdrawals');
}

$('#withdrawal-refresh').addEventListener('click', () => { resetPage('withdrawals'); loadWithdrawals(); });

$('#withdrawal-rows').addEventListener('click', async (event) => {
  const ok = event.target.dataset.withdrawalOk;
  const no = event.target.dataset.withdrawalNo;
  const del = event.target.dataset.withdrawalDelete;

  if (del) {
    const who = event.target.dataset.withdrawalEmail || del;
    const confirmed = await askConfirm({
      title: '删除提现记录',
      message: `将删除 ${who} 的这条提现申请记录。`,
      impact: '积分流水（账本）<b>仍然保留</b>，财务审计不受影响。',
      okText: '删除',
    });
    if (!confirmed) return;
    try {
      await api(`/withdrawals/${del}`, { method: 'DELETE' });
      toast('提现记录已删除');
      await Promise.all([loadWithdrawals(), host.loadOverview()]);
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  if (!ok && !no) return;
  const approve = Boolean(ok);
  const confirmed = await askConfirm({
    title: approve ? '通过提现' : '驳回提现',
    message: approve ? '确认通过该提现申请？' : '确认驳回该提现申请？',
    impact: approve
      ? '将按申请金额结算，冻结积分转为已支出。'
      : '驳回后会<b>退回冻结积分</b>到账号余额。',
    tone: approve ? 'success' : 'danger',
    okText: approve ? '通过' : '驳回',
  });
  if (!confirmed) return;
  try {
    await api(`/withdrawals/${ok || no}/resolve`, {
      method: 'POST', body: JSON.stringify({ approve, note: approve ? '后台通过' : '后台驳回' }),
    });
    toast(approve ? '已通过提现' : '已驳回并退回积分');
    await Promise.all([loadWithdrawals(), host.loadOverview()]);
  } catch (error) { toast(error.message, 'danger'); }
});

// --------------------------------------------------------------------------- //
// 账号
// --------------------------------------------------------------------------- //
export async function loadAccounts() {
  const params = new URLSearchParams();
  const keyword = $('#account-keyword').value.trim();
  const role = $('#account-role').value;
  const status = $('#account-status').value;
  if (keyword) params.set('keyword', keyword);
  if (role) params.set('role', role);
  if (status) params.set('status_filter', status);
  const data = await pagedFetch('accounts', '/accounts', Object.fromEntries(params));
  state.accounts = data.items;
  $('#account-rows').innerHTML = data.items.length ? data.items.map(account => `
    <tr>
      <td class="nowrap">${cell(account.email)}</td>
      <td class="nowrap">${account.isAdmin ? '管理员' : '用户'}</td>
      <td class="nowrap">${num(account.licenseCount)}</td>
      <td class="nowrap">${esc(account.balance)}</td>
      <td class="nowrap mono">${esc(account.referralCode || '—')}</td>
      <td class="nowrap">${account.isActive ? pill('正常', 'success') : pill('已停用', 'danger')}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-account-edit="${esc(account.id)}">编辑</button>`,
        rowMenu('更多操作',
          menuItem('查看积分流水', `data-account-ledger="${esc(account.id)}"`),
          menuItem('人工调账', `data-account-adjust="${esc(account.id)}" data-account-email="${esc(account.email)}"`),
          menuItem('删除账号', `data-account-delete="${esc(account.id)}" data-account-email="${esc(account.email)}" data-account-licenses="${account.licenseCount || 0}"`, { danger: true }),
        ),
      )}</td>
    </tr>`).join('') : emptyRow(7, pageState('accounts').offset > 0 ? '本页无数据' : '没有符合条件的账号');
  renderPager('accounts');
}

export function openAccountEditor(account) {
  const form = $('#account-form');
  form.reset();
  form.elements.id.value = account.id;
  form.elements.email.value = account.email || '';
  form.elements.isAdmin.checked = Boolean(account.isAdmin);
  form.elements.isActive.checked = Boolean(account.isActive);
  form.elements.emailVerified.checked = Boolean(account.emailVerifiedAt);
  $('#account-editor-email').textContent = account.email || '';
  host.showEditor('#account-editor');
  form.elements.email.focus();
}

$('#account-refresh').addEventListener('click', () => { resetPage('accounts'); loadAccounts(); });

$('#account-cancel').addEventListener('click', () => { host.hideEditor('#account-editor'); });

$('#account-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const accountId = form.elements.id.value;
  const payload = {
    email: form.elements.email.value.trim(),
    isAdmin: form.elements.isAdmin.checked,
    isActive: form.elements.isActive.checked,
    emailVerified: form.elements.emailVerified.checked,
  };
  const password = form.elements.newPassword.value;
  if (password) payload.newPassword = password;
  try {
    await withBusy(form, async () => {
      await api(`/accounts/${accountId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast(password ? '账号已更新，该账号的登录会话已全部失效' : '账号已更新');
      host.hideEditor('#account-editor');
      await loadAccounts();
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
});

$('#account-rows').addEventListener('click', async (event) => {
  const editId = event.target.dataset.accountEdit;
  const deleteId = event.target.dataset.accountDelete;
  const ledgerId = event.target.dataset.accountLedger;
  const adjustId = event.target.dataset.accountAdjust;
  // 停用 / 启用不在这里：它走「编辑」里的「启用」勾选框（PATCH /accounts/{id}），
  // 服务端在那条路径上有「不能停用自己」「不能停用最后一个管理员」两道守卫。

  if (editId) {
    const account = state.accounts.find(item => item.id === editId);
    if (account) openAccountEditor(account);
    return;
  }

  // 跳到「积分流水」页并按该账号过滤，省得再手输邮箱
  if (ledgerId) {
    $('#ledger-account').value = ledgerId;
    $('#ledger-kind').value = '';
    location.hash = 'ledger';
    host.activate('ledger');
    return;
  }

  // 调账弹窗自带输入框与校验，这里只要把账号带上
  if (adjustId) {
    openAdjustDialog(adjustId, event.target.dataset.accountEmail);
    return;
  }

  if (deleteId) {
    const email = event.target.dataset.accountEmail || deleteId;
    const licenses = Number(event.target.dataset.accountLicenses || 0);
    const ok = await askConfirm({
      title: '删除账号',
      message: `将永久删除账号 ${email}。`,
      impact: licenses
        ? `该账号有 <b>${licenses}</b> 条授权，删除会被拒绝。请改用「编辑 → 取消启用」来停用。`
        : '只有当该账号没有任何授权、订单、积分流水时才会删除成功；否则系统会退回并提示改用停用。',
      okText: '永久删除',
    });
    if (!ok) return;
    try {
      await api(`/accounts/${deleteId}`, { method: 'DELETE' });
      toast('账号已删除');
      await loadAccounts();
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }
});
