/**
 * 入口场景的「动效档位」开关：给 <html> 挂 `.hos-touch` / 写 `data-hos-motion`。
 *
 * 必须在首帧前跑完（index.html 阻塞脚本）。判据真源是
 * src/studio/platform/scene-depth.ts → packages/shared/src/scene/touch-profile.ts；
 * 本文件是它**手抄的兜底件**：public/ 下的资源不经打包、不能 import，只能各存一份。
 * 改判据必须同步这里 —— 与 `@homeos/shared/scene/touch-profile` 保持一致
 * 两边的信号面（matchMedia 查询串 + 触点数 / Mac 平台判定 + 平板宽度阈值 + 单调降级），
 * 别只改一处。落在 public/static 保证开发态与构建缺口时也不会 404（构建产物会覆盖同名文件）。
 */
(function () {
  'use strict'
  var MEDIA_QUERIES = ['(pointer: coarse)', '(hover: none)']
  /** 平板的下限宽度：触摸设备只有到这一档才值得给「环境动效」（同 touch-profile.ts）。 */
  var TABLET_MIN_WIDTH = 768
  /** 档位高低。会话内**只降不升**，比较用。 */
  var TIER_RANK = { frozen: 0, ambient: 1, full: 2 }

  function isTouchProfile() {
    var coarsePointer = window.matchMedia('(pointer: coarse)').matches
    var noHover = window.matchMedia('(hover: none)').matches
    // 多触点即按手持档（同 touch-profile.ts）：iPad + 妙控键盘 / Surface 的主指针是
    // fine 且能 hover，只看媒体查询会把混合设备判成桌面（full 档），手指一碰就逐帧重算。
    var multiTouch = (navigator.maxTouchPoints || 0) > 1
    return coarsePointer || noHover || multiTouch
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function resolveMotionTier(touch) {
    if (prefersReducedMotion()) return 'frozen'
    if (!touch) return 'full'
    return window.matchMedia('(min-width: ' + TABLET_MIN_WIDTH + 'px)').matches
      ? 'ambient'
      : 'frozen'
  }

  /**
   * 单调降级：档位只会往更省的方向走，`.hos-touch` 一旦挂上也不再摘。
   * 理由见 touch-profile.ts —— 双向切换会让同一批场景动画半路开又关，那本身就是闪烁。
   */
  function applyTouchProfile() {
    var root = document.documentElement
    var touch = isTouchProfile()
    if (touch) root.classList.add('hos-touch')
    var next = resolveMotionTier(touch)
    var prev = root.getAttribute('data-hos-motion')
    var keepPrev = prev && prev in TIER_RANK && TIER_RANK[prev] < TIER_RANK[next]
    root.setAttribute('data-hos-motion', keepPrev ? prev : next)
  }

  applyTouchProfile()

  /**
   * 判据是**一次性快照**，而媒体查询会在页面存活期间改口：PC 浏览器 DevTools 的设备工具栏
   * （移动模拟）开关、iPad 插拔妙控键盘 / 触控板、系统切换「减少动态效果」都会触发。
   * 不跟着重算的话档位会与设备脱节（例如本该降级却仍在跑重动效）。
   * 注意只有首次需要「首帧前同步执行」，后续 change 回调早于首帧也没关系。
   */
  var WATCHED = MEDIA_QUERIES.concat(['(prefers-reduced-motion: reduce)'])
  for (var i = 0; i < WATCHED.length; i++) {
    try {
      var mql = window.matchMedia(WATCHED[i])
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', applyTouchProfile)
      else if (typeof mql.addListener === 'function') mql.addListener(applyTouchProfile)
    } catch (e) {
      /* 个别环境对未知媒体查询抛错：忽略即可，已应用的那一档不受影响 */
    }
  }
})()
