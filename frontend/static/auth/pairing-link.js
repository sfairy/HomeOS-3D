/**
 * 配对链接（二维码）的解析与苹果设备引导条件判断。
 */
import { isAppleMobile } from "../utils/apple-device.js?v=2609271411";

/**
 * 解析并严格校验配对链接；链接超长、格式不符或字段缺失时抛中文错误文案。
 */
export function parsePairingLink(rawLink) {
  if (String(rawLink).length > 4096)
    throw new Error(
      "二维码内容过长，请重新生成。"
    );
  const parsedUrl = new URL(rawLink),
    hashParams = new URLSearchParams(parsedUrl.hash.slice(1));
  // 校验要点：只接受 http/https 且不带用户信息（防钓鱼）；路径必须精确为
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/pair" ||
    parsedUrl.search !== "?scan=1" ||
    [...hashParams.keys()].sort().join(",") !== "code,type,version" ||
    hashParams.get("type") !== "homeos-pair" ||
    hashParams.get("version") !== "1" ||
    // 配对码固定 6 位数字，与后端生成规则一致。
    !/^[0-9]{6}$/.test(hashParams.get("code") || "")
  )
    throw new Error(
      "配对链接无效，请重新扫描编辑器中的二维码。"
    );
  return { server: parsedUrl.origin, code: hashParams.get("code") };
}

/**
 * 判断是否需要向用户展示「添加到主屏幕」引导。
 */
export function needsAppleInstallGuide(navigatorObject = navigator, isStandalone = !1) {
  // 已由 HomeOS 原生 App 打开时不再引导，UA 里带 HomeOS-Apple/Android 标记。
  return (
    isAppleMobile(navigatorObject) &&
    !isStandalone &&
    !navigatorObject.standalone &&
    !/HomeOS-(Apple|Android)/i.test(navigatorObject.userAgent)
  );
}
