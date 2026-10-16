/**
 * 入口场景的「手持档」判据：触摸设备（粗指针 / 无 hover / iPadOS 伪装成 Mac）要给
 * `<html>` 挂 `.hos-touch` —— 场景样式里整组 `html.hos-touch …` 规则只有挂上 class 才生效。
 *
 * 必须在**首帧之前**跑完：两个前端各有一支阻塞入口（主应用 `/static/auth/scene/scene-depth.js`
 * 由 `studio/platform/scene-depth.ts` 产出，商店由 `src/scene/scene-depth.ts` 在 `main.ts` 里
 * 最早 import）。判据必须逐条一致：同一台设备在两个前端的档位不同，同一个场景就会一半关动效、
 * 一半开动效。所以真源只有这一处，两侧入口都只是「谁在什么时刻调用它」的差异。
 *
 * 注：主应用还有一份**未打包的兜底副本** `public/static/auth/scene/scene-depth.js`（开发态与
 * 构建缺口时防 404），它无法 import TS，改动判据时须人肉同步那一个 IIFE。
 */

/** 该设备是否按「手持档」处理。 */
function isTouchProfile(): boolean {
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  // iPadOS 装在 Mac 上：platform 报 Mac，但触点数 > 1，按手持档处理。
  const iPadInDisguise = navigator.maxTouchPoints > 1 && /^Mac/.test(navigator.platform || '')
  return coarsePointer || noHover || iPadInDisguise
}

/** 按判据给 `<html>`（或指定根元素）挂/摘 `.hos-touch`，返回是否手持档。 */
export function applyTouchProfile(root: HTMLElement = document.documentElement): boolean {
  const touch = isTouchProfile()
  root.classList.toggle('hos-touch', touch)
  return touch
}
