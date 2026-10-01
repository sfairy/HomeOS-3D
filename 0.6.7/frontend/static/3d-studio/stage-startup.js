import {
  createScenePersistentCache,
  scenePreparationKey,
} from "./scene-persistent-cache.js?v=20260923-v1";
export function beginStageStartup({
  env: env = globalThis,
  loadModule: loadModule = () =>
    import("../../api/v1/modules/interaction3d/stage.js?v=20260930-floor-shadow-device-pose-v1-20260929-focus-pacing-v1-20260929-animation-work-v1-20260929-neutral-preparation-v1-20260928-courtyard-no-reflection-early-settle-v1-20260928-first-navigation-clock-v1-20260928-control-binding-v1-20260927-background-uniform-reuse-v1-20260927-follow-ui-v1-20260927-source-adoption-v1-20260926-label-opacity-v1-20260925-tv-bound-only-v1-floor-batch-v1-vacuum-v3-focus-start-v1-touch-v2-floor-prepare-v1-focus-soft-start-v1-diagnostics-removed-v1-light-menu-v2-20260926-speaker-clean-v6-20260926-focus-zoom-v1-speaker-marker-v2-20260926-fan-v1-20260926-airer-v4-vehicles-v3-20260926-focus-depth-v1-model-emphasis-v1-airer-no-halo-v1-presence-60fps-no-reflection-v2-warm-outside-floor-scope-v1-background-cache-v1-runtime-load-v1-focus-return-v1-reload-diagnostics-v2-category-marker-bounds-v1-visibility-marker-bounds-v1-focus-return-timing-v2-hidden-pulse-v1-cap-60fps-rug-wall-v1"),
  createCache: createCache = createScenePersistentCache,
} = {}) {
  if (
    (env.HABridgeEmbed?.path || env.location?.pathname) !==
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
      env.document.querySelector('script[src*="/3d-studio/studio-app.js"]')?.src || "",
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
