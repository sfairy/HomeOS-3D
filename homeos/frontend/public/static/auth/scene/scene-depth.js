/**
 * 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 必须在首帧前跑完（index.html 阻塞脚本）。判据真源是
 * src/studio/platform/scene-depth.ts → packages/shared/src/scene/touch-profile.ts；
 * 本文件是它**手抄的兜底件**：public/ 下的资源不经打包、不能 import，只能各存一份。
 * 改判据必须同步这里 —— 与 `@homeos/shared/scene/touch-profile` 保持一致
 * 两边的信号面（matchMedia 查询串 + 触点数 / Mac 平台判定），别只改一处。
 * 落在 public/static 保证开发态与构建缺口时也不会 404（构建产物会覆盖同名文件）。
 */
(function () {
  'use strict'
  var MEDIA_QUERIES = ['(pointer: coarse)', '(hover: none)']
  function isTouchProfile() {
    var coarsePointer = window.matchMedia('(pointer: coarse)').matches
    var noHover = window.matchMedia('(hover: none)').matches
    // iPadOS 装在 Mac 上：platform 报 Mac，但触点数 > 1，按手持档处理。
    var iPadInDisguise =
      navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || '')
    return coarsePointer || noHover || iPadInDisguise
  }
  function applyTouchProfile() {
    document.documentElement.classList.toggle('hos-touch', isTouchProfile())
  }
  applyTouchProfile()
  /**
   * 判据是**一次性快照**，而媒体查询会在页面存活期间改口：PC 浏览器 DevTools 的设备工具栏
   * （移动模拟）开关、iPad 插拔妙控键盘 / 触控板都会触发。不跟着重算的话 `html.hos-touch …`
   * 那一整组「手持档关重动效 + 关掉坞体实时模糊」的规则全部失效，坞体在大面积场景上保留
   * `backdrop-filter: blur(22px)`，DPR 3 下每帧重模糊 = 反复闪。
   * 注意只有首次需要「首帧前同步执行」，后续 change 回调早于首帧也没关系。
   */
  for (var i = 0; i < MEDIA_QUERIES.length; i++) {
    try {
      var mql = window.matchMedia(MEDIA_QUERIES[i])
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', applyTouchProfile)
      else if (typeof mql.addListener === 'function') mql.addListener(applyTouchProfile)
    } catch (e) {
      /* 个别环境对未知媒体查询抛错：忽略即可，已应用的那一档不受影响 */
    }
  }
})()
