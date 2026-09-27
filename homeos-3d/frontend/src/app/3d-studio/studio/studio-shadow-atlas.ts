/**
 * 共享聚光灯阴影图集（Spot Shadow Atlas）：把每盏灯的单灯阴影图拼进一张大图，
 */

import { createRenderLightIndex } from "../../bridge/render-light-index.js";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../../utils/debug-log.js";
// 让出主线程（烘焙多盏灯之间必须让路）的实现只有一份：studio/studio-yield.js。
import { yieldToScheduler } from "./studio-yield.js";
// tile 之间的留白：紧贴会因线性过滤在边缘互相渗色。
const DEFAULT_TILE_GUTTER = 1;

/**
 * 把外部输入夹成正整数。
 */
function toPositiveInt(input: any, fallback = 0) {
  const parsed = Math.floor(Number(input));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  } else {
    return fallback;
  }
}

/**
 * 求不小于入参的最小 2 的幂。
 */
function nextPowerOfTwo(requestedValue: any) {
  let result = 1;
  const powerOfTwo = Math.max(1, Math.ceil(Number(requestedValue) || 1));
  while (result < powerOfTwo) {
    result *= 2;
  }
  return result;
}
/**
 * 按「逐行从左到右、放不下就换行」的货架算法把 tile 摆进方图。
 */
function packTilesIntoAtlas(tiles: any[], atlasSize: any, gutter: any) {
  let cursorX = gutter;
  let cursorY = gutter;
  let rowHeight = 0;
  const placed: any[] = [];
  for (const tile of tiles) {
    const tileSize = tile.size;
    // 当前行放不下 → 换行。行高取本行最高 tile，保证下一行不与本行重叠。
    if (cursorX + tileSize + gutter > atlasSize) {
      cursorX = gutter;
      cursorY += rowHeight + gutter * 2;
      rowHeight = 0;
    }
    // 纵向也放不下 → 该尺寸的图集容不下这批灯，交给调用方翻倍再试。
    if (cursorY + tileSize + gutter > atlasSize) {
      return null;
    }
    placed.push({
      ...tile,
      x: cursorX,
      y: cursorY
    });
    // 左右各留一个 gutter，故前进 tileSize + gutter * 2。
    cursorX += tileSize + gutter * 2;
    rowHeight = Math.max(rowHeight, tileSize);
  }
  return placed;
}
/**
 * 计算聚光灯阴影图集的布局：给每盏灯的阴影图挑一块位置。
 */
function packSpotShadowAtlasTiles(tileSizes: any[] = [], maxAtlasSize = 4096, tileGutter = DEFAULT_TILE_GUTTER) {
  const atlasLimit = toPositiveInt(maxAtlasSize, 4096);
  const gutterPx = Math.max(0, Math.floor(Number(tileGutter) || 0));
  const entries = tileSizes
    .map((size, index) => ({
      index: index,
      size: toPositiveInt(size)
    }))
    // 尺寸为 0 的灯没有阴影图；单块加留白就超过图集上限的灯永远放不下，直接判整体失败。
    .filter(entry => entry.size > 0 && entry.size + gutterPx * 2 <= atlasLimit)
    // 大块优先：货架算法先放大块能压平行高、减少纵向浪费；同尺寸时按原序保证结果稳定。
    .sort((entryA, entryB) => entryB.size - entryA.size || entryA.index - entryB.index);
  if (entries.length !== tileSizes.length) {
    return null;
  }
  if (!entries.length) {
    return {
      size: 1,
      tiles: []
    };
  }
  const totalArea = entries.reduce((sum, tileEntry) => sum + (tileEntry.size + gutterPx * 2) ** 2, 0);
  let atlasSizeCandidate = nextPowerOfTwo(Math.max(entries[0].size + gutterPx * 2, Math.sqrt(totalArea)));
  while (atlasSizeCandidate <= atlasLimit) {
    const candidateLayout = packTilesIntoAtlas(entries, atlasSizeCandidate, gutterPx);
    if (candidateLayout) {
      // 布局内部是按尺寸降序摆的，这里还原成调用方传入的灯顺序。
      const orderedTiles = Array(tileSizes.length);
      for (const placedTile of candidateLayout) {
        orderedTiles[placedTile.index] = placedTile;
      }
      return {
        size: atlasSizeCandidate,
        tiles: orderedTiles
      };
    }
    atlasSizeCandidate *= 2;
  }
  return null;
}
/**
 * 生成一盏灯的稳定键：楼层 ID + 家具 ID。
 */
  function spotLightKey(lightObject: any) {
  // 优先用家具 ID 而不是灯对象的 uuid：家具可能被重建，uuid 会变，键就不稳定了。
  const floorId = String(lightObject?.userData?.lightFloorId || "");
  const itemId = String(lightObject?.userData?.lightItemId || "");
  if (itemId) {
    return floorId + ":" + itemId;
  } else {
    return "";
  }
}
/**
 * 遍历场景收集「需要进图集」的聚光灯。
 */
function collectShadowLights(searchRoot: any, { includeHidden: includeHidden = true }: { includeHidden?: boolean } = {}) {
  const lights: any[] = [];
  searchRoot?.traverse((object: any) => {
    // 亮度归零的灯不再产生光照，阴影也就无从谈起；prewarmShadow 是例外：
    if (
      !!object.isSpotLight &&
      object.userData?.shadowCandidate === true &&
      !!spotLightKey(object) &&
      (!!includeHidden || object.visible !== false) &&
      (!(Number(object.userData?.lightBrightness || 0) <= 0) ||
        object.userData?.prewarmShadow === true)
    ) {
      lights.push(object);
    }
  });
  return lights;
}
/**
 * 判断材质是否属于会被本模块打补丁的标准光照材质。
 */
function isShadowableMaterial(material: any) {
  return (
    !!material &&
    (!!material.isMeshStandardMaterial ||
      !!material.isMeshPhysicalMaterial ||
      !!material.isMeshLambertMaterial ||
      !!material.isMeshPhongMaterial ||
      !!material.isMeshToonMaterial)
  );
}
/**
 * 片段着色器里注入的图集采样函数（GLSL 源码，字符串内的英文注释为原始注释）。
 */
function buildAtlasFragmentChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  uniform sampler2D userSpotShadowAtlas;\n  uniform float userSpotShadowAtlasEnabled;\n  uniform vec4 userSpotShadowRect[ NUM_SPOT_LIGHTS ];\n  uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];\n  varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];\n\n  float getUserSpotAtlasShadow( vec4 atlasRect, vec4 shadowParams, vec4 shadowCoord ) {\n    if ( userSpotShadowAtlasEnabled < 0.5 || shadowParams.z < 0.5 ) return 1.0;\n    shadowCoord.xyz /= shadowCoord.w;\n    shadowCoord.z += shadowParams.x;\n    bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0\n      && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;\n    if ( ! inFrustum || shadowCoord.z > 1.0 ) return 1.0;\n    vec2 atlasUv = atlasRect.xy + clamp( shadowCoord.xy, 0.0, 1.0 ) * atlasRect.zw;\n    vec2 distribution = texture2D( userSpotShadowAtlas, atlasUv ).rg;\n    float mean = distribution.x;\n    // The stock VSM Chebyshev tail turns half-float depth steps from a\n    // 256px local-light map into several visible contour rings. Preserve the\n    // authored VSM blur, but use its deviation only to size one bounded edge\n    // transition. This keeps the same single texture sample and removes the\n    // long probability tail that made furniture shadows look layered.\n    float softness = clamp( abs( distribution.y ) * 0.35, 0.0007, 0.004 );\n    // A slope-scaled receiver guard keeps the newly bounded edge from\n    // exposing quantized self-shadow stripes on cabinet fronts and tabletops.\n    // It changes only the depth comparison, not the map resolution or sample\n    // count, and is capped tightly so real contact shadows stay attached.\n    // Cover the complete soft transition at equal depth, then add only a\n    // small slope allowance. This prevents the half-float map's depth bands\n    // from reappearing on large floors or through transparent glass, while\n    // keeping the allowance proportional to the authored penumbra.\n    float receiverGuard = softness + clamp( fwidth( shadowCoord.z ) * 1.5, 0.0002, 0.0015 );\n    #ifdef USE_REVERSED_DEPTH_BUFFER\n      float occludedDistance = mean - shadowCoord.z;\n    #else\n      float occludedDistance = shadowCoord.z - mean;\n    #endif\n    // The atlas contains only solid architectural occluders. Once a receiver\n    // is safely behind a wall, collapse the remaining VSM depth transition\n    // quickly instead of letting it extend through nearby cabinet backs and\n    // reveal half-float depth rows. The authored blur in atlas UV space still\n    // keeps the wall silhouette soft; this only removes light bleeding behind\n    // the blocker. Equality and the complete receiver guard remain lit.\n    float blockerTransition = max( softness * 0.5, 0.00035 );\n    float shadow = 1.0 - smoothstep(\n      receiverGuard,\n      receiverGuard + blockerTransition,\n      occludedDistance\n    );\n    return mix( 1.0, shadow, shadowParams.y );\n  }\n#endif\n";
}
/**
 * 顶点着色器里注入的 uniform 声明（GLSL 源码）。
 */
function buildAtlasVertexParsChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  uniform mat4 userSpotShadowMatrix[ NUM_SPOT_LIGHTS ];\n  uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];\n  varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];\n#endif\n";
}
/**
 * 顶点着色器里计算每盏灯的阴影坐标（GLSL 源码）。
 */
function buildAtlasVertexChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  vec3 userShadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n  vec4 userShadowWorldPosition;\n  #pragma unroll_loop_start\n  for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n    userShadowWorldPosition = worldPosition + vec4( userShadowWorldNormal * userSpotShadowParams[ i ].w, 0.0 );\n    vUserSpotShadowCoord[ i ] = userSpotShadowMatrix[ i ] * userShadowWorldPosition;\n  }\n  #pragma unroll_loop_end\n#endif\n";
}
/**
 * 定位灯光着色器里「聚光灯直接光」那一段分支，返回 [start, end) 半开区间。
 * @returns {{start: number, end: number} | null} 结构不匹配时返回 null，由调用方决定如何报错。
 */
function spotLightBlockRange(lightsShader: any) {
  const spotBlockStart = lightsShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
  if (spotBlockStart < 0) {
    return null;
  }
  const loopEnd = lightsShader.indexOf("#pragma unroll_loop_end", spotBlockStart);
  if (loopEnd < 0) {
    return null;
  }
  const spotEndif = lightsShader.indexOf("#endif", loopEnd);
  if (spotEndif < 0) {
    return null;
  }
  // 收尾优先取同级的下一个灯光块（r186 里是 NUM_SUN_LIGHTS），没有就退到自己的 #endif 之后。
  const nextLightBlock = lightsShader.indexOf("#if ( NUM_", spotEndif + "#endif".length);
  const spotBlockEnd = nextLightBlock >= 0 ? nextLightBlock : spotEndif + "#endif".length;
  return {
    start: spotBlockStart,
    end: spotBlockEnd
  };
}
/**
 * 给 three.js 的灯光着色器打补丁：跳过颜色为零的聚光灯。场景里常见十几盏灯但多数亮度为 0，
 */
function guardZeroContributionSpotLights(lightsShader: any) {
  const range = spotLightBlockRange(lightsShader);
  const directLightCall =
    "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
  // 用「该调用在聚光灯分支里恰好出现一次」来确认结构，多一次或零次都说明 three.js 改版了。
  const spotLightBranch = range ? lightsShader.slice(range.start, range.end) : "";
  if (!range || spotLightBranch.split(directLightCall).length !== 2) {
    throw new Error("当前 Three.js 聚光灯反射 Shader 与零贡献优化不兼容。");
  }
  // HB_SKIP_ZERO_SPOT_LIGHT 只在开启逐帧同步渲染灯光的模式下由材质 defines 打开。
  const guardedCall =
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      if ( any( notEqual( directLight.color, vec3( 0.0 ) ) ) ) {\n    #endif\n      " +
    directLightCall +
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      }\n    #endif";
  return lightsShader.slice(0, range.start) + spotLightBranch.replace(directLightCall, guardedCall) + lightsShader.slice(range.end);
}
/**
 * 在图集采样点处把 three.js 自带的单灯阴影代码换成图集采样：在 USE_SHADOWMAP 的聚光灯循环
 */
