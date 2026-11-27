import { PanelRenderer } from './renderer/panel-renderer'
import { componentFamiliesForDocument, ensureRegistryComponents } from './renderer/registry/index'
import { type DomControl } from '@app/shared/util/dom-control'
import { navigateInShell } from '@/studio/platform/shell-navigation'

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
    (navigatorObject.platform === 'MacIntel' && navigatorObject.maxTouchPoints > 1)
  )
}

/** 是否需要引导“添加到主屏幕”：Apple 移动端、非独立窗口、非原生壳。 */
function needsAppleInstallGuide(navigatorSource: Navigator = navigator, isStandalone = false) {
  return (
    isAppleMobile(navigatorSource) &&
    !isStandalone &&
    !(navigatorSource as Navigator & { standalone?: boolean }).standalone &&
    !/HomeOS-(Apple|Android)/i.test(navigatorSource.userAgent)
  )
}

let disposeActiveGuide: (() => void) | null = null

/**
 * 是否处于「被嵌入」的展示上下文：`?embed=1`，或页面跑在 iframe 里（`self !== top`）。
 *
 * HA 仪表盘是以 iframe 嵌入的，用户不会在 HA 面板里把 HomeOS 装到主屏幕；go2rtc 的
 * `?embed=1` 场景也复用这个判定，避免两处各写一份。
 */
function isEmbeddedDisplayContext(
  environment: { self?: unknown; top?: unknown } = window,
  search: string = location.search,
): boolean {
  if (new URLSearchParams(search).get('embed') === '1') return true
  return environment.self !== environment.top
}

/** 引导「添加到主屏幕」提示条（重复调用会先回收上一次）。 */
export function bootAppleInstallGuide(): void {
  teardownAppleInstallGuide()
  // 嵌入态（HA 仪表盘 iframe / ?embed=1）完全不注入引导条与 dialog。
  if (isEmbeddedDisplayContext()) return

  const pageUrl = new URL(location.href),
    shouldAutoOpen = pageUrl.searchParams.get('addToHome') === '1'
  if (
    (shouldAutoOpen &&
      (pageUrl.searchParams.delete('addToHome'),
      history.replaceState(null, '', pageUrl.pathname + pageUrl.search + pageUrl.hash)),
    needsAppleInstallGuide(navigator, matchMedia('(display-mode: standalone)').matches))
  ) {
    const isChromeIos = /CriOS\//.test(navigator.userAgent),
      triggerButton = document.createElement('button')
    ;(triggerButton.className = 'apple-install-trigger'),
      (triggerButton.type = 'button'),
      (triggerButton.textContent = '添加到主屏幕')
    const dialogElement = document.createElement('dialog')
    ;(dialogElement.className = 'apple-install-dialog'),
      dialogElement.setAttribute('aria-labelledby', 'apple-install-title'),
      (dialogElement.innerHTML = `
    <img class="apple-install-icon" src="/static/assets/icons/homeos-icon-180-h5.png" alt="">
    <p class="apple-install-eyebrow">IPHONE \xB7 IPAD</p>
    <h2 id="apple-install-title">\u628A HomeOS \u653E\u5230\u4E3B\u5C4F\u5E55</h2>
    <p class="apple-install-intro">\u6DFB\u52A0\u540E\u50CF App \u4E00\u6837\u4ECE\u684C\u9762\u5168\u5C4F\u6253\u5F00\uFF0C\u9762\u677F\u529F\u80FD\u4E0E App \u76F8\u540C\u3002</p>
    <ol class="apple-install-steps">
      <li><b>1</b><div><strong>\u6253\u5F00${isChromeIos ? ' Chrome ' : ' Safari '}\u7684\u5206\u4EAB\u83DC\u5355</strong><p>Chrome \u548C Safari \u5747\u652F\u6301\uFF0C\u53EF\u5728\u201C\u2026\u201D\u4E2D\u627E\u5230\u5206\u4EAB\u3002</p></div></li>
      <li><b>2</b><div><strong>\u9009\u62E9\u201C\u6DFB\u52A0\u5230\u4E3B\u5C4F\u5E55\u201D</strong><p>\u672A\u770B\u5230\u65F6\u70B9\u201C\u67E5\u770B\u66F4\u591A\u201D\u3002\u5982\u6709\u201C\u4F5C\u4E3A\u7F51\u9875 App \u6253\u5F00\u201D\uFF0C\u4FDD\u6301\u5F00\u542F\u3002</p></div></li>
      <li><b>3</b><div><strong>\u70B9\u51FB\u201C\u6DFB\u52A0\u201D</strong><p>\u56DE\u5230\u4E3B\u5C4F\u5E55\uFF0C\u70B9\u51FB HomeOS \u56FE\u6807\u8FDB\u5165\u9762\u677F\u3002</p></div></li>
    </ol>
    <p class="apple-install-footnote">\u9996\u6B21\u6253\u5F00\u82E5\u9700\u767B\u5F55\uFF0C\u4F7F\u7528\u8FD9\u53F0\u8BBE\u5907\u7684\u5BB6\u5EAD\u8D26\u53F7\u767B\u5F55\u5373\u53EF\u3002</p>
    <button class="apple-install-done" type="button">\u77E5\u9053\u4E86\uFF0C\u8FDB\u5165\u9762\u677F</button>`),
      document.body.append(triggerButton, dialogElement)
    const openDialog = () => {
      dialogElement.open || dialogElement.showModal()
    }
    const handleDone = () => dialogElement.close()
    let bootObserver: MutationObserver | null = null
    if (
      (triggerButton.addEventListener('click', openDialog),
      dialogElement.querySelector('.apple-install-done')!.addEventListener('click', handleDone),
      shouldAutoOpen)
    )
      if (!document.documentElement.classList.contains('display-booting')) openDialog()
      else {
        bootObserver = new MutationObserver(() => {
          document.documentElement.classList.contains('display-booting') || (bootObserver?.disconnect(), openDialog())
        })
        bootObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        })
      }

    disposeActiveGuide = () => {
      bootObserver?.disconnect()
      triggerButton.removeEventListener('click', openDialog)
      dialogElement.querySelector('.apple-install-done')?.removeEventListener('click', handleDone)
      dialogElement.close()
      triggerButton.remove()
      dialogElement.remove()
    }
  }
}

/** 回收引导条：摘掉挂在 body 上的按钮与弹窗，断开首帧观察器。 */
export function teardownAppleInstallGuide(): void {
  const dispose = disposeActiveGuide
  disposeActiveGuide = null
  dispose?.()
}

/**
 * 展示页启动层：splash 相位机、文档主题、首屏稳定性轮询。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootDisplayBoot()`、`onBeforeUnmount` 调
 * `teardownDisplayBoot()`。视图现在是 shell 内的可重入路由
 * （总览 `/` 会被反复进出），因此所有状态在 boot 时重建、监听/定时器在 teardown 时回收，
 * 每次进入都能拿到干净的 splash 相位与 `window.HomeOSDisplayBoot`。
 *
 * 对外契约（供 `display.ts` 调用，id 与形状不可改）：
 * `window.HomeOSDisplayBoot = { setDocument, ready, fail, reveal, pending, failed }`
 */
const SPLASH_PHASE_LOADING = 'loading' as const

type SplashPhase = 'loading' | 'waiting' | 'slow' | 'leaving' | 'done' | 'error'

let disposeActiveBoot: (() => void) | null = null

