import { createBackgroundTheme } from "./background-theme";

/**
 * 背景外观配置：只列本模块读的键。
 * sceneStyle / *Theme 决定暖木主题与冷暖色，backgroundMotion 只有显式 false 才关掉动效。
 */
type BackgroundAppearanceConfig = {
  sceneStyle?: unknown;
  warmBackgroundTheme?: unknown;
  backgroundTheme?: unknown;
  backgroundMotion?: unknown;
};

function backgroundFloorAnchor(
  anchorStageOptions,
  anchorCache = new WeakMap(),
  floorRef = anchorStageOptions.backgroundFloor,
) {
  const floors = anchorStageOptions.document?.floors || [],
    anchorFloor =
      floorRef === "all"
        ? floors.reduce(
            (lowestFloor, candidateFloor) =>
              !lowestFloor || candidateFloor.elevation < lowestFloor.elevation
                ? candidateFloor
                : lowestFloor,
            null,
          )
        : floors.find((matchingFloor) => matchingFloor.id === floorRef) || floors[0];
  if (!anchorFloor) return null;
  let planCenter = anchorCache.get(anchorFloor.scene);
  if (!planCenter) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const wall of anchorFloor.scene.walls || [])
      for (const wallEndpoint of [wall.start, wall.end])
        ((minX = Math.min(minX, wallEndpoint.x)),
          (minY = Math.min(minY, wallEndpoint.y)),
          (maxX = Math.max(maxX, wallEndpoint.x)),
          (maxY = Math.max(maxY, wallEndpoint.y)));
    if (!Number.isFinite(minX))
      for (const sceneItem of anchorFloor.scene.items || []) {
        if (!["courtyard-area", "courtyard-path", "courtyard-fence"].includes(sceneItem.type))
          continue;
        const pixelsPerMeter = anchorFloor.scene.calibration?.pixelsPerMeter || 100,
          rotationRad = ((sceneItem.rotation || 0) * Math.PI) / 180,
          cosRotation = Math.cos(rotationRad),
          sinRotation = Math.sin(rotationRad);
        for (const drawingPoint of sceneItem.drawing?.points || []) {
          const worldX =
              sceneItem.x +
              (drawingPoint.x * sceneItem.width * cosRotation -
                drawingPoint.y * sceneItem.depth * sinRotation) *
                pixelsPerMeter,
            worldY =
              sceneItem.y +
              (drawingPoint.x * sceneItem.width * sinRotation +
                drawingPoint.y * sceneItem.depth * cosRotation) *
                pixelsPerMeter;
          !Number.isFinite(worldX) ||
            !Number.isFinite(worldY) ||
            ((minX = Math.min(minX, worldX)),
            (minY = Math.min(minY, worldY)),
            (maxX = Math.max(maxX, worldX)),
            (maxY = Math.max(maxY, worldY)));
        }
      }
    ((planCenter = Number.isFinite(minX) ? [(minX + maxX) / 2, (minY + maxY) / 2] : [0, 0]),
      anchorCache.set(anchorFloor.scene, planCenter));
  }
  return anchorStageOptions.presentationPoint(anchorFloor.id, ...planCenter, -0.203);
}
const WARM_MOTES_CHUNK =
  "\nfloat warmMotes(vec2 p, float size, float threshold, float time) {\n vec2 cell=floor(p), f=fract(p);\n float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);\n float seed2=fract(sin(dot(cell,vec2(269.5,183.3)))*43758.5453);\n vec2 center=vec2(seed,seed2)*0.56+0.22;\n center+=vec2(sin(time*0.19+seed*6.28),cos(time*0.16+seed2*6.28))*0.065;\n float d=length(f-center), aa=max(length(fwidth(p)),0.0001);\n float radius=size*mix(.6,1.35,seed2);\n float core=(1.0-smoothstep(radius,radius+aa,d))*min(1.0,radius/aa);\n float halo=exp(-d*d/(radius*radius*18.0))*.11;\n return (core+halo)*step(threshold,seed)*(.66+.34*sin(time*.45+seed2*6.28));\n}";
