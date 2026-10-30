/**
 * 入口场景的「动效档位」判据：给 `<html>` 挂 `.hos-touch`（手持档标记）与
 * `data-hos-motion`（动效档位）。场景 / 面板样式里整组 `html[data-hos-motion=…] …`
 * 规则只有挂上属性才生效。
 *
 * 必须在**首帧之前**跑完：两个前端各有一支阻塞入口（主应用 `/static/auth/scene/scene-depth.js`
 * 由 `studio/platform/scene-depth.ts` 产出，商店由 `src/scene/scene-depth.ts` 在 `main.ts` 里
 * 最早 import）。判据必须逐条一致：同一台设备在两个前端的档位不同，同一个场景就会一半关动效、
 * 一半开动效。所以真源只有这一处，两侧入口都只是「谁在什么时刻调用它」的差异。
 *
 * 注：主应用还有一份**未打包的兜底副本** `public/static/auth/scene/scene-depth.js`（开发态与
 * 构建缺口时防 404），它无法 import TS，改动判据时须人肉同步那一个 IIFE（含下面的
 * `watchTouchMotion` 监听逻辑）。
 */

/**
 * 判据用到的媒体查询串。真源只此一处 —— 手抄兜底件 `scene-depth.js` 里也必须逐条一致。
 *
 * 之所以要把它们列出来而不是散在函数体里：`watchTouchMotion` 要拿同一批查询去订阅 change，
 * 两处各写一遍就会漂。
 */
const TOUCH_MEDIA_QUERIES = ['(pointer: coarse)', '(hover: none)'] as const

/** 平板的下限宽度：触摸设备只有到这一档才值得给「环境动效」。 */
const TABLET_MIN_WIDTH = 768

/**
 * 动效档位。
 *
 * - `full`：桌面（有精确指针 + 有 hover）。全特效，与改造前逐帧一致。
 * - `ambient`：平板（触摸且宽 ≥ 768px）。只放行**纯 transform / opacity** 的低频环境动效。
 * - `frozen`：手机（触摸且更窄）或 `prefers-reduced-motion: reduce`。完全静止。
 *
 * CSS 侧的对应关系见 `scene/static/scene.css` 与 `panel.css` 的「动效档位」段：
 * `ambient` 的做法是**先全冻、再逐条解冻白名单**，这样以后新增的动画默认不会跑在平板上。
 */
export type MotionTier = 'frozen' | 'ambient' | 'full'

/** 档位高低。会话内**只降不升**，比较用。 */
const TIER_RANK: Record<MotionTier, number> = { frozen: 0, ambient: 1, full: 2 }

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** 该设备是否按「手持档」处理。 */
function isTouchProfile(): boolean {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const noHover = window.matchMedia('(hover: none)').matches
  // 只要存在多触点就按手持档：iPad + 妙控键盘 / Surface 的主指针是 fine 且能 hover，
  // 只看媒体查询会把这类混合设备判成桌面（full 档：全特效 + 实时毛玻璃），
  // 手指一碰屏幕就逐帧重算 —— 这是平板端闪烁的一大来源。原先只特判了 iPad 伪装 Mac，
  // 漏掉了 Windows 触摸本 / 安卓平板 + 外接键鼠；改成统一的触点数判据。
  // 判据只决定「是否触摸」，档位仍按宽度分 ambient / frozen，桌面（0 触点）照旧 full。
  const multiTouch = (navigator.maxTouchPoints || 0) > 1
  return coarsePointer || noHover || multiTouch
}

/** 按判据算出「这一刻」应当用的档位（不含只降不升的约束）。 */
function resolveMotionTier(touch: boolean): MotionTier {
  if (prefersReducedMotion()) return 'frozen'
  if (!touch) return 'full'
  return window.matchMedia(`(min-width: ${TABLET_MIN_WIDTH}px)`).matches ? 'ambient' : 'frozen'
}

/**
 * 按判据给 `<html>`（或指定根元素）挂/摘 `.hos-touch`、写 `data-hos-motion`，返回是否手持档。
 *
 * **单调降级**：档位只会往更省的方向走（`full → ambient → frozen`），绝不会退回上一档。
 *
 * 为什么必须单调：判据是媒体查询的**一次性读数**，而这些查询会在页面存活期间改口 ——
 * iPad 插拔妙控键盘 / 触控板、PC 浏览器 DevTools 的设备工具栏开关、外接触控屏都会触发。
 * 双向切换时同一批场景动画会「半路开 → 半路关」，冻结帧读数与动画规则互相覆盖，画面
 * 反复重绘 —— 那本身就是入户页闪烁的一大来源。宁可这次会话少一点动效，也不要忽明忽暗。
 */
export function applyTouchProfile(root: HTMLElement = document.documentElement): boolean {
  if (typeof window === 'undefined') return false
  const touch = isTouchProfile()
  // 同理单调：`.hos-touch` 一旦挂上就不再摘（旧实现是 toggle，会在媒体查询改口时来回摘挂）。
  if (touch) root.classList.add('hos-touch')

  const next = resolveMotionTier(touch)
  const prev = root.dataset['hosMotion'] as MotionTier | undefined
  const keepPrev = prev != null && prev in TIER_RANK && TIER_RANK[prev] < TIER_RANK[next]
  root.dataset['hosMotion'] = keepPrev ? (prev as MotionTier) : next
  return touch
}

/**
 * 让档位跟着判据走：**页面存活期间**媒体查询改口时重算一次（只会往下降）。
 *
 * 幂等：重复调用只是多挂几个监听，重算本身无副作用。
 *
 * @param root - 要挂 / 摘 class、写属性的根元素，默认 `<html>`。
 */
export function watchTouchMotion(root: HTMLElement = document.documentElement): void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  const replan = () => {
    applyTouchProfile(root)
  }
  for (const query of [...TOUCH_MEDIA_QUERIES, '(prefers-reduced-motion: reduce)']) {
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