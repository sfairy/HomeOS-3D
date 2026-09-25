/**
 * 会话与令牌类诊断表。
 *
 * 会话、授权会话、找回令牌、登录尝试、邮箱验证、解绑事件与核销记录七张列表。
 *
 * 诊断页里七张只读列表（会话、授权会话、找回令牌、登录尝试、邮箱验证、解绑事件、核销
 * 记录），都只是「取一页、渲染一页」，聚在一起省得散落。
 */

import { actions, cell, pageState, pagedFetch, renderPager } from "../table.js?v=2609252218";
import { $, emptyRow, esc, toast } from "../dom.js?v=2609252218";
import { dt, money, num, pill } from "../format.js?v=2609252218";
import { state } from "../state.js?v=2609252218";

export async function loadSessions() {
  const cursor = pageState('sessions');
  let data;
  try {
    data = await pagedFetch('sessions', '/sessions');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#session-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap mono">${esc(row.ref)}</td>
      <td>${cell(row.accountEmail || row.accountId)}</td>
      <td class="nowrap">${row.isAdminSession ? pill('管理员', 'warning') : '用户'}</td>
      <td>${cell(row.ipAddress)}</td>
      <td class="nowrap">${dt(row.lastSeenAt)}</td>
      <td class="nowrap">${dt(row.expiresAt)}</td>
      <td class="nowrap">${row.expired ? pill('已过期', 'muted') : pill('有效', 'success')}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-session-revoke="${esc(row.ref)}" data-session-email="${esc(row.accountEmail || row.accountId)}">踢下线</button>`,
      )}</td>
    </tr>`).join('') : emptyRow(8, cursor.offset > 0 ? '本页无数据' : '暂无登录会话');
  renderPager('sessions');
}

export async function loadLicenseSessions() {
  const cursor = pageState('license-sessions');
  let data;
  try {
    data = await pagedFetch('license-sessions', '/license-sessions');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#license-session-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap mono">${esc(row.ref)}</td>
      <td class="nowrap mono">${cell(row.codeHint)}</td>
      <td class="mono">${cell(row.instanceId)}</td>
      <td class="nowrap">${row.bindingActive ? pill('已绑定', 'success') : pill('已解绑', 'muted')}</td>
      <td class="nowrap">${dt(row.lastUsedAt)}</td>
      <td class="nowrap">${dt(row.expiresAt)}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-license-session-revoke="${esc(row.ref)}" data-license-code="${esc(row.codeHint)}">撤销</button>`,
      )}</td>
    </tr>`).join('') : emptyRow(7, cursor.offset > 0 ? '本页无数据' : '暂无客户端会话');
  renderPager('license-sessions');
}

export async function loadRecoveryTokens() {
  const cursor = pageState('recovery-tokens');
  let data;
  try {
    data = await pagedFetch('recovery-tokens', '/recovery-tokens');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#recovery-token-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap mono">${esc(row.ref)}</td>
      <td class="nowrap mono">${cell(row.codeHint)}</td>
      <td class="mono">${cell(row.instanceId)}</td>
      <td class="nowrap">${dt(row.createdAt)}</td>
      <td class="nowrap">${dt(row.expiresAt)}</td>
      <td class="nowrap">${row.expired ? pill('已过期', 'muted') : pill('有效', 'warning')}</td>
      <td class="nowrap">${actions(
        `<button class="hb-button hb-button--secondary hb-button--sm" data-recovery-token-revoke="${esc(row.ref)}" data-license-code="${esc(row.codeHint)}">作废</button>`,
      )}</td>
    </tr>`).join('') : emptyRow(7, cursor.offset > 0 ? '本页无数据' : '暂无找回令牌');
  renderPager('recovery-tokens');
}

export async function loadLoginAttempts() {
  const cursor = pageState('login-attempts');
  let data;
  try {
    data = await pagedFetch('login-attempts', '/login-attempts');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#attempt-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap">${dt(row.createdAt)}</td>
      <td class="mono">${cell(row.scope)}</td>
      <td class="nowrap">${row.succeeded ? pill('成功', 'success') : pill('失败', 'danger')}</td>
    </tr>`).join('') : emptyRow(3, cursor.offset > 0 ? '本页无数据' : '暂无登录尝试记录');
  renderPager('login-attempts');
}

export async function loadEmailVerifications() {
  const cursor = pageState('email-verifications');
  let data;
  try {
    data = await pagedFetch('email-verifications', '/email-verifications');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#verification-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap">${dt(row.createdAt)}</td>
      <td>${cell(row.email)}</td>
      <td class="nowrap">${esc(row.purpose)}</td>
      <td class="nowrap">${num(row.attempts)}</td>
      <td class="nowrap">${row.consumedAt ? pill('已使用', 'success') : pill('未使用', 'warning')}</td>
      <td class="nowrap">${dt(row.expiresAt)}</td>
      <td class="nowrap">${row.settled ? pill('可清理', 'muted') : pill('仍在用', 'warning')}</td>
    </tr>`).join('') : emptyRow(7, cursor.offset > 0 ? '本页无数据' : '暂无邮箱验证码记录');
  renderPager('email-verifications');
}

export async function loadReleaseEvents() {
  const cursor = pageState('device-release-events');
  let data;
  try {
    data = await pagedFetch('device-release-events', '/device-release-events');
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  $('#release-event-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap">${dt(row.createdAt)}</td>
      <td class="nowrap mono">${cell(row.codeHint)}</td>
      <td class="mono">${cell(row.instanceId)}</td>
      <td class="nowrap">${esc(row.source)}</td>
    </tr>`).join('') : emptyRow(4, cursor.offset > 0 ? '本页无数据' : '暂无解绑历史');
  renderPager('device-release-events');
}

export async function loadRedemptions() {
  const cursor = pageState('coupon-redemptions');
  let data;
  try {
    data = await pagedFetch(
      'coupon-redemptions',
      '/coupon-redemptions',
      state.redemptionFilter ? { coupon_id: state.redemptionFilter.couponId } : {},
    );
  } catch (error) {
    toast(error.message, 'danger');
    return;
  }
  const chip = $('#redemption-filter');
  chip.hidden = !state.redemptionFilter;
  if (state.redemptionFilter) chip.textContent = `仅看 ${state.redemptionFilter.couponCode}（点击清除）`;
  $('#redemption-rows').innerHTML = data.items.length ? data.items.map(row => `
    <tr>
      <td class="nowrap">${dt(row.createdAt)}</td>
      <td class="nowrap mono">${cell(row.couponCode)}</td>
      <td>${cell(row.accountEmail || row.accountId)}</td>
      <td class="nowrap">${money(row.discountCents)}</td>
      <td class="nowrap mono">${cell(row.orderNo || row.orderId)}</td>
      <td class="nowrap">${row.voidedAt ? pill('已作废', 'muted') : (row.holding ? pill('占用中', 'warning') : pill('已归还', 'muted'))}</td>
      <td class="nowrap">${actions(
        row.voidedAt
          ? `<span class="hb-muted" title="${esc(row.voidReason || '已作废')}">—</span>`
          : `<button class="hb-button hb-button--secondary hb-button--sm" data-redemption-void="${esc(row.id)}" data-redemption-code="${esc(row.couponCode)}" data-redemption-email="${esc(row.accountEmail || row.accountId)}">作废</button>`,
      )}</td>
    </tr>`).join('') : emptyRow(7, cursor.offset > 0 ? '本页无数据' : '暂无优惠码核销记录');
  renderPager('coupon-redemptions');
}
