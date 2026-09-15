(() => {
  const documentElement = document.documentElement,
    isCapturePreview = new URLSearchParams(location.search).get("capturePreview") === "1",
    themeStorageKey = `homeos:display-theme:${location.pathname}`;
  documentElement.classList.toggle("capture-preview", isCapturePreview);
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
    getSplashElement = () => document.getElementById("display-splash"),
    getSplashMessageElement = () => document.getElementById("display-splash-message"),
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
        /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)$/i
      );
    let rgbChannels;
    if (hexMatch) {
      const hexDigits =
        hexMatch[1].length === 3
          ? [...hexMatch[1]].map(digit => digit + digit).join("")
          : hexMatch[1];
      rgbChannels = [0, 2, 4].map(byteOffset =>
        parseInt(hexDigits.slice(byteOffset, byteOffset + 2), 16)
      );
    } else rgbMatch && (rgbChannels = rgbMatch.slice(1, 4).map(Number));
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
  function showError(error, canEnter = !1) {
    if (splashPhase === "done" || splashPhase === "error") return;
    (clearAllTimers(),
      (splashPhase = "error"),
      getSplashElement()?.classList.remove("is-complete", "is-leaving"),
      getSplashElement()?.classList.add("is-error"),
      getSplashMessageElement() &&
        (getSplashMessageElement().textContent =
          error?.message ||
          "\u4EEA\u8868\u76D8\u52A0\u8F7D\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002"));
    const actionsElement = document.getElementById("display-splash-actions");
    actionsElement && (actionsElement.hidden = !1);
    const enterButton = document.getElementById("display-splash-enter");
    enterButton && (enterButton.hidden = !canEnter);
  }
  function finishLoading() {
    if (splashPhase === "done" || splashPhase === "leaving") return;
    (clearAllTimers(),
      (splashPhase = "leaving"),
      getSplashElement()?.classList.remove("is-error"),
      getSplashElement()?.classList.add("is-complete"));
    const splashActionsElement = document.getElementById("display-splash-actions");
    (splashActionsElement && (splashActionsElement.hidden = !0),
      getSplashMessageElement() &&
        (getSplashMessageElement().textContent = "\u51C6\u5907\u5C31\u7EEA"),
      (leaveTimer = setTimeout(
        () => {
          (getSplashElement()?.classList.add("is-leaving"),
            (leaveTimer = setTimeout(
              () => {
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
  function isVisible(element) {
    if (!element.isConnected || element.closest("[hidden]")) return !1;
    const rect = element.getBoundingClientRect();
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= innerHeight ||
      rect.left >= innerWidth
    )
      return !1;
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
  function hasPendingAssets() {
    const excludedSelector = ".hb-camera-component, .hb-vacuum-map";
    for (const imageElement of shellElement.querySelectorAll("img[src]"))
      if (
        !imageElement.closest(excludedSelector) &&
        isVisible(imageElement) &&
        !imageElement.complete
      )
        return !0;
    for (const hostElement of shellElement.querySelectorAll(".hb-interaction3d-host")) {
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
  function handleReady(readyShellElement) {
    if (splashPhase !== "loading") return;
    ((shellElement = readyShellElement),
      (splashPhase = "waiting"),
      clearTimeout(loadingTimeoutTimer),
      (loadingTimeoutTimer = setTimeout(
        () =>
          showError(
            new Error(
              "\u9996\u5C4F\u7D20\u6750\u52A0\u8F7D\u8F83\u6162\uFF0C\u53EF\u4EE5\u91CD\u8BD5\uFF0C\u6216\u5148\u8FDB\u5165\u4EEA\u8868\u76D8\u3002"
            ),
            !0
          ),
        3e4
      )));
    let stableSinceMs = 0;
    const poll = () => {
      if (splashPhase !== "waiting") return;
      const now = performance.now();
      (hasPendingAssets() ? (stableSinceMs = 0) : stableSinceMs || (stableSinceMs = now),
        stableSinceMs &&
        now - stableSinceMs >= 120 &&
        now - bootStartedAt >= (prefersReducedMotion() ? 0 : 1350)
          ? requestAnimationFrame(() => {
              splashPhase === "waiting" && finishLoading();
            })
          : (pollTimer = setTimeout(poll, 80)));
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
    }
  }),
    !isCapturePreview &&
      (documentElement.classList.add("display-booting"),
      document.addEventListener("click", clickEvent => {
        (clickEvent.target.closest("#display-splash-retry") && location.reload(),
          clickEvent.target.closest("#display-splash-enter") && finishLoading());
      }),
      (hintTimer = setTimeout(() => {
        (splashPhase === "loading" || splashPhase === "waiting") &&
          getSplashMessageElement() &&
          (getSplashMessageElement().textContent =
            "\u6B63\u5728\u51C6\u5907\u4F60\u7684\u5BB6\uFF0C\u8BF7\u7A0D\u5019\u2026");
      }, 8e3)),
      (loadingTimeoutTimer = setTimeout(
        () =>
          showError(
            new Error(
              "\u4EEA\u8868\u76D8\u52A0\u8F7D\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\u3002"
            )
          ),
        45e3
      )),
      document.addEventListener("focusin", focusEvent => {
        splashPhase !== "done" &&
          document.getElementById("display-shell")?.contains(focusEvent.target) &&
          getSplashElement()?.focus({ preventScroll: !0 });
      })));
})();
