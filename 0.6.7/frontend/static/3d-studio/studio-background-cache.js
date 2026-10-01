export function createBackgroundCache({
  THREE: three,
  renderer: webglRenderer,
  makeCanvas: createCanvasElement = () => document.createElement("canvas"),
  now: readNowMs = () => performance.now(),
  settleMs: settleDelayMs = 250,
  maxPixels: maxPixelCount = 4 * 1024 * 1024,
}) {
  const sceneGroup = new three.Scene();
  let backgroundCanvasElement = null,
    cachePainter = null,
    lastBackground = null,
    backgroundClone = null,
    hasCapturedBackground = false,
    lastCaptureTimestampMs = -Infinity,
    hasCaptureFailed = false,
    isDisposed = false,
    cachedWidthPx = 0,
    cachedHeightPx = 0;
  const captureStats = {
    captures: 0,
    backgroundFrames: 0,
    fullFrames: 0,
    pixels: 0,
    failures: 0,
  };
  function invalidateSnapshot() {
    ((hasCapturedBackground = false),
      backgroundCanvasElement && (backgroundCanvasElement.hidden = true));
  }
  function resetSnapshot() {
    (invalidateSnapshot(),
      backgroundCanvasElement &&
        ((backgroundCanvasElement.width = backgroundCanvasElement.height = 0),
        backgroundCanvasElement.remove()),
      (backgroundCanvasElement = cachePainter = null),
      (cachedWidthPx = cachedHeightPx = 0),
      backgroundClone?.removeFromParent(),
      (backgroundClone = lastBackground = null),
      (captureStats.pixels = 0));
  }
  function prepareSnapshot(targetBackground) {
    const rendererCanvasElement = webglRenderer.domElement,
      rendererWidthPx = rendererCanvasElement.width,
      rendererHeightPx = rendererCanvasElement.height;
    if (
      !rendererCanvasElement.parentElement ||
      rendererWidthPx < 1 ||
      rendererHeightPx < 1 ||
      rendererWidthPx * rendererHeightPx > maxPixelCount
    )
      return (resetSnapshot(), false);
    if (!backgroundCanvasElement) {
      if (
        ((backgroundCanvasElement = createCanvasElement()),
        (cachePainter = backgroundCanvasElement.getContext("2d", {
          alpha: true,
        })),
        !cachePainter)
      )
        throw Error("Background snapshot unavailable");
      ((backgroundCanvasElement.className = "i3d-background-house-cache"),
        backgroundCanvasElement.setAttribute("aria-hidden", "true"),
        Object.assign(backgroundCanvasElement.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: "1",
        }),
        (backgroundCanvasElement.hidden = true),
        rendererCanvasElement.parentElement.append(backgroundCanvasElement));
    }
    return (
      (rendererWidthPx !== cachedWidthPx || rendererHeightPx !== cachedHeightPx) &&
        ((backgroundCanvasElement.width = cachedWidthPx = rendererWidthPx),
        (backgroundCanvasElement.height = cachedHeightPx = rendererHeightPx),
        (hasCapturedBackground = false),
        (captureStats.pixels = rendererWidthPx * rendererHeightPx)),
      lastBackground !== targetBackground &&
        (backgroundClone?.removeFromParent(),
        (lastBackground = targetBackground),
        (backgroundClone = targetBackground.clone(false)),
        sceneGroup.add(backgroundClone),
        (hasCapturedBackground = false)),
      true
    );
  }
  function renderBackgroundScene(renderCamera) {
    ((backgroundClone.visible = true),
      webglRenderer.render(sceneGroup, renderCamera),
      captureStats.backgroundFrames++,
      (backgroundCanvasElement.hidden = false));
  }
  function renderWithCachedBackground(
    scene,
    camera,
    {
      background: background = null,
      changed: hasBackgroundChanged = true,
      enabled: isCacheEnabled = true,
    } = {},
  ) {
    const nowMs = readNowMs(),
      sourceCanvasElement = webglRenderer.domElement;
    if (
      (hasBackgroundChanged && (invalidateSnapshot(), (lastCaptureTimestampMs = nowMs)),
      isDisposed ||
        hasCaptureFailed ||
        !isCacheEnabled ||
        !background?.visible ||
        !background.material?.visible ||
        webglRenderer.getRenderTarget() ||
        sourceCanvasElement.style.opacity === "0")
    ) {
      (resetSnapshot(), webglRenderer.render(scene, camera), captureStats.fullFrames++);
      return;
    }
    if (hasBackgroundChanged || nowMs - lastCaptureTimestampMs < settleDelayMs) {
      (invalidateSnapshot(), webglRenderer.render(scene, camera), captureStats.fullFrames++);
      return;
    }
    try {
      if (!prepareSnapshot(background)) {
        (webglRenderer.render(scene, camera), captureStats.fullFrames++);
        return;
      }
      if (!hasCapturedBackground) {
        const backgroundMaterial = background.material,
          previousMaterialVisible = backgroundMaterial.visible,
          previousSceneBackground = scene.background,
          previousClearAlpha = webglRenderer.getClearAlpha();
        try {
          ((backgroundMaterial.visible = false),
            (scene.background = null),
            webglRenderer.setClearAlpha(0),
            webglRenderer.render(scene, camera),
            captureStats.fullFrames++,
            cachePainter.clearRect(0, 0, cachedWidthPx, cachedHeightPx),
            cachePainter.drawImage(sourceCanvasElement, 0, 0),
            (hasCapturedBackground = true),
            captureStats.captures++);
        } finally {
          ((backgroundMaterial.visible = previousMaterialVisible),
            (scene.background = previousSceneBackground),
            webglRenderer.setClearAlpha(previousClearAlpha));
        }
      }
      renderBackgroundScene(camera);
    } catch {
      (captureStats.failures++,
        (hasCaptureFailed = true),
        resetSnapshot(),
        webglRenderer.render(scene, camera),
        captureStats.fullFrames++);
    }
  }
  return {
    render: renderWithCachedBackground,
    clear: resetSnapshot,
    stats: captureStats,
    get active() {
      return hasCapturedBackground && !backgroundCanvasElement?.hidden;
    },
    dispose() {
      (resetSnapshot(), (isDisposed = true));
    },
  };
}
