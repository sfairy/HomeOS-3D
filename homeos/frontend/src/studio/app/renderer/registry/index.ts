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
 * 组件族按 chunk 并发加载，渲染前由 `startupStudio` 等待就绪。
 *
 * 这里**不能**用顶层 await：entry 变成 async 后 Vite 的 build-html 插件推算不出静态
 * import 图，会把所有 chunk 的 CSS 都塞进 index.html（实测首屏 CSS 303 KB → 1.69 MB）。
 */
export const registryReady: Promise<void> = loadComponentFamilies(registerComponent);

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
