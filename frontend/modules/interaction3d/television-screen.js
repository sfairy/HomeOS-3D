import { televisionState } from "./television-state.js?v=20260915211726";
const { drawTelevisionPoster: drawTelevisionPoster } = await (import.meta.url.startsWith("file:")
  ? import(
      new URL(
        "../../static/3d-studio/studio-television-poster.js?v=20260915211726",
        import.meta.url
      )
    )
  : import("/static/3d-studio/studio-television-poster.js?v=20260915211726"));
export function createTelevisionScreens({ THREE: THREE, requestFrame: requestFrame = () => {} }) {
  let syncedRoot;
  let syncedRevision;
  let screensByLocation = new Map();
  let modelsByLocation = new Map();
  let isDisposed = false;
  const locationKey = bindingConfig =>
    JSON.stringify([bindingConfig.floorId, bindingConfig.modelId]);
  function releaseScreen(targetEntry) {
    if (!targetEntry.removed) {
      targetEntry.removed = true;
      targetEntry.screen.geometry.removeEventListener("dispose", targetEntry.onGeometryDispose);
      targetEntry.generation++;
      if (targetEntry.screen.material === targetEntry.materials) {
        targetEntry.screen.material = targetEntry.original;
      }
      for (const [glow, wasVisible] of targetEntry.glows) {
        glow.visible = wasVisible;
      }
      targetEntry.texture.dispose();
      targetEntry.material.dispose();
    }
  }
  function renderScreen(entry) {
    if (isDisposed) {
      return;
    }
    const { canvas: canvas, context: context, state: state, image: image } = entry;
    context.fillStyle = "#050609";
    if (!state.on) {
      const offGradient = context.createLinearGradient(0, 0, canvas.width * 0.35, canvas.height);
      offGradient.addColorStop(0, "#2a2c2f");
      offGradient.addColorStop(0.45, "#222427");
      offGradient.addColorStop(1, "#181a1d");
      context.fillStyle = offGradient;
    }
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (state.on && image) {
      const fitScale = Math.min(
        canvas.width / image.naturalWidth,
        canvas.height / image.naturalHeight
      );
      const drawWidth = image.naturalWidth * fitScale;
      const drawHeight = image.naturalHeight * fitScale;
      context.drawImage(
        image,
        (canvas.width - drawWidth) / 2,
        (canvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
    } else if (state.on) {
      drawTelevisionPoster(canvas, context);
    }
    entry.texture.needsUpdate = true;
    requestFrame([entry.floorId]);
  }
  return {
    sync({
      root: root,
      revision: revision,
      bindings: bindings = [],
      states: states = {},
      focusedModel: focusedModel = "",
      dimStrength: dimStrength = 70
    }) {
      if (isDisposed) {
        return;
      }
      if (syncedRoot !== root || syncedRevision !== revision) {
        syncedRoot = root;
        syncedRevision = revision;
        modelsByLocation = new Map();
        syncedRoot?.traverse(sceneObject => {
          if (sceneObject.userData?.environmentModelType === "tv") {
            modelsByLocation.set(
              JSON.stringify([
                sceneObject.userData.environmentFloorId,
                sceneObject.userData.environmentModelId
              ]),
              sceneObject
            );
          }
        });
      }
      const activeLocations = new Set();
      for (const binding of bindings) {
        if (binding.visible === false || (!binding.entityId && !binding.powerEntityId)) {
          continue;
        }
        const location = locationKey(binding);
        const model = modelsByLocation.get(location);
        activeLocations.add(location);
        if (!model) {
          continue;
        }
        let screenMesh;
        model.traverse(candidate => {
          if (candidate.userData?.televisionScreen) {
            screenMesh = candidate;
          }
        });
        if (!screenMesh) {
          continue;
        }
        activeLocations.add(location);
        let screenEntry = screensByLocation.get(location);
        if (screenEntry && screenEntry.screen !== screenMesh) {
          releaseScreen(screenEntry);
          screensByLocation.delete(location);
          screenEntry = null;
        }
        if (!screenEntry) {
          const canvasElement = document.createElement("canvas");
          canvasElement.width = 512;
          canvasElement.height = 288;
          const canvasContext = canvasElement.getContext("2d");
          if (!canvasContext) {
            continue;
          }
          const texture = new THREE.CanvasTexture(canvasElement);
          texture.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            toneMapped: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
          });
          const originalMaterial = screenMesh.material;
          const materials = Array.from(
            {
              length: 6
            },
            (element, index) =>
              index === 4
                ? material
                : Array.isArray(originalMaterial)
                  ? originalMaterial[index]
                  : originalMaterial
          );
          const glows = [];
          model.traverse(childObject => {
            if (childObject.userData?.televisionGlow) {
              glows.push([childObject, childObject.visible]);
              childObject.visible = false;
            }
          });
          screenEntry = {
            floorId: binding.floorId,
            screen: screenMesh,
            original: originalMaterial,
            materials: materials,
            material: material,
            canvas: canvasElement,
            context: canvasContext,
            texture: texture,
            glows: glows,
            generation: 0,
            artwork: "",
            signature: "",
            image: null
          };
          const createdEntry = screenEntry;
          screenEntry.onGeometryDispose = () => {
            releaseScreen(createdEntry);
            if (screensByLocation.get(location) === createdEntry) {
              screensByLocation.delete(location);
            }
          };
          screenMesh.geometry.addEventListener("dispose", screenEntry.onGeometryDispose);
          screenMesh.material = materials;
          screensByLocation.set(location, screenEntry);
        }
        const deviceState = televisionState(binding, states);
        const signature = JSON.stringify([
          deviceState.on,
          deviceState.status,
          deviceState.title,
          deviceState.app,
          deviceState.name,
          deviceState.artwork
        ]);
        screenEntry.state = deviceState;
        const colorLevel =
          focusedModel && focusedModel !== location ? Math.max(0.1, 1 - dimStrength / 100) : 1;
        if (screenEntry.material.color.r !== colorLevel) {
          screenEntry.material.color.setRGB(colorLevel, colorLevel, colorLevel);
          requestFrame([screenEntry.floorId]);
        }
        if (screenEntry.signature !== signature) {
          screenEntry.signature = signature;
          if (screenEntry.artwork !== deviceState.artwork) {
            screenEntry.artwork = deviceState.artwork;
            screenEntry.image = null;
            const generation = ++screenEntry.generation;
            if (deviceState.artwork) {
              const loadedImage = new Image();
              loadedImage.onload = () => {
                if (
                  !isDisposed &&
                  generation === screenEntry.generation &&
                  screensByLocation.get(location) === screenEntry
                ) {
                  screenEntry.image = loadedImage;
                  renderScreen(screenEntry);
                }
              };
              loadedImage.onerror = () => {
                if (
                  !isDisposed &&
                  generation === screenEntry.generation &&
                  screensByLocation.get(location) === screenEntry
                ) {
                  screenEntry.image = null;
                  renderScreen(screenEntry);
                }
              };
              loadedImage.src = deviceState.artwork;
            }
          }
          renderScreen(screenEntry);
        }
      }
      for (const [staleLocation, staleEntry] of screensByLocation) {
        if (!activeLocations.has(staleLocation)) {
          releaseScreen(staleEntry);
          screensByLocation.delete(staleLocation);
          requestFrame([staleEntry.floorId]);
        }
      }
    },
    dispose() {
      isDisposed = true;
      for (const disposedEntry of screensByLocation.values()) {
        releaseScreen(disposedEntry);
      }
      screensByLocation.clear();
      modelsByLocation.clear();
      syncedRoot = null;
    }
  };
}
