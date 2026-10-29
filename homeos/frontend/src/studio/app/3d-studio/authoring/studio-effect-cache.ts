/**
 * 静态画面效果缓存（0.7.8 `studio-effect-cache`）。
 *
 * 相机、背景与场景都没变化时，把「不透明体 + 光照」那一帧缓存到带深度纹理的
 * RenderTarget 里，后续帧只重绘动态体（电视画面、喷雾、充电流光等），再贴回缓存帧。
 * 这样静态空镜不再每帧重算整套平面光照 shader，交互中的动画仍然实时。
 *
 * 失败即回退：帧缓冲不完整、超预算、渲染期有改动都会退化成一帧普通渲染，
 * 并把 `failed` 记住，避免在坏驱动上反复尝试。
 */

type EffectCacheStats = {
  captures: number;
  replays: number;
  fullFrames: number;
  failures: number;
  bytes: number;
};

type EffectCacheOptions = {
  THREE: any;
  renderer: any;
  /** 读取当前时间（毫秒）；测试可注入。 */
  now?: () => number;
  /** 缓存帧允许占用的显存上限，默认 32 MiB。 */
  maxBytes?: number;
};

const CACHE_SETTLE_MS = 200;

export function createEffectCache({
  THREE: three,
  renderer: webglRenderer,
  now: readNowMs = () => performance.now(),
  maxBytes = 32 * 1024 * 1024,
}: EffectCacheOptions) {
  const fullscreenScene = new three.Scene(),
    backgroundScene = new three.Scene(),
    fullscreenCamera = new three.Camera(),
    drawingBufferSize = new three.Vector2(),
    fullscreenGeometry = new three.BufferGeometry();
  fullscreenGeometry.setAttribute(
    "position",
    new three.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const fullscreenMaterial = new three.ShaderMaterial({
    depthTest: true,
    depthFunc: three.AlwaysDepth,
    depthWrite: true,
    blending: three.NoBlending,
    toneMapped: false,
    uniforms: {
      colorMap: { value: null },
      depthMap: { value: null },
      cacheSize: { value: new three.Vector2(1, 1) },
    },
    vertexShader: "void main(){gl_Position=vec4(position,1.);}",
    fragmentShader:
      "uniform sampler2D colorMap; uniform sampler2D depthMap; uniform vec2 cacheSize; void main(){vec2 cacheUv=gl_FragCoord.xy/cacheSize;gl_FragColor=texture2D(colorMap,cacheUv);gl_FragDepth=texture2D(depthMap,cacheUv).r;}",
  });
  const fullscreenMesh = new three.Mesh(fullscreenGeometry, fullscreenMaterial);
  ((fullscreenMesh.frustumCulled = false), fullscreenScene.add(fullscreenMesh));

  let renderTarget: any = null,
    lastBackground: any = null,
    backgroundClone: any = null,
    previousCameraKey: number[] | null = null,
    isCacheValid = false,
    hasCaptureFailed = false,
    isDisposed = false,
    isScreenPass = false,
    cacheChangeCounter = 0,
    lastInvalidateTimestampMs = -Infinity;

  const dynamicObjectsByScene = new Map<any, Set<any>>();
  let dynamicObjectSet = new Set<any>();

  const stats: EffectCacheStats = {
    captures: 0,
    replays: 0,
    fullFrames: 0,
    failures: 0,
    bytes: 0,
  };

  function invalidate() {
    ((isCacheValid = false),
      cacheChangeCounter++,
      (lastInvalidateTimestampMs = readNowMs()));
  }

  /** 同步某一场景的动态对象集合；变了就整体失效一次缓存。 */
  function setDynamicObjects(sceneKey: any, objects: any[] = []) {
    if (isDisposed) return false;
    const nextSet = new Set(objects.filter((object) => object?.isObject3D)),
      currentSet = dynamicObjectsByScene.get(sceneKey) || new Set<any>();
    if (
      nextSet.size === currentSet.size &&
      [...nextSet].every((object) => currentSet.has(object))
    )
      return false;
    (nextSet.size
      ? dynamicObjectsByScene.set(sceneKey, nextSet)
      : dynamicObjectsByScene.delete(sceneKey),
      (dynamicObjectSet = new Set([...dynamicObjectsByScene.values()].flatMap((set) => [...set]))),
      invalidate());
    return true;
  }

  function isDynamicObject(object: any) {
    for (let node = object; node; node = node.parent) if (dynamicObjectSet.has(node)) return true;
    return false;
  }

  function clear() {
    (invalidate(),
      renderTarget?.dispose?.(),
      (renderTarget = null),
      (lastBackground = null),
      (backgroundClone = null),
      (stats.bytes = 0),
      (fullscreenMaterial.uniforms.colorMap.value = null),
      (fullscreenMaterial.uniforms.depthMap.value = null));
  }

  function ensureRenderTarget() {
    webglRenderer.getDrawingBufferSize(drawingBufferSize);
    const sampleCount = Math.min(4, webglRenderer.capabilities.maxSamples || 0),
      requiredBytes = drawingBufferSize.x * drawingBufferSize.y * 8 * (sampleCount + 1);
    if (
      !Number.isFinite(requiredBytes) ||
      requiredBytes > maxBytes ||
      drawingBufferSize.x < 1 ||
      drawingBufferSize.y < 1
    )
      return (clear(), false);
    if (
      renderTarget?.width === drawingBufferSize.x &&
      renderTarget?.height === drawingBufferSize.y &&
      renderTarget.texture.colorSpace === webglRenderer.outputColorSpace
    )
      return true;
    (clear(),
      (renderTarget = new three.WebGLRenderTarget(drawingBufferSize.x, drawingBufferSize.y, {
        samples: sampleCount,
        // 与画布的 antialias 保持一致：画布开了 MSAA 而缓存没开，回放边缘会明显发硬。
        antialias: webglRenderer.getContext?.()?.getContextAttributes?.()?.antialias === true,
        depthBuffer: true,
        stencilBuffer: false,
        colorSpace: webglRenderer.outputColorSpace,
        depthTexture: new three.DepthTexture(
          drawingBufferSize.x,
          drawingBufferSize.y,
          three.UnsignedIntType,
        ),
      })),
      (renderTarget.texture.needsUpdate = true),
      (renderTarget.texture.internalFormat = "RGBA8"),
      webglRenderer.initRenderTarget(renderTarget),
      (stats.bytes = requiredBytes));
    const glContext = webglRenderer.getContext?.();
    if (glContext) {
      let isFramebufferComplete = false;
      try {
        (webglRenderer.setRenderTarget(renderTarget),
          (isFramebufferComplete =
            glContext.checkFramebufferStatus(glContext.FRAMEBUFFER) ===
            glContext.FRAMEBUFFER_COMPLETE));
      } finally {
        webglRenderer.setRenderTarget(null);
      }
      if (!isFramebufferComplete)
        throw new Error("Effect cache framebuffer unavailable");
    }
    ((fullscreenMaterial.uniforms.colorMap.value = renderTarget.texture),
      (fullscreenMaterial.uniforms.depthMap.value = renderTarget.depthTexture),
      webglRenderer.compile(fullscreenScene, fullscreenCamera));
    return true;
  }

  function matchesCameraKey(previousKey: number[] | null, nextKey: number[]) {
    return (
      previousKey?.length === nextKey.length &&
      nextKey.every(
        (value, index) =>
          value === previousKey[index] ||
          (index < 16 &&
            Number.isFinite(value) &&
            Number.isFinite(previousKey[index]) &&
            Math.abs(value - previousKey[index]) <=
              16 * Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(previousKey[index]))),
      )
    );
  }

  function saveRendererState() {
    const viewport = webglRenderer.getViewport(new three.Vector4()),
      scissor = webglRenderer.getScissor(new three.Vector4()),
      scissorTest = webglRenderer.getScissorTest(),
      autoClear = webglRenderer.autoClear,
      shadowAutoUpdate = webglRenderer.shadowMap.autoUpdate,
      shadowNeedsUpdate = webglRenderer.shadowMap.needsUpdate,
      clearAlpha = webglRenderer.getClearAlpha();
    return {
      viewport,
      scissor,
      scissorTest,
      clearAlpha,
      restore() {
        ((webglRenderer.setClearAlpha?.(clearAlpha),
          webglRenderer.setRenderTarget(null),
          webglRenderer.setViewport(viewport),
          webglRenderer.setScissor(scissor),
          webglRenderer.setScissorTest(scissorTest),
          (webglRenderer.autoClear = autoClear),
          (webglRenderer.shadowMap.autoUpdate = shadowAutoUpdate),
          (webglRenderer.shadowMap.needsUpdate = shadowNeedsUpdate)),
          (isScreenPass = false));
      },
    };
  }

  function render(
    scene: any,
    camera: any,
    { enabled = false, background = null }: { enabled?: boolean; background?: any } = {},
  ) {
    if (!background?.visible || !background.material?.visible) background = null;
    const renderFullFrame = () => {
      (stats.fullFrames++, webglRenderer.render(scene, camera));
    };
    if (
      isDisposed ||
      hasCaptureFailed ||
      !enabled ||
      webglRenderer.getRenderTarget() ||
      (!isCacheValid && readNowMs() - lastInvalidateTimestampMs < CACHE_SETTLE_MS)
    ) {
      renderFullFrame();
      return;
    }

    camera.updateWorldMatrix(true, false);
    const cameraKey = [
      ...camera.matrixWorld.elements,
      ...camera.projectionMatrix.elements,
      webglRenderer.toneMapping,
      webglRenderer.toneMappingExposure,
      webglRenderer.outputColorSpace,
      camera.layers.mask,
      background?.layers?.mask,
      background?.uuid || "",
      ...webglRenderer.getViewport(new three.Vector4()).toArray(),
    ] as number[];
    if (!matchesCameraKey(previousCameraKey, cameraKey)) isCacheValid = false;

    const opaqueEntries: [any, number][] = [],
      effectEntries: [any, number][] = [];
    let hasTransmissiveMaterial = false;
    scene.traverseVisible((visibleNode: any) => {
      if (visibleNode === background || !visibleNode.material) return;
      if (!visibleNode.layers.test(camera.layers)) return;
      const materials = Array.isArray(visibleNode.material)
        ? visibleNode.material
        : [visibleNode.material];
      hasTransmissiveMaterial ||= materials.some(
        (material: any) => material.transmission > 0,
      );
      (isDynamicObject(visibleNode) ||
      visibleNode.userData.environmentEffect ||
      // transparent 才是「必须逐帧重绘」的判据：transmission 材质可能完全不透明。
      materials.some((material: any) => material.transparent) ||
      !visibleNode.isMesh ||
      visibleNode.isSkinnedMesh
        ? effectEntries
        : opaqueEntries
      ).push([visibleNode, visibleNode.layers.mask]);
    });
    if (!hasTransmissiveMaterial || !opaqueEntries.length || (!effectEntries.length && !background)) {
      (clear(), renderFullFrame());
      return;
    }

    const rendererState = saveRendererState(),
      previousOnBeforeRender = scene.onBeforeRender,
      previousBackground = scene.background,
      previousBackgroundLayerMask = background?.layers.mask;
    let capturedInfo: any = null;
    try {
      if (!ensureRenderTarget()) {
        renderFullFrame();
        return;
      }
      if (!isCacheValid) {
        const captureChangeCounter = cacheChangeCounter;
        scene.onBeforeRender = function (...args: any[]) {
          (previousOnBeforeRender?.apply(this, args),
            webglRenderer.getRenderTarget() === renderTarget &&
              args[2] === camera &&
              (effectEntries.forEach(([effectNode]) => (effectNode.layers.mask = 0)),
              (webglRenderer.shadowMap.autoUpdate = false),
              (webglRenderer.shadowMap.needsUpdate = false),
              background &&
                ((background.layers.mask = 0),
                (scene.background = null),
                webglRenderer.setClearAlpha(0))));
        };
        isScreenPass = true;
        webglRenderer.setRenderTarget(renderTarget);
        webglRenderer.render(scene, camera);
        isScreenPass = false;
        scene.onBeforeRender = previousOnBeforeRender;
        capturedInfo = { ...webglRenderer.info.render };
        if (background) {
          ((background.layers.mask = previousBackgroundLayerMask),
            (scene.background = previousBackground),
            webglRenderer.setClearAlpha(rendererState.clearAlpha));
        }
        effectEntries.forEach(([effectNode, layerMask]) => (effectNode.layers.mask = layerMask));
        (webglRenderer.setRenderTarget(null),
          webglRenderer.setViewport(rendererState.viewport),
          webglRenderer.setScissor(rendererState.scissor));
        // 捕获期间发生过失效（模型/材质/相机变了）：这一帧作废，直接重绘。
        if (cacheChangeCounter !== captureChangeCounter) {
          rendererState.restore();
          renderFullFrame();
          return;
        }
        ((isCacheValid = true), (previousCameraKey = cameraKey), stats.captures++);
      }

      webglRenderer.setScissorTest(false);
      webglRenderer.autoClear = true;
      if (background) {
        if (lastBackground !== background) {
          (backgroundClone?.removeFromParent(),
            (lastBackground = background),
            (backgroundClone = background.clone(false)),
            (backgroundClone.matrixAutoUpdate = false),
            backgroundScene.add(backgroundClone));
        }
        (backgroundClone.matrix.copy(background.matrixWorld),
          (backgroundClone.layers.mask = previousBackgroundLayerMask ?? 0),
          (backgroundClone.visible = true),
          webglRenderer.render(backgroundScene, camera),
          (webglRenderer.autoClear = false),
          (fullscreenMaterial.blending = three.CustomBlending),
          (fullscreenMaterial.blendSrc = three.OneFactor),
          (fullscreenMaterial.blendDst = three.OneMinusSrcAlphaFactor),
          (fullscreenMaterial.blendEquation = three.AddEquation));
      } else {
        fullscreenMaterial.blending = three.NoBlending;
      }
      webglRenderer.render(fullscreenScene, fullscreenCamera);
      if (background) background.layers.mask = 0;
      opaqueEntries.forEach(([opaqueNode]) => (opaqueNode.layers.mask = 0));
      ((scene.onBeforeRender = () => {}),
        (scene.background = null),
        (webglRenderer.autoClear = false),
        (webglRenderer.shadowMap.autoUpdate = false),
        (webglRenderer.shadowMap.needsUpdate = false),
        webglRenderer.setViewport(rendererState.viewport),
        webglRenderer.setScissor(rendererState.scissor),
        webglRenderer.setScissorTest(rendererState.scissorTest),
        webglRenderer.render(scene, camera));
      webglRenderer.info.render.calls +=
        (background ? 2 : 1) + (capturedInfo?.calls || 0);
      webglRenderer.info.render.triangles +=
        (background ? 3 : 1) + (capturedInfo?.triangles || 0);
      stats.replays++;
    } catch {
      (stats.failures++, (hasCaptureFailed = true), rendererState.restore(), clear());
      renderFullFrame();
    } finally {
      rendererState.restore();
    }
  }

  return {
    render,
    invalidate,
    clear,
    stats,
    setDynamicObjects,
    isDynamicObject,
    get active() {
      return isCacheValid && !isDisposed && !hasCaptureFailed;
    },
    resetContext() {
      ((hasCaptureFailed = false), clear());
    },
    get isScreenPass() {
      return isScreenPass && webglRenderer.getRenderTarget() === renderTarget;
    },
    dispose() {
      ((isDisposed = true),
        clear(),
        dynamicObjectsByScene.clear(),
        dynamicObjectSet.clear(),
        fullscreenGeometry.dispose(),
        fullscreenMaterial.dispose());
    },
  };
}