/** 引导展示页启动层（重复调用会先回收上一次）。 */
export function bootDisplayBoot(): void {
  teardownDisplayBoot()

  const documentElement = document.documentElement,
    isCapturePreview = new URLSearchParams(location.search).get('capturePreview') === '1',
    themeStorageKey = `homeos:display-theme:${location.pathname}`,
    warmStorageKey = `homeos:display-warm:${location.pathname}`
  let isWarmStart = false
  try {
    isWarmStart = !isCapturePreview && localStorage.getItem(warmStorageKey) === '1'
  } catch {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
  const isAppleUserAgent = /\bHomeOS-Apple\/\d/.test(globalThis.navigator?.userAgent || ''),
    isWarmBoot = isWarmStart || isAppleUserAgent,
    isPerfDiagnosticsEnabled = new URLSearchParams(location.search).get('performance-diagnostics') === '1',
    logBootPhase = (phase: any) => {
      isPerfDiagnosticsEnabled &&
        console.info(
          '[display-load]',
          JSON.stringify({
            phase: phase,
            at: Math.round(performance.now()),
            warm: isWarmStart,
          }),
        )
    }
  logBootPhase('boot'),
    documentElement.classList.toggle('display-warm-start', isWarmBoot),
    documentElement.classList.toggle('capture-preview', isCapturePreview)
  try {
    const storedTheme = localStorage.getItem(themeStorageKey)
    ;(storedTheme === 'dark' || storedTheme === 'light') && (documentElement.dataset.displayTheme = storedTheme)
  } catch {
    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
  }
  let splashPhase: SplashPhase = isCapturePreview ? 'done' : SPLASH_PHASE_LOADING,
    pollTimer: any,
    loadingTimeoutTimer: any,
    leaveTimer: any,
    hintTimer: any,
    bootStartedAt = performance.now(),
    shellElement: any = null
  const imageByUrl = new Map(),
    displaySplashLookup = () => document.getElementById('display-splash'),
    displaySplashMessageLookup = () => document.getElementById('display-splash-message'),
    prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  function clearAllTimers() {
    for (const timerId of [pollTimer, loadingTimeoutTimer, leaveTimer, hintTimer]) clearTimeout(timerId)
  }
  function applyDocumentTheme(dashboardDocument: any) {
    const background = dashboardDocument?.canvas?.background,
      colorValue = background?.type === 'color' ? String(background.color || '') : ''
    let themeName = ''
    const hexMatch = colorValue.match(/^#([\da-f]{3}|[\da-f]{6})$/i),
      rgbMatch = colorValue.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)(?:\s*[,/]\s*1(?:\.0*)?)?\s*\)$/i)
    let rgbChannels
    if (hexMatch) {
      const hexDigits = hexMatch[1].length === 3 ? [...hexMatch[1]].map((digit) => digit + digit).join('') : hexMatch[1]
      rgbChannels = [0, 2, 4].map((byteOffset) => parseInt(hexDigits.slice(byteOffset, byteOffset + 2), 16))
    } else rgbMatch && (rgbChannels = rgbMatch.slice(1, 4).map(Number))
    if (rgbChannels)
      themeName =
        rgbChannels.reduce(
          (accumulator, channelValue, channelIndex) =>
            accumulator + channelValue * [0.2126, 0.7152, 0.0722][channelIndex],
          0,
        ) >= 150
          ? 'light'
          : 'dark'
    else {
      const themeLabel = String(dashboardDocument?.theme?.name || '').toLowerCase()
      ;/(^|[-_])light($|[-_])/.test(themeLabel)
        ? (themeName = 'light')
        : /(^|[-_])dark($|[-_])/.test(themeLabel) && (themeName = 'dark')
    }
    themeName ? (documentElement.dataset.displayTheme = themeName) : delete documentElement.dataset.displayTheme
    try {
      themeName ? localStorage.setItem(themeStorageKey, themeName) : localStorage.removeItem(themeStorageKey)
    } catch {
      /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
    }
  }
  function showError(error: any, canEnter = false) {
    if (splashPhase === 'done' || splashPhase === 'error') return
    logBootPhase(canEnter ? 'slow-loading' : 'load-error'),
      clearAllTimers(),
      (splashPhase = canEnter ? 'slow' : 'error'),
      displaySplashLookup()?.classList.remove('is-complete', 'is-leaving'),
      displaySplashLookup()?.classList.add('is-error'),
      displaySplashMessageLookup() &&
        (displaySplashMessageLookup!()!.textContent = error?.message || '仪表盘加载失败，请检查网络后重试。')
    const displaySplashActionsNode = document.getElementById('display-splash-actions')
    displaySplashActionsNode && (displaySplashActionsNode.hidden = false)
    const displaySplashEnterButton = document.getElementById('display-splash-enter')
    displaySplashEnterButton && (displaySplashEnterButton.hidden = !canEnter)
  }
  function finishLoading(isFirstScreenReady = false) {
    if (splashPhase === 'done' || splashPhase === 'leaving') return
    logBootPhase(isFirstScreenReady ? 'first-screen-ready' : 'manual-entry'),
      clearAllTimers(),
      (splashPhase = 'leaving'),
      // 首屏已经揭幕，此刻才允许碰 GPU 驱动：诊断结果只进日志，不再影响相位机。
      scheduleWebglDiagnostics(),
      displaySplashLookup()?.classList.remove('is-error'),
      displaySplashLookup()?.classList.add('is-complete')
    const displaySplashActionsElement = document.getElementById('display-splash-actions')
    displaySplashActionsElement && (displaySplashActionsElement.hidden = true),
      displaySplashMessageLookup() &&
        (displaySplashMessageLookup!()!.textContent = isFirstScreenReady ? '即将进入你的家…' : '正在进入仪表盘…'),
      (leaveTimer = setTimeout(
        () => {
          displaySplashLookup()?.classList.add('is-leaving'),
            logBootPhase('reveal-start'),
            window.dispatchEvent?.(new Event('hb-display-reveal')),
            (leaveTimer = setTimeout(
              () => {
                const splashEl = displaySplashLookup()
                const hadFocusInside = !!splashEl?.contains(document.activeElement)
                // 只通知 Vue（DisplayView `splashPresent=false` / v-if）卸节点。
                // 禁止原生 `.remove()`：本仓库 Vue 无 flushSync，命令式摘节点会让父树
                // 重渲染时对已脱离 vnode 做 insertBefore → ErrorBoundary 卡死。
                window.dispatchEvent?.(new Event('hb-display-splash-detach'))
                documentElement.classList.remove('display-booting')
                splashPhase = 'done'
                logBootPhase('entered')
                if (isFirstScreenReady) {
                  try {
                    localStorage.setItem(warmStorageKey, '1')
                  } catch {
                    /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
                  }
                }
                imageByUrl.clear(),
                  hadFocusInside &&
                    shellElement?.focus({
                      preventScroll: true,
                    })
              },
              prefersReducedMotion() ? 100 : isWarmBoot ? 150 : 550,
            ))
        },
        prefersReducedMotion() || isWarmBoot ? 0 : 250,
      ))
  }
  function isVisible(probedElement: any) {
    if (!probedElement.isConnected || probedElement.closest('[hidden]')) return false
    const rect = probedElement.getBoundingClientRect()
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.bottom <= 0 ||
      rect.right <= 0 ||
      rect.top >= innerHeight ||
      rect.left >= innerWidth
    )
      return false
    for (
      let ancestorElement = probedElement;
      ancestorElement && ancestorElement !== shellElement;
      ancestorElement = ancestorElement.parentElement
    ) {
      const computedStyle = window.getComputedStyle(ancestorElement)
      if (
        computedStyle.visibility === 'hidden' ||
        computedStyle.display === 'none' ||
        Number(computedStyle.opacity) === 0
      )
        return false
    }
    return true
  }
  function hasPendingAssets() {
    const excludedSelector = '.hb-camera-component, .hb-vacuum-map'
    for (const imageElement of shellElement.querySelectorAll('img[src]'))
      if (!imageElement.closest(excludedSelector) && isVisible(imageElement) && !imageElement.complete) return true
    for (const hostElement of shellElement.querySelectorAll('.hb-interaction3d-host')) {
      if (
        !isVisible(hostElement) ||
        hostElement.dataset.access === 'locked' ||
        hostElement.querySelector('.is-load-error')
      )
        continue
      const runtimeElement = hostElement.querySelector('.hb-interaction3d-runtime')
      if (!runtimeElement || runtimeElement.classList.contains('is-loading')) return true
    }
    let hasPending = false
    for (const styledElement of shellElement.querySelectorAll('[style*="background"]'))
      if (!(styledElement.closest(excludedSelector) || !isVisible(styledElement)))
        for (const urlMatch of styledElement.style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          const imageUrl = urlMatch[1]
          if (!imageByUrl.has(imageUrl)) {
            const image = new Image()
            ;(image.src = imageUrl), imageByUrl.set(imageUrl, image)
          }
          imageByUrl.get(imageUrl).complete || (hasPending = true)
        }
    return hasPending
  }
  /**
   * 兜底提示用的 WebGL2 判据 —— **不再在 `handleReady()` 里同步调用**。
   *
   * 历史：本函数曾是 `handleReady()` 的第一行，属于首屏关键路径上的同步 GPU 驱动调用。
   * 2026-10-31 在 headless Edge 上测到它单独占用 2.3–2.7s（当时的报告记为 3.28s 长任务），
   * 因此被移除；后来为了「不空白」又在 `27b5ae46` 里加了回来。
   * 2026-11-01 复测（同机 Edge 156、无 throttling、连续 5 次 `getContext("webgl2")`
   * 并 `WEBGL_lose_context`）中位数 1.7ms，最大值 10.6ms —— 也就是说在这个环境里它
   * **不再是数量级瓶颈**，但它仍然是同步驱动调用，而且在真实平板上创建/销毁上下文
   * 的成本无法用无头浏览器外推。
   *
   * 现在的分工：
   * - 首屏不再探测，等待阶段直接用舞台 runtime 回传的 `.is-load-error` 给提示
   *   （见下方 poll 里对 `.hb-interaction3d-host` 的检查，无 WebGL 时约 1.2s 就能出提示）；
   * - 本函数只在**首屏揭幕之后**的 idle 时段跑一次，用于把「设备确实没有 WebGL2」
   *   这个原因写进日志/提示，不影响任何首帧指标。
   */
  function isWebglAvailable() {
    try {
      const probeCanvas = document.createElement('canvas')
      const webglContext = probeCanvas.getContext('webgl2')
      if (!webglContext) return false
      const loseContext = (webglContext as WebGLRenderingContext).getExtension?.('WEBGL_lose_context')
      loseContext?.loseContext?.()
      return true
    } catch {
      return false
    }
  }
  /**
   * 首屏之后的后台探测：只记一条诊断，不改 splash 相位。
   * 用 `requestIdleCallback` 让出主线程；没有该 API 的老内核退化为 2s 定时器。
   */
  function scheduleWebglDiagnostics() {
    const run = () => {
      const available = isWebglAvailable()
      logBootPhase(available ? 'webgl2-available' : 'webgl2-unavailable')
      if (!available) {
        // 舞台 runtime 可能已经自己报错；这里只在它没报时补一条，避免重复提示。
        window.HomeOSLog?.warn?.(new Error('当前设备未启用 WebGL2，3D 户型无法渲染。'), {
          phase: 'display-webgl-probe',
        })
      }
    }
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 })
    else setTimeout(run, 2000)
  }
  function handleReady(readyShellElement: any) {
    if (splashPhase !== SPLASH_PHASE_LOADING) return
    ;(shellElement = readyShellElement),
      (splashPhase = 'waiting'),
      logBootPhase('document-ready'),
      clearTimeout(loadingTimeoutTimer),
      (loadingTimeoutTimer = setTimeout(() => {
        splashPhase === 'waiting' &&
          (showError(new Error('首屏素材加载较慢，准备好后会自动进入，也可以重试或先进入仪表盘。'), true),
          (pollTimer = setTimeout(poll, 1000)))
      }, 60000))
    let stableSinceMs = 0
    const stableThresholdMs = isWarmBoot ? 32 : 120,
      pollIntervalMs = isWarmBoot ? 32 : 80,
      poll = () => {
        if (splashPhase !== 'waiting' && splashPhase !== 'slow') return
        // 3D 户型 host 就绪但仍带 `.is-load-error`：说明运行时已判定加载失败，
        // 在等待阶段就让 splash 给出「重新加载 / 先进入」，而不是干等到稳定超时。
        if (
          [...shellElement.querySelectorAll('.hb-interaction3d-host')].find(
            (hostElement: any) => isVisible(hostElement) && hostElement.querySelector('.is-load-error'),
          ) &&
          splashPhase === 'waiting'
        ) {
          showError(new Error('3D 户型加载失败，请重新加载或先进入仪表盘。'), true),
            (pollTimer = setTimeout(poll, 1000))
          return
        }
        const now = performance.now()
        hasPendingAssets() ? (stableSinceMs = 0) : stableSinceMs || (stableSinceMs = now),
          stableSinceMs &&
          now - stableSinceMs >= stableThresholdMs &&
          now - bootStartedAt >= (prefersReducedMotion() || isWarmBoot ? 0 : 1350)
            ? requestAnimationFrame(() => {
                ;(splashPhase !== 'waiting' && splashPhase !== 'slow') ||
                  (hasPendingAssets()
                    ? ((stableSinceMs = 0),
                      (pollTimer = setTimeout(poll, splashPhase === 'slow' ? 1000 : pollIntervalMs)))
                    : finishLoading(true))
              })
            : (pollTimer = setTimeout(poll, splashPhase === 'slow' ? 1000 : pollIntervalMs))
      }
    poll()
  }

  const handleOnline = () => {
    splashPhase === 'error' && location.reload()
  }
  const handleSplashClick = (clickEvent: Event) => {
    const clickTarget = clickEvent.target as Element | null
    clickTarget?.closest('#display-splash-retry') && location.reload(),
      clickTarget?.closest('#display-splash-enter') && finishLoading()
  }
  const handleFocusIn = (focusEvent: Event) => {
    const focusTarget = focusEvent.target as Node | null
    splashPhase !== 'done' &&
      focusTarget &&
      document.getElementById('display-shell')?.contains(focusTarget) &&
      displaySplashLookup()?.focus({
        preventScroll: true,
      })
  }

  ;(window.HomeOSDisplayBoot = {
    setDocument: applyDocumentTheme,
    ready: handleReady,
    fail: showError,
    // 收起启动 splash 并放行外壳。用于「总览尚未创建任何仪表盘」这类**空状态**：
    // 提示文案本身要求用户去「设置 → 布局」，而 splash 是 fixed + z-index 2.1e9 的整屏层，
    // 留着它会把 MainLayout 的顶栏/侧边栏/页脚一起盖住，用户点不到导航、彻底卡死。
    reveal: () => finishLoading(),
    get pending() {
      return splashPhase !== 'done'
    },
    get failed() {
      return splashPhase === 'error'
    },
  }),
    !isCapturePreview &&
      (window.addEventListener('online', handleOnline),
      documentElement.classList.add('display-booting'),
      document.addEventListener('click', handleSplashClick),
      (hintTimer = setTimeout(() => {
        ;(splashPhase === 'loading' || splashPhase === 'waiting') &&
          displaySplashMessageLookup() &&
          (displaySplashMessageLookup!()!.textContent = '正在准备你的家，请稍候…')
      }, 8000)),
      (loadingTimeoutTimer = setTimeout(
        // 超时不再把用户锁死在 splash：仍然允许「先进入仪表盘」，
        // 否则 3D 资源失败时连顶栏 / 侧边栏都点不到。
        () => showError(new Error('仪表盘加载超时，可重试或先进入仪表盘。'), true),
        45000,
      )),
      document.addEventListener('focusin', handleFocusIn))

  disposeActiveBoot = () => {
    clearAllTimers()
    if (!isCapturePreview) {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('click', handleSplashClick)
      document.removeEventListener('focusin', handleFocusIn)
    }
    imageByUrl.clear()
  }
}

