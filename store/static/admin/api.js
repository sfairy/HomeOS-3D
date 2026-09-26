/**
 * 后台接口出口。
 *
 * 后台/前台两个 fetch 出口、错误归一与提交忙态。
 *
 * 后台接口出口：后台与前台两个 fetch（前台接口在商店域）、错误归一、提交忙态。
 */

import { $$ } from "./dom.js?v=2609262221";
import { host } from "./host.js?v=2609262221";

// 把接口返回的 ``detail`` 归一化成人话，实现只有 store/static/api-error.js 的 ``ApiError.describe``。
// 建带状态码的错误：401 是未登录访客打开 /admin 的正常状态，不能当故障；其余失败必须原样报出，故带上状态码本身。
const httpError = (response, data) => ApiError.fromResponse(response, data);

export async function api(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`/store-admin/v1${path}`, {
    credentials: 'same-origin',
    // multipart 必须让浏览器自己带 boundary，手写 Content-Type 会让解析端读不到文件
    headers: options.body && !isForm ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });
  if (response.status === 401 || response.status === 403) {
    host.showLogin();
    // 403 与 401 共用这条提示，但状态码要留住：调用方据此分辨「没登录」与
    // 「登录了但不是管理员」——后者必须说出来，不能静默退回登录页。
    throw httpError(response, { detail: '未登录后台或无权限。' });
  }
  if (options.raw) return response;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response, data);
  return data;
}

export async function storeApi(path, options = {}) {
  const response = await fetch(`/store/v1${path}`, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response, data);
  return data;
}

// 提交按钮的忙态：请求期间禁用并换文案。这不是装饰 —— 「点了没反应就再点一次」
// 会变成重复发码 / 重复扣库存，忙态是服务端条件 UPDATE 之外的第二道闸。
// 原文案用 innerHTML 存取，textContent 会把按钮里的图标节点一起抹掉。
export async function withBusy(form, task, busyText = '处理中…') {
  // 提交按钮不一定在表单里面：站点配置的「保存配置」常驻在面板头部，靠
  // ``form="settings-form"`` 关联（见模板注释）。只按 form.querySelector 找的话，
  // 它永远不会进入忙状态 —— 运营连点几下，每次都会打一遍接口。
  const submits = [
    ...form.querySelectorAll('button[type="submit"]'),
    ...(form.id ? $$(`button[type="submit"][form="${form.id}"]`) : []),
  ];
  const labels = submits.map(button => button.innerHTML);
  submits.forEach((button) => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = busyText;
  });
  try {
    return await task();
  } finally {
    submits.forEach((button, index) => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = labels[index];
    });
  }
}
