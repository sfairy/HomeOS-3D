/**
 * 审计与权益。
 */

import { errorMessage } from "../../store-types.js";
import { $, emptyRow, esc, toast } from "../dom.js";
import {
  actions,
  cell,
  menuItem,
  pageState,
  pagedFetch,
  renderPager,
  resetPage,
  rowMenu,
} from "../table.js";
import { state } from "../state.js";
import { askConfirm } from "../dialogs.js";
import { api, withBusy } from "../api.js";
import { d, dt, localInput, pill, utcInput } from "../format.js";
import {
  closeFeaturePickers,
  featureCell,
  renderFeatureOptions,
  requireFeatureCode,
  setFeaturePickerValue,
  syncFeatureSummary,
} from "../features.js";
import { host } from "../host.js";

type AuditItem = {
  id: string;
  createdAt?: string;
  actor?: string;
  action?: string;
  target?: string;
  detail?: string;
};

type Entitlement = {
  id: string;
  featureCode?: string;
  productName?: string;
  licenseId?: string;
  startsAt?: string;
  expiresAt?: string | null;
  activeFlag?: boolean;
  active?: boolean;
  [key: string]: unknown;
};

type EntitlementForm = HTMLFormElement & {
  elements: HTMLFormControlsCollection & {
    id: HTMLInputElement;
    licenseId: HTMLInputElement;
    featureCode: HTMLInputElement;
    productName: HTMLInputElement;
    startsAt: HTMLInputElement;
    expiresAt: HTMLInputElement;
    active: HTMLInputElement;
  };
};

