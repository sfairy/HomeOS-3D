/**
 * 苹果设备「添加到主屏幕」引导脚本。
 */
import { needsAppleInstallGuide as shouldShowInstallGuide } from "../auth/pairing-link.js?v=2609271411";

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
    (triggerButton.textContent = "添加到主屏幕"));
  const guideDialog = document.createElement("dialog");
  ((guideDialog.className = "apple-install-dialog"),
    guideDialog.setAttribute("aria-labelledby", "apple-install-title"),
    (guideDialog.innerHTML = `
    <img class="apple-install-icon" src="/static/assets/icons/homeos-icon-180-h5.png?v=2609271411" alt="">
    <p class="apple-install-eyebrow">IPHONE \xB7 IPAD</p>
    <h2 id="apple-install-title">把 HomeOS 放到主屏幕</h2>
    <p class="apple-install-intro">添加后像 App 一样从桌面全屏打开，面板功能与 App 相同。</p>
    <ol class="apple-install-steps">
      <li><b>1</b><div><strong>打开${isChromeIos ? " Chrome " : " Safari "}的分享菜单</strong><p>Chrome 和 Safari 均支持，可在“…”中找到分享。</p></div></li>
      <li><b>2</b><div><strong>选择“添加到主屏幕”</strong><p>未看到时点“查看更多”。如有“作为网页 App 打开”，保持开启。</p></div></li>
      <li><b>3</b><div><strong>点击“添加”</strong><p>回到主屏幕，点击 HomeOS 图标进入面板。</p></div></li>
    </ol>
    <p class="apple-install-footnote">首次打开若提示配对，输入这台设备原来的配对码即可。</p>
    <button class="apple-install-done" type="button">知道了，进入面板</button>`),
    document.body.append(triggerButton, guideDialog));
  /**
   * 打开「添加到主屏幕」说明弹窗。触发点：用户点击悬浮按钮；或链接带 addToHome=1 且启动遮罩
   */
  const openGuide = () => {
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
