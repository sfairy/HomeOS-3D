/**
 * 共享聚光灯阴影图集（Spot Shadow Atlas）：把每盏灯的单灯阴影图拼进一张大图，
 * 避免多灯各自占用纹理单元与显存，所有接收阴影的材质共用一次采样。
 * 对外：createSpotShadowAtlasController（调度烘焙、刷新几何、清理资源）；图集布局计算与
 * 聚光灯补丁都只在本模块内使用。
 * 约定：图集尺寸是像素（2 的幂，上限取 maxTextureSize），每盏灯的 tile 记左上角与边长（x / y / size）；
 * 灯的哈希键是 floorId:itemId，与 userData 的 lightFloorId / lightItemId 绑死，改名会静默丢阴影；
 * 烘焙期间临时改灯的 visible / intensity / castShadow，finally 必须还原且 castShadow 一律还原成 false；
 * 整块图集只在一次完整烘焙成功后才替换旧图集，中途失败保留旧图集避免闪黑。
 */

import { createRenderLightIndex } from "../../bridge/render-light-index.js?v=2609220052";
// 生产控制台里的诊断输出统一走 utils/debug-log.js（默认静默，只在 ?debug=1 时输出）。
import { debugLog } from "../../utils/debug-log.js?v=2609220052";
// 让出主线程（烘焙多盏灯之间必须让路）的实现只有一份：studio/studio-yield.js。
import { yieldToScheduler } from "./studio-yield.js?v=2609220052";
// tile 之间的留白：紧贴会因线性过滤在边缘互相渗色。
const DEFAULT_TILE_GUTTER = 1;

/**
 * 把外部输入夹成正整数。
 */
function toPositiveInt(input, fallback = 0) {
  const parsed = Math.floor(Number(input));
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  } else {
    return fallback;
  }
}

/**
 * 求不小于入参的最小 2 的幂。
 *
 * 图集尺寸必须是 2 的幂：mipmap 与部分驱动的纹理压缩才允许。
 */
function nextPowerOfTwo(requestedValue) {
  let result = 1;
  const powerOfTwo = Math.max(1, Math.ceil(Number(requestedValue) || 1));
  while (result < powerOfTwo) {
    result *= 2;
  }
  return result;
}
/**
 * 按「逐行从左到右、放不下就换行」的货架算法把 tile 摆进方图。
 *
 * 货架算法 O(n) 且结果可预测，每次重建布局完全相同，便于复现问题。
 */
