/**
 * 苹果设备全屏展示页的背景色同步。
 */
import { isAppleMobile } from "../utils/apple-device.js?v=2609271226";
// 兜底色改成从令牌现取：这里取不到就用同值字面量，正是 paletteColor 的语义。
import { paletteColor } from "../utils/colors.js?v=2609271226";

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
  const surfaceColor =
    background?.type === "color" &&
    typeof background.color === "string" &&
    win.CSS?.supports("color", background.color)
      ? background.color
      // 兜底与 scene/page.css 的 --hos-sky-deep 同值：这里是 iOS 独立窗口的浏览器
      : paletteColor("--hos-sky-deep", "#050912");
  doc.documentElement.style.setProperty("--display-surface-background", surfaceColor);
  doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", surfaceColor);
}
