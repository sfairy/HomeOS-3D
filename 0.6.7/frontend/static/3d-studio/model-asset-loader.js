export function releaseModelAsset(modelAsset) {
  const rootObjectSet = new Set([
      modelAsset?.preparedTemplate?.source,
      modelAsset?.source,
      modelAsset?.scene,
      ...(modelAsset?.scenes || []),
    ]),
    meshGeometrySet = new Set(),
    meshMaterialSet = new Set(),
    textureSet = new Set();
  for (const rootObject of rootObjectSet)
    rootObject?.traverse?.((traversedObject) => {
      traversedObject.geometry && meshGeometrySet.add(traversedObject.geometry);
      for (const meshMaterial of [traversedObject.material].flat().filter(Boolean)) {
        meshMaterialSet.add(meshMaterial);
        for (const textureCandidate of Object.values(meshMaterial))
          textureCandidate?.isTexture && textureSet.add(textureCandidate);
      }
    });
  for (const disposableResource of [...meshGeometrySet, ...meshMaterialSet, ...textureSet])
    disposableResource.dispose?.();
}
export function createModelAssetLoader({
  THREE: three,
  GLTFLoader: gltfLoaderClass,
  createDracoLoader: dracoLoaderFactory = () => null,
  requestTimeoutMs: requestTimeoutMs = 60000,
  fetchImpl: fetchImpl = globalThis.fetch,
  resolveURL: resolveAssetUrl = (assetUrl) => assetUrl,
  scheduleDeadline: scheduleDeadline = setTimeout,
  cancelDeadline: cancelDeadline = clearTimeout,
}) {
  const loaderPool = [],
    pendingAbortSet = new Set(),
    effectiveTimeoutMs = Math.max(50, Number(requestTimeoutMs) || 60000);
  let isDisposed = false;
  function createLoaderBundle() {
    const loadTracker = new three.LoadingManager();
    loadTracker.setURLModifier(resolveAssetUrl);
    const dracoLoader = dracoLoaderFactory(loadTracker),
      gltfLoader = new gltfLoaderClass(loadTracker);
    return (
      dracoLoader && gltfLoader.setDRACOLoader(dracoLoader),
      {
        manager: loadTracker,
        decoder: dracoLoader,
        loader: gltfLoader,
        retired: false,
      }
    );
  }
  function retireLoaderBundle(bundleToRetire) {
    bundleToRetire.retired ||
      ((bundleToRetire.retired = true),
      bundleToRetire.manager.abort(),
      bundleToRetire.decoder?.dispose());
  }
  function loadModelAsync(modelUrl) {
    if (isDisposed) return Promise.reject(new DOMException("模型加载器已关闭", "AbortError"));
    const loaderBundle = loaderPool.pop() || createLoaderBundle(),
      abortController = new AbortController();
    let abortPendingLoad, timeoutId;
    const loadPromise = new Promise((resolveLoad, rejectLoad) => {
      ((abortPendingLoad = (abortReason) => {
        (abortController.abort(abortReason),
          retireLoaderBundle(loaderBundle),
          rejectLoad(abortReason));
      }),
        (timeoutId = scheduleDeadline(
          () =>
            abortPendingLoad(
              new DOMException("模型加载超时，已取消并释放加载名额", "TimeoutError"),
            ),
          effectiveTimeoutMs,
        )),
        (async () => {
          const response = await fetchImpl(resolveAssetUrl(modelUrl), {
            signal: abortController.signal,
            credentials: "same-origin",
          });
          if (!response.ok) {
            const responseError = new Error("模型请求失败：HTTP " + response.status);
            throw ((responseError.response = response), responseError);
          }
          const modelBuffer = await response.arrayBuffer();
          if (abortController.signal.aborted) throw abortController.signal.reason;
          const basePath = modelUrl.slice(0, modelUrl.lastIndexOf("/") + 1);
          return await loaderBundle.loader.parseAsync(modelBuffer, basePath);
        })().then(
          (parsedModel) => {
            abortController.signal.aborted
              ? releaseModelAsset(parsedModel)
              : resolveLoad(parsedModel);
          },
          (loadError) => {
            (retireLoaderBundle(loaderBundle), rejectLoad(loadError));
          },
        ));
    });
    return (
      pendingAbortSet.add(abortPendingLoad),
      loadPromise.finally(() => {
        (cancelDeadline(timeoutId),
          pendingAbortSet.delete(abortPendingLoad),
          !isDisposed && !loaderBundle.retired && loaderPool.push(loaderBundle));
      })
    );
  }
  function disposeModelAssetLoader() {
    if (!isDisposed) {
      isDisposed = true;
      for (const abortCallback of pendingAbortSet)
        abortCallback(new DOMException("模型加载器已关闭", "AbortError"));
      for (const pooledLoaderBundle of loaderPool.splice(0)) retireLoaderBundle(pooledLoaderBundle);
    }
  }
  return {
    loadAsync: loadModelAsync,
    dispose: disposeModelAssetLoader,
  };
}
