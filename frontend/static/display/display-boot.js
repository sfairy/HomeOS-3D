/**
 * 展示页启动引导（splash）状态机。
 *
 * 位置：/display/<id> 最前置脚本，早于渲染脚本执行，负责盖住首屏白屏。
 * 职责：维护 loading → waiting → leaving → done / error，等首屏素材与 3D 交互宿主就绪后再淡出；
 * 把画布背景色推导成明 / 暗主题写入 localStorage；失败时给出重试与「先进入仪表盘」两种出口。
 * 约定：通过 window.HABridgeDisplayBoot 暴露 setDocument / ready / fail / notice / recovered /
 * setRuntimePush 与只读的 pending / failed；?capturePreview=1 时完全跳过启动引导。
 */
(() => {
  "use strict";
  const documentElement = document.documentElement,
    // capturePreview 用于截图与预览，跳过启动遮罩，避免截到引导层。
    isCapturePreview = new URLSearchParams(location.search).get("capturePreview") === "1",
    // 主题按路径分别记忆，不同展示页可以各自保持明 / 暗设置。
    themeStorageKey = `homeos:display-theme:${location.pathname}`;
  documentElement.classList.toggle("capture-preview", isCapturePreview);
  try {
    // 只接受 dark / light 两个已知值，脏数据一律忽略。
    // 读不到（首次访问 / 隐私模式）就用默认主题，不为它挡住首屏。
    const storedTheme = localStorage.getItem(themeStorageKey);
    (storedTheme === "dark" || storedTheme === "light") &&
      (documentElement.dataset.displayTheme = storedTheme);
  } catch {}
  // splashPhase：loading 等首屏、waiting 等素材稳定、leaving 淡出中、done / error 终态。
  let splashPhase = isCapturePreview ? "done" : "loading",
    pollTimer,
    loadingTimeoutTimer,
    leaveTimer,
    hintTimer,
    bootStartedAt = performance.now(),
    shellElement = null;
  // 用 CSS background-image 引用的图片不进 <img>，需要单独造 Image 跟踪其加载。
  const imageByUrl = new Map(),
    getSplashElement = () => document.getElementById("display-splash"),
    getSplashMessageElement = () => document.getElementById("display-splash-message"),
    prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // 运行期横幅的三条来源，各自有各自的撤销条件（见各自的 setter）：
  // 实时推送停止（等重新订阅成功）> 刷新失败（等下一次刷新成功）> 一次性提示（8 秒）。
  let noticeHideTimer,
    noticeFlashMessage = "",
    noticeRefreshMessage = "",
    noticeRuntimeMessage = "";

  // 统一清理四类定时器，进入终态后必须调用，避免残留回调再改状态。
  function clearAllTimers() {
    for (const timerId of [pollTimer, loadingTimeoutTimer, leaveTimer, hintTimer])
      clearTimeout(timerId);
  }

  /**
   * 根据画布背景色推导并应用明 / 暗主题。
   */
  function applyDocumentTheme(dashboardDocument) {    const background = dashboardDocument?.canvas?.background,
      colorValue = background?.type === "color" ? String(background.color || "") : "";
    let themeName = "";
    // 支持 #rgb / #rrggbb 与 rgb() / rgba()（仅不透明）两类写法。
    const hexMatch = colorValue.match(/^#([\da-f]{3}|[\da-f]{6})$/i),
      rgbMatch = colorValue.match(
        /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)$/i
      );
    let rgbChannels;
    if (hexMatch) {
      // 3 位缩写先展开成 6 位，再按每两位取一个通道。
      const hexDigits =
        hexMatch[1].length === 3
          ? [...hexMatch[1]].map(digit => digit + digit).join("")
          : hexMatch[1];
      rgbChannels = [0, 2, 4].map(byteOffset =>
        parseInt(hexDigits.slice(byteOffset, byteOffset + 2), 16)
      );
    } else rgbMatch && (rgbChannels = rgbMatch.slice(1, 4).map(Number));
    // 用 Rec.709 亮度公式加权；阈值 150 是经验值，大于它视为浅色底配深色文字。
    if (rgbChannels)
      themeName =
        rgbChannels.reduce(
          (accumulator, channelValue, channelIndex) =>
            accumulator + channelValue * [0.2126, 0.7152, 0.0722][channelIndex],
          0
        ) >= 150
          ? "light"
          : "dark";
    else {
      // 背景不是纯色（图片 / 渐变）时退回主题名里的 light / dark 关键词。
      const themeLabel = String(dashboardDocument?.theme?.name || "").toLowerCase();
      /(^|[-_])light($|[-_])/.test(themeLabel)
        ? (themeName = "light")
        : /(^|[-_])dark($|[-_])/.test(themeLabel) && (themeName = "dark");
    }
    themeName
      ? (documentElement.dataset.displayTheme = themeName)
      : delete documentElement.dataset.displayTheme;
    try {
      // 记忆主题，下次进入同一页面时首帧就用对配色，避免闪白。
      // 写不进去只是下次不再记忆，本次主题已经生效。
      themeName
        ? localStorage.setItem(themeStorageKey, themeName)
        : localStorage.removeItem(themeStorageKey);
    } catch {}
  }

  /**
   * 把当前该显示的那条提示写到运行期横幅上，谁都没有时收起。
   * 三类提示共用一个元素，按严重程度取一条；页面顶部只允许一条横幅，
   * 叠两条会互相盖住、也让读屏重复播报。
   */
  function renderNotice() {
    const noticeElement = document.getElementById("display-notice");
    // 截图 / 预览模式不能出现横幅（会污染截图，也会被误当成系统状态）。
    if (!noticeElement || isCapturePreview) return;
    const noticeMessage = noticeRuntimeMessage || noticeRefreshMessage || noticeFlashMessage;
    // 文案只在非空时写：重复写同一个字符串会让 role="status" 再播报一遍同一件事。
    noticeMessage && (noticeElement.textContent = noticeMessage);
    noticeElement.hidden = !noticeMessage;
  }

  /**
   * 显示一条一次性提示，8 秒后自动收起。
   * 用于「控件操作失败」这类已经过去的事件：它们没有持续状态，
   * 留着不走反而让人以为画面还在坏着。
   */
  function showFlashNotice(message) {
    clearTimeout(noticeHideTimer);
    noticeFlashMessage = String(message || "");
    renderNotice();
    // 8e3 与启动阶段「换安抚文案」的节奏一致。
    noticeFlashMessage && (noticeHideTimer = setTimeout(hideFlashNotice, 8e3));
  }

  /**
   * 收起一次性提示。
   */
  function hideFlashNotice() {
    (clearTimeout(noticeHideTimer),
      (noticeHideTimer = undefined),
      (noticeFlashMessage = ""),
      renderNotice());
  }

  /**
   * 设置 / 撤销「无法更新」横幅（断网、超时这类刷新失败）。
   * 它跟着「下一次刷新成功」一起撤销（recovered），否则恢复联网后横幅会一直挂着，
   * 用户再也分不清好坏。
   */
  function setRefreshNotice(message) {
    ((noticeRefreshMessage = String(message || "")), renderNotice());
  }

  /**
   * 设置 / 撤销「实时推送已停止」横幅。
   * 与刷新失败分开记：刷新成功不代表实体状态会恢复，只有渲染层重新订阅成功（available 为 true）才算恢复。
   * @param {string} [message] 不可用时的文案。
   */
  function setRuntimePushNotice(available, message) {
    noticeRuntimeMessage = available
      ? ""
      : String(message || "实时状态已停止更新，画面可能不是最新的。");
    renderNotice();
  }

  /**
   * 进入错误终态并显示提示。
   * 启动层已摘掉（phase 为 done）时不再有「错误界面」可用，改为挂一条非阻塞横幅
   * 并保留画面；否则展示页断网后会一直安静地显示冻结旧数据，墙面屏前的人看不出异常。
   */
  function showError(error, canEnter = !1) {
    // 运行期失败：数据可能已经过期，但页面还能用，不要用遮罩把整屏挡住。
    if (splashPhase === "done") {
      setRefreshNotice(error?.message || "仪表盘更新失败，画面可能不是最新的。");
      return;
    }
    // 已是终态时忽略后续错误，防止淡出过程中被又一次失败打断。
    if (splashPhase === "error") return;
    (clearAllTimers(),
      (splashPhase = "error"),
      getSplashElement()?.classList.remove("is-complete", "is-leaving"),
      getSplashElement()?.classList.add("is-error"),
      getSplashMessageElement() &&
        (getSplashMessageElement().textContent =
          error?.message ||
          "仪表盘加载失败，请检查网络后重试。"));
    const actionsElement = document.getElementById("display-splash-actions");
    actionsElement && (actionsElement.hidden = !1);
    // 只有「首屏素材慢」这类非致命错误才允许跳过等待直接进入。
    const enterButton = document.getElementById("display-splash-enter");
    enterButton && (enterButton.hidden = !canEnter);
  }

  /**
   * 进入淡出流程并在动画结束后移除启动层。
   */
  function finishLoading() {
    if (splashPhase === "done" || splashPhase === "leaving") return;
    (clearAllTimers(),
      (splashPhase = "leaving"),
      getSplashElement()?.classList.remove("is-error"),
      getSplashElement()?.classList.add("is-complete"));
    const splashActionsElement = document.getElementById("display-splash-actions");
    (splashActionsElement && (splashActionsElement.hidden = !0),
      getSplashMessageElement() &&
        (getSplashMessageElement().textContent = "准备就绪"),
      // 两级定时：先等 250ms 让「准备就绪」可读，再加 550ms 离场动画；
      // 用户开了「减少动态效果」时两段都压到最短。
      (leaveTimer = setTimeout(
        () => {
          (getSplashElement()?.classList.add("is-leaving"),
            (leaveTimer = setTimeout(
              () => {
                // 焦点原本在启动层内时要交还给仪表盘，否则键盘用户会失去焦点。
                const hadFocusInside = getSplashElement()?.contains(document.activeElement);
                (getSplashElement()?.remove(),
                  documentElement.classList.remove("display-booting"),
                  (splashPhase = "done"),
                  imageByUrl.clear(),
                  hadFocusInside && shellElement?.focus({ preventScroll: !0 }));
              },
              prefersReducedMotion() ? 100 : 550
            )));
        },
        prefersReducedMotion() ? 0 : 250
      )));
  }

  /**
   * 判断元素是否真的可见（用于决定它是否需要算进「待加载素材」）。
   */
  function isVisible(element) {
    if (!element.isConnected || element.closest("[hidden]")) return !1;
    const rect = element.getBoundingClientRect();
    // 完全在视口外或尺寸为 0 的元素不必等待其图片。
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= innerHeight ||
      rect.left >= innerWidth
    )
      return !1;
    // 任一祖先被隐藏 / 透明，元素也等于不可见。
    for (
      let ancestor = element;
      ancestor && ancestor !== shellElement;
      ancestor = ancestor.parentElement
    ) {
      const computedStyle = getComputedStyle(ancestor);
      if (
        computedStyle.visibility === "hidden" ||
        computedStyle.display === "none" ||
        Number(computedStyle.opacity) === 0
      )
        return !1;
    }
    return !0;
  }

  /**
   * 检查首屏是否还有未加载完的素材。
   */
  function hasPendingAssets() {
    // 摄像头与扫地机地图是持续推流的组件，永远画不完，必须排除。
    const excludedSelector = ".hb-camera-component, .hb-vacuum-map";
    for (const imageElement of shellElement.querySelectorAll("img[src]"))
      if (
        !imageElement.closest(excludedSelector) &&
        isVisible(imageElement) &&
        !imageElement.complete
      )
        return !0;
    for (const hostElement of shellElement.querySelectorAll(".hb-interaction3d-host")) {
      // 未解锁的 3D 宿主和加载失败的宿主不算「待加载」，否则会永远等下去。
      if (
        !isVisible(hostElement) ||
        hostElement.dataset.access === "locked" ||
        hostElement.querySelector(".is-load-error")
      )
        continue;
      const runtimeElement = hostElement.querySelector(".hb-interaction3d-runtime");
      if (!runtimeElement || runtimeElement.classList.contains("is-loading")) return !0;
    }
    let hasPending = !1;
    // CSS background-image 里的图片也要等：先从声明中抽出 url() 再逐个建 Image 探活。
    for (const styledElement of shellElement.querySelectorAll('[style*="background"]'))
      if (!(styledElement.closest(excludedSelector) || !isVisible(styledElement)))
        for (const urlMatch of styledElement.style.backgroundImage.matchAll(
          /url\(["']?([^"')]+)["']?\)/g
        )) {
          const imageUrl = urlMatch[1];
          if (!imageByUrl.has(imageUrl)) {
            const image = new Image();
            ((image.src = imageUrl), imageByUrl.set(imageUrl, image));
          }
          imageByUrl.get(imageUrl).complete || (hasPending = !0);
        }
    return hasPending;
  }

  /**
   * 渲染脚本通知「首屏已可用」时进入等待稳定阶段。
   */
  function handleReady(readyShellElement) {
    if (splashPhase !== "loading") return;
    ((shellElement = readyShellElement),
      (splashPhase = "waiting"),
      clearTimeout(loadingTimeoutTimer),
      // 30 秒还没画完就不必再等，允许用户选择先进入（3e4 毫秒）。
      (loadingTimeoutTimer = setTimeout(
        () =>
          showError(
            new Error(
              "首屏素材加载较慢，可以重试，或先进入仪表盘。"
            ),
            !0
          ),
        3e4
      )));
    let stableSinceMs = 0;
    // 轮询判定「连续 120ms 无新增待加载素材」才收尾，避免图片先解码后替换造成闪烁。
    const poll = () => {
      if (splashPhase !== "waiting") return;
      const now = performance.now();
      (hasPendingAssets() ? (stableSinceMs = 0) : stableSinceMs || (stableSinceMs = now),
        stableSinceMs &&
        now - stableSinceMs >= 120 &&
        // 启动层最少停留 1350ms，给品牌动画留出时间。
        now - bootStartedAt >= (prefersReducedMotion() ? 0 : 1350)
          ? requestAnimationFrame(() => {
              splashPhase === "waiting" && finishLoading();
            })
          : (pollTimer = setTimeout(poll, 80)));
    };
    poll();
  }

  // 对渲染脚本暴露的桥接接口；pending / failed 用 getter 保证读到实时状态。
  ((window.HABridgeDisplayBoot = {
    setDocument: applyDocumentTheme,
    ready: handleReady,
    fail: showError,
    // 一次性提示（控件操作失败等）：8 秒后自动收起。
    notice: showFlashNotice,
    // 刷新成功：撤销「无法更新」横幅（断网恢复后它必须自己消失）。
    recovered: () => setRefreshNotice(""),
    // 实时推送可用性：false 会挂住，直到渲染层再次订阅成功。
    setRuntimePush: setRuntimePushNotice,
    get pending() {
      return splashPhase !== "done";
    },
    get failed() {
      return splashPhase === "error";
    }
  }),
    // capturePreview 模式下不挂启动遮罩，也不绑定重试 / 进入按钮。
    !isCapturePreview &&
      (documentElement.classList.add("display-booting"),
      // 事件委托到 document：启动层的按钮在错误态才出现，无需提前取节点。
      document.addEventListener("click", clickEvent => {
        (clickEvent.target.closest("#display-splash-retry") && location.reload(),
          clickEvent.target.closest("#display-splash-enter") && finishLoading());
      }),
      // 8 秒（8e3）后换一句安抚文案，说明仍在加载而非卡死。
      (hintTimer = setTimeout(() => {
        (splashPhase === "loading" || splashPhase === "waiting") &&
          getSplashMessageElement() &&
          (getSplashMessageElement().textContent =
            "正在准备你的家，请稍候…");
      }, 8e3)),
      // 45 秒（45e3）是整体兜底：超过就判定启动失败。
      (loadingTimeoutTimer = setTimeout(
        () =>
          showError(
            new Error(
              "仪表盘加载超时，请检查网络后重试。"
            )
          ),
        45e3
      )),
      // 启动期间把焦点锁在遮罩上，防止键盘 / 读屏用户操作到尚未就绪的页面。
      document.addEventListener("focusin", focusEvent => {
        splashPhase !== "done" &&
          document.getElementById("display-shell")?.contains(focusEvent.target) &&
          getSplashElement()?.focus({ preventScroll: !0 });
      }),
      // 断网导致的启动失败，在恢复联网后自动重试一次：墙面屏前通常没人能去点「重试」，
      // 自愈是唯一合理的出口。只在错误终态时重载，正常运行中不因网络抖动打断画面。
      window.addEventListener("online", () => {
        splashPhase === "error" && location.reload();
      })));
})();
