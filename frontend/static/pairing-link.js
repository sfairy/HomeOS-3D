/**
 * 配对链接（二维码）的解析与苹果设备引导条件判断。
 *
 * 位置：扫码落地页 pair.js 与 apple-install-guide.js 共用的纯逻辑模块。
 * 职责：校验并解析二维码里的配对链接，以及判断当前设备是否需要弹出
 *   「添加到主屏幕」引导。
 * 约定：二维码内容由编辑器生成，链接形态固定为
 *   <origin>/pair?scan=1#code=xxxxxx&type=homeos-pair&version=1，
 *   任一环节不符即视为无效，宁可报错也不降级接受。
 */

/**
 * 解析并严格校验配对链接。
 *
 * @param {string} rawLink 二维码扫描得到的原始文本。
 * @returns {{server: string, code: string}} 中心服务地址（origin）与 6 位配对码。
 * @throws {Error} 链接超长、格式不符或字段缺失时抛出中文错误文案。
 */
export function parsePairingLink(rawLink) {
  // 超长字符串通常意味着扫到了非配对二维码，先挡掉避免后续解析开销与被撑爆的风险。
  if (String(rawLink).length > 4096)
    throw new Error(
      "\u4E8C\u7EF4\u7801\u5185\u5BB9\u8FC7\u957F\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210\u3002"
    );
  const parsedUrl = new URL(rawLink),
    hashParams = new URLSearchParams(parsedUrl.hash.slice(1));
  // 校验要点：只接受 http/https 且不带用户信息（防钓鱼）；路径必须精确为
  // /pair 且查询串必须是 ?scan=1；哈希参数必须恰好是 code/type/version 三个。
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
      "\u914D\u5BF9\u94FE\u63A5\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u626B\u63CF\u7F16\u8F91\u5668\u4E2D\u7684\u4E8C\u7EF4\u7801\u3002"
    );
  return { server: parsedUrl.origin, code: hashParams.get("code") };
}

/**
 * 判断是否为苹果移动端设备。
 *
 * @param {object} [navigatorLike] navigator 对象或替身，便于测试注入。
 * @returns {boolean} iPhone / iPad / iPadOS 桌面模式时为 true。
 */
export function isAppleMobile(navigatorLike = navigator) {
  // iPadOS 13+ 的 UA 与桌面 Mac 相同，用 platform 加触摸点数还原判断。
  return (
    /iPhone|iPad|iPod/.test(navigatorLike.userAgent) ||
    (navigatorLike.platform === "MacIntel" && navigatorLike.maxTouchPoints > 1)
  );
}

/**
 * 判断是否需要向用户展示「添加到主屏幕」引导。
 *
 * @param {object} [navigatorObject] navigator 对象或替身。
 * @param {boolean} [isStandalone] 是否已处于 standalone 显示模式。
 * @returns {boolean} 需要引导时为 true。
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
