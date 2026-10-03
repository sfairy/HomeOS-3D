/** 表单忙碌态：禁用提交按钮并改文案（与旧 `admin/api.ts#withBusy` 同行为）。 */

export async function withBusy<T>(
  form: HTMLFormElement | null | undefined,
  task: () => Promise<T>,
  busyText = "处理中…",
): Promise<T> {
  if (!form) return task();
  const submits = [
    ...form.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ...(form.id
      ? Array.from(
          document.querySelectorAll<HTMLButtonElement>(`button[type="submit"][form="${form.id}"]`),
        )
      : []),
  ];
  const labels = submits.map((button) => button.innerHTML);
  submits.forEach((button) => {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = busyText;
  });
  try {
    return await task();
  } finally {
    submits.forEach((button, index) => {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      button.innerHTML = labels[index] ?? "";
    });
  }
}
