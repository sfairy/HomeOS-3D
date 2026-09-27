/**
 * 授权与设备绑定。
 */

import { $, emptyRow, esc, toast } from "../dom.js?v=2609271226";
import { actions, cell, menuItem, pageState, pagedFetch, renderPager, resetPage, rowMenu } from "../table.js?v=2609271226";
import { state } from "../state.js?v=2609271226";
import { d, dt, pill, utcInput } from "../format.js?v=2609271226";
import { LICENSE_SOURCE } from "../vocab.js?v=2609271226";
import { api, withBusy } from "../api.js?v=2609271226";
import { askConfirm } from "../dialogs.js?v=2609271226";
import { host } from "../host.js?v=2609271226";

// --------------------------------------------------------------------------- //
// 激活码
// --------------------------------------------------------------------------- //
export async function loadLicenses() {
  const params = new URLSearchParams();
  const keyword = $('#license-keyword').value.trim();
  const status = $('#license-status').value;
  const expiring = $('#license-expiring').value;
  if (keyword) params.set('keyword', keyword);
  if (status) params.set('status_filter', status);
  if (expiring) params.set('expiring_days', expiring);
  // 「刷新 / 搜索」按钮、分页器与筛选框都直接调这个 loader，失败时没人接那个 Promise，
  let data;
  try {
    data = await pagedFetch('licenses', '/licenses', Object.fromEntries(params));
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  state.licenses = data.items;
  $('#license-rows').innerHTML = data.items.length ? data.items.map(license => `
    <tr>
      <td class="mono"><span id="license-code-${esc(license.activationCodeId)}">${esc(license.activationCode)}</span>
        <button class="hb-button hb-button--ghost hb-button--sm admin-copy" type="button"
                data-copy-target="#license-code-${esc(license.activationCodeId)}"
                aria-label="复制激活码">复制</button></td>
      <td class="nowrap">${cell(license.customerName)}</td>
      <td>${cell(license.productName)}</td>
      <td class="nowrap">${license.accessExpiresAt ? d(license.accessExpiresAt) : '永久'}</td>
      <td class="nowrap">${esc(LICENSE_SOURCE[license.issuanceSource] || license.issuanceSource)}</td>
      <td class="nowrap">${license.active ? pill('有效', 'success') : pill('已停用', 'muted')}</td>
      <td class="nowrap">${actions(
        license.active
          ? `<button class="hb-button hb-button--danger hb-button--sm" data-license-off="${esc(license.activationCodeId)}">停用</button>`
          : `<button class="hb-button hb-button--success hb-button--sm" data-license-on="${esc(license.activationCodeId)}">启用</button>`,
        rowMenu('更多操作',
          menuItem('修正有效期 / 备注', `data-license-edit="${esc(license.activationCodeId)}"`),
          menuItem('彻底删除', `data-license-delete="${esc(license.activationCodeId)}" data-license-code="${esc(license.activationCode)}" title="${license.active ? '需先停用' : '彻底删除该授权'}"`, { danger: true }),
        ),
      )}</td>
    </tr>`).join('') : emptyRow(7, pageState('licenses').offset > 0 ? '本页无数据' : '没有符合条件的激活码');
  renderPager('licenses');
}

$('#license-refresh').addEventListener('click', () => { resetPage('licenses'); loadLicenses(); });

$('#license-issue').addEventListener('click', () => {
  host.showEditor('#license-editor');
  $('#license-issue-result').hidden = true;
});

$('#license-cancel').addEventListener('click', () => { host.hideEditor('#license-editor'); });

// 签发结果落在编辑器里的常驻面板：激活码是这一屏唯一的产出，toast 三秒消失后
export function showIssueResult(result) {
  $('#license-issue-code').textContent = result.activationCode || '';
  $('#license-issue-target').textContent = [
    result.email || '',
    result.productName || '',
    result.accessExpiresAt ? `到期 ${dt(result.accessExpiresAt)}` : '永久有效',
  ].filter(Boolean).join(' · ');
  $('#license-issue-result').hidden = false;
}

$('#license-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    await withBusy(form, async () => {
      const result = await api('/licenses', {
        method: 'POST',
        body: JSON.stringify({
          email: form.elements.email.value.trim(),
          productId: form.elements.productId.value,
          validityDays: form.elements.validityDays.value ? Number(form.elements.validityDays.value) : null,
        }),
      });
      showIssueResult(result);
      form.reset();
      resetPage('licenses');
      await Promise.all([loadLicenses(), host.loadOverview()]);
    }, '签发中…');
  } catch (error) { toast(error.message, 'danger'); }
});

