import {
  createScenePersistentCache,
  scenePreparationKey,
} from "./scene-persistent-cache";
export function beginStageStartup({
  env: env = globalThis,
  loadModule: loadModule = () =>
    import("/api/v1/modules/interaction3d/core/stage.js"),
  createCache: createCache = createScenePersistentCache,
} = {}) {
  if (
    (env.HomeOSEmbed?.path || env.location?.pathname) !==
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
    preparationKey = scenePreparationKey(
      env.document.body?.dataset.i3dLightHistoryScope,
      projectId,
      sceneId,
      env.document.querySelector<HTMLScriptElement>('script[src*="/3d-studio/studio-app.js"]')
        ?.src || "",
    );
  cache.preload(preparationKey);
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
    }
  );
}
export const stageStartup = beginStageStartup();
