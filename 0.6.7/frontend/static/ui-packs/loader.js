import {
  applyUiPackToDocument,
  createComponentFromTemplate,
  dateComponentDimensions,
  hasUiPackDefinition,
  listComponentTemplates,
  registerComponentTemplate,
  registerUiPackDefinition,
  timeComponentDimensions,
  weatherComponentDimensions,
} from "../templates/component-templates.js?v=20260814-effect-image-align-v45-20260815-component-thumbnails-v2-20260822-light-feedback-controls-v1-20260824-light-statistics-v4-20260828-count-statistics-v1-20260901-camera-snapshot-v1-20260902-floorplan-auto-diagram-v12-20260904-auto-diagram-floor-v1-20260908-environment-v1-20260908-lighting-mode-v1-20260926-scene-mode-v3-20260930-flow-line-sign-v1-20260930-percentage-text-offset-v1";
const runtimePromisesById = new Map();
export async function ensureUiPackRuntime(packDefinition) {
  if (!packDefinition?.id) throw new Error("UI 方案信息不完整。");
  if (runtimePromisesById.has(packDefinition.id)) return runtimePromisesById.get(packDefinition.id);
  const pendingRuntime = (async () => {
    if (packDefinition.runtimeUrl) {
      const runtimeModule = await import(
        globalThis.HABridgeEmbed?.url(packDefinition.runtimeUrl) || packDefinition.runtimeUrl
      );
      typeof runtimeModule.registerUIPackRuntime == "function" &&
        (await runtimeModule.registerUIPackRuntime({
          registerComponentTemplate: registerComponentTemplate,
          registerUiPackDefinition: registerUiPackDefinition,
        }));
    }
    if (!hasUiPackDefinition(packDefinition.id))
      throw new Error(
        "UI 方案“" + (packDefinition.name || packDefinition.id) + "”运行时注册失败。",
      );
    return packDefinition;
  })().catch((loadError) => {
    throw (runtimePromisesById.delete(packDefinition.id), loadError);
  });
  return (runtimePromisesById.set(packDefinition.id, pendingRuntime), pendingRuntime);
}
export {
  applyUiPackToDocument,
  createComponentFromTemplate,
  dateComponentDimensions,
  listComponentTemplates,
  timeComponentDimensions,
  weatherComponentDimensions,
};
