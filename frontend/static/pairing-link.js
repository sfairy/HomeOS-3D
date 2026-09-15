export function parsePairingLink(rawLink) {
  if (String(rawLink).length > 4096)
    throw new Error(
      "\u4E8C\u7EF4\u7801\u5185\u5BB9\u8FC7\u957F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002"
    );
  const parsedUrl = new URL(rawLink),
    hashParams = new URLSearchParams(parsedUrl.hash.slice(1));
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
    throw new Error(
      "\u914D\u5BF9\u94FE\u63A5\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF\u7F16\u8F91\u5668\u4E2D\u7684\u4E8C\u7EF4\u7801\u3002"
    );
  return { server: parsedUrl.origin, code: hashParams.get("code") };
}
export function isAppleMobile(navigatorLike = navigator) {
  return (
    /iPhone|iPad|iPod/.test(navigatorLike.userAgent) ||
    (navigatorLike.platform === "MacIntel" && navigatorLike.maxTouchPoints > 1)
  );
}
export function needsAppleInstallGuide(navigatorObject = navigator, isStandalone = !1) {
  return (
    isAppleMobile(navigatorObject) &&
    !isStandalone &&
    !navigatorObject.standalone &&
    !/HomeOS-(Apple|Android)/i.test(navigatorObject.userAgent)
  );
}
