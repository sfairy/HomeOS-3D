/**
 * 背景主题（地面网格 / 微光星尘）：给地面材质注入 GLSL（onBeforeCompile + 自定义 uniform），
 * 在同一份网格上切换出「经典网格」与「微光星尘」两种外观，并让地面能对指针交互产生光影反馈。
 *
 * 约定：星尘主题把注入代码的版本号写进 customProgramCacheKey（":hb-ground-theme-v5"），改注入代码
 * 时必须同时改它，否则 three.js 会复用旧程序。地面局部坐标与世界对应关系是 vec2(position.x, -position.y)：
 * 平面几何的 +Y 对应场景的 -Z，故所有注入代码里都带负号。
 */

// 「减少动态效果」偏好的唯一判定。
import { prefersReducedMotionNow } from "./motion-preference.js?v=2609212100";

/**
 * 归一化主题名。
 *
 * "contours" 是早期版本的旧名，仍映射到 dots，保证老配置升级后不会掉回网格。
 */
const normalizeBackgroundTheme = themeName =>
  themeName === "dots" || themeName === "contours" ? "dots" : "grid";
// 注入到顶点 / 片元着色器的代码片段。
// 注意：字符串里的 // 是 GLSL 注释，属于着色器源码的一部分，必须原样保留 ——
// 改动它会同时改变 customProgramCacheKey 与渲染结果，且无法用 JS 注释替代。
const GROUND_THEME_UNIFORM_CHUNK =
  "\nvarying vec2 vHbGround;\nuniform float hbGroundTheme;\nuniform float hbGroundSpan;\nuniform float hbGroundCoverage;\nuniform float hbGroundFallback;\nuniform vec2 hbGroundCenter;\nuniform vec3 hbGroundDeep;\nuniform float hbGroundActivity;\nuniform vec3 hbGroundPulse;\nuniform vec3 hbGroundInk;\nuniform vec3 hbGroundAccent;\n";
const GROUND_THEME_FRAGMENT_CHUNK =
  "\nif (hbGroundTheme > 0.5) {\ndiffuseColor.a = (hbGroundFallback >= 0.0 ? hbGroundFallback : diffuseColor.a) / hbGroundCoverage;\nvec2 bgP = vHbGround - hbGroundCenter;\nvec2 bgUV = bgP / hbGroundSpan;\nfloat bgR2 = dot(bgUV, bgUV);\nfloat bgHalo = exp(-bgR2 * 0.55);\nfloat bgCore = exp(-bgR2 * 2.4);\nfloat bgFade = 1.0 - smoothstep(2.2, 4.2, length(bgUV));\nfloat bgAge = hbGroundPulse.z;\n// A broad, quiet response; never a sharp concentric ring.\nvec2 bgTouch = (vHbGround - hbGroundPulse.xy) / (hbGroundSpan * 0.38);\nfloat bgFeedback = exp(-dot(bgTouch, bgTouch) * 0.6)\n  * max(0.0, 1.0 - bgAge / 1.25);\nvec3 bgBase = mix(diffuseColor.rgb * 0.34, hbGroundDeep, 0.84);\nbgBase *= mix(1.0, 0.62, smoothstep(0.65, 2.8, length(bgUV)));\nvec3 bgLight = hbGroundInk * bgHalo * 0.085 + hbGroundAccent * bgCore * 0.014;\n  // Uneven, widely separated motes. Fixed world size and pixel coverage keep\n  // far points from turning into a dense, equally bright dotted wallpaper.\n  vec2 bgCellP = bgUV / 0.44;\n  vec2 bgCell = floor(bgCellP);\n  float bgSeed = fract(sin(dot(bgCell, vec2(127.1, 311.7))) * 43758.5453);\n  float bgSeed2 = fract(sin(dot(bgCell, vec2(269.5, 183.3))) * 43758.5453);\n  vec2 bgOffset = vec2(bgSeed, bgSeed2) * 0.64 + 0.18;\n  float bgDistance = length(fract(bgCellP) - bgOffset);\n  float bgAA = max(length(fwidth(bgCellP)), 0.0001);\n  float bgRadius = mix(0.004, 0.012, bgSeed2);\n  float bgPoint = (1.0 - smoothstep(bgRadius, bgRadius + bgAA * 0.75, bgDistance))\n    * min(1.0, bgRadius / bgAA) * step(0.66, bgSeed);\n  float bgVeil = (0.2 + 0.8 * exp(-bgR2 * 0.22)) * bgFade;\n  bgLight += hbGroundAccent * bgPoint * bgVeil * (0.32 + hbGroundActivity * 0.06);\ndiffuseColor.rgb = bgBase + bgLight * (1.0 + hbGroundActivity * 0.12)\n  + hbGroundAccent * bgFeedback * bgFade * 0.009;\n}\n";
