/** 后台接口出口。 */

import { fromResponse } from "../api-error.js";
import { $$ } from "./dom.js";
import { host } from "./host.js";

 type AdminApiOptions = RequestInit & {
  raw?: boolean;
};

const httpError = (response: Response, data: unknown) => fromResponse(response, data);

export async function api(path: string, options: AdminApiOptions = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`/store-admin/v1${path}`, {
    credentials: 'same-origin',

    headers: options.body && !isForm ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });
  if (response.status === 401 || response.status === 403) {
    host.showLogin?.();

    throw httpError(response, { detail: '未登录后台或无权限。' });
  }
  if (options.raw) return response;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response, data);
  return data;
}

export async function storeApi(path: string, options: RequestInit = {}) {
  const response = await fetch(`/store/v1${path}`, {
    credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw httpError(response, data);
  return data;
}


export async function withBusy<T>(
  form: HTMLFormElement,
  task: () => Promise<T>,
  busyText = '处理中…',
): Promise<T> {

  const submits = [
    ...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ...(form.id
      ? ($$(`button[type="submit"][form="${form.id}"]`) as HTMLButtonElement[])
      : []),
  ];
  const labels = submits.map((button) => button.innerHTML);
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
      button.innerHTML = labels[index] ?? '';
    });
  }
}
