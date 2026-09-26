/**
 * 审计与权益。
 *
 * 后台审计日志与账号权益（含补发与搜索）。
 *
 * 两块内容管理的列表与编辑器：后台审计日志、账号权益。
 */

import { $, emptyRow, esc, toast } from "../dom.js?v=2609262221";
import { actions, cell, menuItem, pageState, pagedFetch, renderPager, resetPage, rowMenu } from "../table.js?v=2609262221";
import { state } from "../state.js?v=2609262221";
import { askConfirm } from "../dialogs.js?v=2609262221";
import { api, withBusy } from "../api.js?v=2609262221";
import { d, dt, localInput, pill, utcInput } from "../format.js?v=2609262221";
import { closeFeaturePickers, featureCell, renderFeatureOptions, requireFeatureCode, setFeaturePickerValue, syncFeatureSummary } from "../features.js?v=2609262221";
import { host } from "../host.js?v=2609262221";

// --------------------------------------------------------------------------- //
// 审计日志
// --------------------------------------------------------------------------- //
export async function loadAudits() {
  const cursor = pageState('audits');
  let data;
  try {
    data = await pagedFetch('audits', '/audit-logs');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#audit-rows').innerHTML = data.items.length ? data.items.map(item => `
    <tr>
      <td class="nowrap">${dt(item.createdAt)}</td>
      <td class="nowrap">${cell(item.actor)}</td>
      <td class="nowrap">${esc(item.action)}</td>
      <td class="mono">${cell(item.target)}</td>
      <td>${cell(item.detail)}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--danger hb-button--sm" data-audit-delete="${esc(item.id)}" data-audit-label="${esc((item.action + ' ' + item.target).trim())}">删除</button>`,
      )}</td>
    </tr>`).join('') : emptyRow(6, cursor.offset > 0 ? '本页无数据' : '暂无审计记录');
  renderPager('audits');
}

$('#audit-refresh').addEventListener('click', () => {
  pageState('audits').offset = 0;
  loadAudits();
});

$('#audit-rows').addEventListener('click', async (event) => {
  const logId = event.target.dataset.auditDelete;
  if (!logId) return;
  const label = event.target.dataset.auditLabel || logId;
  const ok = await askConfirm({
    title: '删除审计记录',
    message: `将删除这条审计记录（${label}）。`,
    impact: '删除操作<b>不可恢复</b>，本次删除本身会写入一条新的审计记录。',
    okText: '删除',
  });
  if (!ok) return;
  try {
    await api(`/audit-logs/${logId}`, { method: 'DELETE' });
    toast('审计记录已删除');
    await loadAudits();
  } catch (error) { toast(error.message, 'danger'); }
});

$('#audit-purge').addEventListener('click', async () => {
  const days = Number($('#audit-purge-days').value || 0);
  // 必须是不小于 1 的**整数**：后端按整数天解析，3.5 会被 FastAPI 直接挡在
  // 参数校验那层，前端只能收到一条英文 422，运营看不懂也不知道该怎么改。
  // 诊断面板的清理对话框（runPurge）用的是同一套校验，两边必须一致。
  if (!Number.isInteger(days) || days < 1) { toast('清理天数必须是不小于 1 的整数。', 'warning'); return; }
  const ok = await askConfirm({
    title: '批量清理审计日志',
    message: `将删除 ${days} 天之前的所有审计记录。`,
    impact: '记录一旦清理<b>无法恢复</b>；本次清理会留下一条 <code>audit.purge</code> 记录作为凭据。',
    okText: '执行清理',
  });
  if (!ok) return;
  try {
    const result = await api(`/audit-logs?older_than_days=${encodeURIComponent(days)}`, { method: 'DELETE' });
    toast(result.deleted ? `已清理 ${result.deleted} 条审计记录` : '没有需要清理的记录', result.deleted ? 'success' : 'warning');
    await Promise.all([loadAudits(), host.loadOverview()]);
  } catch (error) { toast(error.message, 'danger'); }
});

// --------------------------------------------------------------------------- //
// 功能权益
// --------------------------------------------------------------------------- //
export async function loadEntitlements() {
  const params = new URLSearchParams();
  const feature = $('#entitlement-feature').value.trim();
  const status = $('#entitlement-status').value;
  if (feature) params.set('keyword', feature);
  if (status) params.set('status_filter', status);
  const data = await pagedFetch('entitlements', '/entitlements', Object.fromEntries(params));
  state.entitlements = data.items;
  $('#entitlement-rows').innerHTML = data.items.length ? data.items.map(entry => `
    <tr>
      <td>${featureCell(entry.featureCode ? [entry.featureCode] : [])}</td>
      <td>${cell(entry.productName)}</td>
      <td class="nowrap mono" title="${esc(entry.licenseId)}">${esc((entry.licenseId || '').slice(0, 8))}…</td>
      <td class="nowrap">${d(entry.startsAt)}</td>
      <td class="nowrap">${entry.expiresAt ? d(entry.expiresAt) : '永久'}</td>
      <td class="nowrap">${entry.activeFlag ? pill('开', 'success') : pill('关', 'muted')}</td>
      <td class="nowrap">${entry.active ? pill('生效中', 'success') : pill('未生效', 'warning')}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-entitlement-edit="${esc(entry.id)}">改期/开关</button>`,
        rowMenu('更多操作',
          menuItem('删除', `data-entitlement-delete="${esc(entry.id)}" data-entitlement-feature="${esc(entry.featureCode)}"`, { danger: true }),
        ),
      )}</td>
    </tr>`).join('') : emptyRow(8, pageState('entitlements').offset > 0 ? '本页无数据' : '没有符合条件的权益记录');
  renderPager('entitlements');
}

