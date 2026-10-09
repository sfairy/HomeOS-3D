/**
 * 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 必须在首帧前跑完（index.html 阻塞脚本）。与
 * src/studio/platform/scene-depth.ts、homeos-store 侧同源判据；改一处须同步改另一处。
 * 落在 public/static 保证开发态与构建缺口时也不会 404。
 */
(function () {
  'use strict'
  var coarsePointer = window.matchMedia('(pointer: coarse)').matches
  var noHover = window.matchMedia('(hover: none)').matches
  var iPadInDisguise =
    navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || '')
  if (coarsePointer || noHover || iPadInDisguise) {
    document.documentElement.classList.add('hos-touch')
  }
})()
