import { createGeometryPersistentCache } from "./geometry-persistent-cache";
import { createContactShadowPersistentCache } from "./plan/contact-shadow-persistent-cache";
import { contactShadowPreparationKey } from "./plan/contact-shadow-cache-scope";
import { createReflectionPersistentCache } from "./reflection/reflection-persistent-cache";
import {
  createScenePersistentCache,
  scenePreparationKey,
} from "./scene-persistent-cache";
function beginStageStartup({
  env: env = globalThis,
  loadModule: loadModule = () =>
    import("/api/v1/modules/interaction3d/core/stage.js"),
  createCache: createCache = createScenePersistentCache,
} = {}) {
  if (
    env.location?.pathname !==
    "/api/v1/modules/interaction3d/stage.html"
  )
    return null;
  const searchParams = new URLSearchParams(env.location.search),
    sceneId = searchParams.get("sceneId") || "",
    projectId = searchParams.get("projectId") || "",
    scenePath =
      "/modules/interaction3d/scenes/" +
      encodeURIComponent(sceneId) +
      "/current?projectId=" +
      encodeURIComponent(projectId),
    cache = createCache({
      env: env,
    }),
    lightHistoryScope = env.document.body?.dataset.i3dLightHistoryScope,
    studioAppSource =
      env.document.querySelector<HTMLScriptElement>('script[src*="/3d-studio/studio-app.js"]')
        ?.src || "",
    preparationKey = scenePreparationKey(lightHistoryScope, projectId, sceneId, studioAppSource);
  cache.preload(preparationKey);
  const geometryCache = createGeometryPersistentCache({
    env: env,
    key: preparationKey,
  });
  geometryCache.preload();
  const furnitureCache = createGeometryPersistentCache({
    env: env,
    key: preparationKey ? JSON.stringify(["furniture-batches-v1", preparationKey]) : "",
  });
  furnitureCache.preload();
  const shadowCacheKey = contactShadowPreparationKey(
      lightHistoryScope,
      projectId,
      sceneId,
      studioAppSource,
      {
        legacy: searchParams.get("shadow-cache") === "legacy",
      },
    ),
    shadowCache = createContactShadowPersistentCache({
      env: env,
      key: shadowCacheKey,
    });
  shadowCache.preload();
  const reflectionCache =
    searchParams.get("lighting") === "standard"
      ? null
      : createReflectionPersistentCache({
          env: env,
          key: preparationKey,
        });
  reflectionCache?.preload();
  const preparationResponse = env.fetch("/api/v1" + scenePath, {
    cache: "no-store",
    credentials: "same-origin",
  });
  preparationResponse.catch(() => {});
  const stageModule = loadModule();
  return (
    stageModule.catch(() => {}),
    {
      path: scenePath,
      response: preparationResponse,
      module: stageModule,
      cache: cache,
      key: preparationKey,
      geometryCache: geometryCache,
      furnitureCache: furnitureCache,
      shadowCache: shadowCache,
      reflectionCache: reflectionCache,
    }
  );
}
export const stageStartup = beginStageStartup();
