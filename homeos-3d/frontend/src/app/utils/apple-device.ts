/**
 * 苹果移动端判定（iPhone / iPad / iPadOS 桌面模式）的纯工具。
 */

type NavigatorLike = {
  userAgent?: string;
  maxTouchPoints?: number;
  platform?: string;
  standalone?: boolean;
};

/**
 * 是否为苹果移动端设备。
 */
export function isAppleMobile(navigatorLike: NavigatorLike = navigator): boolean {
  const userAgent = navigatorLike?.userAgent || "";
  // ① UA 里直接带型号：iPhone / iPad / iPod touch 都走这条（大小写不敏感，
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return true;
  }
  // ② iPadOS 13+ 的桌面模式：UA 与桌面 Mac 完全相同，只能靠「有多个触摸点」
  const touchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  return (
    touchPoints > 1 &&
    (/Macintosh/i.test(userAgent) || navigatorLike?.platform === "MacIntel")
  );
}
