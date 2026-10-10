/**
 * Apple 移动端「添加到主屏幕」引导条。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootAppleInstallGuide()`、`onBeforeUnmount` 调
 * `teardownAppleInstallGuide()`。它把触发按钮与说明
 * `<dialog>` 直接挂到 `document.body`（在 Vue 树之外），视图是 shell 内可重入路由，卸载时
 * 必须摘掉，否则每进出一次就多一套引导条，且弹窗会残留到其它路由。
 */

/** Apple 移动端判定：iPhone/iPad/iPod，或伪装成 Mac 的触屏 iPad。 */
function isAppleMobile(navigatorObject: Navigator = navigator) {
  return (
    /iPhone|iPad|iPod/.test(navigatorObject.userAgent) ||
    (navigatorObject.platform === "MacIntel" && navigatorObject.maxTouchPoints > 1)
  );
}

/** 是否需要引导“添加到主屏幕”：Apple 移动端、非独立窗口、非原生壳。 */
function needsAppleInstallGuide(navigatorSource: Navigator = navigator, isStandalone = false) {
  return (
    isAppleMobile(navigatorSource) &&
    !isStandalone &&
    !(navigatorSource as Navigator & { standalone?: boolean }).standalone &&
    !/HomeOS-(Apple|Android)/i.test(navigatorSource.userAgent)
  );
}

let disposeActiveGuide: (() => void) | null = null;

/** 引导「添加到主屏幕」提示条（重复调用会先回收上一次）。 */
export function bootAppleInstallGuide(): void {
  teardownAppleInstallGuide();

  const pageUrl = new URL(location.href),
    shouldAutoOpen = pageUrl.searchParams.get("addToHome") === "1";
  if (
    (shouldAutoOpen &&
      (pageUrl.searchParams.delete("addToHome"),
      history.replaceState(null, "", pageUrl.pathname + pageUrl.search + pageUrl.hash)),
    needsAppleInstallGuide(navigator, matchMedia("(display-mode: standalone)").matches))
  ) {
    const isChromeIos = /CriOS\//.test(navigator.userAgent),
      triggerButton = document.createElement("button");
    ((triggerButton.className = "apple-install-trigger"),
      (triggerButton.type = "button"),
      (triggerButton.textContent = "添加到主屏幕"));
    const dialogElement = document.createElement("dialog");
    ((dialogElement.className = "apple-install-dialog"),
      dialogElement.setAttribute("aria-labelledby", "apple-install-title"),
      (dialogElement.innerHTML = `
    <img class="apple-install-icon" src="/static/assets/icons/homeos-icon-180-h5.png" alt="">
    <p class="apple-install-eyebrow">IPHONE \xB7 IPAD</p>
    <h2 id="apple-install-title">\u628A HomeOS \u653E\u5230\u4E3B\u5C4F\u5E55</h2>
    <p class="apple-install-intro">\u6DFB\u52A0\u540E\u50CF App \u4E00\u6837\u4ECE\u684C\u9762\u5168\u5C4F\u6253\u5F00\uFF0C\u9762\u677F\u529F\u80FD\u4E0E App \u76F8\u540C\u3002</p>
    <ol class="apple-install-steps">
      <li><b>1</b><div><strong>\u6253\u5F00${isChromeIos ? " Chrome " : " Safari "}\u7684\u5206\u4EAB\u83DC\u5355</strong><p>Chrome \u548C Safari \u5747\u652F\u6301\uFF0C\u53EF\u5728\u201C\u2026\u201D\u4E2D\u627E\u5230\u5206\u4EAB\u3002</p></div></li>
      <li><b>2</b><div><strong>\u9009\u62E9\u201C\u6DFB\u52A0\u5230\u4E3B\u5C4F\u5E55\u201D</strong><p>\u672A\u770B\u5230\u65F6\u70B9\u201C\u67E5\u770B\u66F4\u591A\u201D\u3002\u5982\u6709\u201C\u4F5C\u4E3A\u7F51\u9875 App \u6253\u5F00\u201D\uFF0C\u4FDD\u6301\u5F00\u542F\u3002</p></div></li>
      <li><b>3</b><div><strong>\u70B9\u51FB\u201C\u6DFB\u52A0\u201D</strong><p>\u56DE\u5230\u4E3B\u5C4F\u5E55\uFF0C\u70B9\u51FB HomeOS \u56FE\u6807\u8FDB\u5165\u9762\u677F\u3002</p></div></li>
    </ol>
    <p class="apple-install-footnote">\u9996\u6B21\u6253\u5F00\u82E5\u9700\u767B\u5F55\uFF0C\u4F7F\u7528\u8FD9\u53F0\u8BBE\u5907\u7684\u5BB6\u5EAD\u8D26\u53F7\u767B\u5F55\u5373\u53EF\u3002</p>
    <button class="apple-install-done" type="button">\u77E5\u9053\u4E86\uFF0C\u8FDB\u5165\u9762\u677F</button>`),
      document.body.append(triggerButton, dialogElement));
    const openDialog = () => {
      dialogElement.open || dialogElement.showModal();
    };
    const handleDone = () => dialogElement.close();
    let bootObserver: MutationObserver | null = null;
    if (
      (triggerButton.addEventListener("click", openDialog),
      dialogElement.querySelector(".apple-install-done")!.addEventListener("click", handleDone),
      shouldAutoOpen)
    )
      if (!document.documentElement.classList.contains("display-booting")) openDialog();
      else {
        bootObserver = new MutationObserver(() => {
          document.documentElement.classList.contains("display-booting") ||
            (bootObserver?.disconnect(), openDialog());
        });
        bootObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["class"],
        });
      }

    disposeActiveGuide = () => {
      bootObserver?.disconnect();
      triggerButton.removeEventListener("click", openDialog);
      dialogElement.querySelector(".apple-install-done")?.removeEventListener("click", handleDone);
      dialogElement.close();
      triggerButton.remove();
      dialogElement.remove();
    };
  }
}

/** 回收引导条：摘掉挂在 body 上的按钮与弹窗，断开首帧观察器。 */
export function teardownAppleInstallGuide(): void {
  const dispose = disposeActiveGuide;
  disposeActiveGuide = null;
  dispose?.();
}
