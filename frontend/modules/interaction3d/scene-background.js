/**
 * 场景背景：在「经典网格 / 微光星尘」之上叠加「暖阳微光」。
 *
 * 在 3D 子系统里的位置：本模块包住 background-theme.js（地面主题控制器），
 * 对外提供完全相同的接口（theme / active / configure / sync / interact / tick /
 * suspend / dispose），stage.js 因此可以无差别地把它当成背景控制器使用。
 *
 * 暖阳原木主题下的做法与地面主题完全不同：不再给地面注入着色器，而是往
 * overlayScene 里挂一块全屏四边形，用屏幕空间的片元着色器画出「暖色底 + 尘埃 +
 * 一束阳光」。它替掉的是导出的 background / grid 这两个角色对象 —— 这些对象在
 * 暖阳下会被 backgroundThemeHidden 隐藏（见 applyBackgroundVisibility）。
 *
 * 对外提供：backgroundFloorAnchor、createSceneBackground。
 *
 * 约定：
 * - 全屏四边形把 project_vertex 整段换成 gl_Position = vec4(position.xy, 0.9999, 1.0)，
 *   即直接用裁剪空间坐标铺满屏幕；renderOrder 取 -10000 保证它先于所有物体绘制。
 * - 暖阳下的帧循环是「按需驱动」：每帧最多每 50ms 通知一次舞台请求重绘，返回值告诉
 *   舞台下次该隔多久再来 tick；停帧时返回 Infinity，舞台便会退出动画循环。
 * - 主题名 "warm-sunlight" 只在这里派生，不会下发给后端，也不落库。
 */

import { createBackgroundTheme } from "./background-theme.js?v=20260918181612";
/**
 * 求「背景锚点」：某层楼在展示坐标系里的平面中心，再往下压 0.203 米。
 *
 * 用途：暖阳的「阳光」要打在这层楼的中心上，而楼层切层时会走过渡动画，
 * 所以锚点必须能按任意楼层（含过渡中的来源层）实时求得。
 *
 * 平面中心取该层所有墙端点的包围盒中心；没有墙（或坐标非有限）时退化为原点。
 * 包围盒结果按 scene 缓存：同一份楼层数据在一次会话里不会变，缓存键用 scene 对象
 * 本身，楼层被重新导入时会换成新对象，缓存自然失效。
 *
 * @param {object} stageOptions 舞台上下文（需要 document / backgroundFloor / presentationPoint）。
 * @param {WeakMap} [anchorCache] 平面中心缓存（每个控制器一份）。
 * @param {string} [floorRef] 目标楼层：楼层 id，或 "all" 表示取最低层。
 * @returns {object|null} 展示坐标下的锚点向量；没有楼层时返回 null。
 */
export function backgroundFloorAnchor(
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
  // 地面上的物体才不会把光束整段挡住。
  return stageOptions.presentationPoint(anchorFloor.id, ...planCenter, -0.203);
}
/**
 * 暖阳尘埃的 GLSL 片段。
 *
 * 做法：把屏幕空间切成网格，每个格子用 hash 生成一颗尘埃（位置、半径、相位都不同），
 * 用 fwidth 做抗锯齿后得到「核心 + 光晕」两层亮度。threshold 用来丢掉一部分格子，
 * 让尘埃分布稀疏而不是均匀铺满。
 *
 * 注意：字符串里的换行与空格都属于着色器源码，改动会同时改变渲染结果与
 * customProgramCacheKey，不能用 JS 注释替代。
 */
