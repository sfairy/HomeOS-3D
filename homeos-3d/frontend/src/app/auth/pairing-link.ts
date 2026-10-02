export function parsePairingLink(rawLink) {
  if (String(rawLink).length > 4096) throw new Error("二维码内容过长，请重新生成。");
  const parsedUrl = new URL(rawLink),
    hashParams = new URLSearchParams(parsedUrl.hash.slice(1));
  // type 必须是 homeos-pair。展示端（墙面板）与扫码端共用同一套配对标签。
  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !== "/pair" ||
    parsedUrl.search !== "?scan=1" ||
    [...hashParams.keys()].sort().join(",") !== "code,type,version" ||
    hashParams.get("type") !== "homeos-pair" ||
    hashParams.get("version") !== "1" ||
    !/^[0-9]{6}$/.test(hashParams.get("code") || "")
  )
    throw new Error("配对链接无效，请重新扫描编辑器中的二维码。");
  return {
    server: parsedUrl.origin,
    code: hashParams.get("code"),
  };
}
export function isAppleMobile(navigatorObject = navigator) {
  return (
    /iPhone|iPad|iPod/.test(navigatorObject.userAgent) ||
    (navigatorObject.platform === "MacIntel" && navigatorObject.maxTouchPoints > 1)
  );
}
export function needsAppleInstallGuide(navigatorSource = navigator, isStandalone = false) {
  return (
    isAppleMobile(navigatorSource) &&
    !isStandalone &&
    !navigatorSource.standalone &&
    !/HomeOS-(Apple|Android)/i.test(navigatorSource.userAgent)
  );
}
