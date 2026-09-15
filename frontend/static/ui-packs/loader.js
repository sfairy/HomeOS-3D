import {
  applyUiPackToDocument,
  createComponentFromTemplate,
  dateComponentDimensions,
  hasUiPackDefinition,
  listComponentTemplates,
  registerComponentTemplate,
  registerUiPackDefinition,
  timeComponentDimensions,
  weatherComponentDimensions
} from "../templates/component-templates.js?v=20260915211726";
const runtimePromisesByPackId = new Map();
export async function ensureUiPackRuntime(uiPack) {
  if (!uiPack?.id) {
    throw new Error("UI 方案信息不完整。");
  }
  if (runtimePromisesByPackId.has(uiPack.id)) {
    return runtimePromisesByPackId.get(uiPack.id);
  }
  const runtimePromise = (async () => {
    if (uiPack.runtimeUrl) {
      const runtimeModule = await import(uiPack.runtimeUrl);
      if (typeof runtimeModule.registerUIPackRuntime == "function") {
        await runtimeModule.registerUIPackRuntime({
          registerComponentTemplate: registerComponentTemplate,
          registerUiPackDefinition: registerUiPackDefinition
        });
      }
    }
    if (!hasUiPackDefinition(uiPack.id)) {
      throw new Error("UI 方案“" + (uiPack.name || uiPack.id) + "”运行时注册失败。");
    }
    return uiPack;
  })().catch(loadError => {
    runtimePromisesByPackId.delete(uiPack.id);
    throw loadError;
  });
  runtimePromisesByPackId.set(uiPack.id, runtimePromise);
  return runtimePromise;
}
export {
  applyUiPackToDocument as applyUiPackToDocument,
  createComponentFromTemplate as createComponentFromTemplate,
  dateComponentDimensions as dateComponentDimensions,
  listComponentTemplates as listComponentTemplates,
  timeComponentDimensions as timeComponentDimensions,
  weatherComponentDimensions as weatherComponentDimensions
};
