/** 加密业务备份（HA Bridge 0.6.9+）：导出 / 检视 / 取消任务 / 还原。 */

function readCsrfToken() {
  try {
    const matched = String(document.cookie || "").match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return matched ? decodeURIComponent(matched[1]) : "";
  } catch {
    return "";
  }
}

function withCsrf(headers: Record<string, string> = {}) {
  const token = readCsrfToken();
  return token ? { ...headers, "X-CSRF-Token": token } : headers;
}

async function parseError(response: Response) {
  let detail: unknown;
  try {
    detail = await response.json();
  } catch {
    detail = null;
  }
  const payload = detail as { detail?: unknown; message?: string } | null;
  const message =
    (typeof payload?.detail === "string" && payload.detail) ||
    (payload?.detail &&
      typeof payload.detail === "object" &&
      (payload.detail as { message?: string }).message) ||
    payload?.message ||
    `操作失败（HTTP ${response.status}），请重新检查后再试。`;
  throw new Error(String(message));
}

export async function exportEncryptedBackup(password: string) {
  const response = await fetch("/api/v1/backups/export", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: withCsrf({ "Content-Type": "application/json" }),
    body: JSON.stringify({ password }),
  });
  if (!response.ok) await parseError(response);
  const contentType = response.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json();
    return payload?.data ?? payload;
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const matched = disposition.match(/filename="?([^";]+)"?/);
  const filename = matched?.[1] || "HomeOS.habackup";
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return { filename };
}

export async function inspectEncryptedBackup(file: File, password: string) {
  const response = await fetch("/api/v1/backups/inspect", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: withCsrf({
      "Content-Type": "application/octet-stream",
      "X-Backup-Password": encodeURIComponent(password),
    }),
    body: file,
  });
  if (!response.ok) await parseError(response);
  return response.json();
}

export async function cancelBackupJob(ticket: string) {
  const response = await fetch(
    "/api/v1/backups/jobs/" + encodeURIComponent(String(ticket || "")),
    {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      headers: withCsrf(),
    },
  );
  if (!response.ok) await parseError(response);
  return response.json().catch(() => ({ ok: true }));
}

export async function restoreEncryptedBackup(options: {
  ticket: string;
  adminPassword: string;
  confirm: boolean;
}) {
  const response = await fetch("/api/v1/backups/restore", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: withCsrf({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ticket: options.ticket,
      adminPassword: options.adminPassword,
      confirm: options.confirm === true,
    }),
  });
  if (!response.ok) await parseError(response);
  return response.json();
}
