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

  var OVERLAY_ID = 'homeos-boot-overlay'
  var READY_ATTR = 'data-homeos-ready'
  var MOUNTED_ATTR = 'data-homeos-mounted'
  var RELOAD_KEY = 'homeos:boot-auto-reload'
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
  /** 自动自愈重载最多做一次，避免重载风暴。 */
  var pollTimer = null
  /** ready=1 首次被观测到的时间戳；内容可见后清零。用于上面那条宽限期判定。 */
  var readySince = 0

  function byId(id) {
    return document.getElementById(id)
  }

  function readFlag() {
    try {
      return sessionStorage.getItem(RELOAD_KEY) === '1'
    } catch (e) {
      return false
    }
  }

  function writeFlag() {
    try {
      sessionStorage.setItem(RELOAD_KEY, '1')
    } catch (e) {
      /* 隐私模式下 sessionStorage 不可用：退化为「只提示、不自动重载」 */
    }
  }

  function clearFlag() {
    try {
      sessionStorage.removeItem(RELOAD_KEY)
    } catch (e) {
      /* ignore */
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
   * 「已就绪」之外还要确认**真的渲染出了可见内容**。
   *
   * 只有 ready 标记是不够的：路由解析成功、标记置位，但内容可能整片不可见 ——
   * 例如残留的 body class（见下）或卡在 `opacity: 0` 的入场动画。
   * 此时屏幕全黑且零报错，正是「闪一下正在连接，然后全黑」的成因。
   */
  function hasVisibleContent() {
    var candidates = []
    var app = byId('app')
    if (app) {
      for (var i = 0; i < app.children.length; i++) candidates.push(app.children[i])
    }
    // 兜底：有些页面把主体 Teleport 到 body 下（#app 只剩空壳），一并纳入判定。
    for (var j = 0; j < document.body.children.length; j++) {
      var el = document.body.children[j]
      if (el.id === OVERLAY_ID || el.tagName === 'SCRIPT' || el.tagName === 'LINK') continue
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

  function hide() {
    var box = byId(OVERLAY_ID)
    if (box) box.hidden = true
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
   * 这里主动制造一次布局与合成状态变化，等价于用户拖动窗口宽度的效果。
   * 幂等、无副作用：只读一次布局并派发一次 resize，不改变任何可见样式。
   */
  function nudgeFirstPaint() {
    if (nudgeCount >= NUDGE_MAX) return
    nudgeCount += 1
    try {
      // 读取布局属性强制一次同步重排，再派发 resize 让合成器重新评估绘制。
      void document.documentElement.offsetHeight
      void document.body.offsetHeight
      window.dispatchEvent(new Event('resize'))
    } catch (e) {
      /* ignore */
    }
  }

  /** 就绪后按 0 / 500 / 1500ms 补推，覆盖字体与异步 chunk 落地的时间差。 */
  function schedulePaintNudges() {
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
    box.setAttribute('data-state', 'failed')
    box.hidden = false
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
   * 旧版 SW 会把 SPA 外壳与 `/assets/*` 一并缓存，重建后会一直喂回引用了
   * 已被删除 chunk 的旧外壳，导致「重载也修不好」。整组清掉最省事。
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
    // StudioView / 动态 import 会 Failed to fetch …/assets/js/<old>.js —— 同样走一次自愈。
    if (!readFlag()) {
      writeFlag()
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
        if (url.indexOf('/assets/') !== -1) {
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

  // 就绪后收掉覆盖层 —— 但必须先确认**真的渲染出了可见内容**，否则会把「全黑页」当成成功。
  // 轮询持续存在：即使已升级为说明态，之后一旦内容可见（例如用户点了导航）也会自动放行。
  pollTimer = window.setInterval(function () {
    if (!isReady()) {
      readySince = 0
      return
    }
    if (hasVisibleContent()) {
      readySince = 0
      hide()
      clearFlag()
      // 内容已渲染：轻推一次，绕开「首帧未被合成」导致的假性全黑（见 nudgeFirstPaint）。
      schedulePaintNudges()
      return
    }
    if (escalated) return
    // 已就绪但内容不可见：先尝试移除残留的 body class，成功则放行。
    if (tryHealHidingBodyClasses() && hasVisibleContent()) {
      readySince = 0
      hide()
      clearFlag()
      return
    }
    // 自愈无效：区分「仍在正常启动」与「真的没渲染出来」。
    // ready 只代表首个路由解析完成，app.mount('#app') 还在等 loadFrontendConfig()
    //（后端 /system/config/public 最多等 2s HA 区域），这段窗口里 #app 必为空且属正常。
    if (!readySince) readySince = Date.now()
    if (Date.now() - readySince < READY_GRACE_MS) return
    // 宽限期后仍无可见内容：不要隐藏覆盖层（隐藏了就是黑屏），改为把现场信息摆出来。
    escalate('界面已就绪但未渲染出内容', '请把以下信息反馈给开发：' + domDiagnostics())
  }, 200)

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
