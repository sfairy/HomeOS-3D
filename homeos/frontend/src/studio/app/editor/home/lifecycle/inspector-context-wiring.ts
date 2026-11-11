/* 四份检查器上下文（图标按钮 / 导航 / 折线图 / 空调）。
 *
 * deps 是引导体传入的 `{ ...homeElements, ...依赖 }`：DOM 句柄与 Map/Set 容器在引导期
 * 就已就绪且不再替换，按值拷贝即可；只有编辑器状态（当前工程、选中集、渲染器）会变，
 * 必须走 getter 实时读取 editorCtx。检查器只读上下文，四份互不共享对象。
 */

import type { IconButtonInspectorContext } from '../../inspectors/home/home-icon-button-inspector'
import type { NavigationInspectorContext } from '../../inspectors/home/home-navigation-inspector'
import type { LineChartInspectorContext } from '../../inspectors/home/home-line-chart-inspector'
import type { AirConditionerInspectorContext } from '../../inspectors/home/home-air-conditioner-inspector'

interface InspectorContextsBootResult {
  iconButtonInspectorContext: IconButtonInspectorContext
  navigationInspectorContext: NavigationInspectorContext
  lineChartInspectorContext: LineChartInspectorContext
  airConditionerInspectorContext: AirConditionerInspectorContext
}

export function createInspectorContexts(deps: Record<string, any>): InspectorContextsBootResult {
  const { editorCtx } = deps
  const withEditorState = () =>
    ({
      ...deps,
      get activeProject() {
        return editorCtx.activeProject
      },
      get selectedComponentIdsSet() {
        return editorCtx.selectedComponentIdsSet
      },
      get editorRenderer() {
        return editorCtx.editorRenderer
      },
    }) as IconButtonInspectorContext &
      NavigationInspectorContext &
      LineChartInspectorContext &
      AirConditionerInspectorContext
  return {
    iconButtonInspectorContext: withEditorState(),
    navigationInspectorContext: withEditorState(),
    lineChartInspectorContext: withEditorState(),
    airConditionerInspectorContext: withEditorState(),
  }
}