function packTilesIntoAtlas(tiles, atlasSize, gutter) {
  let cursorX = gutter;
  let cursorY = gutter;
  let rowHeight = 0;
  const placed = [];
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
function packSpotShadowAtlasTiles(tileSizes = [], maxAtlasSize = 4096, tileGutter = DEFAULT_TILE_GUTTER) {
  const atlasLimit = toPositiveInt(maxAtlasSize, 4096);
  // gutter 允许为 0（省显存），但负数没有意义，直接夹到 0。
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
    // 没有灯也要给个 1×1 的占位图集，避免着色器里出现 0 尺寸纹理。
    return {
      size: 1,
      tiles: []
    };
  }
  // 以「总面积」为下界估一个起点，再按 2 的幂往上试，避免从 1 开始逐级翻倍做无谓的布局尝试。
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
 *
 * 图集条目按这个键在多次重建之间复用，所以键必须稳定；键为空的灯不参与图集。
 */
  function spotLightKey(lightObject) {
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
 * 入选条件（缺一不可）：是 SpotLight、标记了 shadowCandidate、有稳定的灯键、
 * （按需）层级可见、以及亮度大于 0 或显式要求预热。
 */
function collectShadowLights(searchRoot, { includeHidden: includeHidden = true } = {}) {
  const lights = [];
  searchRoot?.traverse(object => {
    // 亮度归零的灯不再产生光照，阴影也就无从谈起；prewarmShadow 是例外：
    // 关灯状态下也先把阴影烘好，开灯时就不会有一次性卡顿。
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
 * 只列 MeshStandard / Physical / Lambert / Phong / Toon：这些才走 lights_fragment_begin
 * 分支；Basic 与自定义着色器不接收阴影，打补丁反而报错。
 */
function isShadowableMaterial(material) {
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
 * 用 VSM（方差阴影）贴图的 rg 通道：r 是深度均值，g 是标准差；刻意不走
 * three.js 自带的切比雪夫尾部概率，原因见函数体内注释。
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
 *
 * params.w 是法线偏移（normalBias）：沿世界法线把采样点推离表面，消除斜面自阴影条纹。
 */
function buildAtlasVertexChunk() {
  return "\n#if NUM_SPOT_LIGHTS > 0\n  vec3 userShadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );\n  vec4 userShadowWorldPosition;\n  #pragma unroll_loop_start\n  for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {\n    userShadowWorldPosition = worldPosition + vec4( userShadowWorldNormal * userSpotShadowParams[ i ].w, 0.0 );\n    vUserSpotShadowCoord[ i ] = userSpotShadowMatrix[ i ] * userShadowWorldPosition;\n  }\n  #pragma unroll_loop_end\n#endif\n";
}
/**
 * 给 three.js 的灯光着色器打补丁：跳过颜色为零的聚光灯。场景里常见十几盏灯但多数亮度为 0，
 * 它们仍会走完整段直接光计算，这里在 RE_Direct 调用外裹一层 uniform 分支整段跳过。
 * @throws {Error} three.js 版本变化导致聚光灯分支结构不再匹配时抛出，宁可失败也不要静默出错图。
 */
function guardZeroContributionSpotLights(lightsShader) {
  const spotLightBranchStart = lightsShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
  const dirLightBranchStart = lightsShader.indexOf("#if ( NUM_DIR_LIGHTS > 0 )", spotLightBranchStart);
  const directLightCall =
    "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );";
  // 用「该调用在聚光灯分支里恰好出现一次」来确认结构，多一次或零次都说明 three.js 改版了。
  const spotLightBranch = lightsShader.slice(spotLightBranchStart, dirLightBranchStart);
  if (spotLightBranchStart < 0 || dirLightBranchStart < 0 || spotLightBranch.split(directLightCall).length !== 2) {
    throw new Error("当前 Three.js 聚光灯反射 Shader 与零贡献优化不兼容。");
  }
  // HB_SKIP_ZERO_SPOT_LIGHT 只在开启逐帧同步渲染灯光的模式下由材质 defines 打开。
  const guardedCall =
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      if ( any( notEqual( directLight.color, vec3( 0.0 ) ) ) ) {\n    #endif\n      " +
    directLightCall +
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      }\n    #endif";
  return lightsShader.slice(0, spotLightBranchStart) + spotLightBranch.replace(directLightCall, guardedCall) + lightsShader.slice(dirLightBranchStart);
}
/**
 * 在图集采样点处把 three.js 自带的单灯阴影代码换成图集采样：在 USE_SHADOWMAP 的聚光灯循环
 * 标记前插入替换阴影因子的代码，再删除该标记，让原来的单灯阴影分支不再生成。
 * @throws {Error} three.js 的灯光着色器版本与图集补丁不匹配时抛出。
 */
function patchLightsFragmentBegin(THREE) {
  const spotShadowLoopMarker =
    "\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )";
  const atlasShadowPatch =
    // USE_USER_SPOT_SHADOW_ATLAS 为真时，用图集采样结果乘上 directLight.color。
    // visible 与 receiveShadow 都要检查：否则关灯或明确不接收阴影的对象也会被涂暗。
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
 * 烘焙完成后单灯贴图就是纯显存浪费，必须显式 dispose：three.js 不会因
 * light.shadow.map 被置空而回收纹理。
 */
function disposeShadowTargets(disposedLight) {
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
 * @throws {Error} 缺少 Three.js 渲染上下文，或 three.js 着色器结构不兼容时抛出。
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
} = {}) {
  if (!three || !renderer || !scene || !camera) {
    throw new Error("创建阴影图集时缺少 Three.js 渲染上下文。");
  }
  // 这四个数组的「长度与顺序」必须与当前参与渲染的聚光灯完全一致：
  // three.js 的 unrolled loop 用循环下标 i 访问它们，顺序错了灯就照到别的房间去。
  const uniforms = {
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
  let atlasTarget = null;
  // 1×1 的临时目标：强制烘焙时总得有个已绑定输出的 render target。
  let scratchTarget = null;
  let preparedMaterials = new WeakSet();
  let pendingRoot = null;
  let buildTimer = 0;
  // revision 是「期望状态」的计数：每次 schedule 加一，烘焙过程中发现不等就说明
  // 场景又变了，本次烘焙结果作废，避免把过期数据写进图集。
  let revision = 0;
  let isBuilding = false;
  let isDirty = false;
  let isDisposed = false;
  let isEnabled = true;
  let syncedLights = null;
  let syncedEntries = [];
  let previousLights = [];
  let previousEntries = [];
  const scratchMatrix4 = new three.Matrix4();
  const scratchVector4 = new three.Vector4();
  // 逐帧同步模式才建灯索引：它每帧遍历场景，只在确实需要时才付出这份开销。
  const lightIndex = syncBeforeRender ? createRenderLightIndex() : null;
  // 强制 shadowMap.render() 不能挂在 scene.onBeforeRender 上：r182 里它太早，state 仍为 null，
  // 而 Mesh 的 onBeforeRender 在颜色通道中触发时 three.js 已持有可用的 currentRenderState。
  // 这块探针网格就是用来借 Mesh 钩子的时机执行强制烘焙的。
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
  // 否则钩子可能整帧不触发，烘焙就永远等不到时机。
  bakeProbeMesh.frustumCulled = false;
  bakeProbeMesh.layers.enableAll();
  // 空实现：真正的回调在每次烘焙前临时替换。
  bakeProbeMesh.onBeforeRender = () => {};

  /**
   * 根据当前是否启用、灯数是否非零，决定着色器里的图集开关。
   */
  function setAtlasEnabled(enabled) {
    uniforms.userSpotShadowAtlasEnabled.value = enabled && isEnabled && entryByLightKey.size ? 1 : 0;
  }

  /**
   * 判断当前是否处于「阴影更新被冻结」的状态。
   * 楼层过渡会把 autoUpdate 与 needsUpdate 同时置 false；这段窗口里烘焙会采到
   * 正在移动的世界矩阵，且楼层落位后没有任何机制会顺带重建，只能等解除再烘。
   */
  function areShadowUpdatesFrozen() {
    return renderer.shadowMap.autoUpdate === false && renderer.shadowMap.needsUpdate === false;
  }

  /**
   * 给一个材质注入图集采样所需的 defines 与着色器改写。
   */
  function prepareMaterial(materialToPrepare) {
    // WeakSet 去重：材质可能被成百上千个网格共享，重复包装会层层套娃。
    if (!isShadowableMaterial(materialToPrepare) || preparedMaterials.has(materialToPrepare)) {
      return;
    }
    // 反射用的镜像材质会复用源材质的着色器程序；源材质已经打好补丁时直接跳过，
    // 否则会再包一层 onBeforeCompile 导致同一段代码注入两次（GLSL 重定义报错）。
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
    // 亮度为 0 的灯整段跳过，只在逐帧同步灯光的模式下启用（那时灯列表每帧变动，
    // 零贡献灯很常见）；静态模式下灯表稳定，跳过带来的收益不值得多一个分支。
    if (syncBeforeRender && materialToPrepare.isMeshStandardMaterial) {
      materialToPrepare.defines.HB_SKIP_ZERO_SPOT_LIGHT = 1;
    }
    materialToPrepare.onBeforeCompile = (shader, rendererInstance) => {
      previousOnBeforeCompile?.call(materialToPrepare, shader, rendererInstance);
      // 直接把 uniform 对象挂进着色器：uniforms 是同一个引用，之后改 .value 即可全材质生效。
      Object.assign(shader.uniforms, uniforms);
      // 顶点侧要在 shadowmap 相关 include 之后插入，才能拿到 worldPosition 与 transformedNormal。
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
  function prepareRoot(root) {
    if (!isDisposed) {
      root?.traverse(child => {
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
  function collectActiveLights(activeRoot) {
    return collectShadowLights(activeRoot, {
      includeHidden: false
    });
  }

  /**
   * 按当前可见灯列表重排 uniform 数组，并关闭单灯阴影。
   */
  function syncUniforms(syncRoot = pendingRoot) {
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
      // 着色器里 params.z = 0 表示不阴影，于是这盏灯按无阴影渲染而不是报错。
      matrixUniforms.push(lightEntry?.matrix || new three.Matrix4());
      rectUniforms.push(lightEntry?.rect || new three.Vector4());
      paramUniforms.push(
        lightEntry
          ? new three.Vector4(lightEntry.bias, lightEntry.intensity, 1, lightEntry.normalBias)
          : new three.Vector4(0, 0, 0, 0)
      );
      // 阴影已由图集提供，必须把单灯阴影关掉，否则 three.js 会为每盏灯再分配一张贴图。
      light.castShadow = false;
    }
    uniforms.userSpotShadowAtlas.value = atlasTarget?.texture || null;
    setAtlasEnabled(true);
    const enabledLightCount = paramUniforms.filter(lightParam => lightParam.z > 0.5).length;
    // 把统计写进 dataset，便于在浏览器里直接查看当前有多少盏灯真的带阴影。
    renderer.domElement.dataset.activeSpotShadows = String(enabledLightCount);
    return enabledLightCount;
  }

  /**
   * 按本帧「实际被渲染的灯」顺序同步 uniform（逐帧同步模式专用）。
   * three.js 只给经过视锥与图层筛选的灯分配循环下标，因此 uniform 顺序必须
   * 跟着渲染器实际使用的灯列表走，不能只按场景遍历顺序。
   */
  function syncRenderLights(renderedScene, renderedCamera) {
    if (isDisposed || !syncBeforeRender || !renderedScene) {
      return;
    }
    const renderLights = previousLights;
    const renderEntries = previousEntries;
    renderLights.length = renderEntries.length = 0;
    for (const renderLight of lightIndex.read(renderedScene, renderedCamera)) {
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
    // 不产生新数组，避免逐帧同步模式下的持续 GC 压力。
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
  function createAtlasTarget(targetSize) {
    // RG + 半浮点是 VSM 的最小可用格式：R 存深度均值、G 存方差。
    // 关掉 mipmap 与深度/模板缓冲：这张图只被着色器采样，不参与深度测试。
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
   * 用纯白而非黑色：VSM 里距离 1 代表最远，未绘制的 tile 自动是无阴影，
   * 某些灯烘焙失败时那块区域也不会出现整片黑块。
   */
  function clearAtlasTarget(target) {
    // 临时改渲染目标与清屏色，必须原样还原，否则会污染调用方的渲染状态。
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
   * 之所以逐盏烘：three.js 的阴影通道会一次性处理所有 castShadow 灯，而结果要
   * 拆到不同 tile 上，只能一次只让一盏灯产生阴影。
   */
  async function rebuildAtlas(buildRoot, buildRevision) {
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
    // 这样中途失败时旧图集与旧条目仍然配套可用。
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
    // 这里是离屏烘焙，必须屏蔽这些副作用，否则会重复出图或改错相机。
    const previousSuppressOverviewStack = renderer.userData?.suppressOverviewStack;
    renderer.userData = renderer.userData || {};
    renderer.userData.suppressOverviewStack = true;
    try {
      prepareRoot(buildRoot);
      nextAtlasTarget = createAtlasTarget(layout.size);
      renderer.initRenderTarget(nextAtlasTarget);
      clearAtlasTarget(nextAtlasTarget);
      // 1×1 的临时输出目标：逐灯烘焙时 renderer 必须有绑定目标，
      // 而我们只关心阴影贴图，颜色输出用最小尺寸即可（省带宽）。
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
      // 同时为 false 或 enabled 为 false 时 three.js 会整段跳过。楼层过渡的冻结通常已被
      // areShadowUpdatesFrozen() 挡住，这里兜住其余状态，两个值都在 finally 还原。
      renderer.shadowMap.enabled = true;
      for (let lightCursor = 0; lightCursor < shadowLights.length; lightCursor += 1) {
        // 每盏灯之间都有 await，期间场景可能被改；每次循环都要重新确认 revision。
        if (buildRevision !== revision) {
          return;
        }
        if (areShadowUpdatesFrozen()) {
          // 楼层过渡在这次烘焙的两盏灯之间开始了。丢掉半成品图集，
          // 等楼层落位后再重建，否则会留下新旧楼层混在一起的阴影。
          isDirty = true;
          scheduleBuild(160);
          return;
        }
        const activeLight = shadowLights[lightCursor];
        const targetTile = layout.tiles[lightCursor];
        activeLight.visible = true;
        // 用开灯亮度覆盖当前强度：关灯状态下 intensity 可能为 0，
        // 而强度为 0 的灯在 three.js 里不产生阴影通道，烘出来会是一张空图。
        activeLight.intensity = Math.max(
          Number(activeLight.userData?.lightOnIntensity || activeLight.intensity || 1),
          0.001
        );
        syncUniforms(buildRoot);
        setAtlasEnabled(false);
        activeLight.castShadow = true;
        // autoUpdate=false + needsUpdate=true：只让这一盏灯烘一次，避免递归。
        activeLight.shadow.autoUpdate = false;
        activeLight.shadow.needsUpdate = true;
        renderer.shadowMap.needsUpdate = true;
        // collectShadowLights 可能收进父级被隐藏的灯，而 three.js 只把
        // 层级上可见的灯放进阴影列表。这里临时把祖先链上的隐藏节点打开，事后再关回去。
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
        // 目标的世界矩阵必须先更新，否则 shadow.updateMatrices 会用到上一帧的朝向，
        // 灯一动阴影就会滞后一帧。
        activeLight.updateWorldMatrix(true, false);
        // 借探针网格的 onBeforeRender 做强制烘焙，此时 currentRenderState 才可用（见上方说明）。
        // 显式传灯列表能覆盖 projectObject 会跳过的灯（图层 / 层级边界情况）；自带阴影通道
        // 可能已先烘过这盏灯，多烘一次代价很小，却能让图集路径的结果保持确定。
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
          // 失败灯数已经写进 dataset.spotShadowMissedLights（浏览器里排查用），控制台这份只在 ?debug=1 时出现。
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
          // 内缩后采样点永远落在本 tile 内部。
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
          // 绝不因为一盏灯失败就丢弃整张图集：跳过它即可，
          // 着色器里 userSpotShadowParams.z = 0 会把它当作无阴影处理。
          missingLightKeys.push(spotLightKey(activeLight));
        }
        activeLight.castShadow = false;
        activeLight.visible = false;
        // 单灯阴影图已经进图集了，立刻释放显存，否则一次烘焙会同时占住两份。
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
        // three.js 立刻为这些灯重新分配单灯阴影图，图集就白做了。
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
  function scheduleBuild(delay) {
    // isDirty 是排队的唯一条件：不脏就不排，避免无意义的重复烘焙。
    if (!isDisposed && !!isDirty) {
      // 已有定时器就重置：短时间内多次 schedule 只烘最后一次。
      clearTimeout(buildTimer);
      buildTimer = setTimeout(
        () => {
          buildTimer = 0;
          if (!isDisposed && !isBuilding && !!isDirty) {
            rebuildAtlas(pendingRoot, revision).catch(error => {
              if (!isDisposed) {
                // 重建整体失败（例如图集放不下）时记录原因并标记回退，
                // 各灯在着色器里按无阴影渲染，功能不至于中断。
                // dataset.spotShadowMode = "fallback" 是用户可见的状态，控制台这份只在 ?debug=1 时出现。
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
  function schedule(scheduledRoot, { delay: scheduleDelay = buildDelay } = {}) {
    if (isDisposed) {
      return 0;
    }
    pendingRoot = scheduledRoot;
    prepareRoot(scheduledRoot);
    for (const scheduledLight of collectShadowLights(scheduledRoot)) {
      // 重建到位之前先全部按无阴影渲染，避免用到过期图集里的错位数据。
      scheduledLight.castShadow = false;
    }
    syncUniforms(scheduledRoot);
    // revision 自增让所有在途烘焙立刻作废。
    revision += 1;
    isDirty = true;
    scheduleBuild(scheduleDelay);
    return collectShadowLights(scheduledRoot).length;
  }
  let lastRoot = null;
  let lastRevision = -1;
  let lastLightIndexBuilds = -1;
  let trackedLights = [];

  /**
   * 只刷新已有图集的几何信息（灯移动 / 物体移动），不重新排版。
   *
   * 适用于灯只是换了位置或场景物体微调的情况：重新烘焙一遍几何比整块重建快得多。
   */
  function refreshGeometry(refreshRoot = pendingRoot, viewBoxes = null) {
    if (isDisposed) {
      return true;
    }
    if (isBuilding || buildTimer || isDirty) {
      // 正在重建或有待处理的重建时，刷新没有意义（新图集马上会覆盖它）。
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
      refreshRoot?.traverse(trackedLight => {
        if (trackedLight.isSpotLight && trackedLight.shadow && entryByLightKey.has(spotLightKey(trackedLight))) {
          trackedLights.push(trackedLight);
        }
      });
    }
    const frustumBoxes =
      viewBoxes === null ? null : viewBoxes.filter(box => box?.isBox3 && !box.isEmpty());
    const updates = [];
    // 先整体更新世界矩阵，下面逐灯算阴影矩阵时读到的才是当前帧的位置。
    refreshRoot?.updateWorldMatrix(true, true);
    for (const updateLight of trackedLights) {
      const geometryEntry = entryByLightKey.get(spotLightKey(updateLight));
      if (geometryEntry?.tile) {
        updateLight.target?.updateWorldMatrix(true, false);
        updateLight.shadow.updateMatrices(updateLight);
        // 相机看不到的灯不必重烘：这一步是性能关键，房间多时能省掉大部分灯。
        if (!frustumBoxes || !!frustumBoxes.some(viewBox => updateLight.shadow.getFrustum().intersectsBox(viewBox))) {
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
          // 这里调 shadowMap.render 是安全的：refreshGeometry 由 onBeforeRender 探针触发，
          // WebGLRenderer 此时持有可用的 currentRenderState。
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
        // 覆盖写入同一块 tile：几何刷新不改布局，所以可以直接原地替换。
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
        // 否则每次几何刷新都会泄漏一份显存。
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
  function setEnabled(nextEnabled) {
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
      // 交给 rebuildAtlas 的 finally 收尾。
      if (!isBuilding) {
        disposeAtlases();
      }
    }
  }
  if (syncBeforeRender) {
    // 包一层而不是直接赋值：保留场景上原有的钩子，避免覆盖别处注册的逻辑。
    const previousOnBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args) {
      previousOnBeforeRender?.apply(this, args);
      // 参数约定：args[1] 是场景、args[2] 是相机（由 WebGLRenderer 传入）。
      syncRenderLights(args[1] || scene, args[2] || camera);
    };
  }
  // 对外接口：prepareRoot 提前给静态树打补丁，refreshGeometry 做轻量几何刷新，
  // schedule 登记变更并排队重建，sync 手动重排 uniform。
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
