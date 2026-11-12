/*
 * 编辑器元素查询链的**汇总入口**（853 项）。
 *
 * 为什么拆成按面板族的多个文件：这里原本是单个 1,727 行的函数，前半是 853 条
 * `const x = findElement(...)`、后半是 853 项 `return`，两半严格一一对应。
 * 单个函数体没有任何分组，改一处要在 1,727 行里定位；按面板族拆开后，
 * 「这个元素属于哪个面板」由所在文件回答，新增元素只改对应族。
 *
 * 调用面不变：仍从本文件导入 `queryEditorElements(findElement)`，返回对象形状一致。
 */
import type { ElementQuery } from './types'
import { chromeEditorElements } from './chrome'
import { inspectorsNavigationElements } from './inspectors-navigation'
import { inspectorsClimateElements } from './inspectors-climate'
import { inspectorsChartsElements } from './inspectors-charts'
import { inspectorsDevicesElements } from './inspectors-devices'

export function queryEditorElements(findElement: ElementQuery) {
  return {
    ...chromeEditorElements(findElement),
    ...inspectorsNavigationElements(findElement),
    ...inspectorsClimateElements(findElement),
    ...inspectorsChartsElements(findElement),
    ...inspectorsDevicesElements(findElement),
  }
}
