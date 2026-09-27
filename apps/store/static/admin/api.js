/**
 * 后台接口出口。
 */

import { fromResponse } from "../api-error.js?v=2609271508";
import { $$ } from "./dom.js?v=2609271508";
import { host } from "./host.js?v=2609271508";

const httpError = (response, data) => fromResponse(response, data);

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
export async function withBusy(form, task, busyText = '处理中…') {
  // 提交按钮不一定在表单里面：站点配置的「保存配置」常驻在面板头部，靠
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
