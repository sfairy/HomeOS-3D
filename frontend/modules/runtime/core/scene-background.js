/**
 * 场景背景：在「经典网格 / 微光星尘」之上叠加暖阳背景，包住 background-theme.js 并对外
 */

import { createBackgroundTheme } from "./background-theme.js?v=2609271508";
// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "./motion-preference.js?v=2609271508";
/**
 * 求「背景锚点」：某层楼在展示坐标系里的平面中心，再往下压 0.203 米，供暖阳「阳光」打光。
 */
function backgroundFloorAnchor(
  stageOptions,
  anchorCache = new WeakMap(),
  floorRef = stageOptions.backgroundFloor
) {
  const floors = stageOptions.document?.floors || [];
  // "all"（全楼总览）取海拔最低的那层当作锚点，保证阳光落点在整栋楼的地面附近。
  const anchorFloor =
    floorRef === "all"
      ? floors.reduce(
          (lowestFloor, candidateFloor) =>
            !lowestFloor || candidateFloor.elevation < lowestFloor.elevation
              ? candidateFloor
              : lowestFloor,
          null
        )
      : floors.find(candidateFloor => candidateFloor.id === floorRef) || floors[0];
  if (!anchorFloor) {
    return null;
  }
  let planCenter = anchorCache.get(anchorFloor.scene);
  if (!planCenter) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const wall of anchorFloor.scene.walls || []) {
      for (const wallEndpoint of [wall.start, wall.end]) {
        minX = Math.min(minX, wallEndpoint.x);
        minY = Math.min(minY, wallEndpoint.y);
        maxX = Math.max(maxX, wallEndpoint.x);
        maxY = Math.max(maxY, wallEndpoint.y);
      }
    }
    planCenter = Number.isFinite(minX)
      ? [(minX + maxX) / 2, (minY + maxY) / 2]
      : [0, 0];
    anchorCache.set(anchorFloor.scene, planCenter);
  }
  // 平面坐标的 y 对应展示坐标的 y，高度固定下压 0.203 米：让阳光落在楼板略下方，
  return stageOptions.presentationPoint(anchorFloor.id, ...planCenter, -0.203);
}
/**
 * 暖阳尘埃的 GLSL 片段：把屏幕空间切成网格，每格用 hash 生成一颗尘埃，fwidth 抗锯齿后得到
 */
const WARM_MOTES_CHUNK =
  "\nfloat warmMotes(vec2 p, float size, float threshold, float time) {\n vec2 cell=floor(p), f=fract(p);\n float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);\n float seed2=fract(sin(dot(cell,vec2(269.5,183.3)))*43758.5453);\n vec2 center=vec2(seed,seed2)*0.56+0.22;\n center+=vec2(sin(time*0.19+seed*6.28),cos(time*0.16+seed2*6.28))*0.065;\n float d=length(f-center), aa=max(length(fwidth(p)),0.0001);\n float radius=size*mix(.6,1.35,seed2);\n float core=(1.0-smoothstep(radius,radius+aa,d))*min(1.0,radius/aa);\n float halo=exp(-d*d/(radius*radius*18.0))*.11;\n return (core+halo)*step(threshold,seed)*(.66+.34*sin(time*.45+seed2*6.28));\n}";
/**
 * 创建场景背景控制器。
 */
