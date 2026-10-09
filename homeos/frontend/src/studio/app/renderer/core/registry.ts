import { renderFlowLine } from "./registry/flow-line";
import { renderPercentageBarControl } from "./registry/percentage-bar";
import { renderInteraction3d } from "../../bridge/bridge";
import {
  prewarmCameraMedia,
  mountCameraMedia,
} from "./registry/camera-media";
export { prewarmCameraMedia, mountCameraMedia };
export { renderLineChartDetails } from "./registry/line-chart-details";

export { setBuiltinAssetVersions, staticAssetImageSource } from "./registry/asset-state";

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
} from "./registry/cover-climate-state";
export { renderAirConditionerAirflowLayer } from "./registry/airflow";
export { renderIconButtonEffectLayer } from "./registry/icon-button-effect-layer";

import { installRegistryComponents } from "./registry/register-all";

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