function patchLightsFragmentBegin(THREE: any) {
  const spotShadowLoopMarker =
    "\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )";
  const atlasShadowPatch =
    // USE_USER_SPOT_SHADOW_ATLAS 为真时，用图集采样结果乘上 directLight.color。
    "\n    #if defined( USE_USER_SPOT_SHADOW_ATLAS )\n      directLight.color *= ( directLight.visible && receiveShadow )\n        ? getUserSpotAtlasShadow( userSpotShadowRect[ i ], userSpotShadowParams[ i ], vUserSpotShadowCoord[ i ] )\n        : 1.0;\n    #endif\n";
  const lightsFragmentBegin = THREE.ShaderChunk.lights_fragment_begin;
  if (!lightsFragmentBegin.includes(spotShadowLoopMarker)) {
    throw new Error("当前 Three.js 灯光 Shader 与阴影图集不兼容。");
  }
  // 先插入图集采样、再删掉原标记：顺序反过来会把刚插进去的内容一起删掉。
  return guardZeroContributionSpotLights(lightsFragmentBegin.replace(spotShadowLoopMarker, "" + atlasShadowPatch + spotShadowLoopMarker));
}
/**
 * 释放单灯阴影贴图并断开引用。
 */
function disposeShadowTargets(disposedLight: any) {
  disposedLight?.shadow?.map?.dispose?.();
  disposedLight?.shadow?.mapPass?.dispose?.();
  if (disposedLight?.shadow) {
    disposedLight.shadow.map = null;
    disposedLight.shadow.mapPass = null;
  }
}
/**
 * 创建聚光灯阴影图集控制器。
 * @param {function(): boolean} [options.canBuild] 返回 false 时推迟烘焙（例如页面不可见）。
 */
