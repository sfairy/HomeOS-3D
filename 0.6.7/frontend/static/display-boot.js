(() => {
  const documentElement = document.documentElement,
    isCapturePreview = new URLSearchParams(location.search).get("capturePreview") === "1",
    themeStorageKey = `ha-bridge:display-theme:${window.HABridgeEmbed?.path || location.pathname}`,
    warmStorageKey = `ha-bridge:display-warm:${window.HABridgeEmbed?.path || location.pathname}`;
  let isWarmStart = false;
  try {
    isWarmStart = !isCapturePreview && localStorage.getItem(warmStorageKey) === "1";
  } catch {}
  const isAppleUserAgent = /\bHA-Bridge-Apple\/\d/.test(globalThis.navigator?.userAgent || ""),
    isWarmBoot = isWarmStart || isAppleUserAgent,
    isPerfDiagnosticsEnabled =
      new URLSearchParams(location.search).get("performance-diagnostics") === "1",
    logBootPhase = (phase) => {
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
  let splashPhase = isCapturePreview ? "done" : "loading",
    pollTimer,
    loadingTimeoutTimer,
    leaveTimer,
    hintTimer,
    bootStartedAt = performance.now(),
    shellElement = null;
  const imageByUrl = new Map(),
    displaySplashLookup = () => document.getElementById("display-splash"),
    displaySplashMessageLookup = () => document.getElementById("display-splash-message"),
    prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function clearAllTimers() {
    for (const timerId of [pollTimer, loadingTimeoutTimer, leaveTimer, hintTimer])
      clearTimeout(timerId);
  }
  function applyDocumentTheme(dashboardDocument) {
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
  function showError(error, canEnter = false) {
    if (splashPhase === "done" || splashPhase === "error") return;
    (logBootPhase(canEnter ? "slow-loading" : "load-error"),
      clearAllTimers(),
      (splashPhase = canEnter ? "slow" : "error"),
      displaySplashLookup()?.classList.remove("is-complete", "is-leaving"),
      displaySplashLookup()?.classList.add("is-error"),
      displaySplashMessageLookup() &&
        (displaySplashMessageLookup().textContent =
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
        (displaySplashMessageLookup().textContent = isFirstScreenReady
          ? "即将进入你的家…"
          : "正在进入仪表盘…"),
      (leaveTimer = setTimeout(
        () => {
          (displaySplashLookup()?.classList.add("is-leaving"),
            logBootPhase("reveal-start"),
            window.dispatchEvent?.(new Event("hb-display-reveal")),
            (leaveTimer = setTimeout(
              () => {
                const hadFocusInside = displaySplashLookup()?.contains(document.activeElement);
                if (
                  (displaySplashLookup()?.remove(),
                  documentElement.classList.remove("display-booting"),
                  (splashPhase = "done"),
                  logBootPhase("entered"),
                  isFirstScreenReady)
                )
                  try {
                    localStorage.setItem(warmStorageKey, "1");
                  } catch {}
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
  function isVisible(probedElement) {
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
  function handleReady(readyShellElement) {
    if (splashPhase !== "loading") return;
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
  ((window.HABridgeDisplayBoot = {
    setDocument: applyDocumentTheme,
    ready: handleReady,
    fail: showError,
    get pending() {
      return splashPhase !== "done";
    },
    get failed() {
      return splashPhase === "error";
    },
  }),
    !isCapturePreview &&
      (window.addEventListener("online", () => {
        splashPhase === "error" && location.reload();
      }),
      documentElement.classList.add("display-booting"),
      document.addEventListener("click", (clickEvent) => {
        (clickEvent.target.closest("#display-splash-retry") && location.reload(),
          clickEvent.target.closest("#display-splash-enter") && finishLoading());
      }),
      (hintTimer = setTimeout(() => {
        (splashPhase === "loading" || splashPhase === "waiting") &&
          displaySplashMessageLookup() &&
          (displaySplashMessageLookup().textContent = "正在准备你的家，请稍候…");
      }, 8000)),
      (loadingTimeoutTimer = setTimeout(
        () => showError(new Error("仪表盘加载超时，请检查网络后重试。")),
        45000,
      )),
      document.addEventListener("focusin", (focusEvent) => {
        splashPhase !== "done" &&
          document.getElementById("display-shell")?.contains(focusEvent.target) &&
          displaySplashLookup()?.focus({
            preventScroll: true,
          });
      })));
})();
