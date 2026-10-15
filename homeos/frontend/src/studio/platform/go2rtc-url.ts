/**
 * 摄像头弹窗里 go2rtc 播放地址的前端预校验。
 *
 * 从 0.7.6 `static/go2rtc-url.js`（`home.js` 里的
 * `./go2rtc-url.js?v=20261013-go2rtc-validation-v1`）语义重实现。前端这一层只为
 * 「输错立刻提示」，**不是安全边界** —— 真正的白名单判定在后端
 * `domains/proxy/go2rtc_target.py`，两边规则刻意保持一致（局域网字面量 IP +
 * `/stream.html?src=`），避免出现「前端放行、后端 422」的错位体验。
 *
 * 放在 platform 而不是 `runtime/camera/go2rtc-url.ts`：**保存草稿**前的整体预校验
 * （`app/editor/home.ts`）与运行时摄像头挂载都要用同一份规则，而 app ↛ runtime 是硬边界
 * 。运行时入口
 * `runtime/camera/go2rtc-url.ts` 保留为再导出，构建产物与清单路径不变。
 */

/** 与后端一致的整条地址长度上限（`domains/proxy/go2rtc_target.py` 的 `MAX_URL_LENGTH`）。 */
const MAX_URL_LENGTH = 2048;
/** 与后端一致的 src 流名长度上限与禁用字符（防 CRLF / 参数注入）。 */
const MAX_SRC_LENGTH = 128;
const FORBIDDEN_SRC_CHARS = /[\r\n&]/;
/** 从 `http(s)://authority` 里取端口写法，用于在 `new URL` 之前拦下非法端口。 */
const AUTHORITY_PATTERN = /^https?:\/\/([^/?#]*)/i;

/** IPv4 里允许的私网 / 回环 / 链路本地网段。 */
function isLocalIpv4(value: any): boolean {
  const parts = String(value || "").split(".");
  if (
    parts.length !== 4 ||
    !parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  ) {
    return false;
  }
  const [first, second] = parts.map(Number);
  return (
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

/** IPv6 里允许的回环 / 链路本地 / 唯一本地地址。 */
function isLocalIpv6(value: any): boolean {
  const host = String(value || "").toLowerCase();
  return host === "::1" || host.startsWith("fe80:") || /^(fc|fd)/.test(host);
}

/** 校验单条 go2rtc 播放地址；不合法直接抛 `Error`，消息面向用户。 */
export function validateGo2rtcUrl(value: any): void {
  const raw = String(value || "").trim();
  if (!raw) {
    throw new Error(
      "go2rtc 网页播放地址不能为空，请填写类似 http://192.168.1.100:1984/stream.html?src=camera1 的地址。",
    );
  }
  if (raw.length > MAX_URL_LENGTH) {
    throw new Error(`go2rtc 网页播放地址不能超过 ${MAX_URL_LENGTH} 个字符。`);
  }
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error("go2rtc 网页播放地址必须使用 http:// 或 https://。");
  }
  // 端口要在 `new URL` 之前先看：`:abc` / `:70000` 这类写法 URL 会直接吞掉或归一，
  // 到后端才 422 就太晚了。
  const rawPort = (raw.match(AUTHORITY_PATTERN)?.[1] || "").match(/:(\w*)$/)?.[1];
  if (
    rawPort !== undefined &&
    (!/^\d+$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535)
  ) {
    throw new Error("go2rtc 网页播放地址的端口无效，请填写 1–65535 之间的数字，例如 :1984。");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "go2rtc 网页播放地址格式不正确，请填写 http:// 或 https:// 开头的 /stream.html 地址。",
    );
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("go2rtc 网页播放地址必须使用 http:// 或 https://。");
  }
  if (url.username || url.password) {
    throw new Error("go2rtc 网页播放地址不能包含账号或密码。");
  }
  // URL 会把 IPv6 主机名保留方括号，判定前先剥掉。
  const host = String(url.hostname || "").replace(/^\[|\]$/g, "");
  if (!isLocalIpv4(host) && !isLocalIpv6(host)) {
    throw new Error(
      "go2rtc 网页播放地址请使用 go2rtc 所在设备的局域网 IP，例如 192.168.1.100；暂不支持域名或公网 IP。",
    );
  }
  if (url.pathname.replace(/\/+$/, "") !== "/stream.html") {
    throw new Error("go2rtc 网页播放地址必须指向 /stream.html，例如 /stream.html?src=camera1。");
  }
  const src = url.searchParams.get("src")?.trim() || "";
  if (!src || src.length > MAX_SRC_LENGTH || FORBIDDEN_SRC_CHARS.test(src)) {
    throw new Error("go2rtc 网页播放地址必须包含有效的 src 流名称，例如 ?src=camera1。");
  }
}

/**
 * 校验整份仪表盘文档里所有「生效中」的 2D 摄像头地址。
 *
 * 只检查 `cameraSource === 'go2rtc'` 的组件：已停用的地址留着，用户切回来时不必重填。
 * 一旦有非法地址就抛出**带摄像头名**的错误，让用户知道该改哪一个。
 */
export function validateGo2rtcDocument(document: any): void {
  const walk = (items: any): void => {
    for (const component of items || []) {
      if (component?.type === "camera" && component?.properties?.cameraSource === "go2rtc") {
        try {
          validateGo2rtcUrl(component?.properties?.go2rtcUrl);
        } catch (error: any) {
          const label = String(component?.properties?.label || component?.id || "摄像头").trim();
          throw new Error(`摄像头“${label}”的${error?.message || String(error)}`);
        }
      }
      walk(component?.children);
    }
  };
  walk(document?.sharedComponents);
  for (const page of document?.pages || []) walk(page?.components);
}