/** 回收展示页启动层：注销监听/定时器、摘掉文档级类与主题、撤下全局契约。 */
export function teardownDisplayBoot(): void {
  const dispose = disposeActiveBoot
  disposeActiveBoot = null
  dispose?.()
  delete (window as any).HomeOSDisplayBoot
  const documentElement = document.documentElement
  // 这三个类与主题都作用在 <html>（外壳所在文档），视图卸载后必须摘掉，否则会影响其它路由。
  documentElement.classList.remove('display-warm-start', 'capture-preview', 'display-booting')
  delete documentElement.dataset.displayTheme
}

/**
 * 展示页启动期预取层：在 3D 引导模块求值前，把草稿与资源清单的请求先发出去。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootDisplayStartup()`、`onBeforeUnmount` 调
 * `teardownDisplayStartup()`：
 *  - 目标路径（`/homeos/:name` vs `/display/:projectId`）在 boot 时才读取 —— 视图现在是
 *    可重入路由，同一份模块可能先后服务不同项目，import 期定死的 `basePath` 会取到上一个；
 *  - 预取缓存（`requestsByKey`）与在途请求在 teardown 时清空/中断，避免把上一个项目的
 *    草稿响应交给下一个视图（`take()` 是「取走即删」，重入时重新预取即可）。
 *
 * 对外契约：`window.HomeOSDisplayStartup = { take(requestUrl) }`（`display.ts` 依赖）。
 */
let disposeActiveStartup: (() => void) | null = null

