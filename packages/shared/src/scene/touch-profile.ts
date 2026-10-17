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
 * 构建缺口时防 404），它无法 import TS，改动判据时须人肉同步那一个 IIFE（含下面的
 * `watchTouchProfile` 监听逻辑）。
 */

/**
 * 判据用到的媒体查询串。真源只此一处 —— 手抄兜底件 `scene-depth.js` 里也必须逐条一致。
 *
 * 之所以要把它们列出来而不是散在函数体里：`watchTouchProfile` 要拿同一批查询去订阅 change，
 * 两处各写一遍就会漂。
 */
const TOUCH_MEDIA_QUERIES = ['(pointer: coarse)', '(hover: none)'] as const

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

/**
 * 让 `.hos-touch` 跟着判据走：**页面存活期间**媒体查询改口时重算一次。
 *
 * 为什么必须订阅：判据是**一次性快照**，而 `(pointer: coarse)` / `(hover: none)` 会在页面
 * 存活期间改口 —— PC 浏览器 DevTools 的设备工具栏（移动模拟）开关、iPad 插拔妙控键盘 /
 * 触控板、外接触控屏都会触发。快照与 class 脱节时，`html.hos-touch …` 那一整组「手持档
 * 关掉重动效 + 关掉坞体实时模糊」的规则全部失效：坞体在大面积场景之上保留
 * `backdrop-filter: blur(22px)`，DPR 3 的移动模拟下每帧重新模糊，表现为**反复闪**。
 *
 * 幂等：重复调用只是多挂几个监听，重算本身无副作用。
 *
 * @param root - 要挂 / 摘 class 的根元素，默认 `<html>`。
 */
export function watchTouchProfile(root: HTMLElement = document.documentElement): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const replan = () => {
    applyTouchProfile(root)
  }
  for (const query of TOUCH_MEDIA_QUERIES) {
    try {
      const mql = window.matchMedia(query)
      // 老 Safari 只有 addListener；两种都试，缺一个也不至于整段监听装不上。
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', replan)
      else if (typeof mql.addListener === 'function') mql.addListener(replan)
    } catch {
      /* 个别环境对未知媒体查询抛错：忽略即可，已应用的那一档不受影响 */
    }
  }
}
