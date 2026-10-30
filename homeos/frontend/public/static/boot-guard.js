/*
 * HomeOS 启动覆盖层控制（经典脚本，非 module）。
 *
 * 背景：SPA 外壳的 `<div id="app">` 是空的，整站渲染依赖入口 chunk + 路由。有两类失败会
 * 让用户看到**纯空白 + Console 零报错**，以前完全没有出口：
 *
 *   1. 入口资源加载失败：构建重建导致哈希被替换、浏览器/SW 缓存了旧外壳、
 *      或 `vite build` 清空 outDir 的窗口期 —— 没有任何 JS 可执行，自然也没有报错。
 *   2. 路由长时间不渲染：`router.beforeEach` 在后端不可达时会走
 *      `withBackendBootRetry`（40 次 × 3s ≈ 2 分钟），期间导航一直 pending、
 *      RouterView 渲染为空 —— 有 JS 在跑，但控制台同样一片干净。
 *
 * 覆盖层因此**放在 `#app` 之外**（放在内部会被 Vue 挂载时清空，恰好丢掉最需要提示的场景），
 * 并且从 HTML 静态可见、无需 JS 即可呈现，JS 只负责「就绪后隐藏」与「超时/失败后升级提示」。
 *
 * 就绪信号：应用在首个路由成功解析后置 `<html data-homeos-ready="1">`（见 src/main.ts）。
 */