/** 起一次展示页预取（重复调用会先回收上一次）。非展示路径下是空操作。 */
export function bootDisplayStartup(): void {
  teardownDisplayStartup()

  const basePath = location.pathname
  if (!basePath.startsWith('/homeos/') && !basePath.startsWith('/display/')) return
  let projectName
  try {
    projectName = decodeURIComponent(basePath.slice(basePath.indexOf('/', 1) + 1)).trim()
  } catch {
    return
  }
  if (!projectName) return
  const requestsByKey = new Map<string, any>(),
    activeControllerSet = new Set<AbortController>()
  let isDisposed = false
  const loadEndpoint = (endpoint: any) => {
    if (isDisposed) return null
    if (requestsByKey.has(endpoint)) return requestsByKey.get(endpoint)
    const abortController = new AbortController(),
      abortTimer = setTimeout(() => abortController.abort(), 20000)
    activeControllerSet.add(abortController)
    // 草稿与素材清单是稳定文档：保留浏览器缓存并让 ETag/304 决定是否重下；
    // 其它启动请求仍带时间戳绕缓存，避免读到上个项目的状态。
    const conditionalRequest =
      /^\/projects\/[^/?#]+\/draft$/.test(endpoint) ||
      ['/assets/version', '/assets/builtin', '/assets/user'].includes(endpoint)
    const pendingResult = (async () => {
      try {
        const fetchResponse = await fetch(
            conditionalRequest ? `/api/v1${endpoint}` : `/api/v1${endpoint}?_=${Date.now()}`,
            {
              cache: conditionalRequest ? 'default' : 'no-store',
              headers: {
                'Cache-Control': 'no-cache',
              },
              signal: abortController.signal,
            },
          ),
          payload =
            fetchResponse.status === 204
              ? null
              : await fetchResponse.json().catch((parseError) => {
                  if (abortController.signal.aborted) throw parseError
                  return {}
                })
        return {
          response: fetchResponse,
          payload: payload,
        }
      } finally {
        clearTimeout(abortTimer), activeControllerSet.delete(abortController)
      }
    })()
    pendingResult.catch(() => {})
    const requestRecord = {
      controller: abortController,
      result: pendingResult,
    }
    return (requestsByKey.set(endpoint, requestRecord), requestRecord)
  }
  const handlePageHide = () => {
    isDisposed = true
    for (const controller of activeControllerSet) controller.abort()
    requestsByKey.clear()
  }
  ;(window.HomeOSDisplayStartup = {
    take(requestUrl: string) {
      const cacheKey = requestUrl.replace(/\?_=[0-9]+$/, ''),
        cachedRecord = requestsByKey.get(cacheKey)
      return (requestsByKey.delete(cacheKey), cachedRecord)
    },
  }),
    window.addEventListener('pagehide', handlePageHide, {
      once: true,
    }),
    basePath.startsWith('/homeos/')
      ? loadEndpoint('/projects')
          .result.then(({ response: response, payload: draftPayload }: any) => {
            if (!response.ok) return
            const matchedProjects = (draftPayload?.items || []).filter(
              (projectEntry: any) => projectEntry.name === projectName,
            )
            matchedProjects.length === 1 &&
              matchedProjects[0].id &&
              loadEndpoint(`/projects/${encodeURIComponent(matchedProjects[0].id)}/draft`)
          })
          .catch(() => {})
      : loadEndpoint(`/projects/${encodeURIComponent(projectName)}/draft`)
  for (const assetEndpoint of ['/assets/version', '/assets/builtin', '/assets/user']) loadEndpoint(assetEndpoint)

  disposeActiveStartup = () => {
    window.removeEventListener('pagehide', handlePageHide)
    isDisposed = true
    for (const controller of activeControllerSet) controller.abort()
    requestsByKey.clear()
  }
}

/** 回收预取层：中断在途请求、清空缓存、撤下全局契约。 */
export function teardownDisplayStartup(): void {
  const dispose = disposeActiveStartup
  disposeActiveStartup = null
  dispose?.()
  delete (window as any).HomeOSDisplayStartup
}

/**
 * 展示页引导脚本（`/`、`/display/:projectId`、`/homeos/:name`）。
 *
 * 由 `DisplayView.vue` 在 `onMounted` 调 `bootDisplay()`、`onBeforeUnmount` 调 `teardownDisplay()`。
 * 视图现在是 shell 内的路由，会被反复进出，
 * 因此 DOM 契约查询、宿主判定（整屏 vs 嵌入总览）、全局状态都在 boot 时重建，监听/定时器/观察者
 * 与 `PanelRenderer` 在 teardown 时回收。
 *
 * 引导体保持逐行结构（未重新缩进）；顶层状态改为 boot 局部，匿名处理器提为具名
 * （否则 `removeEventListener` 无法命中）。
 */

/**
 * iPhone 主屏 PWA 的画布高度校正（0.8.8 `display.js` 的 `Y()`）。
 *
 * 返回 `0` 表示「不需要校正」；返回正数表示应当使用的高度（= `screen.height`）。
 *
 * 只在**同时**满足这些条件时生效（任一不满足都返回 0，宁可不动）：
 * - iPhone（不含 iPad、HomeOS 原生壳 `HA-Bridge-Apple`）；
 * - `display-mode: standalone`（从主屏幕打开）；
 * - 视觉视口没有纵向偏移（地址栏展开/收起过程中 `offsetTop > 1` 时尺寸不可信）；
 * - 横竖屏方向与 `screen` 一致，且宽度也对得上（否则说明取到的不是全屏尺寸）；
 * - 当前焦点不是输入框（聚焦输入时 iOS 会顶起视口，此时对齐会锁死错误高度）；
 * - `screen.height - 视口高度` 恰好等于底部安全区，或 `documentElement.clientHeight`
 *   已经等于 `screen.height`（两种都说明「差的那一截」就是被裁掉的部分）。
 */
export function iphoneStandaloneDisplayHeight(
  viewportWidth: number,
  viewportHeight: number,
  visualViewport: { offsetTop?: number } | null,
): number {
  const userAgent = navigator.userAgent || ''
  if (!/iPhone/i.test(userAgent) || /\bHA-Bridge-Apple\//i.test(userAgent)) return 0
  const isStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  if (!isStandalone) return 0
  if (Math.abs(visualViewport?.offsetTop ?? 0) > 1) return 0
  let screenWidth = Number(window.screen?.width) || 0
  let screenHeight = Number(window.screen?.height) || 0
  if (viewportWidth > viewportHeight !== screenWidth > screenHeight) {
    ;[screenWidth, screenHeight] = [screenHeight, screenWidth]
  }
  const missingHeight = screenHeight - viewportHeight
  if (Math.round(screenWidth) !== viewportWidth || !Number.isFinite(missingHeight) || missingHeight < 0) return 0
  const activeElement = document.activeElement as (HTMLElement & { isContentEditable?: boolean }) | null
  if (
    activeElement?.isContentEditable ||
    activeElement?.matches?.('textarea, input:not([type=range]):not([type=checkbox]):not([type=radio])')
  )
    return 0
  const previousHeight =
    Number.parseFloat(document.documentElement.style.getPropertyValue('--display-iphone-pwa-height')) || 0
  // 已经不缺高度：保持上次结论（避免在「刚好相等」的两帧之间来回抖动）。
  if (missingHeight === 0) return previousHeight === screenHeight ? screenHeight : 0
  const bottomInset = Number.parseFloat(
    window.getComputedStyle(document.documentElement).getPropertyValue('--display-safe-area-bottom'),
  )
  const matchesBottomInset = bottomInset > 0 && Math.abs(missingHeight - bottomInset) <= 1
  const matchesClientHeight = document.documentElement.clientHeight === screenHeight
  return matchesBottomInset || matchesClientHeight ? screenHeight : 0
}

function syncAppleDisplaySurface(boardConfig: any, env = window) {
  const { document: documentNode, navigator: nav } = env,
    isIosDevice =
      /iPad|iPhone|iPod/i.test(nav.userAgent || '') ||
      (/Macintosh/i.test(nav.userAgent || '') && Number(nav.maxTouchPoints || 0) > 1),
    isStandalone = nav.standalone === true || env.matchMedia?.('(display-mode: standalone)').matches === true
  if (!isIosDevice || !isStandalone) return
  const canvasBackground = boardConfig?.canvas?.background,
    surfaceColor =
      canvasBackground?.type === 'color' &&
      typeof canvasBackground.color == 'string' &&
      env.CSS?.supports('color', canvasBackground.color)
        ? canvasBackground.color
        : '#070b0e'
  documentNode.documentElement.style.setProperty('--display-surface-background', surfaceColor),
    documentNode.querySelector('meta[name="theme-color"]')?.setAttribute('content', surfaceColor)
}

/**
 * iPad 主屏 PWA：状态栏改为 `default`，独立运行时给 html 加 `ipad-pwa-display`，
 * 让画布固定铺满并贴底（样式见 display.css）。HomeOS 原生壳与 iframe 内不处理。
 * 返回撤销函数：展示页是 shell 内的路由，离开时要还原 meta 与 class。
 */
function syncIpadPwaDisplay(env = window): (() => void) | null {
  const nav = env.navigator,
    agent = nav.userAgent || '',
    isIpad = /iPad/i.test(agent) || (/Macintosh/i.test(agent) && Number(nav.maxTouchPoints || 0) > 1)
  if (!isIpad || env.self !== env.top || /\bHomeOS-Apple\//i.test(agent)) return null
  const statusBarMeta = env.document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'),
    previousStatusBarStyle = statusBarMeta?.getAttribute('content') ?? null,
    isStandalone = nav.standalone === true || env.matchMedia?.('(display-mode: standalone)').matches === true
  statusBarMeta?.setAttribute('content', 'default')
  env.document.documentElement.classList.toggle('ipad-pwa-display', isStandalone)
  return () => {
    if (previousStatusBarStyle !== null) statusBarMeta?.setAttribute('content', previousStatusBarStyle)
    env.document.documentElement.classList.remove('ipad-pwa-display')
  }
}

let disposeActiveDisplay: (() => void) | null = null

/** 素材版本独立轮询的节流窗口（毫秒）。 */
const ASSETS_VERSION_POLL_INTERVAL_MS = 30000

/**
 * 本轮轮询拿到的素材版本结论。
 *
 * - `key`：拿到了 `builtin:user` 规范化键；
 * - `skipped`：还在节流窗口内，本轮不检查素材；
 * - `failed`：独立版本请求失败 —— 调用方必须**中止**本轮刷新（与原有语义一致）。
 */
type AssetsVersionOutcome = { kind: 'key'; key: string } | { kind: 'skipped' } | { kind: 'failed' }

/** 素材版本载荷（`/revision` 的 `assetVersions` 与 `/assets/version` 同形）。 */
type AssetsVersionSource = { builtin?: unknown; user?: unknown }

/** 把「内置 / 用户素材版本」拼成可比较的键。 */
function joinAssetsVersion(versionSource: AssetsVersionSource | null | undefined): string {
  return String(versionSource?.builtin || '') + ':' + String(versionSource?.user || '')
}

/**
 * 解析本轮要用的素材版本键（0.8.9 `display.js` 的 `display_assets=1` 消费方式）。
 *
 * 优先用 `/projects/{id}/revision?display_assets=1` 随 revision 一起下发的 `assetVersions`：
 * 中控不加载编辑器，却也必须在**同一次轮询**里知道素材有没有换过，否则每次都要多开
 * 一条 `/assets/version` 请求。老后端不返回 `assetVersions` 时回退到独立请求，行为不变。
 *
 * 抽成模块级函数：`bootDisplay` 的刷新闭包已贴复杂度上限，内联这段会直接顶超门禁。
 */
async function resolveAssetsVersionOutcome(
  revisionResponse: { assetVersions?: AssetsVersionSource | null } | null | undefined,
  lastCheckAt: number,
  request: (path: string) => Promise<AssetsVersionSource | null | undefined>,
): Promise<AssetsVersionOutcome> {
  if (revisionResponse?.assetVersions) {
    return { kind: 'key', key: joinAssetsVersion(revisionResponse.assetVersions) }
  }
  if (Date.now() - lastCheckAt < ASSETS_VERSION_POLL_INTERVAL_MS) return { kind: 'skipped' }
  const versionResponse = await request('/assets/version')
  return versionResponse ? { kind: 'key', key: joinAssetsVersion(versionResponse) } : { kind: 'failed' }
}

/** 引导展示页（重复调用会先回收上一次）。 */
export function bootDisplay(): void {
  teardownDisplay()

  const displayRootElement = document.querySelector<DomControl>('#display-root'),
    displayShellElement = document.querySelector<DomControl>('#display-shell'),
    /**
     * 本引导脚本的副作用（全局监听、定时器、bootstrap 请求）全部假定 `#display-shell` /
     * `#display-root` 契约存在。它由 `DisplayView.vue` 在 `onMounted` 里动态 `import()`，而这条
     * import 链是异步的（display-boot → display-startup → hls → display）。若在引导前视图已经卸载
     * —— 守卫重定向（未登录/未激活去 /login）、用户提前点走、dev 期热重载 —— 文档里已经没有任何
     * 展示页节点，两个 querySelector 都是 null，此时再初始化只会刷出两类「Uncaught TypeError」
     * 且对页面毫无收益：
     *   · `window.resize` → syncViewportSize 写 `null.style`（boot-guard 的首帧轻推就会触发）；
     *   · bootstrap 失败 → 兜底渲染在 `null` 上调用 `replaceChildren`。
     * 因此契约缺失时整体跳过初始化，等下一次真实挂载（同一模块会被重新 boot）再起。
     */
    hasDisplayDomContract = !!displayRootElement && !!displayShellElement,
    isCapturePreview = new URLSearchParams(window.location.search).get('capturePreview') === '1'
  document.documentElement.classList.toggle('capture-preview', isCapturePreview)
  // 展示端有两种宿主：独立整屏大屏（`/display/:projectId`、`/homeos/:name`）与
  // **总览首页 `/`**（嵌进 MainLayout 的内容区）。前者按视口定尺，后者必须按父容器定尺
  // —— 否则 100vw×100vh 会把顶栏、右侧栏与页脚一起盖住。
  const isEmbeddedOverview = !(
    window.location.pathname.startsWith('/display/') || window.location.pathname.startsWith('/homeos/')
  )
  document.documentElement.classList.toggle('display-embedded', isEmbeddedOverview)
  const restoreIpadPwaDisplay = isEmbeddedOverview ? null : syncIpadPwaDisplay()

  /**
   * 展示端强制 3D 面板背景透明。
   *
   * 模板默认值（bridge/definition.ts）与历史项目文档都可能带 `backgroundVisible: true`，
   * 那会在场景里铺一块不透明地面 + 网格，挡住下方的开关灯背景图。WebGL 通路本身已是
   * alpha 合成（alpha:true + clearAlpha 0），因此只要把 backgroundVisible 归一成 false，
   * 房子周围就会透出背景图。这里在渲染前统一改写；编辑端走的是另一条通路，不受影响。
   */
  function normalizeDisplayDocument(documentPayload: any): any {
    if (!documentPayload || typeof documentPayload !== 'object') return documentPayload
    const collections: any[][] = [
      Array.isArray(documentPayload.sharedComponents) ? documentPayload.sharedComponents : [],
    ]
    for (const page of Array.isArray(documentPayload.pages) ? documentPayload.pages : []) {
      collections.push(Array.isArray(page?.components) ? page.components : [])
    }
    for (const components of collections) {
      for (const component of components) {
        if (component?.type !== 'interaction3d') continue
        const properties = component.properties || (component.properties = {})
        if (properties.backgroundVisible !== false) properties.backgroundVisible = false
      }
    }
    return documentPayload
  }
  let project: any = null,
    lastRevision: any = null,
    lastGlobalPopupRevision: any = null,
    panelRenderer: any = null
  let embeddedResizeObserver: ResizeObserver | null = null,
    refreshPromise: any = null,
    loadedAssetsVersion: any = null,
    entityRecords: any = [],
    deviceRecords: any = [],
    translationResources: Record<string, any> = {},
    syncPromise: any = null,
    lastSyncFingerprint: any = null,
    hasTranslations = false,
    lastCatalogFingerprint: any = null,
    lastAssetsCheckAt = 0,
    assetsVersion: any = null
  const isEmbeddedFrame = window.self !== window.top
  let visibleBounds: any = null
  function isAppleMobile() {
    const userAgent = navigator.userAgent || ''
    return (
      /iPad|iPhone|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && Number(navigator.maxTouchPoints || 0) > 1)
    )
  }
  /** 视口尺寸（苹果整屏设备优先用 `screen`，其余走 `visualViewport` → `innerWidth` 兜底）。 */
  function viewportSizePx(useScreenSize: boolean) {
    const widthPx = Math.round(
        Number(useScreenSize ? window.screen?.width : window.visualViewport?.width) ||
          Number(window.innerWidth) ||
          Number(document.documentElement.clientWidth),
      ),
      heightPx = Math.round(
        Number(useScreenSize ? window.screen?.height : window.visualViewport?.height) ||
          Number(window.innerHeight) ||
          Number(document.documentElement.clientHeight),
      )
    return { widthPx, heightPx }
  }
  /**
   * iPhone 主屏（standalone）的高度校正（0.8.8）。
   *
   * `100vh` 比真实屏幕矮一截（底部工具栏/圆角区域被算进视觉视口），画布底部与导航会被裁掉。
   * 命中时返回 `screen.height` 并写进 CSS 变量，让 `html, body` 的高度一起跟上。
   */
  function applyIphonePwaHeight(widthPx: number, heightPx: number) {
    const iphonePwaHeight = iphoneStandaloneDisplayHeight(widthPx, heightPx, window.visualViewport)
    if (!iphonePwaHeight) {
      document.documentElement.style.removeProperty('--display-iphone-pwa-height')
      return heightPx
    }
    document.documentElement.style.setProperty('--display-iphone-pwa-height', `${iphonePwaHeight}px`)
    return iphonePwaHeight
  }
  /** 计算画布尺寸（含横竖屏纠正、嵌入父容器覆盖、iPhone 主屏高度校正）。 */
  function measureDisplaySize(displayShell: HTMLElement) {
    const shouldUseScreenSize = !isEmbeddedFrame && isAppleMobile(),
      // 嵌入总览时改用父容器（MainLayout 内容区）的布局尺寸：clientWidth/Height 不受
      // ScaledViewport 的 transform: scale 影响，得到的正是 #display-shell 需要的未缩放尺寸。
      embeddedParentElement = isEmbeddedOverview ? displayShell.parentElement : null
    const viewport = viewportSizePx(shouldUseScreenSize)
    let widthPx = viewport.widthPx
    let heightPx = viewport.heightPx
    if (shouldUseScreenSize && window.innerWidth >= window.innerHeight !== widthPx >= heightPx)
      [widthPx, heightPx] = [heightPx, widthPx]
    // 嵌入总览：以父容器尺寸覆盖视口尺寸（父容器尚未布局出尺寸时保留视口值兜底）。
    if (embeddedParentElement && embeddedParentElement.clientWidth > 0 && embeddedParentElement.clientHeight > 0) {
      widthPx = Math.round(embeddedParentElement.clientWidth)
      heightPx = Math.round(embeddedParentElement.clientHeight)
    }
    if (!widthPx || !heightPx) return null
    return { widthPx, heightPx: applyIphonePwaHeight(widthPx, heightPx), shouldUseScreenSize }
  }
  function applyDisplaySize(displayShell: HTMLElement, widthPx: number, heightPx: number, useScreenSize: boolean) {
    let width = widthPx
    let height = heightPx
    if (isEmbeddedFrame && visibleBounds) {
      width = Math.min(width, visibleBounds.width)
      height = Math.min(height, visibleBounds.height)
      displayShell.style.left = visibleBounds.left + 'px'
      displayShell.style.top = visibleBounds.top + 'px'
    }
    displayShell.style.width = width + 'px'
    displayShell.style.height = height + 'px'
    panelRenderer?.resize()
    if (!useScreenSize) return
    document.documentElement.style.width = width + 'px'
    document.documentElement.style.height = height + 'px'
    document.body.style.width = width + 'px'
    document.body.style.height = height + 'px'
  }
  function syncViewportSize() {
    // 见文件头契约说明：视图已卸载时本函数只剩「让 resize 抛 null.style」这一副作用。
    const displayShell = displayShellElement
    if (!displayShell) return
    const measured = measureDisplaySize(displayShell)
    if (measured) applyDisplaySize(displayShell, measured.widthPx, measured.heightPx, measured.shouldUseScreenSize)
  }
  /** 带业务错误码的请求错误（后端 detail.code 原样带出）。 */
  type DisplayRequestError = Error & { code?: string }

  /**
   * 嵌入总览时用 ResizeObserver 跟随父容器（MainLayout 内容区）尺寸。
   *
   * `window.resize` 只在窗口尺寸变化时触发；而右栏折叠、页脚内容增减、顶栏换行
   * 都会改变内容区尺寸，因此必须额外观察父容器，否则 `#display-shell` 会保持旧尺寸。
   */
  function observeEmbeddedParent() {
    if (!isEmbeddedOverview || typeof ResizeObserver !== 'function') return
    const embeddedParentElement = displayShellElement?.parentElement
    if (!embeddedParentElement) return
    embeddedResizeObserver?.disconnect()
    embeddedResizeObserver = new ResizeObserver(() => syncViewportSize())
    embeddedResizeObserver.observe(embeddedParentElement)
  }

  /** 可安全交给浏览器缓存/ETag 重校验的展示页数据（其余请求仍绕缓存取实时状态）。 */
  function isConditionalDisplayEndpoint(path: string) {
    return (
      /^\/projects\/[^/?#]+\/draft$/.test(path) ||
      path === '/assets/version' ||
      path === '/assets/builtin' ||
      path === '/assets/user'
    )
  }

  async function apiRequest(path: any) {
    const separator = path.includes('?') ? '&' : '?',
      conditionalRequest = isConditionalDisplayEndpoint(path),
      startupEntry = window.HomeOSDisplayStartup?.take!(path)!,
      abortController = startupEntry?.controller || new AbortController(),
      abortTimeoutId = startupEntry ? null : window.setTimeout(() => abortController.abort(), 20000)
    try {
      const response = startupEntry
          ? (await startupEntry.result).response
          : await fetch(conditionalRequest ? '/api/v1' + path : '/api/v1' + path + separator + '_=' + Date.now(), {
              cache: conditionalRequest ? 'default' : 'no-store',
              headers: {
                'Cache-Control': 'no-cache',
              },
              signal: abortController.signal,
            }),
        payload = startupEntry
          ? (await startupEntry.result).payload
          : response.status === 204
            ? null
            : await response.json().catch((parseError) => {
                if (abortController.signal.aborted) throw parseError
                return {}
              })
      // 展示页与总览共用同一登录会话：未登录回登录页（shell 内路由）。
      if (response.status === 401) return (navigateInShell('/login'), null)
      if (response.status === 403 && payload?.detail?.code === 'LICENSE_RESTRICTED') {
        navigateInShell('/activate')
        const licenseRestrictedError: DisplayRequestError = new Error(
          payload.detail.message || '授权后台正在验证，请稍后重试。',
        )
        throw ((licenseRestrictedError.code = 'LICENSE_RESTRICTED'), licenseRestrictedError)
      }
      if (!response.ok) {
        const errorDetail = payload?.detail,
          requestError: DisplayRequestError = new Error(
            typeof errorDetail == 'string' ? errorDetail : errorDetail?.message || '请求失败。',
          )
        throw (
          (requestError.code = errorDetail?.code || ''),
          window.HomeOSLog?.linkError!(requestError, response)! || requestError
        )
      }
      return payload
    } catch (caughtError: any) {
      throw abortController.signal.aborted ? new Error('仪表盘更新请求超时，请检查网络连接。') : caughtError
    } finally {
      window.clearTimeout(abortTimeoutId!)
    }
  }
  async function refreshCatalog() {
    return (
      syncPromise ||
      ((syncPromise = (async () => {
        const syncStatus = await apiRequest('/ha/sync/status')
        if (!syncStatus) return
        const fingerprint = syncStatus.configured
            ? JSON.stringify([
                Number.isFinite(Number(syncStatus.catalogRevision))
                  ? Number(syncStatus.catalogRevision)
                  : syncStatus.lastFullSyncAt || '',
                Number(syncStatus.counts?.entities || 0),
                Number(syncStatus.counts?.devices || 0),
                Number(syncStatus.counts?.areas || 0),
              ])
            : 'not-configured',
          hasCatalogChange = fingerprint !== lastSyncFingerprint,
          shouldRefreshTranslations = !!(
            syncStatus.configured &&
            syncStatus.connected &&
            (!hasTranslations || hasCatalogChange)
          )
        if (!(!hasCatalogChange && !shouldRefreshTranslations)) {
          if (!syncStatus.configured) {
            ;(entityRecords = []),
              (deviceRecords = []),
              (translationResources = {}),
              (lastSyncFingerprint = fingerprint),
              (hasTranslations = true),
              pushCatalogToRenderer()
            return
          }
          if (hasCatalogChange) {
            const entityAccumulator: any[] = []
            let offset = 0,
              total = 0
            do {
              const entityPage = await apiRequest('/ha/entities?limit=500&offset=' + offset)
              if (!entityPage) return
              entityAccumulator.push(...(entityPage.items || [])),
                (total = Number(entityPage.total || 0)),
                (offset += Number(entityPage.limit || 500))
            } while (entityAccumulator.length < total)
            entityRecords = entityAccumulator
            const deviceResponse = await apiRequest('/ha/devices').catch(() => null)
            deviceResponse && (deviceRecords = deviceResponse.items || []), (lastSyncFingerprint = fingerprint)
          }
          if (shouldRefreshTranslations) {
            const translationResponse = await apiRequest('/ha/translations').catch(() => null)
            translationResponse
              ? ((translationResources = translationResponse.resources || {}), (hasTranslations = true))
              : (hasTranslations = false)
          }
          pushCatalogToRenderer()
        }
      })().finally(() => {
        syncPromise = null
      })),
      syncPromise)
    )
  }
  function buildCatalogFingerprint() {
    const entityRows = entityRecords.map((entity: any) => [
        entity.entityId || '',
        entity.domain || '',
        entity.name || '',
        entity.icon || '',
        entity.deviceId || '',
        entity.platform || '',
        entity.translationKey || '',
        entity.uniqueId || '',
        entity.originalName || '',
        entity.status || '',
        entity.disabledBy || '',
        // 显示精度会影响实体名后缀与面板数值（0.7.9 F2），改了要重推目录。
        entity.displayPrecision ?? '',
        entity.suggestedDisplayPrecision ?? '',
      ]),
      deviceRows = deviceRecords.map((device: any) => [
        device.deviceId || '',
        device.name || '',
        device.manufacturer || '',
        device.model || '',
        device.status || '',
      ]),
      translationEntries = Object.entries(translationResources).sort(([firstLocale], [secondLocale]) =>
        firstLocale.localeCompare(secondLocale),
      )
    return JSON.stringify([entityRows, deviceRows, translationEntries])
  }
  function pushCatalogToRenderer() {
    if (!panelRenderer) return
    const catalogFingerprint = buildCatalogFingerprint()
    catalogFingerprint !== lastCatalogFingerprint &&
      ((lastCatalogFingerprint = catalogFingerprint),
      panelRenderer.setEntityCatalog(entityRecords, translationResources, deviceRecords))
  }
  async function resolveOverviewProject() {
    // 总览首页（`/`）：展示「当前活动仪表盘」。
    //
    // 由后端 `GET /projects/active` 单源解析（偏好键 → 最近更新的项目），前端不再把
    // `/projects` 的 id 与 `/config/project/active` 的 `activeProfileId` 对一遍 ——
    // 那是布局方案的 id 空间（如 `default`），与仪表盘 UUID 不是一回事，比对必然落空。
    const activeResponse = await apiRequest('/projects/active')
    return activeResponse?.active || null
  }
  async function resolveProject() {
    const pathname = window.location.pathname
    if (pathname.startsWith('/display/'))
      return {
        id: decodeURIComponent(pathname.slice(9)),
        name: '',
      }
    if (pathname.startsWith('/homeos/')) {
      const projectName = decodeURIComponent(pathname.slice('/homeos/'.length)).trim()
      if (!projectName) throw new Error('仪表盘名称不能为空。')
      const projectsResponse = await apiRequest('/projects')
      if (!projectsResponse) return null
      const projectMatches = (projectsResponse.items || []).filter(
        (projectCandidate: any) => projectCandidate.name === projectName,
      )
      if (!projectMatches.length) throw new Error('找不到仪表盘“' + projectName + '”。')
      if (projectMatches.length > 1) throw new Error('仪表盘名称“' + projectName + '”重复，请先在编辑器中改名。')
      return projectMatches[0]
    }
    // 总览首页：无路径参数，按当前活动仪表盘展示。
    const overviewProject = await resolveOverviewProject()
    if (!overviewProject) {
      // 用独立错误码与「加载失败」区分：全新安装本就没有仪表盘，这是**正常空状态**，
      // 不该走整屏失败 splash（见 handleDisplayError 里的 NO_DASHBOARD 分支）。
      const noDashboardError: DisplayRequestError = new Error(
        '还没有可展示的仪表盘。请以管理员身份进入「设置 → 布局」打开仪表盘编辑器创建。',
      )
      throw ((noDashboardError.code = 'NO_DASHBOARD'), noDashboardError)
    }
    return overviewProject
  }
  async function refreshDisplay() {
    if (project)
      return (
        refreshPromise ||
        ((refreshPromise = (async () => {
          refreshCatalog().catch(() => null)
          const assetsPromise = panelRenderer
            ? null
            : Promise.all([apiRequest('/assets/version'), apiRequest('/assets/builtin'), apiRequest('/assets/user')])
                .then(([versionResponse, builtinResponse, userResponse]) => ({
                  versions: versionResponse,
                  builtin: builtinResponse,
                  user: userResponse,
                }))
                .catch((assetsError) => ({
                  error: assetsError,
                }))
          let revisionResponse: any = null,
            hasAssetsChange = loadedAssetsVersion !== assetsVersion
          if (panelRenderer) {
            // `display_assets=1`：中控不加载编辑器，但仍要在**同一次轮询**里知道
            // 「内置/用户素材有没有换过」（0.8.9 display.js 的消费方式）。缺这个参数
            // 时每次都要多开一条 `/assets/version` 请求。
            if (
              ((revisionResponse = await apiRequest(
                '/projects/' + encodeURIComponent(project.id) + '/revision?display_assets=1',
              )),
              !revisionResponse)
            )
              return
            const assetsOutcome = await resolveAssetsVersionOutcome(revisionResponse, lastAssetsCheckAt, apiRequest)
            if (assetsOutcome.kind === 'failed') return
            if (assetsOutcome.kind === 'key') {
              ;(hasAssetsChange = loadedAssetsVersion !== assetsOutcome.key),
                (assetsVersion = assetsOutcome.key),
                (lastAssetsCheckAt = Date.now())
            }
            if (
              !hasAssetsChange &&
              revisionResponse.revision === lastRevision &&
              revisionResponse.globalPopupRevision === lastGlobalPopupRevision
            )
              return
          }
          const draftResponse = await apiRequest('/projects/' + encodeURIComponent(project.id) + '/draft')
          if (!draftResponse) return
          const displayDocument = normalizeDisplayDocument(draftResponse.document)
          window.HomeOSDisplayBoot?.setDocument!(displayDocument), syncAppleDisplaySurface(displayDocument)
          let targetAssetsVersion = assetsVersion,
            builtinAssets: any = null,
            userAssets: any = null
          if (!panelRenderer && assetsPromise) {
            const assetsBundle: any = await assetsPromise
            if (assetsBundle.error) throw assetsBundle.error
            const versionsPayload = assetsBundle.versions
            ;(targetAssetsVersion = (versionsPayload?.builtin || '') + ':' + (versionsPayload?.user || '')),
              (assetsVersion = targetAssetsVersion),
              (lastAssetsCheckAt = Date.now()),
              (builtinAssets = assetsBundle.builtin),
              (userAssets = assetsBundle.user)
          } else {
            if (hasAssetsChange || loadedAssetsVersion !== targetAssetsVersion) {
              const fetchedAssetsVersion = assetsVersion ? null : await apiRequest('/assets/version')
              if (
                ((targetAssetsVersion = fetchedAssetsVersion
                  ? (fetchedAssetsVersion.builtin || '') + ':' + (fetchedAssetsVersion.user || '')
                  : targetAssetsVersion),
                (assetsVersion = targetAssetsVersion),
                (lastAssetsCheckAt = Date.now()),
                ([builtinAssets, userAssets] = await Promise.all([
                  apiRequest('/assets/builtin'),
                  apiRequest('/assets/user'),
                ])),
                !builtinAssets || !userAssets)
              )
                return
            }
          }
          const title = project.name || draftResponse.document?.name || '全屋智能家居'
          if (
            ((document.title = title + ' · 全屋智能家居'),
            panelRenderer ||
              ((panelRenderer = new PanelRenderer(displayRootElement!, {
                scaleMode: 'contain',
              })),
              pushCatalogToRenderer()),
            builtinAssets &&
              userAssets &&
              (panelRenderer.refreshBuiltinAssets([...(builtinAssets.items || []), ...(userAssets.items || [])]),
              (loadedAssetsVersion = targetAssetsVersion)),
            lastRevision === draftResponse.revision && lastGlobalPopupRevision === draftResponse.globalPopupRevision)
          )
            return
          const currentPagePath = panelRenderer.page?.path || null
          // 只下载这份草稿真正用到的组件族：全量的 8 个族里有 7 个在多数项目上都是白下载。
          await ensureRegistryComponents(componentFamiliesForDocument(displayDocument))
          panelRenderer.setDocument(displayDocument, currentPagePath),
            window.HomeOSDisplayBoot?.ready!(displayRootElement!)!,
            (lastRevision = draftResponse.revision),
            (lastGlobalPopupRevision = draftResponse.globalPopupRevision)
        })().finally(() => {
          refreshPromise = null
        })),
        refreshPromise)
      )
  }
  async function bootstrap() {
    syncViewportSize(),
      observeEmbeddedParent(),
      (project = await resolveProject()),
      window.HomeOSLog?.setContext!({
        projectId: project?.id || '',
      })!,
      project && (await refreshDisplay())
  }
  function refreshIfVisible() {
    document.visibilityState === 'visible' &&
      (window.HomeOSDisplayBoot?.failed || refreshDisplay().catch(handleDisplayError))
  }
  function handleLifecycleResume() {
    if (document.visibilityState === 'hidden') {
      panelRenderer?.suspendCameraMedia?.()
      return
    }
    panelRenderer?.resumeCameraMedia?.()
    document.visibilityState === 'visible' && ((lastAssetsCheckAt = 0), refreshIfVisible())
  }
  function handleDisplayError(displayError: any) {
    window.HomeOSLog?.error!(displayError, {
      phase: 'display-refresh',
    })!
    // 「总览尚无任何仪表盘」是全新安装的正常空状态，不是故障：
    // 走整屏失败 splash 会连 MainLayout 的顶栏/侧边栏/页脚一起盖住，而此时提示文案
    // 恰恰要求用户去「设置 → 布局」—— 导航被挡住就成了死循环。这里改为收起 splash、
    // 放行外壳，把引导文案落到内容区，用户即可正常使用导航去创建仪表盘。
    if (displayError?.code === 'NO_DASHBOARD') {
      panelRenderer?.destroy(), (panelRenderer = null), (lastRevision = null)
      window.HomeOSDisplayBoot?.reveal!()!
      const noDashboardElement = document.createElement('p')
      ;(noDashboardElement.className = 'display-error'),
        (noDashboardElement.textContent = displayError.message),
        displayRootElement?.replaceChildren(noDashboardElement)
      return
    }
    if ((window.HomeOSDisplayBoot?.fail!(displayError), displayError?.code !== 'UI_PACK_RESTRICTED')) return
    panelRenderer?.destroy(), (panelRenderer = null), (lastRevision = null)
    const displayErrorElement = document.createElement('p')
    ;(displayErrorElement.className = 'display-error'),
      (displayErrorElement.textContent = displayError.message),
      displayRootElement?.replaceChildren(displayErrorElement)
  }
  const handleOrientationChange = () => window.setTimeout(syncViewportSize, 100)
  let viewportObserver: IntersectionObserver | null = null
  const handleViewportPageHide = () => viewportObserver?.disconnect()
  const handleViewportPageShow = () => viewportObserver?.observe(document.documentElement)
  if (!hasDisplayDomContract) {
    // 见文件头契约说明：视图已卸载时整块跳过 —— 不注册全局监听、不起定时器、不发 bootstrap
    // 请求，也就不会在 resize / 失败兜底里对 null 写入。
    window.HomeOSLog?.warn?.(
      '[display] 页面缺少 #display-shell/#display-root，跳过展示页初始化（视图可能已被卸载或重定向）。',
      { phase: 'display-boot' },
    )
  } else if (
    (window.addEventListener('pageshow', handleLifecycleResume),
    document.addEventListener('visibilitychange', handleLifecycleResume),
    window.addEventListener('online', handleLifecycleResume),
    window.addEventListener('resize', syncViewportSize),
    window.visualViewport?.addEventListener('resize', syncViewportSize),
    window.addEventListener('orientationchange', handleOrientationChange),
    isEmbeddedFrame && typeof IntersectionObserver == 'function')
  ) {
    viewportObserver = new IntersectionObserver(
      (observerEntries) => {
        const lastEntry = observerEntries[observerEntries.length - 1]
        if (!lastEntry?.isIntersecting || lastEntry.intersectionRect.width < 1 || lastEntry.intersectionRect.height < 1)
          return
        const intersectionRect = lastEntry.intersectionRect
        ;(visibleBounds = {
          width: intersectionRect.width,
          height: intersectionRect.height,
          left: intersectionRect.left,
          top: intersectionRect.top,
        }),
          syncViewportSize()
      },
      {
        threshold: Array.from(
          {
            length: 101,
          },
          (_thresholdItem, thresholdIndex) => thresholdIndex / 100,
        ),
      },
    )
    viewportObserver.observe(document.documentElement),
      window.addEventListener('pagehide', handleViewportPageHide, {
        once: true,
      }),
      window.addEventListener('pageshow', handleViewportPageShow)
  }
  /**
   * 展示页对「实体目录已变更」的反应。
   *
   * 目录变更（HA 侧新增 / 删除实体、注册表刷新）与状态增量是两条数据流：状态推送
   * 里不会告诉你「多了一台设备」。收到事件立刻校准一次目录，而不是等 10s 轮询；
   * `refreshCatalog` 内部按 catalogRevision 指纹去重，重复事件几乎没有成本。
   */
  const handleEntityCatalogChanged = () => {
    refreshCatalog().catch(() => null)
  }

  /**
   * 展示页对「仪表盘草稿已保存」的反应。
   *
   * 后端在保存草稿后经 `/ws/runtime` 广播 `project_revision_changed`，这里据此立即重拉，
   * 而不是等轮询 —— 在编辑器里改完面板，墙板应当马上变。带 `projectId` 的事件只在
   * 本页正展示那个项目时才动作；不带 `projectId`（老版本）则保守地刷新本页。
   */
  const handleProjectRevisionChanged = (revisionEvent: Event) => {
    const detail = (revisionEvent as CustomEvent).detail || {}
    const changedProjectId = String(detail.projectId || '')
    if (changedProjectId && project?.id && changedProjectId !== String(project.id)) return
    refreshDisplay().catch(() => null)
  }

  let refreshIntervalId: any = null
  if (hasDisplayDomContract) {
    window.addEventListener('hb-entity-catalog-changed', handleEntityCatalogChanged)
    window.addEventListener('hb-project-revision-changed', handleProjectRevisionChanged)
    // 轮询降级为兜底：正常路径由上面的 WS 事件驱动。60 秒只用于「事件丢失 / 连接刚恢复」
    // 这类边缘情况，避免 24 小时开机的墙板每 10 秒白跑两次 HTTP 请求。
    ;(refreshIntervalId = window.setInterval(refreshIfVisible, 60000)),
      bootstrap().catch((bootstrapError) => {
        handleDisplayError(bootstrapError)
        // NO_DASHBOARD 与 UI_PACK_RESTRICTED 的文案已由 handleDisplayError 落到内容区，
        // 这里再写一次只会重复渲染同一段文字。
        if (bootstrapError?.code === 'UI_PACK_RESTRICTED' || bootstrapError?.code === 'NO_DASHBOARD') return
        const bootstrapErrorElement = document.createElement('p')
        ;(bootstrapErrorElement.className = 'display-error'),
          (bootstrapErrorElement.textContent = bootstrapError.message),
          displayRootElement?.replaceChildren(bootstrapErrorElement)
      })
  }

  disposeActiveDisplay = () => {
    // 定时器与观察者
    window.clearInterval(refreshIntervalId)
    embeddedResizeObserver?.disconnect()
    embeddedResizeObserver = null
    viewportObserver?.disconnect()
    viewportObserver = null
    // 全局监听（必须与注册时同一函数引用才能命中）
    window.removeEventListener('hb-entity-catalog-changed', handleEntityCatalogChanged)
    window.removeEventListener('hb-project-revision-changed', handleProjectRevisionChanged)
    window.removeEventListener('pageshow', handleLifecycleResume)
    document.removeEventListener('visibilitychange', handleLifecycleResume)
    window.removeEventListener('online', handleLifecycleResume)
    window.removeEventListener('resize', syncViewportSize)
    window.visualViewport?.removeEventListener('resize', syncViewportSize)
    window.removeEventListener('orientationchange', handleOrientationChange)
    window.removeEventListener('pagehide', handleViewportPageHide)
    window.removeEventListener('pageshow', handleViewportPageShow)
    // 渲染器：释放 3D 运行时、WebSocket 与画布
    panelRenderer?.destroy(), (panelRenderer = null)
    restoreIpadPwaDisplay?.()
    // 文档级残留：嵌入宿主判定类、苹果端定尺写下的内联尺寸、苹果端表面色变量
    document.documentElement.classList.remove('display-embedded', 'capture-preview')
    document.documentElement.style.removeProperty('width')
    document.documentElement.style.removeProperty('height')
    document.documentElement.style.removeProperty('--display-surface-background')
    document.body.style.removeProperty('width')
    document.body.style.removeProperty('height')
    // 模块级状态复位，避免下一次 boot 复用陈旧引用
    ;(project = null),
      (lastRevision = null),
      (lastGlobalPopupRevision = null),
      (refreshPromise = null),
      (loadedAssetsVersion = null),
      (entityRecords = []),
      (deviceRecords = []),
      (translationResources = {}),
      (syncPromise = null),
      (lastSyncFingerprint = null),
      (hasTranslations = false),
      (lastCatalogFingerprint = null),
      (lastAssetsCheckAt = 0),
      (assetsVersion = null),
      (visibleBounds = null)
  }
}

/** 回收展示页：注销监听/定时器/观察者、销毁渲染器、清掉文档级残留状态。 */
export function teardownDisplay(): void {
  const dispose = disposeActiveDisplay
  disposeActiveDisplay = null
  dispose?.()
}
