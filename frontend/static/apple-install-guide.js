/**
 * 苹果设备「添加到主屏幕」引导脚本。
 *
 * 位置：随配对 / 展示页一起加载的独立脚本，运行在应用主脚本之前。
 * 职责：在 iPhone / iPad 上注入一个悬浮按钮与说明弹窗，指导用户把页面
 *   添加到主屏幕；支持 ?addToHome=1 自动弹出。
 * 约定：needsAppleInstallGuide 来自 pairing-link.js，统一判断「是否该引导」；
 *   自动弹出要等展示页启动态（display-booting）结束，避免盖住启动遮罩。
 */
import { needsAppleInstallGuide as shouldShowInstallGuide } from "./pairing-link.js";

// isAddToHomeLaunch 为真表示配对链接带 addToHome=1，这次落地就是引导添加主屏的场景。
const currentUrl = new URL(location.href),
  isAddToHomeLaunch = currentUrl.searchParams.get("addToHome") === "1";

// 无论是否弹引导，addToHome 参数都要立刻从地址栏抹掉，防止刷新重复进入引导态。
if (
  (isAddToHomeLaunch &&
    (currentUrl.searchParams.delete("addToHome"),
    history.replaceState(null, "", currentUrl.pathname + currentUrl.search + currentUrl.hash)),
  shouldShowInstallGuide(navigator, matchMedia("(display-mode: standalone)").matches))
) {
  // isChromeIos 用于区分分享菜单入口：Chrome iOS 与 Safari 的文案不同。
  const isChromeIos = /CriOS\//.test(navigator.userAgent),
    triggerButton = document.createElement("button");
  ((triggerButton.className = "apple-install-trigger"),
    (triggerButton.type = "button"),
    (triggerButton.textContent = "\u6DFB\u52A0\u5230\u4E3B\u5C4F\u5E55"));
  const guideDialog = document.createElement("dialog");
  ((guideDialog.className = "apple-install-dialog"),
    guideDialog.setAttribute("aria-labelledby", "apple-install-title"),
    (guideDialog.innerHTML = `
    <img class="apple-install-icon" src="/static/homeos-icon-180-h5.png?v=20260918174425" alt="">
    <p class="apple-install-eyebrow">IPHONE \xB7 IPAD</p>
    <h2 id="apple-install-title">\u628A HomeOS \u653E\u5230\u4E3B\u5C4F\u5E55</h2>
    <p class="apple-install-intro">\u6DFB\u52A0\u540E\u50CF App \u4E00\u6837\u4ECE\u684C\u9762\u5168\u5C4F\u6253\u5F00\uFF0C\u9762\u677F\u529F\u80FD\u4E0E App \u76F8\u540C\u3002</p>
    <ol class="apple-install-steps">
      <li><b>1</b><div><strong>\u6253\u5F00${isChromeIos ? " Chrome " : " Safari "}\u7684\u5206\u4EAB\u83DC\u5355</strong><p>Chrome \u548C Safari \u5747\u652F\u6301\uFF0C\u53EF\u5728\u201C\u2026\u201D\u4E2D\u627E\u5230\u5206\u4EAB\u3002</p></div></li>
      <li><b>2</b><div><strong>\u9009\u62E9\u201C\u6DFB\u52A0\u5230\u4E3B\u5C4F\u5E55\u201D</strong><p>\u672A\u770B\u5230\u65F6\u70B9\u201C\u67E5\u770B\u66F4\u591A\u201D\u3002\u5982\u6709\u201C\u4F5C\u4E3A\u7F51\u9875 App \u6253\u5F00\u201D\uFF0C\u4FDD\u6301\u5F00\u542F\u3002</p></div></li>
      <li><b>3</b><div><strong>\u70B9\u51FB\u201C\u6DFB\u52A0\u201D</strong><p>\u56DE\u5230\u4E3B\u5C4F\u5E55\uFF0C\u70B9\u51FB HomeOS \u56FE\u6807\u8FDB\u5165\u9762\u677F\u3002</p></div></li>
    </ol>
    <p class="apple-install-footnote">\u9996\u6B21\u6253\u5F00\u82E5\u63D0\u793A\u914D\u5BF9\uFF0C\u8F93\u5165\u8FD9\u53F0\u8BBE\u5907\u539F\u6765\u7684\u914D\u5BF9\u7801\u5373\u53EF\u3002</p>
    <button class="apple-install-done" type="button">\u77E5\u9053\u4E86\uFF0C\u8FDB\u5165\u9762\u677F</button>`),
    document.body.append(triggerButton, guideDialog));
  /**
   * 打开「添加到主屏幕」说明弹窗。
   *
   * 有两个触发点：用户点击悬浮按钮；或链接带 addToHome=1 且展示页启动遮罩已摘掉时
   * 自动弹出（启动阶段弹窗会被 display-booting 遮罩压住，必须等遮罩消失）。
   *
   * @returns {void}
   */
  const openGuide = () => {
    // 重复点击时 dialog 已打开就不要再 showModal，否则会抛异常。
    guideDialog.open || guideDialog.showModal();
  };
  if (
    (triggerButton.addEventListener("click", openGuide),
    guideDialog
      .querySelector(".apple-install-done")
      .addEventListener("click", () => guideDialog.close()),
    isAddToHomeLaunch)
  )
    // 展示页启动阶段会挂 display-booting 类，此时弹窗会被启动遮罩压住。
    if (!document.documentElement.classList.contains("display-booting")) openGuide();
    else {
      // 监听根节点 class 变化，等启动遮罩摘掉后再弹，避免闪现被遮挡的弹窗。
      const bootingObserver = new MutationObserver(() => {
        document.documentElement.classList.contains("display-booting") ||
          (bootingObserver.disconnect(), openGuide());
      });
      bootingObserver.observe(document.documentElement, {
        attributes: !0,
        attributeFilter: ["class"]
      });
    }
}
