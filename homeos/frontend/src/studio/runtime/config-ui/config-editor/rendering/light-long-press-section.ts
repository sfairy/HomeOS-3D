/**
 * 配置面板里灯光的「长按打开弹窗」分区（0.8.8 `config-editor.js` 的 light 分支）。
 *
 * 单独成文件的两个原因：
 * 1. `panel-assembly.ts` 的 `renderPanel` 已贴着复杂度基线（284），再内联一段带回调的
 *    表单项就会顶破；拆出来后主函数只多一行调用。
 * 2. 秒数的区间 / 默认值必须与运行时共用 `light-long-press.ts` 那一份契约，
 *    放在这里也便于「只改文案与一个字段」的评审。
 */

import { LIGHT_LONG_PRESS_SECONDS, lightLongPressSeconds } from '@app/shared/util/light-long-press'

/** 只声明本分区用到的宿主能力（真实实现来自配置编辑器，结构上满足）。 */
export interface LightLongPressSectionDeps {
  /** 当前设备种类：非 `light` 直接跳过（只有灯光有长按档）。 */
  deviceKind?: string
  createElement: (tag: string, className?: string, text?: string) => HTMLElement
  createSettingRow: (container: HTMLElement, label: string, control: HTMLElement) => HTMLElement
  createNumberRow: (
    container: HTMLElement,
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (value: number) => void,
  ) => HTMLElement
  container: HTMLElement
  vector: { longPressOpensPanel?: boolean; longPressSeconds?: number }
  refreshEditorPreview: () => void
}

/** 追加「长按打开弹窗」开关与「长按时间（秒）」数值行（关闭开关时隐藏数值行）。 */
export function appendLightLongPressSettings(deps: LightLongPressSectionDeps): void {
  if (deps.deviceKind !== 'light') return
  const { createElement, createSettingRow, createNumberRow, container, vector, refreshEditorPreview } = deps
  const longPressCheckbox = createElement('input') as HTMLInputElement
  Object.assign(longPressCheckbox, {
    type: 'checkbox',
    checked: vector.longPressOpensPanel === true,
  })
  createSettingRow(container, '长按打开弹窗', longPressCheckbox)
  const secondsContainer = createElement('div')
  secondsContainer.hidden = !longPressCheckbox.checked
  container.append(secondsContainer)
  createNumberRow(
    secondsContainer,
    '长按时间（秒）',
    lightLongPressSeconds(vector.longPressSeconds),
    LIGHT_LONG_PRESS_SECONDS.min,
    LIGHT_LONG_PRESS_SECONDS.max,
    LIGHT_LONG_PRESS_SECONDS.step,
    (pickedSeconds: number) => {
      vector.longPressSeconds = pickedSeconds
      refreshEditorPreview()
    },
  )
  longPressCheckbox.addEventListener('change', () => {
    vector.longPressOpensPanel = longPressCheckbox.checked
    secondsContainer.hidden = !longPressCheckbox.checked
    refreshEditorPreview()
  })
}
