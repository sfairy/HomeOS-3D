import { applyTreeTextureAnisotropy, isLegacyTextureQuality, textureAnisotropyFor } from '../render-kit/texture-quality'

type DisposableResource = { dispose?: () => void }

type TextureLike = DisposableResource & { isTexture?: boolean }
type TextureBearingMaterial = DisposableResource & { [materialProperty: string]: unknown }

export function releaseModelAsset(modelAsset: any) {
  const rootObjectSet = new Set([
      modelAsset?.preparedTemplate?.source,
      modelAsset?.source,
      modelAsset?.scene,
      ...(modelAsset?.scenes || []),
    ]),
    meshGeometrySet = new Set<DisposableResource>(),
    meshMaterialSet = new Set<TextureBearingMaterial>(),
    textureSet = new Set<TextureLike>()
  for (const rootObject of rootObjectSet)
    rootObject?.traverse?.((traversedObject: any) => {
      traversedObject.geometry && meshGeometrySet.add(traversedObject.geometry)
      for (const meshMaterial of [traversedObject.material].flat().filter(Boolean)) {
        meshMaterialSet.add(meshMaterial)
        for (const materialPropertyValue of Object.values(meshMaterial)) {
          const textureCandidate = materialPropertyValue as TextureLike | undefined
          textureCandidate?.isTexture && textureSet.add(textureCandidate)
        }
      }
    })
  for (const disposableResource of [...meshGeometrySet, ...meshMaterialSet, ...textureSet])
    disposableResource.dispose?.()
}
const legacyTextureQuality = isLegacyTextureQuality()

/** 解析完成、首次上传之前补齐各向异性（GLTFLoader 默认 1）。 */
function applyLoadedTextureQuality<T extends { scene?: unknown; scenes?: unknown[] }>(
  parsedModel: T,
  renderer: unknown,
) {
  if (legacyTextureQuality || !renderer) return parsedModel
  const anisotropy = textureAnisotropyFor(renderer as Parameters<typeof textureAnisotropyFor>[0])
  for (const scene of parsedModel?.scenes || [parsedModel?.scene])
    applyTreeTextureAnisotropy(scene as Parameters<typeof applyTreeTextureAnisotropy>[0], anisotropy)
  return parsedModel
}

