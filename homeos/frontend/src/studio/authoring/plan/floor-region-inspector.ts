/**
 * 地面分区检查器的**表现层**（0.9.0 `studio-floor-region-editor.js`）。
 *
 * ## 为什么单独成模块
 *
 * 检查器的 DOM 在 `StudioView.vue` 里（标记必须常驻，boot 按固定 id 绑定），
 * 但它要读的东西 —— 当前选中分区的铺面、本层色档、场景风格 —— 都在 authoring 侧。
 * 把这些判定写成**纯函数**，DOM 绑定只负责把结果贴上去：
 * 文案与 `aria-*` 的正确性能在这里直接断言，不用起浏览器。
 *
 * ## 0.9.0 的三处行为变化
 *
 * 1. **深浅改数字步进**：`−20 … +20`，0 为默认。原来的滑条 + `<output>` 读数被替换，
 *    因为「−3 到 −4」这种相邻档位在滑条上根本分辨不出来；
 * 2. **铺面改名**：`原色 → 木地板`、`浅色 → 瓷砖`。名字要说清材质，不要只说深浅 ——
 *    用户以为「浅色」是色档，其实是瓷砖；
 * 3. **自然木语独占瓷砖**：只有自然木语那套木纹配方同时给了瓷砖色档，其它风格下
 *    瓷砖按钮隐藏，`theme` 按钮文案改成「跟随主题」。
 */

import {
  type FloorFinish,
  type FloorToneKind,
  FLOOR_TONE_LIMIT,
  clampFloorTone,
  floorFinishToneKind,
} from './studio-floor'

/** 检查器里三个铺面按钮的顺序（与标记一致）。 */
export const FLOOR_FINISH_BUTTONS: readonly FloorFinish[] = Object.freeze(['theme', 'wood', 'tile'])

/** 全部铺面按钮的文案与显隐。 */
export type FloorFinishButtonCopy = {
  finish: FloorFinish
  label: string
  hidden: boolean
  pressed: boolean
}

/** 检查器要贴到 DOM 上的全部内容。 */
export type FloorRegionInspectorView = {
  /** 三个铺面按钮（顺序同 `FLOOR_FINISH_BUTTONS`）。 */
  buttons: FloorFinishButtonCopy[]
  /** 深浅输入是否可见（未选中分区 / 铺面不支持调色时隐藏）。 */
  toneVisible: boolean
  /** 深浅输入的值（整数档位）。 */
  toneValue: number
  /** 深浅输入的上下限，供 DOM 的 `min` / `max` 属性直接用。 */
  toneMin: number
  toneMax: number
  /** 深浅这一行在说什么（「木地板深浅」/「瓷砖深浅」）。 */
  toneLabel: string
  /** 复位按钮是否禁用（已经是 0 档）。 */
  toneResetDisabled: boolean
  /** 「移除分区」是否可用（只剩一块时不可用）。 */
  canRemove: boolean
}

/** 该场景风格是否使用自然木语那套木纹 / 瓷砖配方。 */
export function isNaturalWoodStyle(sceneStyle: string | null | undefined): boolean {
  return sceneStyle === 'natural-wood'
}

/**
 * 铺面按钮文案。
 *
 * `theme` 在自然木语下叫「跟随主题」（它跟随的就是这套自然木语），
 * 其它风格下叫「原色」（跟随的是默认木色）。混用会让用户点错。
 */
export function floorFinishButtonLabel(finish: FloorFinish, sceneStyle: string | null | undefined): string {
  const naturalWood = isNaturalWoodStyle(sceneStyle)
  if (finish === 'wood') return '木地板'
  if (finish === 'tile') return naturalWood ? '瓷砖' : '浅色'
  return naturalWood ? '跟随主题' : '原色'
}

/** 瓷砖只在自然木语下可选（其它风格没有对应的瓷砖色档配方）。 */
export function floorFinishButtonHidden(finish: FloorFinish, sceneStyle: string | null | undefined): boolean {
  return finish === 'tile' && !isNaturalWoodStyle(sceneStyle)
}

/**
 * 算出检查器要显示的全部内容。
 *
 * @param selected 选中分区的状态；`null` 表示没选中（检查器整体已隐藏，这里只给出安全默认）
 */
export function floorRegionInspectorView(
  selected: { finish: FloorFinish; canRemove: boolean } | null,
  tones: Partial<Record<FloorToneKind, number>>,
  sceneStyle: string | null | undefined,
): FloorRegionInspectorView {
  const finish = selected?.finish ?? 'theme',
    toneKind = floorFinishToneKind(finish, String(sceneStyle || 'default')),
    supportsTone = finish === 'wood' || finish === 'tile',
    toneValue = supportsTone ? clampFloorTone(tones[toneKind] ?? 0) : 0
  return {
    buttons: FLOOR_FINISH_BUTTONS.map((buttonFinish) => ({
      finish: buttonFinish,
      label: floorFinishButtonLabel(buttonFinish, sceneStyle),
      hidden: floorFinishButtonHidden(buttonFinish, sceneStyle),
      pressed: buttonFinish === finish,
    })),
    toneVisible: !!selected && supportsTone,
    toneValue,
    toneMin: -FLOOR_TONE_LIMIT,
    toneMax: FLOOR_TONE_LIMIT,
    toneLabel: (toneKind === 'tile' ? '瓷砖' : '木地板') + '深浅',
    toneResetDisabled: toneValue === 0,
    canRemove: selected?.canRemove === true,
  }
}

/** 把视图贴到检查器 DOM 上（幂等：同一份视图重复调用不会产生副作用）。 */
export function paintFloorRegionInspector(root: ParentNode, view: FloorRegionInspectorView): void {
  for (const button of view.buttons) {
    const buttonElement = root.querySelector<HTMLButtonElement>(`[data-floor-finish="${button.finish}"]`)
    if (!buttonElement) continue
    buttonElement.textContent = button.label
    buttonElement.hidden = button.hidden
    buttonElement.setAttribute('aria-pressed', String(button.pressed))
  }
  const toneFields = root.querySelector<HTMLElement>('[data-floor-tone-fields]'),
    toneInput = root.querySelector<HTMLInputElement>('#floor-tone-input'),
    toneReset = root.querySelector<HTMLButtonElement>('[data-floor-tone-reset]'),
    toneLabel = root.querySelector<HTMLElement>('[data-floor-tone-label]'),
    removeButton = root.querySelector<HTMLButtonElement>('[data-floor-region-remove]')
  if (toneFields) toneFields.hidden = !view.toneVisible
  if (toneInput) {
    // 只在值真的变了才写：正在输入的中间态（例如只打下「-」）不该被覆盖。
    if (toneInput !== root.ownerDocument?.activeElement && Number(toneInput.value) !== view.toneValue)
      toneInput.value = String(view.toneValue)
    toneInput.min = String(view.toneMin)
    toneInput.max = String(view.toneMax)
    toneInput.disabled = !view.toneVisible
  }
  if (toneReset) toneReset.disabled = view.toneResetDisabled
  if (toneLabel) toneLabel.textContent = view.toneLabel
  if (removeButton) removeButton.disabled = !view.canRemove
}