/**
 * 创建背景主题控制器。
 */
export function createBackgroundTheme(
  stageOptions,
  requestFrame = () => {},
  now = () => performance.now()
) {
  const { THREE: THREE } = stageOptions;
  // 被注入着色器的地面对象 → 注入记录（材质、uniform、原始回调与混合参数）。
  const entriesByObject = new Map();
  // exportRole === "grid" 的网格对象：只在「经典网格」主题下可见。
  const gridObjects = new Set();
  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  // 星尘的配色：墨蓝做底色光晕、浅青做点缀、深蓝做渐变基底。
  const inkColor = new THREE.Color("#6b8199");
  const accentColor = new THREE.Color("#b5cbd8");
  const deepColor = new THREE.Color("#182431");
  // 用户要求「减少动态效果」时完全关掉星尘的交互反馈（既不扫描也不重绘）。
  const prefersReducedMotion = prefersReducedMotionNow();
  let activeTheme = "grid";
  let isSyncEnabled = true;
  let isDisposed = false;
  let isAnimating = false;
  let lastInteractionMs = -Infinity;
  let lastPulseMs = -Infinity;
  let pulsingObject = null;
  let lastOpaqueObject = null;
  const pulseNdc = new THREE.Vector2();
  // 会被本模块改写的混合参数：注入后要改成预乘 alpha 的合成方式，销毁时必须还原。
  const BLEND_PROPERTY_KEYS = [
    "blending",
    "blendEquation",
    "blendSrc",
    "blendDst",
    "blendEquationAlpha",
    "blendSrcAlpha",
    "blendDstAlpha"
  ];
  /**
   * 该对象是否应当保持可见：楼层背景隐藏逻辑（floorBackgroundHidden）会藏起远处楼层地面，
   * 但被选为「兜底不透明层」的地面必须例外，否则整体透明度会不足。
   */
  const shouldRemainVisible = candidateObject =>
    !candidateObject.userData.floorBackgroundHidden ||
    !!candidateObject.userData.backgroundThemeKeepVisible;
  /** 还原一次注入：关掉主题分支、恢复混合参数与着色器回调。 */
  function restoreMaterial(entry) {
    const {
      material: entryMaterial,
      beforeCompile: originalBeforeCompile,
      programKey: originalProgramKey
    } = entry;
    entry.uniforms.hbGroundTheme.value = 0;
    delete entry.object.userData.backgroundThemeKeepVisible;
    for (const blendProperty of BLEND_PROPERTY_KEYS) {
      entryMaterial[blendProperty] = entry.blend[blendProperty];
    }
    // 只有在回调仍是我们替换的那个时才还原，避免覆盖别的模块后来的修改。
    if (entryMaterial.onBeforeCompile === entry.compile) {
      entryMaterial.onBeforeCompile = originalBeforeCompile;
    }
    if (entryMaterial.customProgramCacheKey === entry.key) {
      entryMaterial.customProgramCacheKey = originalProgramKey;
    }
    entryMaterial.needsUpdate = true;
  }
  /**
   * 给一块地面材质注入星尘着色代码。
   */
  function applyGroundTheme(meshObject) {
    const meshMaterial = meshObject.material;
    // 只处理 Basic 材质且几何体声明了宽度的网格：其它材质没有 color_fragment 注入点。
    if (!meshMaterial?.isMeshBasicMaterial || !meshObject.geometry?.parameters?.width) {
      return;
    }
    const groundThemeEntry = {
      object: meshObject,
      material: meshMaterial,
      beforeCompile: meshMaterial.onBeforeCompile,
      programKey: meshMaterial.customProgramCacheKey,
      blend: Object.fromEntries(
        BLEND_PROPERTY_KEYS.map(blendPropertyKey => [
          blendPropertyKey,
          meshMaterial[blendPropertyKey]
        ])
      ),
      uniforms: {
        // 主题开关：1 表示走星尘分支，0 表示保持原样。
        hbGroundTheme: {
          value: activeTheme === "dots" ? 1 : 0
        },
        // 覆盖度：多块半透明地面叠在一起时，用它把 alpha 除回去，避免重复叠加变亮。
        hbGroundCoverage: {
          value: 1
        },
        // 兜底透明度：负数表示不使用兜底（-1 是「未设置」的哨兵值）。
        hbGroundFallback: {
          value: -1
        },
        // 星尘的空间尺度取地面宽度的 1/16 再乘 0.7，最小 6：让颗粒密度与场景尺寸匹配。
        hbGroundSpan: {
          value: Math.max(6, (meshObject.geometry.parameters.width / 16) * 0.7)
        },
        hbGroundCenter: {
          value: new THREE.Vector2()
        },
        hbGroundDeep: {
          value: deepColor
        },
        hbGroundActivity: {
          value: 0
        },
        // z 分量存的是脉冲年龄（秒），2 表示「无脉冲」（超过 1.25 秒的判定阈值）。
        hbGroundPulse: {
          value: new THREE.Vector3(0, 0, 2)
        },
        hbGroundInk: {
          value: inkColor
        },
        hbGroundAccent: {
          value: accentColor
        }
      }
    };
    // 先把版本后缀从原键里剥掉，避免反复注入时版本号不断累积。
    const baseProgramKey = groundThemeEntry.programKey
      .call(meshMaterial)
      .replace(/:hb-ground-theme-v[0-9]+/g, "");
    groundThemeEntry.compile = function (shader, renderer) {
      // 先跑原来的注入逻辑，再叠加本模块的改动，保证与其它效果共存。
      groundThemeEntry.beforeCompile.call(this, shader, renderer);
      Object.assign(shader.uniforms, groundThemeEntry.uniforms);
      // 幂等保护：同一份 shader 被重复编译时不重复插入。
      if (!shader.fragmentShader.includes("uniform float hbGroundTheme;")) {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vHbGround;")
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHbGround = vec2(position.x, -position.y);"
          );
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\n" + GROUND_THEME_UNIFORM_CHUNK)
          .replace(
            "#include <color_fragment>",
            "#include <color_fragment>\n" + GROUND_THEME_FRAGMENT_CHUNK
          );
      }
    };
    // 版本号参与程序缓存键：改注入代码必须同时改版本号（v5），否则 shader 不会重编。
    groundThemeEntry.key = () => baseProgramKey + ":hb-ground-theme-v5";
    meshMaterial.onBeforeCompile = groundThemeEntry.compile;
    meshMaterial.customProgramCacheKey = groundThemeEntry.key;
    meshMaterial.needsUpdate = true;
    entriesByObject.set(meshObject, groundThemeEntry);
  }
  /** 复位所有交互状态（活动强度、脉冲、动画循环）。 */
  function resetInteraction() {
    lastInteractionMs = lastPulseMs = -Infinity;
    pulsingObject = null;
    for (const entryToReset of entriesByObject.values()) {
      entryToReset.uniforms.hbGroundActivity.value = 0;
      entryToReset.uniforms.hbGroundPulse.value.z = 2;
    }
    if (isAnimating) {
      isAnimating = false;
      stageOptions.backgroundFrame?.(false);
    }
  }
  return {
    get theme() {
      return activeTheme;
    },
    get active() {
      return isAnimating;
    },
    get materialCount() {
      return entriesByObject.size;
    },
    /**
     * 切换主题。
     */
    configure(configuredTheme) {
      const normalizedTheme = normalizeBackgroundTheme(configuredTheme);
      if (isDisposed || normalizedTheme === activeTheme) {
        return false;
      }
      // 切主题前先清掉交互状态：脉冲位置属于旧主题的坐标系，留着会有一帧错位。
      resetInteraction();
      activeTheme = normalizedTheme;
      for (const themeEntry of entriesByObject.values()) {
        themeEntry.uniforms.hbGroundTheme.value = normalizedTheme === "dots" ? 1 : 0;
      }
      requestFrame();
      return true;
    },
    /**
     * 同步场景对象。
     */
    sync(sceneObjects, isBackgroundEnabled) {
      if (isDisposed) {
        return;
      }
      isSyncEnabled = isBackgroundEnabled !== false;
      if (!isSyncEnabled) {
        resetInteraction();
      }
      const themedObjects = new Set();
      for (const themedObject of sceneObjects) {
        if (themedObject.userData.exportRole === "grid") {
          // 网格对象只在网格主题下显示：星尘主题用着色器自带的点阵替代它。
          themedObject.userData.backgroundThemeHidden = activeTheme !== "grid";
          gridObjects.add(themedObject);
        } else if (themedObject.userData.exportRole === "background" && activeTheme !== "grid") {
          themedObjects.add(themedObject);
          const staleMaterialEntry = entriesByObject.get(themedObject);
          // 材质被换过（例如主题重载）：旧注入已失效，还原后重新注入。
          if (staleMaterialEntry && staleMaterialEntry.material !== themedObject.material) {
            restoreMaterial(staleMaterialEntry);
            entriesByObject.delete(themedObject);
          }
          if (!entriesByObject.has(themedObject)) {
            applyGroundTheme(themedObject);
          }
          const entryForObject = entriesByObject.get(themedObject);
          // 把「轨道中心」换算到地面局部坐标，星尘的亮心里外层次始终围绕户型中心。
          const orbitCenter = stageOptions.getOrbitCenter?.();
          if (entryForObject && orbitCenter?.length === 3 && orbitCenter.every(Number.isFinite)) {
            themedObject.updateWorldMatrix(true, false);
            const localOrbitCenter = themedObject.worldToLocal(new THREE.Vector3(...orbitCenter));
            entryForObject.uniforms.hbGroundCenter.value.set(
              localOrbitCenter.x,
              -localOrbitCenter.y
            );
          }
        }
      }
      for (const [trackedObject, trackedEntry] of entriesByObject) {
        // 对象已不再需要主题、或材质被替换：还原并移出跟踪表。
        if (!themedObjects.has(trackedObject) || trackedEntry.material !== trackedObject.material) {
          restoreMaterial(trackedEntry);
          entriesByObject.delete(trackedObject);
        }
      }
      for (const staleGridObject of gridObjects) {
        if (!sceneObjects.includes(staleGridObject)) {
          delete staleGridObject.userData.backgroundThemeHidden;
          gridObjects.delete(staleGridObject);
        }
      }
      for (const resetEntry of entriesByObject.values()) {
        // 每轮重新判定兜底层，先假定都不需要保持可见。
        delete resetEntry.object.userData.backgroundThemeKeepVisible;
        resetEntry.uniforms.hbGroundFallback.value = -1;
      }
      const visibleEntries = [...entriesByObject.values()].filter(visibleEntry =>
        shouldRemainVisible(visibleEntry.object)
      );
      let totalOpacity = visibleEntries.reduce(
        (opacityAccumulator, contributingEntry) =>
          opacityAccumulator + contributingEntry.material.opacity,
        0
      );
      // 兜底不透明层：当所有可见地面的不透明度加起来不到 1 时（多层叠加被隐藏），
      // 需要让一块「被判定为不可见」的半透明地面顶上来补齐，否则会透出场景底色。
      // 优先复用上一次用的那块，避免每帧切换导致画面闪动。
      const previousFallbackEntry = entriesByObject.get(lastOpaqueObject);
      const fallbackEntry =
        previousFallbackEntry?.material.transparent &&
        !visibleEntries.includes(previousFallbackEntry) &&
        previousFallbackEntry.material.opacity > 0
          ? previousFallbackEntry
          : [...entriesByObject.values()]
              .filter(
                transparentEntry =>
                  transparentEntry.material.transparent &&
                  !visibleEntries.includes(transparentEntry)
              )
              .sort(
                (firstEntry, secondEntry) =>
                  secondEntry.material.opacity - firstEntry.material.opacity
              )[0];
      if (
        fallbackEntry?.material.transparent &&
        !visibleEntries.includes(fallbackEntry) &&
        totalOpacity < 1
      ) {
        fallbackEntry.object.userData.backgroundThemeKeepVisible = true;
        // 差值直接交给着色器作为该层的 alpha，从而把总覆盖率补到 1。
        fallbackEntry.uniforms.hbGroundFallback.value = 1 - totalOpacity;
        totalOpacity = 1;
      } else if (visibleEntries.length === 1 && visibleEntries[0].material.opacity > 0.999) {
        // 只有一层且基本不透明：它天然就是兜底层，记下来供下次优先复用。
        lastOpaqueObject = visibleEntries[0].object;
      }
      totalOpacity = Math.max(1, totalOpacity);
      for (const blendTargetEntry of entriesByObject.values()) {
        const { material: targetMaterial, uniforms: targetUniforms } = blendTargetEntry;
        // 半透明层按总覆盖度归一化 alpha；不透明层保持 1。
        targetUniforms.hbGroundCoverage.value = targetMaterial.transparent ? totalOpacity : 1;
        if (targetMaterial.transparent) {
          // 改用预乘 alpha 的自定义混合：多层半透明地面叠加时不会出现「越叠越亮」，
          // 这是与上面的 coverage 归一化配套的（两者缺一都会导致亮度不对）。
          targetMaterial.blending = THREE.CustomBlending;
          targetMaterial.blendEquation = targetMaterial.blendEquationAlpha = THREE.AddEquation;
          targetMaterial.blendSrc = targetMaterial.premultipliedAlpha
            ? THREE.OneFactor
            : THREE.SrcAlphaFactor;
          targetMaterial.blendDst =
            targetMaterial.blendSrcAlpha =
            targetMaterial.blendDstAlpha =
              THREE.OneFactor;
        }
      }
    },
    /**
     * 处理一次指针交互。
     */
    interact(pointerEvent, shouldRaycast = false) {
      // 网格主题没有交互反馈；减少动态效果时不打扰用户；没有地面时无事可做。
      if (
        isDisposed ||
        !isSyncEnabled ||
        activeTheme === "grid" ||
        prefersReducedMotion ||
        !entriesByObject.size
      ) {
        return;
      }
      const interactionTimestampMs = now();
      lastInteractionMs = interactionTimestampMs;
      if (shouldRaycast) {
        const canvasRect = stageOptions.canvas.getBoundingClientRect();
        if (canvasRect.width && canvasRect.height) {
          // 屏幕坐标 → 归一化设备坐标（NDC）：注意 Y 轴方向相反。
          pointerNdc.set(
            ((pointerEvent.clientX - canvasRect.left) / canvasRect.width) * 2 - 1,
            1 - ((pointerEvent.clientY - canvasRect.top) / canvasRect.height) * 2
          );
          raycaster.setFromCamera(pointerNdc, stageOptions.camera);
          // 只对「祖先链全部可见」的地面做拾取：被隐藏楼层的地面不该接收点击脉冲。
          const raycastTargets = [...entriesByObject.keys()].filter(candidateMeshObject => {
            for (
              let visibilityAncestor = candidateMeshObject;
              visibilityAncestor;
              visibilityAncestor = visibilityAncestor.parent
            ) {
              if (!visibilityAncestor.visible) {
                return false;
              }
            }
            candidateMeshObject.updateWorldMatrix(true, false);
            return true;
          });
          const firstHit = raycaster.intersectObjects(raycastTargets, false)[0];
          if (firstHit) {
            // 命中点转到地面局部坐标，并按 same 约定取 -y；脉冲只作用在命中的那一块地面上。
            const localHitPoint = firstHit.object.worldToLocal(firstHit.point);
            pulseNdc.set(localHitPoint.x, -localHitPoint.y);
            pulsingObject = firstHit.object;
            lastPulseMs = interactionTimestampMs;
          }
        }
      }
      requestFrame();
    },
    /**
     * 推进交互衰减。
     */
    tick(frameTimestampMs) {
      if (isDisposed || !isSyncEnabled || activeTheme === "grid" || prefersReducedMotion) {
        resetInteraction();
        return Infinity;
      }
      // 活动强度在 400ms 内线性衰减到 0（驱动 uniform 的呼吸亮度）。
      const interactionStrength = Math.max(0, 1 - (frameTimestampMs - lastInteractionMs) / 400);
      // 脉冲年龄封顶 2 秒（着色器里用 2 表示「无脉冲」），1.25 秒后不再需要逐帧刷新。
      const pulseAgeSeconds = Math.min(2, Math.max(0, (frameTimestampMs - lastPulseMs) / 1000));
      const isInteractionActive = interactionStrength > 0 || pulseAgeSeconds < 1.25;
      if (!isInteractionActive && !isAnimating) {
        return Infinity;
      }
      for (const [uniformTargetObject, uniformTargetEntry] of entriesByObject) {
        uniformTargetEntry.uniforms.hbGroundActivity.value = interactionStrength;
        uniformTargetEntry.uniforms.hbGroundPulse.value.set(
          pulseNdc.x,
          pulseNdc.y,
          // 只有被命中的那块地面拿到真实年龄，其余地面固定为 2（即不显示脉冲）。
          uniformTargetObject === pulsingObject ? pulseAgeSeconds : 2
        );
      }
      isAnimating = isInteractionActive;
      // 通知舞台本帧存在背景动画（用于决定是否需要持续渲染）。
      stageOptions.backgroundFrame?.(isInteractionActive);
      if (isInteractionActive) {
        return 1000 / 30;
      } else {
        return Infinity;
      }
    },
    /** 暂停：清空交互状态但保留注入。 */
    suspend() {
      resetInteraction();
    },
    dispose() {
      resetInteraction();
      isDisposed = true;
      for (const disposeEntry of entriesByObject.values()) {
        restoreMaterial(disposeEntry);
      }
      for (const hiddenGridObject of gridObjects) {
        delete hiddenGridObject.userData.backgroundThemeHidden;
      }
      entriesByObject.clear();
      gridObjects.clear();
    }
  };
}
