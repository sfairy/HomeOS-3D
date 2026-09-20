/**
 * 苹果移动端判定（iPhone / iPad / iPadOS 桌面模式）的纯工具。
 *
 * 同时看 UA 里的 `Macintosh` 与 `navigator.platform === "MacIntel"` 两条证据，任一成立即认定 ——
 * 两条各自依赖一个正被浏览器收紧的信号（UA 缩减、platform 冻结），只挑一条迟早失效；并起来只会补漏判，
 * 不会多认 Windows / 安卓（它们的 UA 无 Macintosh，platform 也不是 MacIntel）。
 *
 * 约定：navigatorLike 可注入（传替身对象即可），不传时读全局 navigator。
 */

/**
 * 是否为苹果移动端设备。
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
