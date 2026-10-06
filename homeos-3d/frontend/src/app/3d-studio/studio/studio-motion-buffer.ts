export function createMotionBuffer({
  THREE: three,
  renderer: renderer,
  maxBytes: maxBytes = 32 * 1024 * 1024,
  maxSamples: maxSamples = 4,
}) {
  const sizeVector = new three.Vector2(),
    screenScene = new three.Scene(),
    screenCamera = new three.Camera(),
    meshGeometry = new three.BufferGeometry();
  meshGeometry.setAttribute(
    "position",
    new three.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  );
  const meshMaterial = new three.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      blending: three.NoBlending,
      toneMapped: false,
      uniforms: {
        map: {
          value: null,
        },
      },
      vertexShader:
        "varying vec2 uvMotion; void main(){uvMotion=position.xy*.5+.5;gl_Position=vec4(position,1.);}",
      fragmentShader:
        "uniform sampler2D map; varying vec2 uvMotion; void main(){gl_FragColor=texture2D(map,uvMotion);}",
    }),
    fullscreenMesh = new three.Mesh(meshGeometry, meshMaterial);
  ((fullscreenMesh.frustumCulled = false), screenScene.add(fullscreenMesh));
  let renderTarget = null,
    targetKey = "",
    isPrepared = false,
    isDisposed = false,
    isScreenPassActive = false;
  const stats = {
    allocations: 0,
    frames: 0,
    bytes: 0,
    failures: 0,
  };
  function computeTargetDescriptor(resolutionScale) {
    renderer.getSize(sizeVector);
    const widthPx = Math.floor(sizeVector.x * resolutionScale),
      heightPx = Math.floor(sizeVector.y * resolutionScale),
      sampleCount = Math.min(maxSamples, renderer.capabilities.maxSamples || 0),
      estimatedBytes = widthPx * heightPx * 4 * (sampleCount ? 1 + 2 * sampleCount : 2);
    return {
      width: widthPx,
      height: heightPx,
      samples: sampleCount,
      bytes: estimatedBytes,
      key: widthPx + "/" + heightPx + "/" + sampleCount + "/" + renderer.outputColorSpace,
    };
  }
  function clearRenderTarget() {
    (renderTarget?.dispose(),
      (renderTarget = null),
      (targetKey = ""),
      (isPrepared = false),
      (stats.bytes = 0),
      (meshMaterial.uniforms.map.value = null));
  }
  function matchesTarget(requestedScale) {
    return !isDisposed && isPrepared && targetKey === computeTargetDescriptor(requestedScale).key;
  }
  function prepareTarget(targetScale) {
    if (isDisposed || renderer.getRenderTarget() || isScreenPassActive) return false;
    const targetDescriptor = computeTargetDescriptor(targetScale);
    if (
      !Number.isFinite(targetDescriptor.bytes) ||
      targetDescriptor.width < 1 ||
      targetDescriptor.height < 1 ||
      targetDescriptor.bytes > maxBytes
    )
      return (clearRenderTarget(), false);
    if (matchesTarget(targetScale)) return true;
    clearRenderTarget();
    try {
      ((renderTarget = new three.WebGLRenderTarget(
        targetDescriptor.width,
        targetDescriptor.height,
        {
          samples: targetDescriptor.samples,
          colorSpace: renderer.outputColorSpace,
          depthBuffer: true,
          stencilBuffer: false,
        },
      )),
        (renderTarget.isXRRenderTarget = true),
        (renderTarget.texture.internalFormat = "RGBA8"),
        renderer.initRenderTarget(renderTarget));
      const webgl = renderer.getContext?.();
      if (webgl) {
        let isFramebufferComplete;
        try {
          (renderer.setRenderTarget(renderTarget),
            (isFramebufferComplete =
              webgl.checkFramebufferStatus(webgl.FRAMEBUFFER) === webgl.FRAMEBUFFER_COMPLETE));
        } finally {
          renderer.setRenderTarget(null);
        }
        if (!isFramebufferComplete) throw new Error("Motion framebuffer unavailable");
      }
      return (
        (meshMaterial.uniforms.map.value = renderTarget.texture),
        renderer.compile(screenScene, screenCamera),
        (targetKey = targetDescriptor.key),
        (isPrepared = true),
        (stats.bytes = targetDescriptor.bytes),
        stats.allocations++,
        true
      );
    } catch {
      return (stats.failures++, clearRenderTarget(), false);
    }
  }
  function renderScene(scene, camera) {
    if (!isPrepared || isDisposed || renderer.getRenderTarget()) {
      renderer.render(scene, camera);
      return;
    }
    const previousAutoReset = renderer.info.autoReset,
      previousViewport = renderer.getViewport(new three.Vector4()),
      previousScissor = renderer.getScissor(new three.Vector4()),
      previousScissorTest = renderer.getScissorTest(),
      previousAutoClear = renderer.autoClear;
    let previousRenderStats;
    isScreenPassActive = true;
    try {
      (renderer.setRenderTarget(renderTarget),
        renderer.render(scene, camera),
        (previousRenderStats = {
          ...renderer.info.render,
        }),
        renderer.setRenderTarget(null),
        renderer.setScissorTest(false),
        (renderer.autoClear = true),
        renderer.render(screenScene, screenCamera),
        stats.frames++);
    } finally {
      (renderer.setRenderTarget(null),
        renderer.setViewport(previousViewport),
        renderer.setScissor(previousScissor),
        renderer.setScissorTest(previousScissorTest),
        (renderer.autoClear = previousAutoClear),
        (renderer.info.autoReset = previousAutoReset),
        previousRenderStats &&
          Object.assign(renderer.info.render, previousRenderStats, {
            calls: previousRenderStats.calls + 1,
            triangles: previousRenderStats.triangles + 1,
          }),
        (isScreenPassActive = false));
    }
  }
  return {
    prepare: prepareTarget,
    matches: matchesTarget,
    render: renderScene,
    clear: clearRenderTarget,
    stats: stats,
    get isScreenPass() {
      return isScreenPassActive && renderer.getRenderTarget() === renderTarget;
    },
    dispose() {
      isDisposed ||
        (clearRenderTarget(), meshGeometry.dispose(), meshMaterial.dispose(), (isDisposed = true));
    },
  };
}
