/**
 * 苹果设备全屏展示页的背景色同步。
 *
 * 展示页启动时调用，仅对 iOS / iPadOS 生效：把项目画布背景色写进 CSS 变量
 * --display-surface-background 与 meta[theme-color]，让状态栏与页面底色一致，避免全屏下露出
 * 黑边。只有「已添加到主屏并以 standalone 运行」的设备才处理。
 */
import { isAppleMobile } from "../utils/apple-device.js?v=20260921151446";

/**
 * 按画布背景色更新苹果全屏设备的表面颜色。
 */
export function syncAppleDisplaySurface(docModel, win = window) {
  const { document: doc, navigator: nav } = win;
  const isApple = isAppleMobile(nav);
  const isStandalone =
    nav.standalone === true || win.matchMedia?.("(display-mode: standalone)").matches === true;
  if (!isApple || !isStandalone) {
    return;
  }
  const background = docModel?.canvas?.background;
  // 先确认背景类型是纯色，再用 CSS.supports 复核颜色字符串合法，否则回退深色底。
  const surfaceColor =
    background?.type === "color" &&
    typeof background.color === "string" &&
    win.CSS?.supports("color", background.color)
      ? background.color
      : "#070b0e";
  doc.documentElement.style.setProperty("--display-surface-background", surfaceColor);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", surfaceColor);
}
