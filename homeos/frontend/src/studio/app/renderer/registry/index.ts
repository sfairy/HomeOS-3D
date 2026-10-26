import { renderFlowLine } from "./flow-line";
import { renderInteraction3d } from "../../bridge/bridge";
import {
  prewarmCameraMedia,
  mountCameraMedia,
  cameraRecordNeedsHlsPrewarm,
  normalizeGo2rtcTarget,
} from "./camera-media";
export {
  prewarmCameraMedia,
  mountCameraMedia,
  cameraRecordNeedsHlsPrewarm,
  normalizeGo2rtcTarget,
};
export { renderLineChartDetails } from "./line-chart-details";

export { setBuiltinAssetVersions, staticAssetImageSource } from "./asset-state";

export {
  lightStatisticsEntityStateStatus,
  lightStatisticsEntitySupport,
} from "../controls/light-statistics-runtime";
export { formatLineChartValue } from "../controls/line-chart-runtime";
export {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
} from "../controls/door-window-runtime";
export { formatPresenceDuration } from "../controls/presence-runtime";
export {
  presenceHistoryBuckets,
  presenceMotionEventConfig,
  presenceSensorPresentation,
  presenceStateTimestamp,
} from "../controls/presence-runtime";

export {
  coverComponentIsDream,
  iconButtonEffectLightVisualAwaiting,
  iconButtonEffectLightVisualState,
  vacuumMapImageSource,
} from "./cover-climate-state";
export { renderAirConditionerAirflowLayer } from "./airflow";
export { renderIconButtonEffectLayer } from "./icon-button-effect-layer";

import { installRegistryComponents, loadComponentFamilies } from "./register-all";

export {
  componentFamilyByType,
  componentFamiliesForDocument,
  componentFamiliesForTypes,
} from "./register-all";
const rendererByComponentType = new Map<string, any>();

function registerComponent(componentType: any, componentDefinition: any) {
  rendererByComponentType.set(componentType, componentDefinition);
}

registerComponent("interaction3d", {
  render: renderInteraction3d,
});
registerComponent("flow-line", {
  render: renderFlowLine,
});

installRegistryComponents(registerComponent);

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
  return loadComponentFamilies(registerComponent, families);
}

export function renderRegisteredComponent(componentProps: any, renderEnvironment: any) {
  const registeredRenderer = rendererByComponentType.get(componentProps.type);
  if (registeredRenderer) return registeredRenderer.render(componentProps, renderEnvironment);
  const unknownComponentBox = document.createElement("div");
  unknownComponentBox.className = "hb-unknown-component";
  const unknownComponentTitle = document.createElement("strong");
  unknownComponentTitle.textContent = "控件尚未实现";
  const unknownComponentTypeElement = document.createElement("span");
  return (
    (unknownComponentTypeElement.textContent = componentProps.type),
    unknownComponentBox.append(unknownComponentTitle, unknownComponentTypeElement),
    unknownComponentBox
  );
}
