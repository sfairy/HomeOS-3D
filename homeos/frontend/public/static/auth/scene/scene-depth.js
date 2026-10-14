/**
 * 入口场景的「手持档」开关：给 <html> 挂 .hos-touch。
 *
 * 必须在首帧前跑完（index.html 阻塞脚本）。判据真源是
 * src/studio/platform/scene-depth.ts → packages/shared/src/scene/touch-profile.ts；
 * 本文件是它**手抄的兜底件**：public/ 下的资源不经打包、不能 import，只能各存一份。
 * 改判据必须同步这里 —— ops/check/check_shared_contracts.py 的「手持档兜底件」检查会比对
 * 两边的信号面（matchMedia 查询串 + 触点数 / Mac 平台判定），别只改一处。
 * 落在 public/static 保证开发态与构建缺口时也不会 404（构建产物会覆盖同名文件）。
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
