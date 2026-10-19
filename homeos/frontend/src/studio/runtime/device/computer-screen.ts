/**
 * 电脑屏幕贴图（0.7.8 `computer-screen`）。
 *
 * 开机时把 `screenImage` 资源画到屏幕网格的 CanvasTexture 上，
 * 关机时铺纯黑；图片加载失败按指数退避重试，离线/页面隐藏时暂停。
 */

import { computerPower, computerScreenImage } from "../device/computer-state";

const SCREEN_CANVAS_WIDTH = 1024,
  SCREEN_CANVAS_HEIGHT = 576,
  LOAD_TIMEOUT_MS = 15000,
  MAX_RETRY_DELAY_MS = 300000;

const sceneModelKey = (binding: any) => JSON.stringify([binding.floorId, binding.modelId]);

/** 关机画面：纯黑，避免屏幕材质透出场景。 */
function paintOffScreen(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  ((context.fillStyle = "#050609"), context.fillRect(0, 0, canvas.width, canvas.height));
}

export type ComputerScreensController = {
  sync: (payload: { root: any; revision: any; bindings?: any[]; states?: any }) => void;
  setAvailable: (isAvailable: boolean) => void;
  dispose: () => void;
};

export function createComputerScreens({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
}: {
  THREE?: any;
  requestFrame?: (floorIds?: string[]) => void;
}): ComputerScreensController {
  let rootObject: any = null,
    rootRevision: any,
    modelsByKey = new Map<string, any>(),
    screensByKey = new Map<string, any>(),
    isDisposed = false,
    isAvailable = true,
    isOffline = globalThis.navigator?.onLine === false;

  const ownerDocument = globalThis.document,
    ownerWindow = globalThis.window;

  const isScreenActive = (screenRecord: any) =>
    !isDisposed && !screenRecord.removed && isAvailable && !ownerDocument?.hidden && !isOffline;

  /** 清掉加载中的图片与计时器（重试前统一收口）。 */
  function cancelImageLoad(screenRecord: any) {
    (clearTimeout(screenRecord.retry), clearTimeout(screenRecord.timeout));
    screenRecord.retry = screenRecord.timeout = null;
    const pendingImage = screenRecord.loading;
    ((screenRecord.loading = null),
      pendingImage &&
        ((pendingImage.onload = pendingImage.onerror = null), pendingImage.removeAttribute?.("src")));
  }

  function loadScreenImage(screenRecord: any) {
    if (
      !isScreenActive(screenRecord) ||
      !screenRecord.source ||
      screenRecord.image ||
      screenRecord.loading ||
      screenRecord.retry !== null
    )
      return;
    const loadingImage = new Image();
    screenRecord.loading = loadingImage;
    const isStillCurrent = () =>
      screenRecord.loading === loadingImage && isScreenActive(screenRecord);
    loadingImage.onload = () => {
      isStillCurrent() &&
        (clearTimeout(screenRecord.timeout),
        (screenRecord.timeout = null),
        (screenRecord.image = loadingImage),
        (screenRecord.loading = null),
        (screenRecord.failures = 0),
        redrawScreen(screenRecord));
    };
    const handleFailure = () => {
      isStillCurrent() &&
        (cancelImageLoad(screenRecord),
        screenRecord.failures++,
        redrawScreen(screenRecord),
        (screenRecord.retry = setTimeout(
          () => {
            ((screenRecord.retry = null), loadScreenImage(screenRecord));
          },
          Math.min(
            MAX_RETRY_DELAY_MS,
            1000 * 2 ** Math.min(screenRecord.failures - 1, 9),
          ),
        )),
        screenRecord.retry?.["unref"]?.());
    };
    ((loadingImage.onerror = handleFailure),
      (screenRecord.timeout = setTimeout(handleFailure, LOAD_TIMEOUT_MS)),
      screenRecord.timeout?.["unref"]?.(),
      (loadingImage.src = screenRecord.source));
  }

  /** 在线/可见性变化后重新调度所有屏幕的加载队列。 */
  function refreshLoadQueue() {
    for (const screenRecord of screensByKey.values())
      isScreenActive(screenRecord)
        ? loadScreenImage(screenRecord)
        : cancelImageLoad(screenRecord);
  }
  const handleOnline = () => {
    isOffline = false;
    for (const screenRecord of screensByKey.values())
      !screenRecord.image &&
        !screenRecord.loading &&
        (clearTimeout(screenRecord.retry), (screenRecord.retry = null));
    refreshLoadQueue();
  };
  const handleOffline = () => {
    ((isOffline = true), refreshLoadQueue());
  };
  (ownerWindow?.addEventListener?.("online", handleOnline),
    ownerWindow?.addEventListener?.("offline", handleOffline),
    ownerDocument?.addEventListener?.("visibilitychange", refreshLoadQueue));

  /** 重绘屏幕贴图：黑底 + 等比居中的屏幕图。 */
  function redrawScreen(screenRecord: any) {
    if (isDisposed || screenRecord.removed || !screenRecord.screen || !isAvailable) return;
    const { canvas, context } = screenRecord;
    paintOffScreen(canvas, context);
    if (screenRecord.on && screenRecord.image) {
      const imageScale = Math.min(
          canvas.width / screenRecord.image.naturalWidth,
          canvas.height / screenRecord.image.naturalHeight,
        ),
        drawnWidth = screenRecord.image.naturalWidth * imageScale,
        drawnHeight = screenRecord.image.naturalHeight * imageScale;
      context.drawImage(
        screenRecord.image,
        (canvas.width - drawnWidth) / 2,
        (canvas.height - drawnHeight) / 2,
        drawnWidth,
        drawnHeight,
      );
    }
    ((screenRecord.texture.needsUpdate = true), requestFrame([screenRecord.floorId]));
  }

  function disposeScreenRecord(screenKey: string, screenRecord: any) {
    screenRecord &&
      !screenRecord.removed &&
      ((screenRecord.removed = true),
      screenRecord.screen.material === screenRecord.material &&
        (screenRecord.screen.material = screenRecord.original),
      cancelImageLoad(screenRecord),
      screenRecord.texture.dispose(),
      screenRecord.material.dispose(),
      screensByKey.get(screenKey) === screenRecord && screensByKey.delete(screenKey));
  }

  return {
    sync({ root, revision, bindings = [], states = {} }) {
      if (isDisposed) return;
      (rootObject !== root || rootRevision !== revision) &&
        ((rootObject = root),
        (rootRevision = revision),
        (modelsByKey = new Map()),
        rootObject?.traverse((sceneNode: any) => {
          ["desktop", "laptop"].includes(sceneNode.userData?.environmentModelType) &&
            modelsByKey.set(
              sceneModelKey({
                floorId: sceneNode.userData.environmentFloorId,
                modelId: sceneNode.userData.environmentModelId,
              }),
              sceneNode,
            );
        }));

      const liveKeySet = new Set<string>();
      for (const binding of bindings) {
        if (binding.visible === false) continue;
        const bindingKey = sceneModelKey(binding),
          model = modelsByKey.get(bindingKey);
        if (!model) continue;
        let screenMesh: any;
        if (
          (model.traverse((sceneNode: any) => {
            !screenMesh && sceneNode.userData?.computerScreen && (screenMesh = sceneNode);
          }),
          !screenMesh)
        )
          continue;
        liveKeySet.add(bindingKey);
        let screenRecord = screensByKey.get(bindingKey);
        if (screenRecord && screenRecord.screen !== screenMesh) {
          (disposeScreenRecord(bindingKey, screenRecord), (screenRecord = null));
        }
        if (!screenRecord) {
          const canvas = document.createElement("canvas");
          ((canvas.width = SCREEN_CANVAS_WIDTH), (canvas.height = SCREEN_CANVAS_HEIGHT));
          const context = canvas.getContext("2d");
          if (!context) continue;
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          const screenMaterial = new THREE.MeshBasicMaterial({
              map: texture,
              toneMapped: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
            originalMaterial = screenMesh.material;
          ((screenRecord = {
            floorId: binding.floorId,
            screen: screenMesh,
            original: originalMaterial,
            material: screenMaterial,
            canvas,
            context,
            texture,
            on: false,
            source: "",
            image: null,
            loading: null,
            retry: null,
            timeout: null,
            failures: 0,
            signature: "",
            removed: false,
          }),
            (screenMesh.material = screenRecord.material),
            screensByKey.set(bindingKey, screenRecord));
        }
        const power = computerPower(binding, states),
          screenSource = power.on ? computerScreenImage(binding) : "",
          screenSignature = JSON.stringify([power.on, power.available, screenSource]);
        ((screenRecord.on = power.on),
          screenRecord.source !== screenSource &&
            (cancelImageLoad(screenRecord),
            (screenRecord.source = screenSource),
            (screenRecord.image = null),
            (screenRecord.failures = 0)),
          loadScreenImage(screenRecord),
          screenRecord.signature !== screenSignature &&
            ((screenRecord.signature = screenSignature), redrawScreen(screenRecord)));
      }
      for (const [staleKey, staleRecord] of screensByKey)
        liveKeySet.has(staleKey) || disposeScreenRecord(staleKey, staleRecord);
    },
    setAvailable(isNowAvailable: boolean) {
      const availability = !!isNowAvailable;
      if (availability !== isAvailable) {
        if (((isAvailable = availability), refreshLoadQueue(), isAvailable))
          for (const screenRecord of screensByKey.values()) redrawScreen(screenRecord);
      }
    },
    dispose() {
      ((isDisposed = true),
        ownerWindow?.removeEventListener?.("online", handleOnline),
        ownerWindow?.removeEventListener?.("offline", handleOffline),
        ownerDocument?.removeEventListener?.("visibilitychange", refreshLoadQueue));
      for (const [screenKey, screenRecord] of screensByKey)
        disposeScreenRecord(screenKey, screenRecord);
      (screensByKey.clear(), modelsByKey.clear(), (rootObject = null));
    },
  };
}
