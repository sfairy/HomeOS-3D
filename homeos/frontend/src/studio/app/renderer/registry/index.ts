import { renderFlowLine } from './flow-line'
import { renderInteraction3d } from '../../bridge/bridge'
import type {
  PageBackgroundPosition,
  PAGE_BACKGROUND_TYPE as PageBackgroundTypeName,
} from '@app/shared/page-background'
import { mountPageBackgroundLayer } from '../controls/page-background-layer'
import { staticAssetImageSource } from './asset-state'
import {
  prewarmCameraMedia,
  mountCameraMedia,
  cameraRecordNeedsHlsPrewarm,
  normalizeGo2rtcTarget,
} from './camera-media'
export { prewarmCameraMedia, mountCameraMedia, cameraRecordNeedsHlsPrewarm, normalizeGo2rtcTarget }
export { renderLineChartDetails } from './line-chart-details'

export { setBuiltinAssetVersions, staticAssetImageSource } from './asset-state'

export {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
} from '../controls/light-statistics-runtime'
export { formatLineChartValue } from '../controls/line-chart-runtime'
export {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
} from '../controls/door-window-runtime'
export { formatPresenceDuration } from '../controls/presence-runtime'
export {
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
} from '../controls/presence-runtime'

export {
  coverComponentIsDream,
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  vacuumMapImageSource,
} from './cover-climate-state'
export { renderAirConditionerAirflowLayer } from './airflow'
export { renderIconButtonEffectLayer } from './icon-button-effect-layer'

import { installRegistryComponents, loadComponentFamilies } from './register-all'

import { domElement } from '@app/shared/util/dom-factory'
export {
  componentFamilyByType,
  componentFamiliesForDocument,
  componentFamiliesForTypes,
} from './register-all'
const rendererByComponentType = new Map<string, any>()

function registerComponent(componentType: any, componentDefinition: any) {
  rendererByComponentType.set(componentType, componentDefinition)
}

registerComponent('interaction3d', {
  render: renderInteraction3d,
})
registerComponent('flow-line', {
  render: renderFlowLine,
})
// 页面背景（0.9.0）：主页面宿主。侧边栏走 `RightSidebar.vue` 的同一份渲染实现。
// 它是纯装饰层，不参与命中，因此不需要进「组件族」——不会拖慢展示端首屏。
//
// ⚠ 类型名在这里写**字面量**，不从 `../controls/page-background-layer` 导入常量：
// 那个模块与 `registry/index.ts` 落在同一个 shared 环里（`entriesAware` 兜底组），
// 模块顶层读它导出的 `const` 在环内求值顺序不利时是 `undefined` —— 注册表会拿到
// `undefined` 作为 key（组件静默消失，或直接抛 TypeError）。
// 用 `typeof` 做编译期等价断言：真源仍然是 `@app/shared/page-background` 的
// `PAGE_BACKGROUND_TYPE`，谁改了两边不一致，typecheck 立刻报错。
const PAGE_BACKGROUND_COMPONENT_TYPE: typeof PageBackgroundTypeName = 'page-background'
registerComponent(PAGE_BACKGROUND_COMPONENT_TYPE, {
  render(
    pageBackgroundComponent: { properties?: unknown; position?: PageBackgroundPosition } | undefined,
    renderEnvironment: any,
  ) {
    return mountPageBackgroundLayer({
      background: pageBackgroundComponent?.properties ?? pageBackgroundComponent,
      component: pageBackgroundComponent,
      canvas: renderEnvironment?.document?.canvas,
      resolveAssetUrl: staticAssetImageSource,
      editable: renderEnvironment?.editable === true,
    })
  },
})

installRegistryComponents(registerComponent)

/**
 * 组件族按 chunk 懒加载，由调用方决定要哪些：
 *
 * - 编辑器（可插入任意类型）：不传 `families`，全量加载；
 * - 展示端：传草稿里实际出现的族，没出现的族一个字节都不下载。
 *
 * 这里**不能**在模块顶层启动全量加载：`registry/index.ts` 同时被展示端引入，模块顶层
 * `import()` 会让展示端无条件下载全部 8 个族。也不能用顶层 await：entry 变成 async 后
 * Vite 的 build-html 插件推算不出静态 import 图，会把所有 chunk 的 CSS 都塞进 index.html
 * （实测首屏 CSS 303 KB → 1.69 MB）。
 *
 * 返回本次新加载的族（已就绪的族不会重复加载，也不会触发额外重渲染）。
 */
export function ensureRegistryComponents(families?: Iterable<string>): Promise<string[]> {
  return loadComponentFamilies(registerComponent, families)
}

export function renderRegisteredComponent(componentProps: any, renderEnvironment: any) {
  const registeredRenderer = rendererByComponentType.get(componentProps.type)
  if (registeredRenderer) return registeredRenderer.render(componentProps, renderEnvironment)
  const unknownComponentBox = domElement(document, 'div', 'hb-unknown-component')
  const unknownComponentTitle = domElement(document, 'strong', null, '控件尚未实现')
  const unknownComponentTypeElement = document.createElement('span')
  return (
    (unknownComponentTypeElement.textContent = componentProps.type),
    unknownComponentBox.append(unknownComponentTitle, unknownComponentTypeElement),
    unknownComponentBox
  )
}
