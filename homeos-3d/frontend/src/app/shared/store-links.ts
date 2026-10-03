/** 商店入口链接：把 HTML 里写死的 href 换成后端下发的商店地址。 */
interface StoreConfig {
  storeUrl: string;
  storePasswordResetPath: string;
}

/** 取不到配置时的兜底：与后端 DEFAULT_STORE_URL / STORE_PASSWORD_RESET_PATH 保持一致。 */
const FALLBACK_STORE_CONFIG: StoreConfig = {
  storeUrl: "https://pay.homeos.cn",
  storePasswordResetPath: "/user/authentication/forget",
};

/** 归一化后端响应：只认非空字符串，缺失或类型不对一律回落到兜底值。 */
function readStoreConfig(payload: unknown): StoreConfig {
  const record = (payload || {}) as Record<string, unknown>,
    storeUrl =
      typeof record.storeUrl === "string" ? record.storeUrl.trim().replace(/\/+$/, "") : "",
    resetPath =
      typeof record.storePasswordResetPath === "string"
        ? record.storePasswordResetPath.trim()
        : "";
  return {
    storeUrl: storeUrl || FALLBACK_STORE_CONFIG.storeUrl,
    storePasswordResetPath: resetPath || FALLBACK_STORE_CONFIG.storePasswordResetPath,
  };
}

async function loadStoreConfig(): Promise<StoreConfig> {
  try {
    const response = await fetch("/api/v1/public/config", {
      credentials: "same-origin",
      cache: "no-store",
    });
    return response.ok ? readStoreConfig(await response.json()) : FALLBACK_STORE_CONFIG;
  } catch {

    return FALLBACK_STORE_CONFIG;
  }
}

async function applyStoreLinks(): Promise<void> {
  const config = await loadStoreConfig(),
    storeHomeUrl = `${config.storeUrl}/`,
    passwordResetUrl = `${config.storeUrl}${
      config.storePasswordResetPath.startsWith("/")
        ? config.storePasswordResetPath
        : `/${config.storePasswordResetPath}`
    }`;
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-store-link]")) {
    link.href = storeHomeUrl;
  }
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-store-password-reset-link]")) {
    link.href = passwordResetUrl;
  }
}

void applyStoreLinks();