// 修正授权：客服处理「客户要延期 / 备注写错了」。
$('#license-patch-cancel').addEventListener('click', () => { host.hideEditor('#license-patch-editor'); });

$('#license-patch-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const licenseId = form.elements.licenseId.value;
  const extendDays = form.elements.extendDays.value;
  const expiresAt = form.elements.accessExpiresAt.value;
  const permanent = form.elements.permanent.checked;
  const validityDays = form.elements.validityDays.value;
  if (extendDays && (expiresAt || permanent)) {
    return toast('「续期天数」与「新的到期时间 / 永久有效」不能同时提交，请二选一。', 'danger');
  }
  const payload = { userLabel: form.elements.userLabel.value.trim() };
  if (extendDays) payload.extendDays = Number(extendDays);
  if (permanent) payload.accessExpiresAt = null;
  // 输入框是本地时间，提交前换算成库里认的 UTC
  else if (expiresAt) payload.accessExpiresAt = utcInput(expiresAt);
  if (validityDays) payload.validityDays = Number(validityDays);
  try {
    await withBusy(form, async () => {
      const result = await api(`/licenses/${licenseId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast(`授权已修正，到期时间：${result.accessExpiresAt ? dt(result.accessExpiresAt) : '永久'}`);
      host.hideEditor('#license-patch-editor');
      await loadLicenses();
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
});

$('#license-rows').addEventListener('click', (event) => {
  const licenseId = event.target.dataset.licenseEdit;
  if (!licenseId) return;
  const license = state.licenses.find(item => item.activationCodeId === licenseId);
  if (!license) return;
  const form = $('#license-patch-form');
  form.reset();
  form.elements.licenseId.value = licenseId;
  form.elements.userLabel.value = license.userLabel || '';
  $('#license-patch-code').textContent = license.activationCode || '';
  host.showEditor('#license-patch-editor');
});

$('#license-rows').addEventListener('click', async (event) => {
  const off = event.target.dataset.licenseOff;
  const on = event.target.dataset.licenseOn;
  const del = event.target.dataset.licenseDelete;

  if (del) {
    const code = event.target.dataset.licenseCode || del;
    const ok = await askConfirm({
      title: '彻底删除授权',
      message: `将永久删除激活码 ${code}，无法恢复。`,
      impact: '会连带删除该授权的<b>权益、设备绑定、租约与会话</b>；相关订单会保留但不再指向它。<br>若该授权仍在生效，请先「停用」并强制解绑。',
      okText: '永久删除',
    });
    if (!ok) return;
    try {
      const result = await api(`/licenses/${del}`, { method: 'DELETE' });
      toast(`授权已删除（连带清理 ${result.bindings ?? 0} 条绑定记录）`);
      await Promise.all([loadLicenses(), host.loadOverview()]);
    } catch (error) { toast(error.message, 'danger'); }
    return;
  }

  if (!off && !on) return;
  if (off) {
    const ok = await askConfirm({
      title: '停用授权',
      message: '停用后该激活码将立即失效。',
      impact: '客户端<b>下次心跳</b>会转为吊销状态；已有设备绑定也会被释放。',
      okText: '停用',
    });
    if (!ok) return;
  }
  try {
    await api(`/licenses/${off || on}/${off ? 'deactivate' : 'activate'}`, {
      method: 'POST', body: JSON.stringify({ note: '后台操作' }),
    });
    toast(off ? '授权已停用（客户端下次心跳将转为吊销）' : '授权已启用');
    await loadLicenses();
  } catch (error) { toast(error.message, 'danger'); }
});

// --------------------------------------------------------------------------- //
// 设备绑定
// --------------------------------------------------------------------------- //
export async function loadBindings() {
  const params = new URLSearchParams();
  if ($('#binding-active-only').checked) params.set('active_only', 'true');
  const keyword = $('#binding-keyword').value.trim();
  if (keyword) params.set('keyword', keyword);
  // 同 loadLicenses：刷新 / 筛选 / 分页都直接调它，失败要在这里收口，别把 Promise 漏出去。
  let data;
  try {
    data = await pagedFetch('bindings', '/bindings', Object.fromEntries(params));
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#binding-rows').innerHTML = data.items.length ? data.items.map(binding => `
    <tr>
      <td class="mono">${cell(binding.instanceId)}</td>
      <td class="mono">${cell(binding.activationCodeHint)}</td>
      <td class="nowrap">${esc(binding.clientVersion || '—')}</td>
      <td class="nowrap">${dt(binding.lastHeartbeatAt)}</td>
      <td class="nowrap">${binding.bound ? pill('绑定中', 'success') : pill('已解绑', 'muted')}</td>
      <td class="nowrap">${actions(
        binding.bound
          ? `<button class="hb-button hb-button--danger hb-button--sm" data-binding-release="${esc(binding.bindingId)}">强制解绑</button>`
          : '',
        rowMenu('更多操作',
          menuItem('彻底删除记录', `data-binding-delete="${esc(binding.bindingId)}" data-binding-instance="${esc(binding.instanceId || '')}"`, { danger: true }),
        ),
      )}</td>
    </tr>`).join('') : emptyRow(6, pageState('bindings').offset > 0 ? '本页无数据' : '没有符合条件的设备绑定');
  renderPager('bindings');
}

$('#binding-refresh').addEventListener('click', () => { resetPage('bindings'); loadBindings(); });

$('#binding-rows').addEventListener('click', async (event) => {
  const bindingId = event.target.dataset.bindingDelete;
  if (!bindingId) return;
  const instanceId = event.target.dataset.bindingInstance || bindingId;
  const ok = await askConfirm({
    title: '彻底删除绑定记录',
    message: `将永久删除实例 ${instanceId} 的绑定记录。`,
    impact: '与「强制解绑」的差别是<b>不留绑定行</b>：记录整条删除，该实例的会话与找回令牌一并清掉。<br><b>解绑事件与解绑冷却不受影响</b> —— 事件挂在授权上，不在这行绑定上，所以别指望这一步能顺带解除冷却。<br>重新激活不受影响 —— 解绑后本来就能立刻激活，冷却约束的是下一次解绑。<br>仅用于清理测试机、重复绑定这类脏数据。',
    okText: '永久删除',
  });
  if (!ok) return;
  try {
    await api(`/bindings/${bindingId}`, { method: 'DELETE' });
    toast('绑定记录已删除');
    await Promise.all([loadBindings(), host.loadOverview()]);
  } catch (error) { toast(error.message, 'danger'); }
});

$('#binding-rows').addEventListener('click', async (event) => {
  const bindingId = event.target.dataset.bindingRelease;
  if (!bindingId) return;
  const ok = await askConfirm({
    title: '强制解绑设备',
    message: '确认强制解绑该设备？',
    impact: '该客户端下次心跳将转为<b>吊销</b>。它现在可以立即重新激活；冷却约束的只是<b>下一次解绑</b>。',
    okText: '强制解绑',
  });
  if (!ok) return;
  try {
    await api(`/bindings/${bindingId}/release`, { method: 'POST', body: JSON.stringify({ note: '后台强制解绑' }) });
    toast('已强制解绑');
    await Promise.all([loadBindings(), host.loadOverview()]);
  } catch (error) { toast(error.message, 'danger'); }
});
