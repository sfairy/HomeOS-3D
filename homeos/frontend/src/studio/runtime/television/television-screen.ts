const { drawTelevisionGlass: drawGlass } = await (import("@app/3d-studio/materials/studio-television-glass"));
import { televisionState } from "./television-state";
function drawPoster(posterCanvas: any, canvasPainter: any, posterState: any) {
  (canvasPainter.save(),
    (canvasPainter.fillStyle = "#07111d"),
    canvasPainter.fillRect(0, 0, posterCanvas.width, posterCanvas.height),
    (canvasPainter.fillStyle = "#f4f8fb"),
    (canvasPainter.font = "500 26px sans-serif"),
    (canvasPainter.textAlign = "center"),
    (canvasPainter.textBaseline = "middle"));
  const statusText = posterState.playing
    ? "正在播放中"
    : !posterState.idle && posterState.state === "paused"
      ? "已暂停"
      : !posterState.idle && posterState.state === "buffering"
        ? "正在缓冲"
        : "暂未播放";
  (canvasPainter.fillText(statusText, posterCanvas.width / 2, posterCanvas.height / 2),
    canvasPainter.restore());
}
export function createTelevisionScreens({
  THREE: THREE,
  requestFrame: requestFrame = () => {},
}: {
  THREE?: any;
  requestFrame?: (floorIds: any[]) => void;
} = {}) {
  let syncedRoot: any,
    syncedRevision: any,
    screensByLocation = new Map(),
    modelsByLocation = new Map(),
    isDisposed = false;
  const sceneModelKey = (locationSource: any) =>
    JSON.stringify([locationSource.floorId, locationSource.modelId]);
  function releaseScreen(targetEntry: any) {
    if (!targetEntry.removed) {
      ((targetEntry.removed = true),
        targetEntry.screen.geometry.removeEventListener("dispose", targetEntry.onGeometryDispose),
        targetEntry.generation++,
        targetEntry.screen.material === targetEntry.materials &&
          (targetEntry.screen.material = targetEntry.original));
      for (const [glow, wasVisible] of targetEntry.glows) glow.visible = wasVisible;
      (targetEntry.texture.dispose(), targetEntry.material.dispose());
    }
  }
  function renderScreen(entry: any) {
    if (isDisposed) return;
    const { canvas: canvas, context: screenPainter, state: state, image: image } = entry;
    if (
      ((screenPainter.fillStyle = "#050609"),
      state.on
        ? screenPainter.fillRect(0, 0, canvas.width, canvas.height)
        : drawGlass(canvas, screenPainter, entry.screen.userData?.sceneStyle === "warm-wood"),
      state.on && image)
    ) {
      const fitScale = Math.min(
          canvas.width / image.naturalWidth,
          canvas.height / image.naturalHeight,
        ),
        drawWidth = image.naturalWidth * fitScale,
        drawHeight = image.naturalHeight * fitScale;
      screenPainter.drawImage(
        image,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    } else state.on && drawPoster(canvas, screenPainter, state);
    ((entry.texture.needsUpdate = true), requestFrame([entry.floorId]));
  }
  return {
    sync({
      root: root,
      revision: revision,
      bindings: bindings = [],
      states: states = {},
      focusedModel: focusedModel = "",
      dimStrength: dimStrength = 70,
    }: any) {
      if (isDisposed) return;
      (syncedRoot !== root || syncedRevision !== revision) &&
        ((syncedRoot = root),
        (syncedRevision = revision),
        (modelsByLocation = new Map()),
        syncedRoot?.traverse((sceneObject: any) => {
          sceneObject.userData?.environmentModelType === "tv" &&
            modelsByLocation.set(
              JSON.stringify([
                sceneObject.userData.environmentFloorId,
                sceneObject.userData.environmentModelId,
              ]),
              sceneObject,
            );
        }));
      const activeLocationSet = new Set(),
        bindingsByLocation = new Map();
      for (const [modelLocation, locatedModel] of modelsByLocation)
        bindingsByLocation.set(modelLocation, {
          floorId: locatedModel.userData.environmentFloorId,
          modelId: locatedModel.userData.environmentModelId,
        });
      for (const [screenLocation, existingScreenEntry] of screensByLocation)
        bindingsByLocation.has(screenLocation) ||
          bindingsByLocation.set(screenLocation, {
            floorId: existingScreenEntry.floorId,
            modelId: existingScreenEntry.modelId,
          });
      for (const binding of bindings)
        binding.visible !== false && bindingsByLocation.set(sceneModelKey(binding), binding);
      for (const bindingEntry of bindingsByLocation.values()) {
        const location = sceneModelKey(bindingEntry),
          model = modelsByLocation.get(location);
        if ((activeLocationSet.add(location), !model)) continue;
        let screenMesh: any;
        if (
          (model.traverse((candidate: any) => {
            candidate.userData?.televisionScreen && (screenMesh = candidate);
          }),
          !screenMesh)
        )
          continue;
        activeLocationSet.add(location);
        let screenEntry = screensByLocation.get(location);
        if (
          (screenEntry &&
            screenEntry.screen !== screenMesh &&
            (releaseScreen(screenEntry), screensByLocation.delete(location), (screenEntry = null)),
          !screenEntry)
        ) {
          const canvasElement = document.createElement("canvas");
          ((canvasElement.width = 512), (canvasElement.height = 288));
          const posterPainter = canvasElement.getContext("2d");
          if (!posterPainter) continue;
          const texture = new THREE.CanvasTexture(canvasElement);
          texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.MeshBasicMaterial({
              map: texture,
              toneMapped: false,
              polygonOffset: true,
              polygonOffsetFactor: -2,
              polygonOffsetUnits: -2,
            }),
            originalMaterial = screenMesh.material,
            materials = Array.from(
              {
                length: 6,
              },
              (_element, index) =>
                index === 4
                  ? material
                  : Array.isArray(originalMaterial)
                    ? originalMaterial[index]
                    : originalMaterial,
            ),
            glows: any = [];
          (model.traverse((childObject: any) => {
            childObject.userData?.televisionGlow &&
              (glows.push([childObject, childObject.visible]), (childObject.visible = false));
          }),
            (screenEntry = {
              floorId: bindingEntry.floorId,
              modelId: bindingEntry.modelId,
              screen: screenMesh,
              original: originalMaterial,
              materials: materials,
              material: material,
              canvas: canvasElement,
              context: posterPainter,
              texture: texture,
              glows: glows,
              generation: 0,
              artwork: "",
              customPoster: "",
              signature: "",
              image: null as any,
            }));
          const createdEntry = screenEntry;
          ((screenEntry.onGeometryDispose = () => {
            (releaseScreen(createdEntry),
              screensByLocation.get(location) === createdEntry &&
                screensByLocation.delete(location));
          }),
            screenMesh.geometry.addEventListener("dispose", screenEntry.onGeometryDispose),
            (screenMesh.material = materials),
            screensByLocation.set(location, screenEntry));
        }
        const deviceState = televisionState(bindingEntry, states),
          signature = JSON.stringify([
            deviceState.on,
            deviceState.status,
            deviceState.title,
            deviceState.app,
            deviceState.name,
            deviceState.artwork,
            deviceState.customPosterUrl,
            bindingEntry.screenImage?.assetId || bindingEntry.posterAssetId || "",
          ]);
        screenEntry.state = deviceState;
        const colorLevel =
          focusedModel && focusedModel !== location ? Math.max(0.1, 1 - dimStrength / 100) : 1;
        if (
          (screenEntry.material.color.r !== colorLevel &&
            (screenEntry.material.color.setRGB(colorLevel, colorLevel, colorLevel),
            requestFrame([screenEntry.floorId])),
          screenEntry.signature !== signature)
        ) {
          const nextScreenImageUrl =
            deviceState.artwork || (deviceState.on ? deviceState.customPosterUrl : "");
          if (
            ((screenEntry.signature = signature),
            screenEntry.artwork !== deviceState.artwork ||
              screenEntry.customPoster !== deviceState.customPosterUrl)
          ) {
            ((screenEntry.artwork = deviceState.artwork),
              (screenEntry.customPoster = deviceState.customPosterUrl),
              (screenEntry.image = null));
            const generation = ++screenEntry.generation;
            if (nextScreenImageUrl) {
              let retryCount = 0;
              const loadScreenImage = () => {
                if (
                  isDisposed ||
                  generation !== screenEntry.generation ||
                  screensByLocation.get(location) !== screenEntry
                )
                  return;
                const loadedImage = new Image();
                loadedImage.onload = () => {
                  !isDisposed &&
                    generation === screenEntry.generation &&
                    screensByLocation.get(location) === screenEntry &&
                    ((screenEntry.image = loadedImage), renderScreen(screenEntry));
                };
                loadedImage.onerror = () => {
                  if (
                    isDisposed ||
                    generation !== screenEntry.generation ||
                    screensByLocation.get(location) !== screenEntry
                  )
                    return;
                  if (retryCount < 2 && (typeof navigator == "undefined" || navigator.onLine !== false)) {
                    retryCount += 1;
                    setTimeout(loadScreenImage, 400 * retryCount);
                    return;
                  }
                  ((screenEntry.image = null), renderScreen(screenEntry));
                };
                loadedImage.src =
                  nextScreenImageUrl +
                  (nextScreenImageUrl.includes("?") ? "&" : "?") +
                  "hb_retry=" +
                  retryCount;
              };
              loadScreenImage();
            } else renderScreen(screenEntry);
          } else renderScreen(screenEntry);
        }
      }
      for (const [staleLocation, staleEntry] of screensByLocation)
        activeLocationSet.has(staleLocation) ||
          (releaseScreen(staleEntry),
          screensByLocation.delete(staleLocation),
          requestFrame([staleEntry.floorId]));
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of screensByLocation.values()) releaseScreen(disposedEntry);
      (screensByLocation.clear(), modelsByLocation.clear(), (syncedRoot = null));
    },
  };
}
