/**
 * 展示页启动层：splash 相位机、文档主题、首屏稳定性轮询。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootDisplayBoot()`、`onBeforeUnmount` 调
 * `teardownDisplayBoot()`。**不再是模块求值即执行的 IIFE**：视图现在是 shell 内的可重入路由
 * （总览 `/` 会被反复进出），因此所有状态在 boot 时重建、监听/定时器在 teardown 时回收，
 * 每次进入都能拿到干净的 splash 相位与 `window.HomeOSDisplayBoot`。
 *
 * 对外契约（供 `display.ts` 调用，id 与形状不可改）：
 * `window.HomeOSDisplayBoot = { setDocument, ready, fail, reveal, pending, failed }`
 */
const SPLASH_PHASE_LOADING = "loading" as const;

type SplashPhase = "loading" | "waiting" | "slow" | "leaving" | "done" | "error";

let disposeActiveBoot: (() => void) | null = null;

/** 引导展示页启动层（重复调用会先回收上一次）。 */
export function bootDisplayBoot(): void {
  teardownDisplayBoot();

  const documentElement = document.documentElement,
    isCapturePreview = new URLSearchParams(location.search).get("capturePreview") === "1",
    themeStorageKey = `homeos:display-theme:${location.pathname}`,
    warmStorageKey = `homeos:display-warm:${location.pathname}`;
  let isWarmStart = false;
  try {
    isWarmStart = !isCapturePreview && localStorage.getItem(warmStorageKey) === "1";
  } catch {}
  const isAppleUserAgent = /\bHomeOS-Apple\/\d/.test(globalThis.navigator?.userAgent || ""),
    isWarmBoot = isWarmStart || isAppleUserAgent,
    isPerfDiagnosticsEnabled =
      new URLSearchParams(location.search).get("performance-diagnostics") === "1",
    logBootPhase = (phase: any) => {
      isPerfDiagnosticsEnabled &&
        console.info(
          "[display-load]",
          JSON.stringify({
            phase: phase,
            at: Math.round(performance.now()),
            warm: isWarmStart,
          }),
        );
    };
  (logBootPhase("boot"),
    documentElement.classList.toggle("display-warm-start", isWarmBoot),
    documentElement.classList.toggle("capture-preview", isCapturePreview));
  try {
    const storedTheme = localStorage.getItem(themeStorageKey);
    (storedTheme === "dark" || storedTheme === "light") &&
      (documentElement.dataset.displayTheme = storedTheme);
  } catch {}
  let splashPhase: SplashPhase = isCapturePreview ? "done" : SPLASH_PHASE_LOADING,
    pollTimer: any,
    loadingTimeoutTimer: any,
    leaveTimer: any,
    hintTimer: any,
    bootStartedAt = performance.now(),
    shellElement: any = null;
  const imageByUrl = new Map(),
    displaySplashLookup = () => document.getElementById("display-splash"),
    displaySplashMessageLookup = () => document.getElementById("display-splash-message"),
    prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clearAllTimers() {
    for (const timerId of [pollTimer, loadingTimeoutTimer, leaveTimer, hintTimer])
      clearTimeout(timerId);
  }
  function applyDocumentTheme(dashboardDocument: any) {
    const background = dashboardDocument?.canvas?.background,
      colorValue = background?.type === "color" ? String(background.color || "") : "";
    let themeName = "";
    const hexMatch = colorValue.match(/^#([\da-f]{3}|[\da-f]{6})$/i),
      rgbMatch = colorValue.match(
        /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)$/i,
      );
    let rgbChannels;
    if (hexMatch) {
      const hexDigits =
        hexMatch[1].length === 3
          ? [...hexMatch[1]].map((digit) => digit + digit).join("")
          : hexMatch[1];
      rgbChannels = [0, 2, 4].map((byteOffset) =>
        parseInt(hexDigits.slice(byteOffset, byteOffset + 2), 16),
      );
    } else rgbMatch && (rgbChannels = rgbMatch.slice(1, 4).map(Number));
    if (rgbChannels)
      themeName =
        rgbChannels.reduce(
          (accumulator, channelValue, channelIndex) =>
            accumulator + channelValue * [0.2126, 0.7152, 0.0722][channelIndex],
          0,
        ) >= 150
          ? "light"
          : "dark";
    else {
      const themeLabel = String(dashboardDocument?.theme?.name || "").toLowerCase();
      /(^|[-_])light($|[-_])/.test(themeLabel)
        ? (themeName = "light")
        : /(^|[-_])dark($|[-_])/.test(themeLabel) && (themeName = "dark");
    }
    themeName
      ? (documentElement.dataset.displayTheme = themeName)
      : delete documentElement.dataset.displayTheme;
    try {
      themeName
        ? localStorage.setItem(themeStorageKey, themeName)
        : localStorage.removeItem(themeStorageKey);
    } catch {}
  }
  function showError(error: any, canEnter = false) {
    if (splashPhase === "done" || splashPhase === "error") return;
    (logBootPhase(canEnter ? "slow-loading" : "load-error"),
      clearAllTimers(),
      (splashPhase = canEnter ? "slow" : "error"),
      displaySplashLookup()?.classList.remove("is-complete", "is-leaving"),
      displaySplashLookup()?.classList.add("is-error"),
      displaySplashMessageLookup() &&
        (displaySplashMessageLookup!()!.textContent =
          error?.message || "仪表盘加载失败，请检查网络后重试。"));
    const displaySplashActionsNode = document.getElementById("display-splash-actions");
    displaySplashActionsNode && (displaySplashActionsNode.hidden = false);
    const displaySplashEnterButton = document.getElementById("display-splash-enter");
    displaySplashEnterButton && (displaySplashEnterButton.hidden = !canEnter);
  }
  function finishLoading(isFirstScreenReady = false) {
    if (splashPhase === "done" || splashPhase === "leaving") return;
    (logBootPhase(isFirstScreenReady ? "first-screen-ready" : "manual-entry"),
      clearAllTimers(),
      (splashPhase = "leaving"),
      displaySplashLookup()?.classList.remove("is-error"),
      displaySplashLookup()?.classList.add("is-complete"));
    const displaySplashActionsElement = document.getElementById("display-splash-actions");
    (displaySplashActionsElement && (displaySplashActionsElement.hidden = true),
      displaySplashMessageLookup() &&
        (displaySplashMessageLookup!()!.textContent = isFirstScreenReady
          ? "即将进入你的家…"
          : "正在进入仪表盘…"),
      (leaveTimer = setTimeout(
        () => {
          (displaySplashLookup()?.classList.add("is-leaving"),
            logBootPhase("reveal-start"),
            window.dispatchEvent?.(new Event("hb-display-reveal")),
            (leaveTimer = setTimeout(
              () => {
                const splashEl = displaySplashLookup();
                const hadFocusInside = !!splashEl?.contains(document.activeElement);
                // 只通知 Vue（DisplayView `splashPresent=false` / v-if）卸节点。
                // 禁止原生 `.remove()`：本仓库 Vue 无 flushSync，命令式摘节点会让父树
                // 重渲染时对已脱离 vnode 做 insertBefore → ErrorBoundary 卡死。
                window.dispatchEvent?.(new Event("hb-display-splash-detach"));
                documentElement.classList.remove("display-booting");
                splashPhase = "done";
                logBootPhase("entered");
                if (isFirstScreenReady) {
                  try {
                    localStorage.setItem(warmStorageKey, "1");
                  } catch {}
                }
                (imageByUrl.clear(),
                  hadFocusInside &&
                    shellElement?.focus({
                      preventScroll: true,
                    }));
              },
              prefersReducedMotion() ? 100 : isWarmBoot ? 150 : 550,
            )));
        },
        prefersReducedMotion() || isWarmBoot ? 0 : 250,
      )));
  }
  function isVisible(probedElement: any) {
    if (!probedElement.isConnected || probedElement.closest("[hidden]")) return false;
    const rect = probedElement.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= innerHeight ||
      rect.left >= innerWidth
    )
      return false;
    for (
      let ancestorElement = probedElement;
      ancestorElement && ancestorElement !== shellElement;
      ancestorElement = ancestorElement.parentElement
    ) {
      const computedStyle = getComputedStyle(ancestorElement);
      if (
        computedStyle.visibility === "hidden" ||
        computedStyle.display === "none" ||
        Number(computedStyle.opacity) === 0
      )
        return false;
    }
    return true;
  }
  function hasPendingAssets() {
    const excludedSelector = ".hb-camera-component, .hb-vacuum-map";
    for (const imageElement of shellElement.querySelectorAll("img[src]"))
      if (
        !imageElement.closest(excludedSelector) &&
        isVisible(imageElement) &&
        !imageElement.complete
      )
        return true;
    for (const hostElement of shellElement.querySelectorAll(".hb-interaction3d-host")) {
      if (
        !isVisible(hostElement) ||
        hostElement.dataset.access === "locked" ||
        hostElement.querySelector(".is-load-error")
      )
        continue;
      const runtimeElement = hostElement.querySelector(".hb-interaction3d-runtime");
      if (!runtimeElement || runtimeElement.classList.contains("is-loading")) return true;
    }
    let hasPending = false;
    for (const styledElement of shellElement.querySelectorAll('[style*="background"]'))
      if (!(styledElement.closest(excludedSelector) || !isVisible(styledElement)))
        for (const urlMatch of styledElement.style.backgroundImage.matchAll(
          /url\(["']?([^"')]+)["']?\)/g,
        )) {
          const imageUrl = urlMatch[1];
          if (!imageByUrl.has(imageUrl)) {
            const image = new Image();
            ((image.src = imageUrl), imageByUrl.set(imageUrl, image));
          }
          imageByUrl.get(imageUrl).complete || (hasPending = true);
        }
    return hasPending;
  }
  function handleReady(readyShellElement: any) {
    if (splashPhase !== SPLASH_PHASE_LOADING) return;
    ((shellElement = readyShellElement),
      (splashPhase = "waiting"),
      logBootPhase("document-ready"),
      clearTimeout(loadingTimeoutTimer),
      (loadingTimeoutTimer = setTimeout(() => {
        splashPhase === "waiting" &&
          (showError(
            new Error("首屏素材加载较慢，准备好后会自动进入，也可以重试或先进入仪表盘。"),
            true,
          ),
          (pollTimer = setTimeout(poll, 1000)));
      }, 60000)));
    let stableSinceMs = 0;
    const stableThresholdMs = isWarmBoot ? 32 : 120,
      pollIntervalMs = isWarmBoot ? 32 : 80,
      poll = () => {
        if (splashPhase !== "waiting" && splashPhase !== "slow") return;
        const now = performance.now();
        (hasPendingAssets() ? (stableSinceMs = 0) : stableSinceMs || (stableSinceMs = now),
          stableSinceMs &&
          now - stableSinceMs >= stableThresholdMs &&
          now - bootStartedAt >= (prefersReducedMotion() || isWarmBoot ? 0 : 1350)
            ? requestAnimationFrame(() => {
                (splashPhase !== "waiting" && splashPhase !== "slow") ||
                  (hasPendingAssets()
                    ? ((stableSinceMs = 0),
                      (pollTimer = setTimeout(
                        poll,
                        splashPhase === "slow" ? 1000 : pollIntervalMs,
                      )))
                    : finishLoading(true));
              })
            : (pollTimer = setTimeout(poll, splashPhase === "slow" ? 1000 : pollIntervalMs)));
      };
    poll();
  }

  const handleOnline = () => {
    splashPhase === "error" && location.reload();
  };
  const handleSplashClick = (clickEvent: Event) => {
    const clickTarget = clickEvent.target as Element | null;
    (clickTarget?.closest("#display-splash-retry") && location.reload(),
      clickTarget?.closest("#display-splash-enter") && finishLoading());
  };
  const handleFocusIn = (focusEvent: Event) => {
    const focusTarget = focusEvent.target as Node | null;
    splashPhase !== "done" &&
      focusTarget &&
      document.getElementById("display-shell")?.contains(focusTarget) &&
      displaySplashLookup()?.focus({
        preventScroll: true,
      });
  };

  ((window.HomeOSDisplayBoot = {
    setDocument: applyDocumentTheme,
    ready: handleReady,
    fail: showError,
    // 收起启动 splash 并放行外壳。用于「总览尚未创建任何仪表盘」这类**空状态**：
    // 提示文案本身要求用户去「设置 → 布局」，而 splash 是 fixed + z-index 2.1e9 的整屏层，
    // 留着它会把 MainLayout 的顶栏/侧边栏/页脚一起盖住，用户点不到导航、彻底卡死。
    reveal: () => finishLoading(),
    get pending() {
      return splashPhase !== "done";
    },
    get failed() {
      return splashPhase === "error";
    },
  }),
    !isCapturePreview &&
      (window.addEventListener("online", handleOnline),
      documentElement.classList.add("display-booting"),
      document.addEventListener("click", handleSplashClick),
      (hintTimer = setTimeout(() => {
        (splashPhase === "loading" || splashPhase === "waiting") &&
          displaySplashMessageLookup() &&
          (displaySplashMessageLookup!()!.textContent = "正在准备你的家，请稍候…");
      }, 8000)),
      (loadingTimeoutTimer = setTimeout(
        () => showError(new Error("仪表盘加载超时，请检查网络后重试。")),
        45000,
      )),
      document.addEventListener("focusin", handleFocusIn)));

  disposeActiveBoot = () => {
    clearAllTimers();
    if (!isCapturePreview) {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("click", handleSplashClick);
      document.removeEventListener("focusin", handleFocusIn);
    }
    imageByUrl.clear();
  };
}

/** 回收展示页启动层：注销监听/定时器、摘掉文档级类与主题、撤下全局契约。 */
export function teardownDisplayBoot(): void {
  const dispose = disposeActiveBoot;
  disposeActiveBoot = null;
  dispose?.();
  delete (window as any).HomeOSDisplayBoot;
  const documentElement = document.documentElement;
  // 这三个类与主题都作用在 <html>（外壳所在文档），视图卸载后必须摘掉，否则会影响其它路由。
  documentElement.classList.remove("display-warm-start", "capture-preview", "display-booting");
  delete documentElement.dataset.displayTheme;
}