export function createModelAssetLoader({
  THREE: three,
  GLTFLoader: gltfLoaderClass,
  resolveGLTFLoader: resolveGLTFLoader = null,

  createDracoLoader: dracoLoaderFactory = (_manager: any) => null,
  requestTimeoutMs: requestTimeoutMs = 60000,
  fetchImpl: fetchImpl = globalThis.fetch,
  resolveURL: resolveAssetUrl = (assetUrl: any) => assetUrl,
  scheduleDeadline: scheduleDeadline = setTimeout,
  cancelDeadline: cancelDeadline = clearTimeout,
  getRenderer: getRenderer = () => null,
}: any) {
  const loaderPool: any = [],
    pendingAbortSet = new Set<(abortReason?: unknown) => void>(),
    effectiveTimeoutMs = Math.max(50, Number(requestTimeoutMs) || 60000)
  let isDisposed = false
  // B21：GLTFLoader（three addon，~26KB gzip）只在真正要加载模型时才拉取；这里缓存
  // 解析后的 Promise，并发加载共用一次网络请求，失败清缓存以便弱网恢复后重试。
  let gltfLoaderClassPromise: Promise<unknown> | null = null
  function ensureGLTFLoaderClass() {
    if (gltfLoaderClass) return Promise.resolve(gltfLoaderClass)
    if (!resolveGLTFLoader) return Promise.reject(new Error('模型加载器缺少 GLTFLoader 提供者'))
    if (!gltfLoaderClassPromise) {
      gltfLoaderClassPromise = Promise.resolve()
        .then(() => resolveGLTFLoader())
        .then((resolvedLoaderClass) => {
          if (!resolvedLoaderClass) throw new Error('GLTFLoader 动态加载失败')
          return (gltfLoaderClass = resolvedLoaderClass)
        })
        .catch((loadError: unknown) => {
          gltfLoaderClassPromise = null
          throw loadError
        })
    }
    return gltfLoaderClassPromise
  }
  function createLoaderBundle() {
    const loadTracker = new three.LoadingManager()
    loadTracker.setURLModifier(resolveAssetUrl)
    // 贴图失败必须留痕：GLTFLoader 对贴图是静默 `catch → null`，材质会安静地丢掉
    // `map`，模型照常显示成纯色壳（`car_tms` 就因此整台车变白）。没有这条日志，
    // 这类问题只能靠肉眼比对贴图才能发现。
    loadTracker.onError = (assetUrl: any) => {
      console.error('[3D-model] 资源加载失败，材质可能缺少贴图：', assetUrl)
    }
    const dracoLoader = dracoLoaderFactory(loadTracker),
      gltfLoader = new gltfLoaderClass(loadTracker)
    return (
      dracoLoader && gltfLoader.setDRACOLoader(dracoLoader),
      {
        manager: loadTracker,
        decoder: dracoLoader,
        loader: gltfLoader,
        retired: false,
      }
    )
  }
  function retireLoaderBundle(bundleToRetire: any) {
    bundleToRetire.retired ||
      ((bundleToRetire.retired = true), bundleToRetire.manager.abort(), bundleToRetire.decoder?.dispose())
  }
  async function loadModelAsync(modelUrl: any) {
    if (isDisposed) throw new DOMException('模型加载器已关闭', 'AbortError')
    // 先确保 GLTFLoader 就位（首次会动态拉取），再取/建 loader 实例。
    await ensureGLTFLoaderClass()
    const loaderBundle = loaderPool.pop() || createLoaderBundle(),
      abortController = new AbortController()
    let abortPendingLoad: any, timeoutId: any
    const loadPromise = new Promise((resolveLoad, rejectLoad) => {
      ;(abortPendingLoad = (abortReason: any) => {
        abortController.abort(abortReason), retireLoaderBundle(loaderBundle), rejectLoad(abortReason)
      }),
        (timeoutId = scheduleDeadline(
          () => abortPendingLoad(new DOMException('模型加载超时，已取消并释放加载名额', 'TimeoutError')),
          effectiveTimeoutMs,
        )),
        (async () => {
          const response = await fetchImpl(resolveAssetUrl(modelUrl), {
            signal: abortController.signal,
            credentials: 'same-origin',
          })
          if (!response.ok) {
            const responseError = new Error('模型请求失败：HTTP ' + response.status) as Error & {
              response?: unknown
            }
            throw ((responseError.response = response), responseError)
          }
          const modelBuffer = await response.arrayBuffer()
          if (abortController.signal.aborted) throw abortController.signal.reason
          const basePath = modelUrl.slice(0, modelUrl.lastIndexOf('/') + 1)
          return await loaderBundle.loader.parseAsync(modelBuffer, basePath)
        })().then(
          (parsedModel) => {
            abortController.signal.aborted
              ? releaseModelAsset(parsedModel)
              : resolveLoad(applyLoadedTextureQuality(parsedModel, getRenderer()))
          },
          (loadError) => {
            retireLoaderBundle(loaderBundle), rejectLoad(loadError)
          },
        )
    })
    return (
      pendingAbortSet.add(abortPendingLoad),
      loadPromise.finally(() => {
        cancelDeadline(timeoutId),
          pendingAbortSet.delete(abortPendingLoad),
          !isDisposed && !loaderBundle.retired && loaderPool.push(loaderBundle)
      })
    )
  }
  function disposeModelAssetLoader() {
    if (!isDisposed) {
      isDisposed = true
      for (const abortCallback of pendingAbortSet) abortCallback(new DOMException('模型加载器已关闭', 'AbortError'))
      for (const pooledLoaderBundle of loaderPool.splice(0)) retireLoaderBundle(pooledLoaderBundle)
    }
  }
  return {
    loadAsync: loadModelAsync,
    dispose: disposeModelAssetLoader,
  }
}