const WARM_MOTES_CHUNK =
  "\nfloat warmMotes(vec2 p, float size, float threshold, float time) {\n vec2 cell=floor(p), f=fract(p);\n float seed=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);\n float seed2=fract(sin(dot(cell,vec2(269.5,183.3)))*43758.5453);\n vec2 center=vec2(seed,seed2)*0.56+0.22;\n center+=vec2(sin(time*0.19+seed*6.28),cos(time*0.16+seed2*6.28))*0.065;\n float d=length(f-center), aa=max(length(fwidth(p)),0.0001);\n float radius=size*mix(.6,1.35,seed2);\n float core=(1.0-smoothstep(radius,radius+aa,d))*min(1.0,radius/aa);\n float halo=exp(-d*d/(radius*radius*18.0))*.11;\n return (core+halo)*step(threshold,seed)*(.66+.34*sin(time*.45+seed2*6.28));\n}";
/**
 * 创建场景背景控制器。
 *
 * @param {object} stageOptions 舞台上下文：THREE / camera / controls / overlayScene /
 *     document / backgroundFloor / backgroundFloorTransition / presentationPoint /
 *     requestRender / backgroundFrame。
 * @param {() => void} [requestFrame] 请求重绘。
 * @returns {object} 与 createBackgroundTheme 同形的控制器；暖阳下额外派生
 *     theme === "warm-sunlight"。
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
  let isBackgroundEnabled = true;
  let isMotionEnabled = true;
  let isWarmAnimating = false;
  let isDisposed = false;
  let backgroundObjects = [];
  let lastTickMs = null;
  let lastWarmFrameMs = -Infinity;
  let lastCameraPosition = null;
  // 用户在系统里要求「减少动态效果」时完全停掉暖阳的帧循环：画面停在一帧静态构图上。
  const prefersReducedMotion =
    globalThis.window?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
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
    // 位置由着色器直接写裁剪空间坐标，包围盒没有意义，必须关掉视锥剔除。
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
      if (isWarmWood) {
        return "warm-sunlight";
      } else {
        return themeController.theme;
      }
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
     *
     * @param {string} configuredTheme 背景主题名（仅非暖阳时生效）。
     * @param {object} [config] 完整配置；读取 sceneStyle 与 backgroundMotion。
     * @returns {boolean} 是否需要外部重绘（主题或动态开关发生变化时为真）。
     */
    configure(configuredTheme, config = {}) {
      const nextWarmWood = config.sceneStyle === "warm-wood";
      const didChange =
        nextWarmWood !== isWarmWood || isMotionEnabled !== (config.backgroundMotion !== false);
      if (didChange) {
        // 主题或动态开关变了：先停掉当前帧循环，避免残留的时间基准把新主题算歪。
        stopWarmFrames();
      }
      isWarmWood = nextWarmWood;
      isMotionEnabled = config.backgroundMotion !== false;
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
     *
     * @param {Array<object>} sceneObjects 场景对象列表。
     * @param {boolean} nextBackgroundEnabled 背景总开关。
     * @returns {void}
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
     *
     * 暖阳下没有地面脉冲可打，但相机的每一次移动都值得重绘一帧；
     * 其余主题原样转交给地面主题控制器。
     *
     * @param {PointerEvent} pointerEvent 指针事件。
     * @param {boolean} [shouldRaycast] 是否额外做一次射线拾取。
     * @returns {void}
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
     *
     * @param {number} frameTimestampMs 当前时间。
     * @returns {number} 下次调用间隔；停帧时返回 Infinity。
     */
    tick(frameTimestampMs) {
      if (isDisposed) {
        return Infinity;
      }
      if (!isWarmWood) {
        return themeController.tick(frameTimestampMs);
      }
      // 背景被关掉、或页面切到后台：停帧，避免空转。
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
        // 楼层过渡中：在「来源层锚点」与「目标层锚点」之间插值，阳光落点平滑滑过去。
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
      // 单帧时间差封顶 60ms：切回标签页时不会因为巨大的间隔让动画跳一大步。
      const deltaSeconds =
        lastTickMs === null
          ? 0
          : Math.min(0.06, Math.max(0, (frameTimestampMs - lastTickMs) / 1000));
      lastTickMs = frameTimestampMs;
      // 总览模式下尘埃铺得更开（1），单层视角收到 0，用指数缓动避免切换时突兀。
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