(function () {
  'use strict'

  /**
   * 启动期错误记录器（供真机排障读取）。
   *
   * 动机：「3D 区域一片空白」至少有三种成因 —— 入口 chunk 加载失败、模块求值期抛错、
   * 渲染器创建失败。三者在画面上完全一致，而 release 包既不能 `chrome://inspect`，
   * 真机现场也常常拿不到 logcat。
   *
   * 这里按发生顺序把最早的错误留在 `window.__hosBootErrors` 上（原生侧读一次即可定性）。
   * 资源加载失败用捕获阶段监听：script/link 的 error 不冒泡，只有捕获能拿到，
   * 那条恰好是「模块没下载下来」的唯一线索。
   */
  var BOOT_ERRORS_KEY = '__hosBootErrors'
  var BOOT_ERROR_LIMIT = 12
  window[BOOT_ERRORS_KEY] = window[BOOT_ERRORS_KEY] || []
  function recordBootError(kind, detail, extra) {
    try {
      var list = window[BOOT_ERRORS_KEY]
      if (!list || list.length >= BOOT_ERROR_LIMIT) return
      list.push({
        kind: kind,
        detail: String(detail == null ? '' : detail).slice(0, 300),
        extra: String(extra == null ? '' : extra).slice(0, 160),
      })
    } catch (_error) {
      // 记录器自身绝不能成为新的故障点。
    }
  }
  window.addEventListener(
    'error',
    function (event) {
      var target = event && event.target
      if (target && target !== window && (target.src || target.href)) {
        recordBootError('resource', target.src || target.href, target.tagName)
        return
      }
      recordBootError(
        'error',
        (event && event.message) || 'error',
        ((event && event.filename) || '') + ':' + ((event && event.lineno) || 0),
      )
    },
    true,
  )
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason
    recordBootError('rejection', (reason && (reason.message || reason)) || 'unknown')
  })

  var OVERLAY_ID = 'homeos-boot-overlay'
  /**
   * 不算「页面内容」的覆盖层：判定「#app 是否真的渲染出东西」时必须跳过它们。
   *
   * `studio-loading` 是 `/3d-studio` 的首屏加载遮罩（见 static/3d-studio/studio-loading.js）。
   * 它本身就占满整屏且可见 —— 若把它当成内容，编辑器真的白屏时自愈/升级提示会被永久压住。
   */
  var NON_CONTENT_OVERLAY_IDS = [OVERLAY_ID, 'studio-loading']
  var READY_ATTR = 'data-homeos-ready'
  var MOUNTED_ATTR = 'data-homeos-mounted'
  var RELOAD_KEY = 'homeos:boot-auto-reload'
  /** 自愈重载预算：窗口（毫秒）与窗口内最多自动重载次数。 */
  var RELOAD_WINDOW_MS = 120000
  var RELOAD_MAX_IN_WINDOW = 2
  /** 超过这个时长仍未就绪，就把「正在连接…」升级为带重载按钮的可操作提示。 */
  var ESCALATE_MS = 25000
  /**
   * 「已就绪但还看不见内容」的宽限期。
   *
   * `data-homeos-ready` 由 main.ts 的 `router.afterEach` 置位，含义是**首个路由解析成功**，
   * 而不是「界面已经渲染出来」：`app.mount('#app')` 还被 `loadFrontendConfig()` 挡在后面，
   * 而后端 `/system/config/public` 会等 HA 区域索引（最多 2s）才返回。也就是说
   * 「ready=1 且 #app 仍为空」是**正常启动窗口**（实测约 2s），不是故障。
   *
   * 这里给足宽限再升级为「请把以下信息反馈给开发」，否则每次冷启动都会闪出一次误报诊断
   * （旧行为：ready 后第一个 200ms 轮询就升级，必然命中）。
   */
  var READY_GRACE_MS = 8000
  /** 轮询句柄：覆盖层收起、以及「已就绪但未渲染出内容」的升级判定都靠它。 */
  var pollTimer = null
  /** ready=1 首次被观测到的时间戳；内容可见后清零。用于上面那条宽限期判定。 */
  var readySince = 0

  function byId(id) {
    return document.getElementById(id)
  }

  /**
   * 自愈重载预算（sessionStorage 里的 `{count, start}`）。
   *
   * 关键约束：预算**只在窗口过期时重置**，不能在「渲染成功」时清零。否则 dev 下依赖重打包 /
   * 服务重启的那一两秒里（动态 import 与 /api/** 同时失败），刷新后的页面正常渲染 → 清零 →
   * 紧接着又失败 → 整页刷新被反复触发（实测 1.3s 一次、持续数分钟）。
   * 预算用尽就停在带现场信息的提示态；用户点「重新加载」仍可手动刷新。
   */
  function readReloadBudget(now) {
    try {
      var raw = sessionStorage.getItem(RELOAD_KEY)
      if (raw) {
        var parsed = JSON.parse(raw)
        if (
          parsed &&
          typeof parsed.count === 'number' &&
          typeof parsed.start === 'number' &&
          now - parsed.start < RELOAD_WINDOW_MS
        ) {
          return { count: parsed.count, start: parsed.start }
        }
      }
    } catch (e) {
      /* 隐私模式下 sessionStorage 不可用 / 脏数据：等价于没有预算 */
    }
    return { count: 0, start: now }
  }

  function writeReloadBudget(budget) {
    try {
      sessionStorage.setItem(RELOAD_KEY, JSON.stringify(budget))
    } catch (e) {
      /* best-effort：写不进去就退化为「只提示、不自动重载」 */
    }
  }

  /** 应用是否已成功渲染出首个路由（由 src/main.ts 的 router.afterEach 置位）。 */
  function isReady() {
    return document.documentElement.getAttribute(READY_ATTR) === '1'
  }

  /** 应用是否已真正挂载（由 src/main.ts 挂载成功后置位）。ready 早于 mounted，见 READY_GRACE_MS。 */
  function isMounted() {
    return document.documentElement.getAttribute(MOUNTED_ATTR) === '1'
  }

  /**
   * 逐级向上乘算 opacity，得到**有效不透明度**。
   *
   * 只查元素自身的 opacity 是不够的：入场动画常见写法是容器 `opacity: 0` + 动画淡入，
   * 若动画因任何原因没跑（被禁用、被后台标签页节流、进度卡在 0%），元素有尺寸却是隐形的 ——
   * 屏幕全黑、零报错。必须把祖先链一起算进来。
   */
  function effectiveOpacity(el) {
    var opacity = 1
    var node = el
    while (node && node !== document.documentElement) {
      var value = parseFloat(window.getComputedStyle(node).opacity)
      if (!isNaN(value)) opacity *= value
      node = node.parentElement
    }
    return opacity
  }

  /** 单个元素是否"真的看得见"：非 display:none、非 visibility:hidden、有效 opacity 够高、有几何尺寸。 */
  function isEffectivelyVisible(el) {
    var style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (effectiveOpacity(el) < 0.05) return false
    var rect = el.getBoundingClientRect()
    return rect.width > 1 && rect.height > 1
  }

  /**
   * 3D 编辑器首屏遮罩是否正在屏幕上。
   *
   * 它是**有意的**占位界面（带阶段文案与重试按钮），而且会把外壳设成
   * `visibility: hidden` —— 两件事叠加正好落进「已就绪但全黑」判据。所以两个地方都要问它：
   * ① `hasVisibleContent()`：把它算作有效内容，免得慢启动时被误判成白屏；
   * ② `revealOverlay()`：它已经在自己报进度了，别再揭一层 z-index 更高的「正在连接…」
   *    把它盖住（`spa-shell.css` 的 `#homeos-boot-overlay` 是 2147483647，是本层之上）。
   */
  function studioOverlayVisible() {
    var studioLoading = byId('studio-loading')
    return !!(studioLoading && !studioLoading.hidden && isEffectivelyVisible(studioLoading))
  }

  /**
   * 「已就绪」之外还要确认**真的渲染出了可见内容**。
   *
   * 只有 ready 标记是不够的：路由解析成功、标记置位，但内容可能整片不可见 ——
   * 例如残留的 body class（见下）或卡在 `opacity: 0` 的入场动画。
   * 此时屏幕全黑且零报错，正是「闪一下正在连接，然后全黑」的成因。
   */
  function hasVisibleContent() {
    if (studioOverlayVisible()) return true
    var candidates = []
    var app = byId('app')
    if (app) {
      for (var i = 0; i < app.children.length; i++) candidates.push(app.children[i])
    }
    // 兜底：有些页面把主体 Teleport 到 body 下（#app 只剩空壳），一并纳入判定。
    for (var j = 0; j < document.body.children.length; j++) {
      var el = document.body.children[j]
      if (
        NON_CONTENT_OVERLAY_IDS.indexOf(el.id) !== -1 ||
        el.tagName === 'SCRIPT' ||
        el.tagName === 'LINK'
      )
        continue
      candidates.push(el)
    }
    for (var k = 0; k < candidates.length; k++) {
      if (isEffectivelyVisible(candidates[k])) return true
    }
    return false
  }

  /** 会隐藏 `#app` 子元素的 body class（见 spa-shell.css 的说明）。 */
  var HIDING_BODY_CLASSES = ['interaction3d-stage', 'auto-diagram-embedded']

  /**
   * 当前文档是否为 **3D 舞台页**（`/api/v1/modules/interaction3d/stage.html`）。
   *
   * 舞台页的 `interaction3d-stage` 是**服务端主动写进 HTML 的**、并由 `stage.css` 用它
   * 把绘制工具（顶栏 / 模型库 / 属性面板）裁掉、只留 3D 画布 —— 它绝不可能是「残留 class」。
   * 若把这条 class 当作残留移除，舞台会立刻退回带全部绘制工具的编辑器界面：这正是
   * 「总览里显示的是 3D 户型图绘制页面，而不是展示画面」的成因（舞台内容尚未可见的那一两个
   * 轮询窗口里被误伤）。因此舞台文档一律跳过这条 class 的自愈。
   */
  function isStageDocument() {
    try {
      if (document.documentElement.getAttribute('data-homeos-stage') === '1') return true
      return /\/interaction3d\/stage\.html$/.test(window.location.pathname || '')
    } catch (e) {
      return false
    }
  }

  /**
   * 自愈：内容不可见时，移除上述残留 body class 再复查一次。
   *
   * 只在「内容确实不可见」时动手 —— 真正需要这些 class 的页面（3D 舞台 / 导出嵌入态）
   * 内容本来就是可见的，因此不会被误伤。返回 true 表示自愈后已可见。
   */
  function tryHealHidingBodyClasses() {
    var removed = []
    var stageDocument = isStageDocument()
    for (var i = 0; i < HIDING_BODY_CLASSES.length; i++) {
      var name = HIDING_BODY_CLASSES[i]
      // 舞台文档的 `interaction3d-stage` 是页面档位而非残留：移除会把「展示画面」变成绘制界面。
      if (name === 'interaction3d-stage' && stageDocument) continue
      if (document.body.classList.contains(name)) {
        document.body.classList.remove(name)
        removed.push(name)
      }
    }
    if (!removed.length) return false
    var healed = hasVisibleContent()
    if (window.console && window.console.warn) {
      window.console.warn(
        '[HomeOS] 检测到残留的 body class 隐藏了整页内容，已移除：' +
          removed.join(', ') +
          (healed ? '（页面已恢复）' : '（内容仍不可见，请查看下方提示）'),
      )
    }
    return healed
  }

  /** 供升级提示使用的现场信息：body/html class + 首个子元素 + 有效透明度 + 挂载规模。 */
  function domDiagnostics() {
    var app = byId('app')
    var first = app && app.firstElementChild ? app.firstElementChild.className : '(无)'
    var firstOpacity = app && app.firstElementChild ? effectiveOpacity(app.firstElementChild) : null
    return (
      'html class="' +
      (document.documentElement.className || '(空)') +
      '"；body class="' +
      (document.body.className || '(空)') +
      '"；#app 首个元素="' +
      String(first).slice(0, 60) +
      '"（有效 opacity=' +
      firstOpacity +
      '）；#app 长度=' +
      (app ? app.innerHTML.length : 0) +
      '；已挂载=' +
      (isMounted() ? '1' : '0') +
      '；就绪后=' +
      (readySince ? Math.round((Date.now() - readySince) / 1000) : 0) +
      's'
    )
  }

  var HIDE_FADE_MS = 180
  /**
   * 覆盖层延迟揭示：快路径（常见冷开 < 此值）只见深色底 → 入户页，不再闪「正在连接」。
   * 慢路径（后端冷启动 / chunk 慢）到期后仍未就绪才露出提示，保留原兜底语义。
   *
   * 这个值必须盖住「页面已经画好、但 <html data-homeos-ready> 还没置位」的窗口：
   * 路由守卫首屏要等后端探测 / 授权查询，几百毫秒很常见。只要早一步露出，不透明的
   * 覆盖层就会把已经可见的页面整屏盖住，ready 到达后再淡出 —— 用户看到的是
   * 「页面出现 → 发黑 → 再出现」，这才是手机上最刺眼的那次闪。
   */
  var SHOW_DELAY_MS = 1200
  /**
   * 已经露出的覆盖层至少停留这么久再撤：否则「盖上 → 立刻淡出」与不盖没有区别，
   * 还平白多一次整屏合成。ready 若在揭示后很快到达，由 hide() 排队等待剩余时长。
   */
  var MIN_VISIBLE_MS = 500
  var revealTimer = null
  var revealFadeRaf = null
  var hideTimer = null
  var revealedAt = 0
  var overlayRevealed = false

  function clearRevealTimer() {
    if (revealTimer != null) {
      window.clearTimeout(revealTimer)
      revealTimer = null
    }
  }

  function clearHideTimer() {
    if (hideTimer != null) {
      window.clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch (e) {
      return false
    }
  }

  /** 真正把覆盖层摆上屏幕（去掉 deferred / hidden）。失败升级路径也会走这里。 */
  function revealOverlay() {
    var box = byId(OVERLAY_ID)
    if (!box) return
    if (isReady() && hasVisibleContent()) return
    // 3D 编辑器的遮罩自带阶段文案 / 重试按钮，且**层级低于本层**（spa-shell.css 给的
    // 2147483647 是上限值）。它一出现就说明页面已经在正常推进（不是「后端没起来」），
    // 这时再揭「正在连接…」只会把它盖住 —— 用户看到的是一句和实际进度无关的泛泛提示。
    if (studioOverlayVisible()) return
    if (overlayRevealed) {
      // 升级 / 自愈路径会在首次揭示之后再次调用：此时只做「确保可见」，
      // 不能再走一遍入场，否则已经站住的整屏面板会重新从透明淡入一次。
      clearHideTimer()
      if (revealFadeRaf != null) {
        window.cancelAnimationFrame(revealFadeRaf)
        revealFadeRaf = null
      }
      box.classList.remove('is-deferred')
      box.classList.remove('is-leaving')
      box.removeAttribute('data-leaving')
      box.hidden = false
      return
    }
    overlayRevealed = true
    revealedAt = Date.now()
    clearRevealTimer()
    clearHideTimer()
    box.classList.remove('is-leaving')
    box.removeAttribute('data-leaving')
    box.hidden = false
    // hidden 与 is-deferred 必须**分两帧**摘：hidden 去掉的那一帧元素已是
    // display:flex + opacity:0（is-deferred 给 transparent + 180ms transition），
    // 下一帧再摘 is-deferred 才开始真正的淡入。同一个任务里全摘，
    // 浏览器只会合成「display:none → 全不透明」，也就是整屏一下子盖上。
    revealFadeRaf = window.requestAnimationFrame(function () {
      revealFadeRaf = null
      try {
        // 读一次布局，确保 opacity:0 的那一帧真的参与过样式计算。
        void box.offsetHeight
      } catch (e) {
        /* ignore */
      }
      box.classList.remove('is-deferred')
    })
  }

  function armDeferredOverlay() {
    var box = byId(OVERLAY_ID)
    if (!box) return
    // HTML 已带 hidden + is-deferred；再保险一次，避免旧缓存外壳无这些属性。
    box.classList.add('is-deferred')
    if (!overlayRevealed) box.hidden = true
    clearRevealTimer()
    revealTimer = window.setTimeout(function () {
      revealTimer = null
      if (isReady() && hasVisibleContent()) return
      revealOverlay()
    }, SHOW_DELAY_MS)
  }

  function hide() {
    var box = byId(OVERLAY_ID)
    if (!box) return
    clearRevealTimer()
    // 从未揭示过：直接保持 hidden，不要先显示再淡出（那正是闪烁本身）。
    if (!overlayRevealed && box.hidden) {
      box.classList.add('is-deferred')
      return
    }
    if (box.hidden || box.dataset.leaving === '1') return
    // 刚露出还没站满最短时长：排一次延后隐藏，别再让「盖上 - 撤掉」发生在几帧内。
    if (revealedAt) {
      var remaining = MIN_VISIBLE_MS - (Date.now() - revealedAt)
      if (remaining > 0) {
        if (hideTimer == null) {
          hideTimer = window.setTimeout(function () {
            hideTimer = null
            hide()
          }, remaining)
        }
        return
      }
    }
    if (revealFadeRaf != null) {
      window.cancelAnimationFrame(revealFadeRaf)
      revealFadeRaf = null
    }
    if (prefersReducedMotion()) {
      box.hidden = true
      box.classList.add('is-deferred')
      return
    }
    box.dataset.leaving = '1'
    box.classList.add('is-leaving')
    window.setTimeout(function () {
      box.hidden = true
      box.classList.add('is-deferred')
      box.classList.remove('is-leaving')
      box.removeAttribute('data-leaving')
    }, HIDE_FADE_MS)
  }

  function reloadButton() {
    return byId(OVERLAY_ID + '-reload')
  }

  function bindReload() {
    var btn = reloadButton()
    if (!btn || btn.dataset.bound === '1') return
    btn.dataset.bound = '1'
    btn.addEventListener('click', function () {
      window.location.reload()
    })
  }

  var reloadButtonBound = false
  /** 是否已升级为失败/说明态：避免 25s 定时器覆盖掉更有价值的现场信息。 */
  var escalated = false

  var nudgeCount = 0
  var NUDGE_MAX = 3

  /**
   * 首帧轻推：某些运行环境（嵌入式 WebView / CEF / 被其他窗口完全遮挡的窗口）不会主动
   * 合成首帧 —— 内容其实已经渲染好，但屏幕上是全黑，且**零报错**；用户一旦改变窗口尺寸
   * 才会触发重新合成，画面立刻出现。这与「Vue 已挂载、内容有尺寸、无报错，却全黑」完全吻合。
   *
   * 这里在下一帧里读一次布局属性（rAF → 强制样式 / 布局重算 → 重新合成），**不再伪造
   * `resize` 事件**：合成 resize 会被设备工具栏 / 移动浏览器的尺寸监听当成真 resize 处理，
   * 触发一轮整页重排重绘 —— 那正是入户页「反复闪」的来源之一。后台标签页直接跳过，
   * 免得在不可见时反复触发布局。
   */
  function nudgeFirstPaint() {
    if (nudgeCount >= NUDGE_MAX) return
    nudgeCount += 1
    try {
      if (document.visibilityState === 'hidden') return
      window.requestAnimationFrame(function () {
        try {
          void document.documentElement.offsetHeight
          void document.body.offsetHeight
          void document.documentElement.getBoundingClientRect().height
        } catch (e) {
          /* ignore */
        }
      })
    } catch (e) {
      /* ignore */
    }
  }

  /** 就绪后按 0 / 500 / 1500ms 补推，覆盖字体与异步 chunk 落地的时间差。 */
  var paintNudgesScheduled = false
  function schedulePaintNudges() {
    // 幂等：轮询每轮都会走到这里，没有这个闸门就会各自排一串定时器，
    // 而 NUDGE_MAX 只挡住真正派发的那一步、挡不住定时器堆积。
    if (paintNudgesScheduled) return
    paintNudgesScheduled = true
    nudgeFirstPaint()
    window.setTimeout(nudgeFirstPaint, 500)
    window.setTimeout(nudgeFirstPaint, 1500)
  }

  /**
   * 升级为「可操作」状态：把转圈收掉、给标题与说明、露出重载按钮。
   * 覆盖层保持可见 —— 空白页最糟的地方就是没有任何可点的东西。
   */
  function escalate(title, message) {
    if (isReady() && hasVisibleContent()) return
    var box = byId(OVERLAY_ID)
    if (!box) return
    escalated = true
    // 升级态要立刻可见：取消可能排着的「最短可见后再隐藏」。
    clearHideTimer()
    revealOverlay()
    box.setAttribute('data-state', 'failed')
    var titleEl = byId(OVERLAY_ID + '-title')
    var msgEl = byId(OVERLAY_ID + '-message')
    if (titleEl && title) titleEl.textContent = title
    if (msgEl && message) msgEl.textContent = message
    var btn = reloadButton()
    if (btn) btn.hidden = false
    bindReload()
  }

  /** 是否属于「资源/模块加载失败」这一类，值得走自愈流程。 */
  function isAssetFailure(reason) {
    if (!reason) return false
    var text = typeof reason === 'string' ? reason : reason.message || String(reason)
    return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload|Loading chunk|Loading CSS chunk/i.test(
      text,
    )
  }

  /**
   * 清掉可能仍在接管旧资源的 Service Worker 与缓存。
   *
   * SW 会把 SPA 外壳一并缓存，重建后会一直喂回引用了已被删除 chunk 的旧外壳，
   * 导致「重载也修不好」。整组清掉最省事。
   */
  function purgeClientCaches() {
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker
          .getRegistrations()
          .then(function (regs) {
            regs.forEach(function (reg) {
              try {
                reg.unregister()
              } catch (e) {
                /* ignore */
              }
            })
          })
          .catch(function () {})
      }
      if (window.caches && window.caches.keys) {
        window.caches
          .keys()
          .then(function (keys) {
            keys.forEach(function (key) {
              try {
                window.caches.delete(key)
              } catch (e) {
                /* ignore */
              }
            })
          })
          .catch(function () {})
      }
    } catch (e) {
      /* ignore */
    }
  }

  function recoverOrReport(reasonText) {
    // 启动期：入口 chunk 404 → 清 SW/缓存后自愈重载。
    // 已就绪后仍可能命中：dev 下 dist 重建砍掉旧 hash，或 SW 曾缓存生产外壳，
    // StudioView / 动态 import 会 Failed to fetch …/static/assets/<old>.js —— 同样走一次自愈。
    var now = Date.now()
    var budget = readReloadBudget(now)
    if (budget.count < RELOAD_MAX_IN_WINDOW) {
      writeReloadBudget({ count: budget.count + 1, start: budget.start })
      escalate('正在重新加载…', '页面资源已更新，正在清理缓存并重新加载。')
      purgeClientCaches()
      window.setTimeout(function () {
        window.location.reload()
      }, 150)
      return
    }
    if (isReady()) return
    escalate('界面未能加载', reasonText)
  }

  /**
   * Vite HMR（8805）与生产 SW 同口共存时：旧 SW 可能仍注册在本源。
   * 入口已是 /@vite/client 时主动卸掉 SW + 壳缓存，避免再喂生产 index/chunk。
   */
  ;(function purgeServiceWorkerOnViteDev() {
    try {
      if (!document.querySelector('script[src="/@vite/client"]')) return
      purgeClientCaches()
    } catch (e) {
      /* ignore */
    }
  })()

  window.addEventListener(
    'error',
    function (event) {
      var target = event.target
      // 资源加载失败：script/link 的 error 事件不带 message，只有 target
      if (target && target !== window && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
        var url = target.src || target.href || ''
        if (url.indexOf('/static/assets/') !== -1) {
          recoverOrReport('页面资源加载失败：' + url)
        }
        return
      }
      if (isAssetFailure(event.message)) {
        recoverOrReport('模块加载失败：' + event.message)
      }
    },
    true,
  )

  window.addEventListener('unhandledrejection', function (event) {
    if (isAssetFailure(event.reason)) {
      recoverOrReport('模块加载失败：' + (event.reason && event.reason.message))
    }
  })

  // 覆盖层改为延迟揭示，避免快路径冷开闪「正在连接」。
  if (document.body) armDeferredOverlay()
  else document.addEventListener('DOMContentLoaded', armDeferredOverlay)

  // 就绪后收掉覆盖层 —— 但必须先确认**真的渲染出了可见内容**，否则会把「全黑页」当成成功。
  //
  // 轮询用 setTimeout 自循环而不是固定 setInterval：`hasVisibleContent()` 每轮都要读
  // getComputedStyle + getBoundingClientRect，200ms 一次就是每 200ms 强制一次同步布局，
  // 在入户页这种大面积模糊 / 动画的场景里直接变成掉帧源。所以：
  //   - 内容可见 → 收掉覆盖层并**停掉轮询**（启动期结束，不再需要它）；
  //   - 已升级为说明态 → 降到 1s 一次继续守望（用户点导航后内容出现仍能自动放行）；
  //   - 启动期（未就绪 / 未到宽限期）→ 保持 200ms，这段窗口短且需要及时放行。
  // 最长守望 POLL_MAX_MS：超时后停掉，避免一个标签页永久每 200ms 触发布局。
  var POLL_INTERVAL_MS = 200
  var ESCALATED_POLL_INTERVAL_MS = 1000
  var POLL_MAX_MS = 180000
  var pollStartedAt = Date.now()

  function stopPolling() {
    if (pollTimer != null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function schedulePoll(delay) {
    if (pollTimer != null) return
    if (Date.now() - pollStartedAt > POLL_MAX_MS) {
      stopPolling()
      return
    }
    pollTimer = window.setTimeout(pollTick, delay)
  }

  function pollTick() {
    pollTimer = null
    if (!isReady()) {
      readySince = 0
      schedulePoll(POLL_INTERVAL_MS)
      return
    }
    if (hasVisibleContent()) {
      readySince = 0
      hide()
      // 内容已渲染：轻推一次，绕开「首帧未被合成」导致的假性全黑（见 nudgeFirstPaint）。
      schedulePaintNudges()
      stopPolling()
      return
    }
    if (escalated) {
      schedulePoll(ESCALATED_POLL_INTERVAL_MS)
      return
    }
    // 已就绪但内容不可见：先尝试移除残留的 body class，成功则放行。
    if (tryHealHidingBodyClasses() && hasVisibleContent()) {
      readySince = 0
      hide()
      schedulePaintNudges()
      stopPolling()
      return
    }
    // 自愈无效：区分「仍在正常启动」与「真的没渲染出来」。
    // ready 只代表首个路由解析完成，app.mount('#app') 还在等 loadFrontendConfig()
    //（后端 /system/config/public 最多等 2s HA 区域），这段窗口里 #app 必为空且属正常。
    if (!readySince) readySince = Date.now()
    if (Date.now() - readySince < READY_GRACE_MS) {
      schedulePoll(POLL_INTERVAL_MS)
      return
    }
    // 宽限期后仍无可见内容：不要隐藏覆盖层（隐藏了就是黑屏），改为把现场信息摆出来。
    escalate('界面已就绪但未渲染出内容', '请把以下信息反馈给开发：' + domDiagnostics())
    schedulePoll(ESCALATED_POLL_INTERVAL_MS)
  }

  schedulePoll(POLL_INTERVAL_MS)

  // 迟迟不就绪：升级提示但保持可见。最常见的成因是后端还在冷启动 / 热重载
  // （前端会重试约 2 分钟），所以要给出「等待中」而不是「失败」的语义。
  window.setTimeout(function () {
    if (isReady()) return
    if (escalated) return
    escalate(
      '仍在等待后端…',
      'HomeOS 后端可能仍在启动或热重载。界面就绪后会自动出现；也可以直接重新加载。',
    )
  }, ESCALATE_MS)
})()