// --------------------------------------------------------------------------- //
// 审计日志
// --------------------------------------------------------------------------- //
export async function loadAudits() {
  const cursor = pageState('audits');
  let data: { items?: AuditItem[] } | null;
  try {
    data = (await pagedFetch('audits', '/audit-logs')) as typeof data;
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
    return;
  }
  if (!data) return;
  const rows = $('#audit-rows');
  if (!rows) return;
  const items = data.items || [];
  rows.innerHTML = items.length
    ? items
        .map(
          (item) => `
    <tr>
      <td class="nowrap">${dt(item.createdAt)}</td>
      <td class="nowrap">${cell(item.actor)}</td>
      <td class="nowrap">${esc(item.action)}</td>
      <td class="mono">${cell(item.target)}</td>
      <td>${cell(item.detail)}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--danger hb-button--sm" data-audit-delete="${esc(item.id)}" data-audit-label="${esc((item.action + ' ' + item.target).trim())}">删除</button>`,
      )}</td>
    </tr>`,
        )
        .join('')
    : emptyRow(6, cursor.offset > 0 ? '本页无数据' : '暂无审计记录');
  renderPager('audits');
}

$('#audit-refresh')?.addEventListener('click', () => {
  pageState('audits').offset = 0;
  loadAudits();
});

$('#audit-rows')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const logId = target.dataset.auditDelete;
  if (!logId) return;
  const label = target.dataset.auditLabel || logId;
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
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

$('#audit-purge')?.addEventListener('click', async () => {
  const days = Number(($('#audit-purge-days') as HTMLInputElement | null)?.value || 0);
  // 必须是不小于 1 的**整数**：后端按整数天解析，3.5 会被 FastAPI 直接挡在
  if (!Number.isInteger(days) || days < 1) {
    toast('清理天数必须是不小于 1 的整数。', 'warning');
    return;
  }
  const ok = await askConfirm({
    title: '批量清理审计日志',
    message: `将删除 ${days} 天之前的所有审计记录。`,
    impact:
      '记录一旦清理<b>无法恢复</b>；本次清理会留下一条 <code>audit.purge</code> 记录作为凭据。',
    okText: '执行清理',
  });
  if (!ok) return;
  try {
    const result = (await api(
      `/audit-logs?older_than_days=${encodeURIComponent(days)}`,
      { method: 'DELETE' },
    )) as { deleted?: number };
    toast(
      result.deleted ? `已清理 ${result.deleted} 条审计记录` : '没有需要清理的记录',
      result.deleted ? 'success' : 'warning',
    );
    await Promise.all([loadAudits(), host.loadOverview?.()]);
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

// --------------------------------------------------------------------------- //
// 功能权益
// --------------------------------------------------------------------------- //
export async function loadEntitlements() {
  const params = new URLSearchParams();
  const feature = (($('#entitlement-feature') as HTMLInputElement | null)?.value || '').trim();
  const status = ($('#entitlement-status') as HTMLSelectElement | null)?.value || '';
  if (feature) params.set('keyword', feature);
  if (status) params.set('status_filter', status);
  let data: { items?: Entitlement[] } | null;
  try {
    data = (await pagedFetch(
      'entitlements',
      '/entitlements',
      Object.fromEntries(params),
    )) as typeof data;
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
    return;
  }
  if (!data) return;
  state.entitlements = data.items || [];
  const rows = $('#entitlement-rows');
  if (!rows) return;
  const items = data.items || [];
  rows.innerHTML = items.length
    ? items
        .map(
          (entry) => `
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
        rowMenu(
          '更多操作',
          menuItem(
            '删除',
            `data-entitlement-delete="${esc(entry.id)}" data-entitlement-feature="${esc(entry.featureCode)}"`,
            { danger: true },
          ),
        ),
      )}</td>
    </tr>`,
        )
        .join('')
    : emptyRow(
        8,
        pageState('entitlements').offset > 0 ? '本页无数据' : '没有符合条件的权益记录',
      );
  renderPager('entitlements');
}

 function openEntitlementEditor(entry: Entitlement) {
  const form = $('#entitlement-patch-form') as EntitlementForm | null;
  const picker = $('#entitlement-patch-features');
  if (!form || !picker) return;
  closeFeaturePickers();
  form.reset();
  form.elements.id.value = entry.id;
  setFeaturePickerValue(picker, entry.featureCode ? [entry.featureCode] : []);
  form.elements.productName.value = entry.productName || '';
  form.elements.startsAt.value = localInput(entry.startsAt);
  form.elements.expiresAt.value = localInput(entry.expiresAt);
  form.elements.active.checked = Boolean(entry.activeFlag);
  const label = $('#entitlement-patch-label');
  if (label) label.textContent = entry.featureCode || '';
  renderFeatureOptions(picker);
  syncFeatureSummary(picker);
  host.showEditor?.('#entitlement-patch-editor');
}

$('#entitlement-refresh')?.addEventListener('click', () => {
  loadEntitlements();
});

$('#entitlement-search')?.addEventListener('click', () => {
  resetPage('entitlements');
  loadEntitlements();
});

$('#entitlement-new')?.addEventListener('click', () => {
  const form = $('#entitlement-form') as EntitlementForm | null;
  const picker = $('#entitlement-features');
  if (!form || !picker) return;
  closeFeaturePickers();
  form.reset();
  form.elements.active.checked = true;
  // form.reset() 不会碰隐藏域：不显式清空，上一次填的功能码会跟着留下来。
  setFeaturePickerValue(picker, []);
  renderFeatureOptions(picker);
  syncFeatureSummary(picker);
  host.showEditor?.('#entitlement-editor');
});

$('#entitlement-cancel')?.addEventListener('click', () => {
  closeFeaturePickers();
  host.hideEditor?.('#entitlement-editor');
});

$('#entitlement-patch-cancel')?.addEventListener('click', () => {
  closeFeaturePickers();
  host.hideEditor?.('#entitlement-patch-editor');
});

$('#entitlement-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target as EntitlementForm;
  // 功能码改成了选择器，隐藏域不再受浏览器 required 保护，这里自己拦一道
  const features = $('#entitlement-features');
  if (!features || !requireFeatureCode(features, '请先选择功能码。')) return;
  try {
    await withBusy(
      form,
      async () => {
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
        host.hideEditor?.('#entitlement-editor');
        await loadEntitlements();
      },
      '保存中…',
    );
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

$('#entitlement-patch-form')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target as EntitlementForm;
  const entitlementId = form.elements.id.value;
  const features = $('#entitlement-patch-features');
  if (!features || !requireFeatureCode(features, '请先选择功能码。')) return;
  try {
    await withBusy(
      form,
      async () => {
        await api(`/entitlements/${entitlementId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            featureCode: form.elements.featureCode.value.trim(),
            productName: form.elements.productName.value.trim(),
            startsAt: utcInput(form.elements.startsAt.value),
            expiresAt: utcInput(form.elements.expiresAt.value),
            active: form.elements.active.checked,
          }),
        });
        toast('权益已更新');
        host.hideEditor?.('#entitlement-patch-editor');
        await loadEntitlements();
      },
      '保存中…',
    );
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});

$('#entitlement-rows')?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const editId = target.dataset.entitlementEdit;
  if (editId) {
    const entry = (state.entitlements as Entitlement[]).find((item) => item.id === editId);
    if (entry) openEntitlementEditor(entry);
    return;
  }
  const deleteId = target.dataset.entitlementDelete;
  if (!deleteId) return;
  const feature = target.dataset.entitlementFeature || deleteId;
  const ok = await askConfirm({
    title: '删除权益',
    message: `将删除功能 ${feature} 的权益记录。`,
    impact:
      '删除后客户端<b>立刻失去</b>该功能（下次心跳刷新租约时生效）。<br>若只是临时收回，请改用「改期/开关」把开关关掉，保留记录。',
    okText: '删除',
  });
  if (!ok) return;
  try {
    await api(`/entitlements/${deleteId}`, { method: 'DELETE' });
    toast('权益已删除');
    await loadEntitlements();
  } catch (error) {
    toast(errorMessage(error, '操作失败'), 'danger');
  }
});
