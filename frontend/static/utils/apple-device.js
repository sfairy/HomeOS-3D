/**
 * 苹果移动端判定（iPhone / iPad / iPadOS 桌面模式）。
 *
 * 位置：`utils/` 下的纯工具，被展示页（`display.js`）、展示表层色（`display-surface.js`）
 *   与配对页引导（`pairing-link.js` → `apple-install-guide.js`）共用。
 *
 * 为什么要有这个文件：这处判定原先有**三份实现、两套策略** ——
 *   `display.js` 与 `display-surface.js` 看 UA 里有没有 `Macintosh`，
 *   `pairing-link.js` 看 `navigator.platform === "MacIntel"`。真实的 iPadOS 13+
 *   两条同时成立（UA 伪装成 Macintosh、platform 报 MacIntel），所以今天结果一样；
 *   但两条各自依赖一个**正在被浏览器收紧**的证据：UA 缩减会先抹掉 `Macintosh`，
 *   `platform` 已被标记废弃、正在被冻结。谁先失效只是时间问题，而失效的表现不是报错，
 *   而是「iPad 上视口改按 visualViewport 算、添加到主屏的引导也不再弹」。
 *
 * 所以这里不挑一条、废掉另一条，而是把两条**并**起来：任一证据成立就认定是苹果移动端。
 *   在真实设备矩阵上这与原来那两份都等价（iPad 上两条都成立；桌面 Mac 上两条都不成立 ——
 *   即便带触摸屏，UA 里也必有 `Macintosh`，原来就已经判真），差别只出现在只给一条证据的
 *   替身 / 测试对象上，而那里并集是超集：只会补上漏判，不会多认一台 Windows 或安卓设备
 *   （它们的 UA 里既没有 `Macintosh`，platform 也不是 `MacIntel`）。
 *
 * 约定：`navigatorLike` 可注入，便于探针把设备矩阵摆出来跑；不传时读全局 `navigator`。
 */

/**
 * 是否为苹果移动端设备。
 *
 * @param {object} [navigatorLike] navigator 对象或替身，便于测试注入。
 * @returns {boolean} iPhone / iPad / iPadOS 桌面模式时为 true。
 */
export function isAppleMobile(navigatorLike = navigator) {
  const userAgent = navigatorLike?.userAgent || "";
  // ① UA 里直接带型号：iPhone / iPad / iPod touch 都走这条（大小写不敏感，
  //    某些内置浏览器会把 UA 写成小写）。
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return true;
  }
  // ② iPadOS 13+ 的桌面模式：UA 与桌面 Mac 完全相同，只能靠「有多个触摸点」
  //    加上「这是台 Mac」的证据来区分。两条证据并列，任何一条被浏览器收紧都还有另一条。
  const touchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  return (
    touchPoints > 1 &&
    (/Macintosh/i.test(userAgent) || navigatorLike?.platform === "MacIntel")
  );
}