export function openEntitlementEditor(entry) {
  const form = $('#entitlement-patch-form');
  const picker = $('#entitlement-patch-features');
  closeFeaturePickers();
  form.reset();
  form.elements.id.value = entry.id;
  setFeaturePickerValue(picker, entry.featureCode ? [entry.featureCode] : []);
  form.elements.productName.value = entry.productName || '';
  form.elements.startsAt.value = localInput(entry.startsAt);
  form.elements.expiresAt.value = localInput(entry.expiresAt);
  form.elements.active.checked = Boolean(entry.activeFlag);
  $('#entitlement-patch-label').textContent = entry.featureCode || '';
  renderFeatureOptions(picker);
  syncFeatureSummary(picker);
  host.showEditor('#entitlement-patch-editor');
}

$('#entitlement-refresh').addEventListener('click', loadEntitlements);

$('#entitlement-search').addEventListener('click', () => { resetPage('entitlements'); loadEntitlements(); });

$('#entitlement-new').addEventListener('click', () => {
  const form = $('#entitlement-form');
  const picker = $('#entitlement-features');
  closeFeaturePickers();
  form.reset();
  form.elements.active.checked = true;
  // form.reset() 不会碰隐藏域：不显式清空，上一次填的功能码会跟着留下来。
  setFeaturePickerValue(picker, []);
  renderFeatureOptions(picker);
  syncFeatureSummary(picker);
  host.showEditor('#entitlement-editor');
});

$('#entitlement-cancel').addEventListener('click', () => { closeFeaturePickers(); host.hideEditor('#entitlement-editor'); });

$('#entitlement-patch-cancel').addEventListener('click', () => { closeFeaturePickers(); host.hideEditor('#entitlement-patch-editor'); });

$('#entitlement-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  // 功能码改成了选择器，隐藏域不再受浏览器 required 保护，这里自己拦一道
  if (!requireFeatureCode($('#entitlement-features'), '请先选择功能码。')) return;
  try {
    await withBusy(form, async () => {
      await api('/entitlements', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: form.elements.licenseId.value.trim(),
          featureCode: form.elements.featureCode.value.trim(),
          productName: form.elements.productName.value.trim(),
          // 本地时间 → UTC：后端按 naive UTC 存库，直接回传本地字面量会差一个时区
          startsAt: utcInput(form.elements.startsAt.value),
          expiresAt: utcInput(form.elements.expiresAt.value),
          active: form.elements.active.checked,
        }),
      });
      toast('权益已创建');
      host.hideEditor('#entitlement-editor');
      await loadEntitlements();
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
});

$('#entitlement-patch-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const entitlementId = form.elements.id.value;
  if (!requireFeatureCode($('#entitlement-patch-features'), '请先选择功能码。')) return;
  try {
    await withBusy(form, async () => {
      await api(`/entitlements/${entitlementId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          featureCode: form.elements.featureCode.value.trim(),
          productName: form.elements.productName.value.trim(),
          startsAt: utcInput(form.elements.startsAt.value),
          // 显式 null = 永久有效，所以「清空到期时间」就是改永久，符合直觉
          expiresAt: utcInput(form.elements.expiresAt.value),
          active: form.elements.active.checked,
        }),
      });
      toast('权益已更新');
      host.hideEditor('#entitlement-patch-editor');
      await loadEntitlements();
    }, '保存中…');
  } catch (error) { toast(error.message, 'danger'); }
});

$('#entitlement-rows').addEventListener('click', async (event) => {
  const editId = event.target.dataset.entitlementEdit;
  if (editId) {
    const entry = state.entitlements.find(item => item.id === editId);
    if (entry) openEntitlementEditor(entry);
    return;
  }
  const deleteId = event.target.dataset.entitlementDelete;
  if (!deleteId) return;
  const feature = event.target.dataset.entitlementFeature || deleteId;
  const ok = await askConfirm({
    title: '删除权益',
    message: `将删除功能 ${feature} 的权益记录。`,
    impact: '删除后客户端<b>立刻失去</b>该功能（下次心跳刷新租约时生效）。<br>若只是临时收回，请改用「改期/开关」把开关关掉，保留记录。',
    okText: '删除',
  });
  if (!ok) return;
  try {
    await api(`/entitlements/${deleteId}`, { method: 'DELETE' });
    toast('权益已删除');
    await loadEntitlements();
  } catch (error) { toast(error.message, 'danger'); }
});
