/**
 * 商店入口链接：把 HTML 里写死的 href 换成后端下发的商店地址。
 *
 * 地址不能钉死在页面里 —— 商店（homeos-store）在部署时可能是局域网 `http://<IP>:8802`，
 * 也可能是接了真实证书的反代域名，只有服务端知道自己那一份（见 `APP_STORE_URL`）。
 * 所以 HTML 里的 href 只当「脚本没跑起来时的兜底」，这里异步取一次配置再覆盖。
 *
 * 用法：给 <a> 加 `data-store-link`（商店首页）或 `data-store-password-reset-link`（找回密码）。
 */
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
    // 匿名接口也可能被反代拦掉：静默回落到兜底地址，页面不该因为一个跳转链接而报错。
    return FALLBACK_STORE_CONFIG;
  }
}

export async function applyStoreLinks(): Promise<void> {
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