export function createSceneBackground(stageOptions, requestFrame = () => {}) {
  const themeController = createBackgroundTheme(stageOptions, requestFrame),
    { THREE: THREE } = stageOptions,
    floorAnchorMap = new WeakMap(),
    projectedFloorAnchor = new THREE.Vector3(),
    cameraDirection = new THREE.Vector3(),
    warmUniforms = {
      warmAspect: {
        value: 1,
      },
      warmScale: {
        value: 1,
      },
      warmShift: {
        value: new THREE.Vector2(),
      },
      warmAnchor: {
        value: new THREE.Vector2(),
      },
      warmTime: {
        value: 0,
      },
      warmOverview: {
        value: 0,
      },
      warmFlow: {
        value: new THREE.Vector2(),
      },
      warmDeep: {
        value: new THREE.Color("#d9d6cc"),
      },
      warmInk: {
        value: new THREE.Color("#fff6dd"),
      },
      warmAccent: {
        value: new THREE.Color("#b59b72"),
      },
    };
  let warmBackdrop = null,
    isWarmWood = false,
    isWarmDusk = false,
    isBackgroundEnabled = true,
    isMotionEnabled = true,
    isWarmAnimating = false,
    isDisposed = false,
    backgroundObjects = [],
    lastTickMs = null,
    lastWarmFrameMs = -Infinity,
    lastCameraPosition = null;
  const isReducedMotionPreferred =
    globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  function ensureWarmBackdrop() {
    if (warmBackdrop) return;
    const warmMaterial = new THREE.MeshBasicMaterial({
      color: 15658212,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    ((warmMaterial.onBeforeCompile = (compiledShader) => {
      (Object.assign(compiledShader.uniforms, warmUniforms),
        (compiledShader.vertexShader = compiledShader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\n        varying vec2 warmPoint; uniform float warmAspect; uniform float warmScale; uniform vec2 warmShift;",
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\n          warmPoint=vec2(position.x*max(warmAspect,.5),-position.y)*12.0*warmScale+warmShift;",
          )
          .replace("#include <project_vertex>", "gl_Position=vec4(position.xy,0.9999,1.0);")),
        (compiledShader.fragmentShader = compiledShader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\n        varying vec2 warmPoint; uniform vec2 warmAnchor; uniform float warmTime; uniform float warmOverview;\n        uniform vec2 warmFlow; uniform vec3 warmDeep; uniform vec3 warmInk; uniform vec3 warmAccent;\n        " +
              WARM_MOTES_CHUNK,
          )
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n          vec2 bgUV=warmPoint/6.0;\n          float fade=1.0-smoothstep(2.2,4.2,length(bgUV));\n          vec2 drift=vec2(warmTime*.009,-warmTime*.006);\n          vec2 flow=warmFlow*.11;\n          vec2 uv=bgUV/mix(1.0,1.22,warmOverview);\n          float nearDust=warmMotes(uv/.22+drift+flow,.021,.68,warmTime);\n          float farDust=warmMotes(uv/.095-drift*.42+flow*.32,.016,.80,warmTime+7.0);\n          vec2 wash=(warmPoint-warmAnchor)/6.0*vec2(.68,1.12);\n          float sunlight=exp(-dot(wash,wash)*.72);\n          float washStrength=1.0-smoothstep(.25,.85,warmOverview);\n          vec3 base=mix(warmDeep,vec3(.94,.914,.858),.42+sunlight*.18*washStrength);\n          float dust=(nearDust*.74+farDust*.26)*fade;\n          base=mix(base,warmAccent,min(.18,dust*.12));\n          base+=vec3(1.0,.93,.77)*(nearDust*.38+farDust*.15)*fade;\n          diffuseColor.rgb=(base+warmInk*sunlight*.008)*.88;",
          )));
    }),
      (warmMaterial.customProgramCacheKey = () => "warm-wood-backdrop-v9-flat-stars"),
      (warmBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), warmMaterial)),
      (warmBackdrop.name = "warm-wood-background"),
      (warmBackdrop.renderOrder = -10000),
      (warmBackdrop.frustumCulled = false),
      (warmBackdrop.userData.environmentEffect = true),
      stageOptions.overlayScene?.add(warmBackdrop));
  }
  function stopWarmFrames() {
    ((lastTickMs = null),
      (lastCameraPosition = null),
      isWarmAnimating && ((isWarmAnimating = false), stageOptions.backgroundFrame?.(false)));
  }
  function applyBackgroundVisibility() {
    if (
      (themeController.sync(isWarmWood ? [] : backgroundObjects, isBackgroundEnabled),
      warmBackdrop && (warmBackdrop.visible = isWarmWood && isBackgroundEnabled),
      isWarmWood)
    ) {
      for (const backgroundObject of backgroundObjects)
        ((backgroundObject.userData.backgroundThemeHidden = true),
          (backgroundObject.visible = false));
    } else {
      for (const backgroundObjectEntry of backgroundObjects)
        backgroundObjectEntry.userData.exportRole !== "grid" &&
          (backgroundObjectEntry.userData.backgroundThemeHidden = false);
    }
  }
  return {
    get theme() {
      return isWarmWood ? (isWarmDusk ? "warm-dusk" : "warm-sunlight") : themeController.theme;
    },
    get active() {
      return isWarmWood ? isWarmAnimating : themeController.active;
    },
    get cacheBackground() {
      return isWarmWood && isBackgroundEnabled ? warmBackdrop : null;
    },
    // config 来自外观设置对象：这几个键都要「缺省即保持默认行为」，因此只声明用到的字段。
    configure(configuredTheme, config: BackgroundAppearanceConfig = {}) {
      const isWarmWoodNext = config.sceneStyle === "warm-wood",
        nextWarmDusk =
          isWarmWoodNext && (config.warmBackgroundTheme || config.backgroundTheme) === "warm-dusk",
        didChange =
          isWarmWoodNext !== isWarmWood ||
          nextWarmDusk !== isWarmDusk ||
          isMotionEnabled !== (config.backgroundMotion !== false);
      return (
        didChange && stopWarmFrames(),
        (isWarmWood = isWarmWoodNext),
        (isWarmDusk = nextWarmDusk),
        (isMotionEnabled = config.backgroundMotion !== false),
        warmUniforms.warmDeep.value.set(isWarmDusk ? "#746c67" : "#d9d6cc"),
        warmUniforms.warmInk.value.set(isWarmDusk ? "#f4dfb6" : "#fff6dd"),
        warmUniforms.warmAccent.value.set(isWarmDusk ? "#9c765a" : "#b59b72"),
        themeController.configure(configuredTheme),
        isWarmWood && (themeController.suspend(), ensureWarmBackdrop()),
        applyBackgroundVisibility(),
        didChange && requestFrame(),
        didChange
      );
    },
    sync(sceneObjects, nextBackgroundEnabled) {
      ((backgroundObjects = sceneObjects),
        (isBackgroundEnabled = nextBackgroundEnabled !== false),
        isBackgroundEnabled || stopWarmFrames(),
        applyBackgroundVisibility());
    },
    interact(pointerEvent, shouldRaycast) {
      isWarmWood
        ? isBackgroundEnabled && requestFrame()
        : themeController.interact(pointerEvent, shouldRaycast);
    },
    tick(frameTimestampMs) {
      if (isDisposed) return Infinity;
      if (!isWarmWood) return themeController.tick(frameTimestampMs);
      if (!isBackgroundEnabled || globalThis.document?.hidden) return (stopWarmFrames(), Infinity);
      const camera = stageOptions.camera;
      (camera.updateMatrixWorld(), camera.getWorldDirection(cameraDirection));
      const cameraAspect =
          camera.aspect || (camera.right - camera.left) / (camera.top - camera.bottom) || 1,
        clampedAspect = Math.max(0.5, Math.min(2.5, cameraAspect));
      ((warmUniforms.warmAspect.value = clampedAspect),
        warmUniforms.warmShift.value.set(
          cameraDirection.x * 0.85,
          cameraDirection.z * 0.7 + cameraDirection.y * 0.25,
        ));
      const cameraDistance = camera.position.distanceTo(
          stageOptions.controls?.target || new THREE.Vector3(),
        ),
        warmScale = 1 + Math.tanh(Math.log(Math.max(cameraDistance, 1) / 35)) * 0.12;
      warmUniforms.warmScale.value = warmScale;
      const floorAnchorPoint = backgroundFloorAnchor(stageOptions, floorAnchorMap),
        floorTransition = stageOptions.backgroundFloorTransition;
      if (
        floorAnchorPoint &&
        floorTransition &&
        floorTransition.from !== stageOptions.backgroundFloor
      ) {
        const fromAnchorPoint = backgroundFloorAnchor(
          stageOptions,
          floorAnchorMap,
          floorTransition.from,
        );
        fromAnchorPoint &&
          floorAnchorPoint.lerpVectors(
            fromAnchorPoint,
            floorAnchorPoint.clone(),
            floorTransition.amount,
          );
      }
      floorAnchorPoint &&
        (projectedFloorAnchor.copy(floorAnchorPoint).project(camera),
        warmUniforms.warmAnchor.value
          .set(
            projectedFloorAnchor.x * clampedAspect * 12 * warmScale,
            -projectedFloorAnchor.y * 12 * warmScale,
          )
          .add(warmUniforms.warmShift.value));
      const deltaSeconds =
        lastTickMs === null
          ? 0
          : Math.min(0.06, Math.max(0, (frameTimestampMs - lastTickMs) / 1000));
      lastTickMs = frameTimestampMs;
      const overviewTarget = stageOptions.backgroundFloor === "all" ? 1 : 0;
      return (
        (warmUniforms.warmOverview.value +=
          (overviewTarget - warmUniforms.warmOverview.value) * (1 - Math.exp(-deltaSeconds * 4))),
        !isMotionEnabled || isReducedMotionPreferred
          ? (stopWarmFrames(), Infinity)
          : ((warmUniforms.warmTime.value += deltaSeconds),
            warmUniforms.warmFlow.value.multiplyScalar(Math.exp(-deltaSeconds * 2.4)),
            lastCameraPosition &&
              ((warmUniforms.warmFlow.value.x += Math.max(
                -0.08,
                Math.min(0.08, (camera.position.x - lastCameraPosition.x) * 0.04),
              )),
              (warmUniforms.warmFlow.value.y += Math.max(
                -0.08,
                Math.min(0.08, (camera.position.z - lastCameraPosition.z) * 0.04),
              ))),
            lastCameraPosition
              ? lastCameraPosition.copy(camera.position)
              : (lastCameraPosition = camera.position.clone()),
            frameTimestampMs - lastWarmFrameMs >= 50 &&
              ((isWarmAnimating = true),
              stageOptions.backgroundFrame?.(true, {
                separate: true,
              }),
              (lastWarmFrameMs = frameTimestampMs)),
            Math.max(0, 50 - (frameTimestampMs - lastWarmFrameMs)))
      );
    },
    suspend() {
      (themeController.suspend(), stopWarmFrames());
    },
    dispose() {
      ((isDisposed = true), stopWarmFrames(), themeController.dispose());
      for (const backgroundObjectToDispose of backgroundObjects)
        delete backgroundObjectToDispose.userData.backgroundThemeHidden;
      warmBackdrop &&
        (warmBackdrop.removeFromParent(),
        warmBackdrop.geometry.dispose(),
        warmBackdrop.material.dispose());
    },
  };
}