export function createSceneBackground(stageOptions, requestFrame = () => {}) {
  const themeController = createBackgroundTheme(stageOptions, requestFrame);
  const { THREE: THREE } = stageOptions;
  // 楼层平面中心缓存：键是楼层 scene 对象，楼层重载后自动失效。
  const anchorCache = new WeakMap();
  const projectedFloorAnchor = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  // 全屏暖阳背景的 uniform。挂在材质上，所有注入共用同一份引用。
  const warmUniforms = {
    warmAspect: {
      value: 1
    },
    warmScale: {
      value: 1
    },
    warmShift: {
      value: new THREE.Vector2()
    },
    warmAnchor: {
      value: new THREE.Vector2()
    },
    warmTime: {
      value: 0
    },
    warmOverview: {
      value: 0
    },
    warmFlow: {
      value: new THREE.Vector2()
    },
    // 暖阳的三档色：底色（暖灰）、光色（暖白）、点缀（浅木）。
    warmDeep: {
      value: new THREE.Color("#d9d6cc")
    },
    warmInk: {
      value: new THREE.Color("#fff6dd")
    },
    warmAccent: {
      value: new THREE.Color("#b59b72")
    }
  };
  let warmBackdrop = null;
  let isWarmWood = false;
  // 暖阳背景的两档配色：默认「暖阳微光」，暖阳原木主题下可再叠一层「暖阳暮色」。
  let isWarmDusk = false;
  let isBackgroundEnabled = true;
  let isMotionEnabled = true;
  let isWarmAnimating = false;
  let isDisposed = false;
  let backgroundObjects = [];
  let lastTickMs = null;
  let lastWarmFrameMs = -Infinity;
  let lastCameraPosition = null;
  // 用户在系统里要求「减少动态效果」时完全停掉暖阳的帧循环：画面停在一帧静态构图上。
  const prefersReducedMotion = prefersReducedMotionNow();
  /** 惰性创建全屏暖阳背景（只在第一次进入暖阳主题时建一次）。 */
  function ensureWarmBackdrop() {
    if (warmBackdrop) {
      return;
    }
    const warmMaterial = new THREE.MeshBasicMaterial({
      color: 15658212,
      // 全屏背景不参与深度：既不该遮挡任何物体，也不该被物体遮挡。
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });
    warmMaterial.onBeforeCompile = compiledShader => {
      Object.assign(compiledShader.uniforms, warmUniforms);
      compiledShader.vertexShader = compiledShader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\n        varying vec2 warmPoint; uniform float warmAspect; uniform float warmScale; uniform vec2 warmShift;"
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\n          warmPoint=vec2(position.x*warmAspect,-position.y)*12.0*warmScale+warmShift;"
        )
        // 整段替换投影：直接输出裁剪空间坐标，四边形永远铺满屏幕。
        .replace("#include <project_vertex>", "gl_Position=vec4(position.xy,0.9999,1.0);");
      compiledShader.fragmentShader = compiledShader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\n        varying vec2 warmPoint; uniform vec2 warmAnchor; uniform float warmTime; uniform float warmOverview;\n        uniform vec2 warmFlow; uniform vec3 warmDeep; uniform vec3 warmInk; uniform vec3 warmAccent;\n        " +
            WARM_MOTES_CHUNK
        )
        .replace(
          "#include <color_fragment>",
          "#include <color_fragment>\n          vec2 bgUV=warmPoint/6.0;\n          float fade=1.0-smoothstep(2.2,4.2,length(bgUV));\n          vec2 drift=vec2(warmTime*.009,-warmTime*.006);\n          vec2 flow=warmFlow*.11;\n          vec2 uv=bgUV/mix(1.0,1.22,warmOverview);\n          float nearDust=warmMotes(uv/.22+drift+flow,.021,.68,warmTime);\n          float farDust=warmMotes(uv/.095-drift*.42+flow*.32,.016,.80,warmTime+7.0);\n          vec2 wash=(warmPoint-warmAnchor)/6.0*vec2(.68,1.12);\n          float sunlight=exp(-dot(wash,wash)*.72);\n          vec3 base=mix(warmDeep,vec3(.94,.914,.858),.28+sunlight*.58);\n          float dust=(nearDust*.74+farDust*.26)*fade;\n          base=mix(base,warmAccent,min(.18,dust*.12));\n          base+=vec3(1.0,.93,.77)*(nearDust*.38+farDust*.15)*fade;\n          diffuseColor.rgb=base+warmInk*sunlight*.008;"
        );
    };
    // 注入是固定的一套，缓存键取常量字符串即可（改注入代码要同时改版本号）。
    warmMaterial.customProgramCacheKey = () => "warm-wood-backdrop-v1";
    warmBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), warmMaterial);
    warmBackdrop.name = "warm-wood-background";
    // 最先绘制：renderOrder 取极小值，配合 depthTest:false 保证它在所有物体之下。
    warmBackdrop.renderOrder = -10000;
    warmBackdrop.frustumCulled = false;
    stageOptions.overlayScene?.add(warmBackdrop);
  }
  /** 停掉暖阳帧循环：清掉时间与相机基准，并通知舞台不再需要每帧重绘。 */
  function stopWarmFrames() {
    lastTickMs = null;
    lastCameraPosition = null;
    if (isWarmAnimating) {
      isWarmAnimating = false;
      stageOptions.backgroundFrame?.(false);
    }
  }
  /**
   * 写入暖阳背景的配色。
   */
  function applyWarmPalette(useDuskPalette) {
    warmUniforms.warmDeep.value.set(useDuskPalette ? "#746c67" : "#d9d6cc");
    warmUniforms.warmInk.value.set(useDuskPalette ? "#f4dfb6" : "#fff6dd");
    warmUniforms.warmAccent.value.set(useDuskPalette ? "#9c765a" : "#b59b72");
  }
  /** 按当前主题与开关，同步地面主题控制器、全屏背景的可见性与导出对象的隐藏标记。 */
  function applyBackgroundVisibility() {
    // 暖阳下不给地面主题传对象：那块全屏背景会顶替地面，地面主题也就无需生效。
    themeController.sync(isWarmWood ? [] : backgroundObjects, isBackgroundEnabled);
    if (warmBackdrop) {
      warmBackdrop.visible = isWarmWood && isBackgroundEnabled;
    }
    if (isWarmWood) {
      // 暖阳下彻底藏掉导出的 background / grid 对象：它们的深色底会盖住暖色背景。
      for (const backgroundObject of backgroundObjects) {
        backgroundObject.userData.backgroundThemeHidden = true;
        backgroundObject.visible = false;
      }
    } else {
      // 回到默认主题时只清 background 角色的标记；grid 的显隐归地面主题管。
      for (const backgroundObject of backgroundObjects) {
        if (backgroundObject.userData.exportRole !== "grid") {
          backgroundObject.userData.backgroundThemeHidden = false;
        }
      }
    }
  }
  return {
    get theme() {
      if (!isWarmWood) {
        return themeController.theme;
      }
      // 对外暴露的是「当前真正生效的配色档」，而不是配置里的原始值：调用方据此判断
      return isWarmDusk ? "warm-dusk" : "warm-sunlight";
    },
    get active() {
      if (isWarmWood) {
        return isWarmAnimating;
      } else {
        return themeController.active;
      }
    },
    /**
     * 切换主题与暖阳开关。
     */
    configure(configuredTheme, config = {}) {
      const nextWarmWood = config.sceneStyle === "warm-wood";
      // 暮色只在暖阳原木主题下成立：其余主题连暖阳背景都不显示，更谈不上哪一档配色。
      const warmThemeChoice = config.warmBackgroundTheme || config.backgroundTheme;
      const nextWarmDusk =
        nextWarmWood &&
        (warmThemeChoice === true || warmThemeChoice === "warm-dusk");
      const didChange =
        nextWarmWood !== isWarmWood ||
        nextWarmDusk !== isWarmDusk ||
        isMotionEnabled !== (config.backgroundMotion !== false);
      if (didChange) {
        stopWarmFrames();
      }
      isWarmWood = nextWarmWood;
      isWarmDusk = nextWarmDusk;
      isMotionEnabled = config.backgroundMotion !== false;
      // 三支颜色每次都重写：本函数的调用频率是「宿主发来整份配置时」，写颜色可忽略不计，
      applyWarmPalette(nextWarmDusk);
      themeController.configure(configuredTheme);
      if (isWarmWood) {
        // 暖阳下地面主题整体让位：suspend 清掉它的交互状态，且不再参与 tick。
        themeController.suspend();
        ensureWarmBackdrop();
      }
      applyBackgroundVisibility();
      if (didChange) {
        requestFrame();
      }
      return didChange;
    },
    /**
     * 同步需要处理的场景对象（studio-app 传入选中的 background / grid 角色对象）。
     */
    sync(sceneObjects, nextBackgroundEnabled) {
      backgroundObjects = sceneObjects;
      isBackgroundEnabled = nextBackgroundEnabled !== false;
      if (!isBackgroundEnabled) {
        stopWarmFrames();
      }
      applyBackgroundVisibility();
    },
    /**
     * 处理一次指针交互。
     */
    interact(pointerEvent, shouldRaycast) {
      if (isWarmWood) {
        if (isBackgroundEnabled) {
          requestFrame();
        }
      } else {
        themeController.interact(pointerEvent, shouldRaycast);
      }
    },
    /**
     * 推进一帧。
     */
    tick(frameTimestampMs) {
      if (isDisposed) {
        return Infinity;
      }
      if (!isWarmWood) {
        return themeController.tick(frameTimestampMs);
      }
      if (!isBackgroundEnabled || globalThis.document?.hidden) {
        stopWarmFrames();
        return Infinity;
      }
      const camera = stageOptions.camera;
      camera.updateMatrixWorld();
      camera.getWorldDirection(cameraDirection);
      // 宽高比优先取相机自身字段，正交相机没有 aspect 时再由投影范围推算。
      const cameraAspect =
        camera.aspect || (camera.right - camera.left) / (camera.top - camera.bottom) || 1;
      warmUniforms.warmAspect.value = cameraAspect;
      // 偏移量取视线方向的分量：转头时暖色底会跟着轻微平移，产生视差。
      warmUniforms.warmShift.value.set(
        cameraDirection.x * 0.85,
        cameraDirection.z * 0.7 + cameraDirection.y * 0.25
      );
      // 相机离轨道中心越远，整体纹理越放大（tanh 让变化在两端收敛）。
      const cameraDistance = camera.position.distanceTo(
        stageOptions.controls?.target || new THREE.Vector3()
      );
      const warmScale = 1 + Math.tanh(Math.log(Math.max(cameraDistance, 1) / 35)) * 0.12;
      warmUniforms.warmScale.value = warmScale;
      const floorAnchorPoint = backgroundFloorAnchor(stageOptions, anchorCache);
      const floorTransition = stageOptions.backgroundFloorTransition;
      if (
        floorAnchorPoint &&
        floorTransition &&
        floorTransition.from !== stageOptions.backgroundFloor
      ) {
        const fromAnchorPoint = backgroundFloorAnchor(stageOptions, anchorCache, floorTransition.from);
        if (fromAnchorPoint) {
          floorAnchorPoint.lerpVectors(fromAnchorPoint, floorAnchorPoint.clone(), floorTransition.amount);
        }
      }
      if (floorAnchorPoint) {
        projectedFloorAnchor.copy(floorAnchorPoint).project(camera);
        // 锚点转到与顶点着色器相同的「warmPoint」空间：x 乘宽高比、y 取负。
        warmUniforms.warmAnchor.value
          .set(
            projectedFloorAnchor.x * cameraAspect * 12 * warmScale,
            -projectedFloorAnchor.y * 12 * warmScale
          )
          .add(warmUniforms.warmShift.value);
      }
      const deltaSeconds =
        lastTickMs === null
          ? 0
          : Math.min(0.06, Math.max(0, (frameTimestampMs - lastTickMs) / 1000));
      lastTickMs = frameTimestampMs;
      const overviewTarget = stageOptions.backgroundFloor === "all" ? 1 : 0;
      warmUniforms.warmOverview.value +=
        (overviewTarget - warmUniforms.warmOverview.value) * (1 - Math.exp(-deltaSeconds * 4));
      if (!isMotionEnabled || prefersReducedMotion) {
        stopWarmFrames();
        return Infinity;
      }
      warmUniforms.warmTime.value += deltaSeconds;
      // 相机移动会在「流场」里留下痕迹：先自行衰减，再叠加这一帧的位移。
      warmUniforms.warmFlow.value.multiplyScalar(Math.exp(-deltaSeconds * 2.4));
      if (lastCameraPosition) {
        warmUniforms.warmFlow.value.x += Math.max(
          -0.08,
          Math.min(0.08, (camera.position.x - lastCameraPosition.x) * 0.04)
        );
        warmUniforms.warmFlow.value.y += Math.max(
          -0.08,
          Math.min(0.08, (camera.position.z - lastCameraPosition.z) * 0.04)
        );
      }
      if (lastCameraPosition) {
        lastCameraPosition.copy(camera.position);
      } else {
        lastCameraPosition = camera.position.clone();
      }
      // 帧率上限 20fps（50ms）：暖阳只是缓慢飘动的背景，不需要跟随屏幕刷新率。
      if (frameTimestampMs - lastWarmFrameMs >= 50) {
        isWarmAnimating = true;
        stageOptions.backgroundFrame?.(true);
        stageOptions.requestRender?.();
        lastWarmFrameMs = frameTimestampMs;
      }
      return Math.max(0, 50 - (frameTimestampMs - lastWarmFrameMs));
    },
    /** 暂停：停掉帧循环但保留注入与背景对象，切回页面时可直接续跑。 */
    suspend() {
      themeController.suspend();
      stopWarmFrames();
    },
    dispose() {
      isDisposed = true;
      stopWarmFrames();
      themeController.dispose();
      for (const backgroundObject of backgroundObjects) {
        delete backgroundObject.userData.backgroundThemeHidden;
      }
      if (warmBackdrop) {
        warmBackdrop.removeFromParent();
        warmBackdrop.geometry.dispose();
        warmBackdrop.material.dispose();
      }
    }
  };
}