export function createSpotShadowAtlasController({
  THREE: three,
  renderer: renderer,
  scene: scene,
  camera: camera,
  requestFrame: requestFrame = () => {},
  canBuild: canBuild = () => true,
  buildDelay: buildDelay = 80,
  syncBeforeRender: syncBeforeRender = false
}: any = {}) {
  if (!three || !renderer || !scene || !camera) {
    throw new Error("创建阴影图集时缺少 Three.js 渲染上下文。");
  }
  // 这四个数组的「长度与顺序」必须与当前参与渲染的聚光灯完全一致：
  const uniforms: any = {
    userSpotShadowAtlas: {
      value: null
    },
    userSpotShadowAtlasEnabled: {
      value: 0
    },
    userSpotShadowMatrix: {
      value: []
    },
    userSpotShadowRect: {
      value: []
    },
    userSpotShadowParams: {
      value: []
    }
  };
  // 着色器补丁只需算一次：three.js 的 ShaderChunk 是全局单例，改写它对所有材质生效。
  const patchedLightsFragment = patchLightsFragmentBegin(three);
  // 键 → 图集条目（tile 位置、阴影矩阵、偏置、强度）。
  const entryByLightKey = new Map();
  let atlasTarget: any = null;
  // 1×1 的临时目标：强制烘焙时总得有个已绑定输出的 render target。
  let scratchTarget: any = null;
  let preparedMaterials = new WeakSet();
  let pendingRoot: any = null;
  let buildTimer: any = 0;
  // revision 是「期望状态」的计数：每次 schedule 加一，烘焙过程中发现不等就说明
  let revision = 0;
  let isBuilding = false;
  let isDirty = false;
  let isDisposed = false;
  let isEnabled = true;
  let syncedLights: any = null;
  let syncedEntries: any[] = [];
  let previousLights: any[] = [];
  let previousEntries: any[] = [];
  const scratchMatrix4 = new three.Matrix4();
  const scratchVector4 = new three.Vector4();
  // 逐帧同步模式才建灯索引：它每帧遍历场景，只在确实需要时才付出这份开销。
  const lightIndex = syncBeforeRender ? createRenderLightIndex() : null;
  const bakeProbeMesh = new three.Mesh(
    new three.BufferGeometry().setAttribute(
      "position",
      new three.Float32BufferAttribute([], 3)
    ),
    new three.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false
    })
  );
  bakeProbeMesh.name = "spot-shadow-atlas-bake-probe";
  // 关掉视锥剔除并启用所有图层，保证探针在任何相机、任何图层配置下都会被绘制，
  bakeProbeMesh.frustumCulled = false;
  bakeProbeMesh.layers.enableAll();
  // 空实现：真正的回调在每次烘焙前临时替换。
  bakeProbeMesh.onBeforeRender = () => {};

  /**
   * 根据当前是否启用、灯数是否非零，决定着色器里的图集开关。
   */
  function setAtlasEnabled(enabled: any) {
    uniforms.userSpotShadowAtlasEnabled.value = enabled && isEnabled && entryByLightKey.size ? 1 : 0;
  }

  /**
   * 判断当前是否处于「阴影更新被冻结」的状态。
   */
  function areShadowUpdatesFrozen() {
    return renderer.shadowMap.autoUpdate === false && renderer.shadowMap.needsUpdate === false;
  }

  /**
   * 给一个材质注入图集采样所需的 defines 与着色器改写。
   */
  function prepareMaterial(materialToPrepare: any) {
    // WeakSet 去重：材质可能被成百上千个网格共享，重复包装会层层套娃。
    if (!isShadowableMaterial(materialToPrepare) || preparedMaterials.has(materialToPrepare)) {
      return;
    }
    // 反射用的镜像材质会复用源材质的着色器程序；源材质已经打好补丁时直接跳过，
    if (
      materialToPrepare.environmentSourceMaterial &&
      preparedMaterials.has(materialToPrepare.environmentSourceMaterial) &&
      materialToPrepare.defines?.USE_USER_SPOT_SHADOW_ATLAS === 1
    ) {
      preparedMaterials.add(materialToPrepare);
      return;
    }
    preparedMaterials.add(materialToPrepare);
    // 链式保留外部已有的钩子：本模块不是材质着色器的唯一改造者。
    const previousOnBeforeCompile = materialToPrepare.onBeforeCompile;
    const previousCacheKey = materialToPrepare.customProgramCacheKey?.bind(materialToPrepare);
    materialToPrepare.defines = {
      ...(materialToPrepare.defines || {}),
      USE_USER_SPOT_SHADOW_ATLAS: 1
    };
    if (syncBeforeRender && materialToPrepare.isMeshStandardMaterial) {
      materialToPrepare.defines.HB_SKIP_ZERO_SPOT_LIGHT = 1;
    }
    materialToPrepare.onBeforeCompile = (shader: any, rendererInstance: any) => {
      previousOnBeforeCompile?.call(materialToPrepare, shader, rendererInstance);
      // 直接把 uniform 对象挂进着色器：uniforms 是同一个引用，之后改 .value 即可全材质生效。
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <shadowmap_pars_vertex>", "#include <shadowmap_pars_vertex>\n" + buildAtlasVertexParsChunk())
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>")
        .replace("#include <shadowmap_vertex>", "#include <shadowmap_vertex>\n" + buildAtlasVertexChunk());
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <shadowmap_pars_fragment>",
          "#include <shadowmap_pars_fragment>\n" + buildAtlasFragmentChunk()
        )
        // 整段替换灯光分支：内部同时完成「去掉单灯阴影」与「接上图集采样」。
        .replace("#include <lights_fragment_begin>", patchedLightsFragment);
    };
    // 缓存键必须带上版本串：补丁内容变了而键不变，浏览器会继续用旧的编译结果。
    materialToPrepare.customProgramCacheKey = () =>
      (previousCacheKey?.() || "") + "|user-spot-shadow-atlas-v7-zero-contribution";
    materialToPrepare.needsUpdate = true;
  }

  /**
   * 遍历子树，给所有接收阴影的网格材质打补丁。
   */
  function prepareRoot(root: any) {
    if (!isDisposed) {
      root?.traverse((child: any) => {
        // receiveShadow 为 false 的网格根本不采样阴影，注入代码纯属浪费编译时间。
        if (!child.isMesh || child.receiveShadow === false) {
          return;
        }
        // material 可能是数组（多材质网格），统一成数组处理。
        const materials = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        for (const candidateMaterial of materials) {
          prepareMaterial(candidateMaterial);
        }
      });
    }
  }
  /**
   * 收集当前实际可见（层级可见）的候选灯。
   */
  function collectActiveLights(activeRoot: any) {
    return collectShadowLights(activeRoot, {
      includeHidden: false
    });
  }

  /**
   * 按当前可见灯列表重排 uniform 数组，并关闭单灯阴影。
   */
  function syncUniforms(syncRoot: any = pendingRoot) {
    if (isDisposed) {
      return 0;
    }
    prepareRoot(syncRoot);
    syncedLights = null;
    const matrixUniforms = uniforms.userSpotShadowMatrix.value;
    const rectUniforms = uniforms.userSpotShadowRect.value;
    const paramUniforms = uniforms.userSpotShadowParams.value;
    matrixUniforms.length = 0;
    rectUniforms.length = 0;
    paramUniforms.length = 0;
    for (const light of collectActiveLights(syncRoot)) {
      const lightEntry = entryByLightKey.get(spotLightKey(light));
      // 没有图集条目的灯（尚未烘焙或烘焙失败）推入零参数，
      matrixUniforms.push(lightEntry?.matrix || new three.Matrix4());
      rectUniforms.push(lightEntry?.rect || new three.Vector4());
      paramUniforms.push(
        lightEntry
          ? new three.Vector4(lightEntry.bias, lightEntry.intensity, 1, lightEntry.normalBias)
          : new three.Vector4(0, 0, 0, 0)
      );
      light.castShadow = false;
    }
    uniforms.userSpotShadowAtlas.value = atlasTarget?.texture || null;
    setAtlasEnabled(true);
    const enabledLightCount = paramUniforms.filter((lightParam: any) => lightParam.z > 0.5).length;
    // 把统计写进 dataset，便于在浏览器里直接查看当前有多少盏灯真的带阴影。
    renderer.domElement.dataset.activeSpotShadows = String(enabledLightCount);
    return enabledLightCount;
  }

  /**
   * 按本帧「实际被渲染的灯」顺序同步 uniform（逐帧同步模式专用）。
   */
  function syncRenderLights(renderedScene: any, renderedCamera: any) {
    if (isDisposed || !syncBeforeRender || !renderedScene) {
      return;
    }
    const renderLights = previousLights;
    const renderEntries = previousEntries;
    renderLights.length = renderEntries.length = 0;
    const renderLightList = lightIndex ? lightIndex.read(renderedScene, renderedCamera) : [];
    for (const renderLight of renderLightList) {
      renderLights.push(renderLight);
    }
    // 逐项比对灯对象与其图集条目：灯没变但条目变了同样要重传 uniform。
    let isSame = syncedLights?.length === renderLights.length;
    for (let changeIndex = 0; changeIndex < renderLights.length; changeIndex++) {
      renderEntries.push(entryByLightKey.get(spotLightKey(renderLights[changeIndex])));
      if (renderLights[changeIndex] !== syncedLights?.[changeIndex] || renderEntries[changeIndex] !== syncedEntries[changeIndex]) {
        isSame = false;
      }
    }
    if (isSame) {
      return;
    }
    // 保留上一帧的数组对象做双缓冲：这样每帧只改长度与元素，
    previousLights = syncedLights || [];
    previousEntries = syncedEntries;
    syncedLights = renderLights;
    syncedEntries = renderEntries;
    const matrixValues = uniforms.userSpotShadowMatrix.value;
    const rectValues = uniforms.userSpotShadowRect.value;
    const paramValues = uniforms.userSpotShadowParams.value;
    matrixValues.length = rectValues.length = paramValues.length = 0;
    for (const lightSource of renderEntries) {
      matrixValues.push(lightSource?.matrix || scratchMatrix4);
      rectValues.push(lightSource?.rect || scratchVector4);
      // 缓存的 uniformParams 挂在图集条目上，矩阵变了也不必重新分配 Vector4。
      paramValues.push(
        lightSource
          ? (lightSource.uniformParams ||= new three.Vector4(
              lightSource.bias,
              lightSource.intensity,
              1,
              lightSource.normalBias
            ))
          : scratchVector4
      );
    }
  }
  /**
   * 创建一块图集渲染目标。
   */
  function createAtlasTarget(targetSize: any) {
    // RG + 半浮点是 VSM 的最小可用格式：R 存深度均值、G 存方差。
    const textureTarget = new three.WebGLRenderTarget(targetSize, targetSize, {
      format: three.RGFormat,
      type: three.HalfFloatType,
      minFilter: three.LinearFilter,
      magFilter: three.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    textureTarget.texture.name = "HomeOS shared spot shadow atlas";
    // 图集不会被放大采样到需要 mip 的程度，关掉可省约 1/3 显存。
    textureTarget.texture.generateMipmaps = false;
    return textureTarget;
  }
  /**
   * 把图集整张清成「白色 = 完全无遮挡」。
   */
  function clearAtlasTarget(target: any) {
    const previousTarget = renderer.getRenderTarget();
    const previousClearColor = renderer.getClearColor(new three.Color()).clone();
    const previousClearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    renderer.setClearColor(16777215, 1);
    // 只清颜色：这张目标根本没有深度附件。
    renderer.clear(true, false, false);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
  }
  /**
   * 完整重建图集：逐盏灯单独烘焙阴影，再逐块拷进大图。
   */
  async function rebuildAtlas(buildRoot: any, buildRevision: any) {
    // revision 不一致说明排队期间场景又变了，本次结果必然过期，直接放弃。
    if (isDisposed || isBuilding || buildRevision !== revision) {
      return;
    }
    if (!buildRoot) {
      isDirty = false;
      return;
    }
    if (!canBuild() || areShadowUpdatesFrozen()) {
      // 条件不满足时不清 isDirty，只是延后重试，保证最终一定会烘一次。
      renderer.domElement.dataset.spotShadowBakeState = "paused";
      scheduleBuild(160);
      return;
    }
    isDirty = false;
    const shadowLights = collectShadowLights(buildRoot);
    if (!shadowLights.length) {
      // 一盏灯都没有：清空图集并释放目标，让着色器走无阴影分支。
      entryByLightKey.clear();
      atlasTarget?.dispose?.();
      atlasTarget = null;
      uniforms.userSpotShadowAtlas.value = null;
      setAtlasEnabled(false);
      requestFrame();
      return;
    }
    const maxTextureSize = toPositiveInt(renderer.capabilities?.maxTextureSize, 4096);
    // 每盏灯的阴影图可能设置了不同分辨率（近处房间给大图），按各自实际尺寸排版。
    const lightMapSizes = shadowLights.map(shadowLight => toPositiveInt(shadowLight.shadow?.mapSize?.x, 256));
    const layout = packSpotShadowAtlasTiles(lightMapSizes, maxTextureSize);
    if (!layout) {
      throw new Error(
        "当前设备最大阴影图集 " + maxTextureSize + "px 无法容纳 " + shadowLights.length + " 盏灯。"
      );
    }
    let nextAtlasTarget = null;
    // 先用新表构建，全部成功后一次性替换 entryByLightKey，
    const nextEntryByLightKey = new Map();
    const missingLightKeys = [];
    const previousRenderTarget = renderer.getRenderTarget();
    const previousShadowMapEnabled = renderer.shadowMap.enabled;
    const previousShadowMapNeedsUpdate = renderer.shadowMap.needsUpdate;
    // 记录每盏灯的原始状态，finally 里逐项还原（烘焙会大改它们的 visible / intensity）。
    const lightStates = shadowLights.map(capturedLight => ({
      light: capturedLight,
      visible: capturedLight.visible,
      intensity: capturedLight.intensity,
      castShadow: capturedLight.castShadow
    }));
    isBuilding = true;
    // 烘焙会调用 renderer.render，而全局渲染流程可能注册了「总览层堆叠」等副作用钩子；
    const previousSuppressOverviewStack = renderer.userData?.suppressOverviewStack;
    renderer.userData = renderer.userData || {};
    renderer.userData.suppressOverviewStack = true;
    try {
      prepareRoot(buildRoot);
      nextAtlasTarget = createAtlasTarget(layout.size);
      renderer.initRenderTarget(nextAtlasTarget);
      clearAtlasTarget(nextAtlasTarget);
      // 1×1 的临时输出目标：逐灯烘焙时 renderer 必须有绑定目标，
      scratchTarget ||= new three.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        stencilBuffer: false
      });
      // 烘焙期间先把所有候选灯全部关掉，再逐盏单独打开，确保阴影通道只处理当前这盏。
      setAtlasEnabled(false);
      for (const lightState of lightStates) {
        lightState.light.visible = false;
        lightState.light.castShadow = false;
      }
      // 烘焙走自建的离屏阴影通道，不能被 App 的全局阴影开关拦下：autoUpdate 与 needsUpdate
      renderer.shadowMap.enabled = true;
      for (let lightCursor = 0; lightCursor < shadowLights.length; lightCursor += 1) {
        // 每盏灯之间都有 await，期间场景可能被改；每次循环都要重新确认 revision。
        if (buildRevision !== revision) {
          return;
        }
        if (areShadowUpdatesFrozen()) {
          // 楼层过渡在这次烘焙的两盏灯之间开始了。丢掉半成品图集，
          isDirty = true;
          scheduleBuild(160);
          return;
        }
        const activeLight = shadowLights[lightCursor];
        const targetTile = layout.tiles[lightCursor];
        activeLight.visible = true;
        // 用开灯亮度覆盖当前强度：关灯状态下 intensity 可能为 0，
        activeLight.intensity = Math.max(
          Number(activeLight.userData?.lightOnIntensity || activeLight.intensity || 1),
          0.001
        );
        syncUniforms(buildRoot);
        setAtlasEnabled(false);
        activeLight.castShadow = true;
        activeLight.shadow.autoUpdate = false;
        activeLight.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;
        // collectShadowLights 可能收进父级被隐藏的灯，而 three.js 只把
        const restoredVisibility = [];
        for (let visibilityNode = activeLight; visibilityNode; visibilityNode = visibilityNode.parent) {
          if (visibilityNode.visible === false) {
            restoredVisibility.push(visibilityNode);
            visibilityNode.visible = true;
          }
        }
        // 灯自身与它的 target 都要更新世界矩阵：target 决定了聚光灯的朝向。
        activeLight.visible = true;
        activeLight.target?.updateWorldMatrix(true, false);
        activeLight.updateWorldMatrix(true, false);
        let forcedShadowBake = false;
        let shadowBakeError = null;
        bakeProbeMesh.onBeforeRender = () => {
          // 同一帧里可能被多次绘制，只烘第一次。
          if (forcedShadowBake) {
            return;
          }
          forcedShadowBake = true;
          try {
            activeLight.shadow.needsUpdate = true;
            renderer.shadowMap.needsUpdate = true;
            // 显式传灯列表：只烘当前这一盏，结果才能准确拷到它自己的 tile。
            renderer.shadowMap.render([activeLight], scene, camera);
          } catch (shadowError) {
            // 捕获后延迟到渲染结束再处理：在钩子里直接抛出会打断整个渲染循环。
            shadowBakeError = shadowError;
          }
        };
        // 探针必须挂在场景里才会被渲染，从而触发上面的钩子。
        if (!bakeProbeMesh.parent) {
          scene.add(bakeProbeMesh);
        }
        // 输出到 1×1 的临时目标：这一步只为触发阴影通道，颜色结果直接丢弃。
        renderer.setRenderTarget(scratchTarget);
        try {
          renderer.render(scene, camera);
        } catch (renderError) {
          shadowBakeError ||= renderError;
        } finally {
          // 探针钩子改回空实现，并恢复被临时打开的祖先节点可见性。
          bakeProbeMesh.onBeforeRender = () => {};
          for (const visibilityNode of restoredVisibility) {
            visibilityNode.visible = false;
          }
        }
        if (shadowBakeError) {
          // 单盏灯失败不算致命：它只是没有阴影，其余灯照常进图集。
          debugLog(
            "warn",
            "阴影图集: 单灯阴影烘焙失败，已按无阴影处理。",
            spotLightKey(activeLight),
            shadowBakeError
          );
        }
        const shadowTexture = activeLight.shadow?.map?.texture;
        if (shadowTexture) {
          // 把这张单灯阴影图拷到图集里它的 tile 位置（像素级矩形拷贝，不走着色器）。
          renderer.copyTextureToTexture(
            shadowTexture,
            nextAtlasTarget.texture,
            new three.Box2(new three.Vector2(0, 0), new three.Vector2(targetTile.size, targetTile.size)),
            new three.Vector2(targetTile.x, targetTile.y)
          );
          // 内缩半个像素：tile 边缘在双线性过滤下会与相邻 tile 互相取样，
          const halfPixelInset = 0.5;
          nextEntryByLightKey.set(spotLightKey(activeLight), {
            tile: {
              ...targetTile
            },
            matrix: activeLight.shadow.matrix.clone(),
            rect: new three.Vector4(
              (targetTile.x + halfPixelInset) / layout.size,
              (targetTile.y + halfPixelInset) / layout.size,
              Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size,
              Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size
            ),
            bias: Number(activeLight.shadow.bias || 0),
            normalBias: Number(activeLight.shadow.normalBias || 0),
            intensity: Number(activeLight.shadow.intensity ?? 1)
          });
        } else {
          missingLightKeys.push(spotLightKey(activeLight));
        }
        activeLight.castShadow = false;
        activeLight.visible = false;
        disposeShadowTargets(activeLight);
        // 每盏灯之间让出主线程：多灯场景一次连续烘焙会明显掉帧。
        await yieldToScheduler();
      }
      // 让出主线程后可能已经过期，提交前必须再确认一次。
      if (buildRevision !== revision) {
        return;
      }
      // 到这里新图集已经完整可用，才替换旧的。
      atlasTarget?.dispose?.();
      atlasTarget = nextAtlasTarget;
      entryByLightKey.clear();
      for (const [lightKey, atlasEntry] of nextEntryByLightKey) {
        entryByLightKey.set(lightKey, atlasEntry);
      }
      uniforms.userSpotShadowAtlas.value = atlasTarget.texture;
      // 这些 dataset 是给浏览器里排查阴影问题用的（灯数、图集尺寸、失败灯数）。
      const domElement = renderer.domElement;
      domElement.dataset.spotShadowMode = "atlas";
      domElement.dataset.spotShadowBakeState = "ready";
      domElement.dataset.spotShadowAtlasSize = String(layout.size);
      domElement.dataset.spotShadowAtlasLights = String(entryByLightKey.size);
      domElement.dataset.spotShadowMissedLights = String(missingLightKeys.length);
      if (missingLightKeys.length) {
        // 未生成阴影的灯清单：dataset 里只留条数，明细放控制台，且只在 ?debug=1 时输出。
        debugLog(
          "warn",
          "阴影图集: " + missingLightKeys.length + " 盏灯未生成阴影贴图，已按无阴影处理。",
          missingLightKeys
        );
      }
    } finally {
      // 无论成功、失败还是中途 return，都要还原渲染器状态与所有灯的原始属性。
      renderer.userData.suppressOverviewStack = previousSuppressOverviewStack;
      renderer.setRenderTarget(previousRenderTarget);
      renderer.shadowMap.enabled = previousShadowMapEnabled;
      renderer.shadowMap.needsUpdate = previousShadowMapNeedsUpdate;
      for (const previousState of lightStates) {
        previousState.light.visible = previousState.visible;
        previousState.light.intensity = previousState.intensity;
        // castShadow 一律还原成 false：阴影已由图集承担，恢复成 true 会让
        previousState.light.castShadow = false;
      }
      // 只有真正提交的图集才保留，未提交的临时目标当场释放。
      if (atlasTarget !== nextAtlasTarget) {
        nextAtlasTarget?.dispose();
      }
      isBuilding = false;
      if (isDisposed) {
        // 烘焙期间被 dispose 了，这时才终于能安全回收资源。
        disposeAtlases();
      } else {
        syncUniforms(pendingRoot);
        // 烘焙过程中又被标脏 → 立刻再排一次（等 0 毫秒），保证不留过期图集。
        if (isDirty && !buildTimer) {
          scheduleBuild(0);
        }
        requestFrame();
      }
    }
  }

  /**
   * 延迟调度一次重建（带防抖）。
   */
  function scheduleBuild(delay: any) {
    if (!isDisposed && !!isDirty) {
      // 已有定时器就重置：短时间内多次 schedule 只烘最后一次。
      clearTimeout(buildTimer);
      buildTimer = setTimeout(
        () => {
          buildTimer = 0;
          if (!isDisposed && !isBuilding && !!isDirty) {
            rebuildAtlas(pendingRoot, revision).catch(error => {
              if (!isDisposed) {
                debugLog("error", error);
                renderer.domElement.dataset.spotShadowMode = "fallback";
              }
            });
          }
        },
        // 非法 delay 一律按 0 处理，等价于下一轮宏任务。
        Math.max(0, Number(delay) || 0)
      );
    }
  }

  /**
   * 登记一次「场景变了」：更新待处理子树、同步 uniform 并排队重建。
   */
  function schedule(scheduledRoot: any, { delay: scheduleDelay = buildDelay }: { delay?: number } = {}) {
    if (isDisposed) {
      return 0;
    }
    pendingRoot = scheduledRoot;
    prepareRoot(scheduledRoot);
    for (const scheduledLight of collectShadowLights(scheduledRoot)) {
      scheduledLight.castShadow = false;
    }
    syncUniforms(scheduledRoot);
    // revision 自增让所有在途烘焙立刻作废。
    revision += 1;
    isDirty = true;
    scheduleBuild(scheduleDelay);
    return collectShadowLights(scheduledRoot).length;
  }
  let lastRoot: any = null;
  let lastRevision = -1;
  let lastLightIndexBuilds = -1;
  let trackedLights: any[] = [];

  /**
   * 只刷新已有图集的几何信息（灯移动 / 物体移动），不重新排版。
   */
  function refreshGeometry(refreshRoot: any = pendingRoot, viewBoxes: any = null) {
    if (isDisposed) {
      return true;
    }
    if (isBuilding || buildTimer || isDirty) {
      return false;
    }
    if (!atlasTarget || !entryByLightKey.size) {
      // 还没有图集：没什么可刷新的。
      return true;
    }
    const lightIndexBuilds = lightIndex?.stats.builds || 0;
    // 缓存待刷新的灯列表：这三者都没变时，灯集合也不会变，无需重新遍历场景。
    if (lastRoot !== refreshRoot || lastRevision !== revision || lastLightIndexBuilds !== lightIndexBuilds) {
      lastRoot = refreshRoot;
      lastRevision = revision;
      lastLightIndexBuilds = lightIndexBuilds;
      trackedLights = [];
      refreshRoot?.traverse((trackedLight: any) => {
        if (trackedLight.isSpotLight && trackedLight.shadow && entryByLightKey.has(spotLightKey(trackedLight))) {
          trackedLights.push(trackedLight);
        }
      });
    }
    const frustumBoxes =
      viewBoxes === null ? null : viewBoxes.filter((box: any) => box?.isBox3 && !box.isEmpty());
    const updates: any[] = [];
    // 先整体更新世界矩阵，下面逐灯算阴影矩阵时读到的才是当前帧的位置。
    refreshRoot?.updateWorldMatrix(true, true);
    for (const updateLight of trackedLights) {
      const geometryEntry = entryByLightKey.get(spotLightKey(updateLight));
      if (geometryEntry?.tile) {
        updateLight.target?.updateWorldMatrix(true, false);
        updateLight.shadow.updateMatrices(updateLight);
        // 相机看不到的灯不必重烘：这一步是性能关键，房间多时能省掉大部分灯。
        if (!frustumBoxes || !!frustumBoxes.some((viewBox: any) => updateLight.shadow.getFrustum().intersectsBox(viewBox))) {
          // 连同阴影贴图句柄一起快照：烘焙会产生新贴图，事后要能比对并回收。
          updates.push({
            light: updateLight,
            entry: geometryEntry,
            matrix: updateLight.shadow.matrix.clone(),
            cast: updateLight.castShadow,
            visible: updateLight.visible,
            autoUpdate: updateLight.shadow.autoUpdate,
            needsUpdate: updateLight.shadow.needsUpdate,
            map: updateLight.shadow.map,
            mapPass: updateLight.shadow.mapPass
          });
        }
      }
    }
    if (!updates.length) {
      return true;
    }
    // 快照完整的渲染器状态：烘焙会大改渲染目标 / 视口 / 清屏色，finally 里逐项还原。
    const rendererState = {
      target: renderer.getRenderTarget(),
      face: renderer.getActiveCubeFace(),
      mip: renderer.getActiveMipmapLevel(),
      viewport: renderer.getViewport(new three.Vector4()),
      scissor: renderer.getScissor(new three.Vector4()),
      scissorTest: renderer.getScissorTest(),
      clear: renderer.getClearColor(new three.Color()),
      alpha: renderer.getClearAlpha(),
      enabled: renderer.shadowMap.enabled,
      autoUpdate: renderer.shadowMap.autoUpdate,
      needsUpdate: renderer.shadowMap.needsUpdate
    };
    try {
      renderer.shadowMap.enabled = true;
      for (const update of updates) {
        const { light: refreshLight } = update;
        try {
          refreshLight.castShadow = true;
          refreshLight.visible = true;
          refreshLight.shadow.autoUpdate = false;
          refreshLight.shadow.needsUpdate = true;
          renderer.shadowMap.needsUpdate = true;
          renderer.shadowMap.render([refreshLight], scene, camera);
          if (!refreshLight.shadow.map?.texture) {
            // 拿不到贴图说明这盏灯这次没烘出来，保持旧图集内容不动即可。
            return false;
          }
          update.texture = refreshLight.shadow.map.texture;
          update.matrix.copy(refreshLight.shadow.matrix);
        } catch (refreshError) {
          // 这盏灯这次没烘出来，保持旧图集内容不动（调用方按 false 处理），控制台这份只在 ?debug=1 时出现。
          debugLog(
            "warn",
            "阴影图集: 几何刷新烘焙失败。",
            spotLightKey(refreshLight),
            refreshError
          );
          return false;
        } finally {
          refreshLight.castShadow = update.cast;
          refreshLight.visible = update.visible;
        }
      }
      for (const { texture: texture, entry: updatedEntry, matrix: lightMatrix } of updates) {
        const tileDefinition = updatedEntry.tile;
        renderer.copyTextureToTexture(
          texture,
          atlasTarget.texture,
          new three.Box2(new three.Vector2(0, 0), new three.Vector2(tileDefinition.size, tileDefinition.size)),
          new three.Vector2(tileDefinition.x, tileDefinition.y)
        );
        updatedEntry.matrix.copy(lightMatrix);
      }
    } finally {
      for (const previousUpdate of updates) {
        const { light: restoreLight } = previousUpdate;
        restoreLight.castShadow = previousUpdate.cast;
        restoreLight.visible = previousUpdate.visible;
        restoreLight.shadow.autoUpdate = previousUpdate.autoUpdate;
        restoreLight.shadow.needsUpdate = previousUpdate.needsUpdate;
        // 烘焙给灯换了新的阴影贴图（map / mapPass）。旧贴图必须显式释放，
        if (restoreLight.shadow.map !== previousUpdate.map) {
          restoreLight.shadow.map?.dispose();
        }
        if (restoreLight.shadow.mapPass !== previousUpdate.mapPass) {
          restoreLight.shadow.mapPass?.dispose();
        }
        restoreLight.shadow.map = previousUpdate.map;
        restoreLight.shadow.mapPass = previousUpdate.mapPass;
      }
      renderer.shadowMap.enabled = rendererState.enabled;
      renderer.shadowMap.autoUpdate = rendererState.autoUpdate;
      renderer.shadowMap.needsUpdate = rendererState.needsUpdate;
      renderer.setViewport(rendererState.viewport);
      renderer.setScissor(rendererState.scissor);
      renderer.setScissorTest(rendererState.scissorTest);
      renderer.setRenderTarget(rendererState.target, rendererState.face, rendererState.mip);
      // 还原清屏色：Color 是按引用存的，直接传回去即可。
      renderer.setClearColor(rendererState.clear, rendererState.alpha);
    }
    renderer.domElement.dataset.curtainShadowUpdates = String(
      // 累加计数，用于确认几何刷新是否真的在跑（排查「阴影不跟随」时的第一手线索）。
      Number(renderer.domElement.dataset.curtainShadowUpdates || 0) + 1
    );
    return true;
  }

  /**
   * 打开 / 关闭图集（例如导出或低性能模式时关闭）。
   */
  function setEnabled(nextEnabled: any) {
    if (!isDisposed) {
      isEnabled = nextEnabled !== false;
      setAtlasEnabled(true);
      requestFrame();
    }
  }
  /**
   * 释放图集相关显存并清空条目。
   */
  function disposeAtlases() {
    atlasTarget?.dispose();
    scratchTarget?.dispose();
    atlasTarget = null;
    scratchTarget = null;
    entryByLightKey.clear();
    uniforms.userSpotShadowAtlas.value = null;
    setAtlasEnabled(false);
  }
  /**
   * 销毁控制器：停掉调度、断开引用、回收纹理。
   */
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      // revision 自增让所有在途烘焙立刻失效。
      revision += 1;
      isDirty = false;
      clearTimeout(buildTimer);
      buildTimer = 0;
      pendingRoot = null;
      lightIndex?.dispose();
      lastRoot = null;
      trackedLights = [];
      syncedLights = null;
      syncedEntries = [];
      previousLights = [];
      previousEntries = [];
      bakeProbeMesh.onBeforeRender = () => {};
      bakeProbeMesh.removeFromParent();
      bakeProbeMesh.geometry.dispose();
      bakeProbeMesh.material.dispose();
      // 正在烘焙时不能在这里回收：renderer 可能还在引用图集，
      if (!isBuilding) {
        disposeAtlases();
      }
    }
  }
  if (syncBeforeRender) {
    const previousOnBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args: any[]) {
      previousOnBeforeRender?.apply(this, args);
      // 参数约定：args[1] 是场景、args[2] 是相机（由 WebGLRenderer 传入）。
      syncRenderLights(args[1] || scene, args[2] || camera);
    };
  }
  // 对外接口：prepareRoot 提前给静态树打补丁，refreshGeometry 做轻量几何刷新，
  return {
    prepareRoot: prepareRoot,
    // 只刷新几何，不重新排版（灯位微调时的高性价比路径）。
    refreshGeometry: refreshGeometry,
    schedule: schedule,
    sync: syncUniforms,
    setEnabled: setEnabled,
    dispose: dispose,
    activeCount: () => entryByLightKey.size,
    isBuilding: () => isBuilding,
    isPending: () => !!buildTimer || isDirty,
    releaseRenderIndex: () => lightIndex?.dispose()
  };
}
