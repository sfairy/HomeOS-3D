import { createRenderLightIndex } from "../../../bridge/scene/render-light-index";
import {
  createFloorDirectionalShadow,
  floorDirectionalShader,
  type FloorDirectionalLight,
  type FloorDirectionalShadow,
} from "./studio-floor-directional-shadow";
import {
  createFloorLightBuffer,
  floorLightShaderPars,
  floorLightShaderLoop,
  objectFloorId,
  type FloorLightBuffer,
  type FloorCamera,
  type FloorLightNode,
  type FloorMatrix4,
  type FloorShadowEntry,
  type FloorSunEntry,
  type FloorVector4,
} from "./studio-floor-lights";
import { createShadowParameterBuffer, type ShadowParameterBuffer } from "./studio-shadow-parameters";
import { createShadowTextureCopy, type ShadowTextureCopy } from "./studio-shadow-copy";

const DEFAULT_TILE_GUTTER = 1;
function toPositiveInt(input: any, fallback = 0) {
  const parsed = Math.floor(Number(input));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function nextPowerOfTwo(requestedValue: any) {
  let result = 1;
  const powerOfTwo = Math.max(1, Math.ceil(Number(requestedValue) || 1));
  for (; result < powerOfTwo;) result *= 2;
  return result;
}
function packTilesIntoAtlas(tiles: any, atlasSize: any, gutter: any) {
  let cursorX = gutter,
    cursorY = gutter,
    rowHeight = 0;
  const placed: any[] = [];
  for (const tile of tiles) {
    const tileSize = tile.size;
    if (
      (cursorX + tileSize + gutter > atlasSize &&
        ((cursorX = gutter), (cursorY += rowHeight + gutter * 2), (rowHeight = 0)),
      cursorY + tileSize + gutter > atlasSize)
    )
      return null;
    (placed.push({
      ...tile,
      x: cursorX,
      y: cursorY,
    }),
      (cursorX += tileSize + gutter * 2),
      (rowHeight = Math.max(rowHeight, tileSize)));
  }
  return placed;
}
function packSpotShadowAtlasTiles(
  tileSizes: any[] = [],
  maxAtlasSize = 4096,
  tileGutter = DEFAULT_TILE_GUTTER,
) {
  const atlasLimit = toPositiveInt(maxAtlasSize, 4096),
    gutterPx = Math.max(0, Math.floor(Number(tileGutter) || 0)),
    entries = tileSizes
      .map((size, index) => ({
        index: index,
        size: toPositiveInt(size),
      }))
      .filter((entry) => entry.size > 0 && entry.size + gutterPx * 2 <= atlasLimit)
      .sort((entryA, entryB) => entryB.size - entryA.size || entryA.index - entryB.index);
  if (entries.length !== tileSizes.length) return null;
  if (!entries.length)
    return {
      size: 1,
      tiles: [] as any[],
    };
  const totalArea = entries.reduce(
    (sum, tileEntry) => sum + (tileEntry.size + gutterPx * 2) ** 2,
    0,
  );
  let atlasSizeCandidate = nextPowerOfTwo(
    Math.max(entries[0].size + gutterPx * 2, Math.sqrt(totalArea)),
  );
  for (; atlasSizeCandidate <= atlasLimit;) {
    const candidateLayout = packTilesIntoAtlas(entries, atlasSizeCandidate, gutterPx);
    if (candidateLayout) {
      const orderedTiles = Array(tileSizes.length);
      for (const placedTile of candidateLayout) orderedTiles[placedTile.index] = placedTile;
      return {
        size: atlasSizeCandidate,
        tiles: orderedTiles,
      };
    }
    atlasSizeCandidate *= 2;
  }
  return null;
}
function spotLightKey(lightObject: any) {
  const floorId = String(lightObject?.userData?.lightFloorId || ""),
    itemId = String(lightObject?.userData?.lightItemId || "");
  return itemId ? floorId + ":" + itemId : "";
}
function collectShadowLights(searchRoot: any, { includeHidden: includeHidden = true } = {}) {
  const lights: any = [];
  return (
    searchRoot?.traverse((object: any) => {
      !object.isSpotLight ||
        object.userData?.shadowCandidate !== true ||
        !spotLightKey(object) ||
        (!includeHidden && object.visible === false) ||
        (Number(object.userData?.lightBrightness || 0) <= 0 &&
          object.userData?.prewarmShadow !== true) ||
        lights.push(object);
    }),
    lights
  );
}
function isShadowableMaterial(material: any) {
  return !!(
    material &&
    (material.isMeshStandardMaterial ||
      material.isMeshPhysicalMaterial ||
      material.isMeshLambertMaterial ||
      material.isMeshPhongMaterial ||
      material.isMeshToonMaterial)
  );
}
/** 图集里一盏灯占的矩形（像素坐标）。 */
interface AtlasTile {
  index: number;
  size: number;
  x: number;
  y: number;
}
/** 图集里一盏灯的采样参数：着色器按这 6 个 `vec4` 做投影与采样。 */
interface SpotShadowEntry extends FloorShadowEntry {
  /** 生成该条目时对应的灯对象；离开楼层后仍要能反查它属于哪层。 */
  light: FloorLightNode | null;
  tile: AtlasTile;
  /** 灯的世界矩阵：分层缓冲要用它把「锚点空间里的阴影矩阵」折回当前相机空间。 */
  lightWorld: FloorMatrix4;
  /** `syncRenderLights` 复用的 `vec4`，避免每帧新建。 */
  uniformParams?: FloorVector4;
}
/**
 * 片元着色器里的图集采样段。
 *
 * 0.8.1 起要同时服务两条路径：
 * - 常规路径：每盏射灯一组 varying（或数据纹理）；
 * - 分层路径（`HB_FLOOR_LIGHTS`）：层数一多 varying 必然超限，参数改从 `std140` 的
 *   `UserSpotShadowParameters` 块里按灯槽位取，纹理单元只留图集本身。
 *
 * 所以整段（包括 `getUserSpotAtlasShadow`）都跟着闸门一起放宽到 `HB_FLOOR_LIGHTS`：
 * 分层路径下 `NUM_SPOT_LIGHTS` 往往是 0（灯都被楼层缓冲接管、`layers.mask` 已清零），
 * 只用 `NUM_SPOT_LIGHTS > 0` 会把这几个函数整段裁掉，分层灯光循环就编不过。
 */
function buildAtlasFragmentChunk() {
  return `
#if NUM_SPOT_LIGHTS > 0 || defined(HB_FLOOR_LIGHTS)
  uniform sampler2D userSpotShadowAtlas;
  uniform float userSpotShadowAtlasEnabled;
  #if NUM_SPOT_LIGHTS > USER_SPOT_SHADOW_VERTEX_LIMIT || defined(HB_FLOOR_LIGHTS)
    varying vec4 vUserShadowWorldPosition;
    varying vec3 vUserShadowWorldNormal;
    #if NUM_SPOT_LIGHTS <= USER_SPOT_SHADOW_BUFFER_LIMIT
      layout(std140) uniform UserSpotShadowParameters {
        vec4 userSpotShadowBuffer[ USER_SPOT_SHADOW_BUFFER_LIMIT * 6 ];
      };
      vec4 userSpotShadowValue( int slot, int column ) {
        return userSpotShadowBuffer[ slot * 6 + column ];
      }
    #else
      uniform highp sampler2D userSpotShadowData;
      vec4 userSpotShadowValue( int slot, int column ) {
        return texelFetch( userSpotShadowData, ivec2( column, slot ), 0 );
      }
    #endif
  #else
    uniform vec4 userSpotShadowRect[ NUM_SPOT_LIGHTS ];
    uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];
    varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];
  #endif

  float getUserSpotAtlasShadow( vec4 atlasRect, vec4 shadowParams, vec4 shadowCoord ) {
    if ( userSpotShadowAtlasEnabled < 0.5 || shadowParams.z < 0.5 ) return 1.0;
    shadowCoord.xyz /= shadowCoord.w;
    shadowCoord.z += shadowParams.x;
    bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0
      && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
    if ( ! inFrustum || shadowCoord.z > 1.0 ) return 1.0;
    vec2 atlasUv = atlasRect.xy + clamp( shadowCoord.xy, 0.0, 1.0 ) * atlasRect.zw;
    vec2 distribution = texture2D( userSpotShadowAtlas, atlasUv ).rg;
    float mean = distribution.x;
    // The stock VSM Chebyshev tail turns half-float depth steps from a
    // 256px local-light map into several visible contour rings. Preserve the
    // authored VSM blur, but use its deviation only to size one bounded edge
    // transition. This keeps the same single texture sample and removes the
    // long probability tail that made furniture shadows look layered.
    float softness = clamp( abs( distribution.y ) * 0.35, 0.0007, 0.004 );
    // A slope-scaled receiver guard keeps the newly bounded edge from
    // exposing quantized self-shadow stripes on cabinet fronts and tabletops.
    // It changes only the depth comparison, not the map resolution or sample
    // count, and is capped tightly so real contact shadows stay attached.
    // Cover the complete soft transition at equal depth, then add only a
    // small slope allowance. This prevents the half-float map's depth bands
    // from reappearing on large floors or through transparent glass, while
    // keeping the allowance proportional to the authored penumbra.
    float receiverGuard = softness + clamp( fwidth( shadowCoord.z ) * 1.5, 0.0002, 0.0015 );
    #ifdef USE_REVERSED_DEPTH_BUFFER
      float occludedDistance = mean - shadowCoord.z;
    #else
      float occludedDistance = shadowCoord.z - mean;
    #endif
    // The atlas contains only solid architectural occluders. Once a receiver
    // is safely behind a wall, collapse the remaining VSM depth transition
    // quickly instead of letting it extend through nearby cabinet backs and
    // reveal half-float depth rows. The authored blur in atlas UV space still
    // keeps the wall silhouette soft; this only removes light bleeding behind
    // the blocker. Equality and the complete receiver guard remain lit.
    float blockerTransition = max( softness * 0.5, 0.00035 );
    float shadow = 1.0 - smoothstep(
      receiverGuard,
      receiverGuard + blockerTransition,
      occludedDistance
    );
    return mix( 1.0, shadow, shadowParams.y );
  }
#endif
`;
}
function buildAtlasVertexParsChunk() {
  return `
#if NUM_SPOT_LIGHTS > 0 || defined(HB_FLOOR_LIGHTS)
  #if NUM_SPOT_LIGHTS > USER_SPOT_SHADOW_VERTEX_LIMIT || defined(HB_FLOOR_LIGHTS)
    varying vec4 vUserShadowWorldPosition;
    varying vec3 vUserShadowWorldNormal;
  #else
    uniform mat4 userSpotShadowMatrix[ NUM_SPOT_LIGHTS ];
    uniform vec4 userSpotShadowParams[ NUM_SPOT_LIGHTS ];
    varying vec4 vUserSpotShadowCoord[ NUM_SPOT_LIGHTS ];
  #endif
#endif
`;
}
function buildAtlasVertexChunk() {
  return `
#if NUM_SPOT_LIGHTS > 0 || defined(HB_FLOOR_LIGHTS)
  #if NUM_SPOT_LIGHTS > USER_SPOT_SHADOW_VERTEX_LIMIT || defined(HB_FLOOR_LIGHTS)
    vUserShadowWorldPosition = worldPosition;
    vUserShadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
  #else
    vec3 userShadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
    vec4 userShadowWorldPosition;
    #pragma unroll_loop_start
    for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
      userShadowWorldPosition = worldPosition + vec4( userShadowWorldNormal * userSpotShadowParams[ i ].w, 0.0 );
      vUserSpotShadowCoord[ i ] = userSpotShadowMatrix[ i ] * userShadowWorldPosition;
    }
    #pragma unroll_loop_end
  #endif
#endif
`;
}
/**
 * `lights_pars_begin` 的分层改动。
 *
 * 分层路径下 `NUM_SPOT_LIGHTS` / `NUM_RECT_AREA_LIGHTS` 通常是 0（灯被楼层缓冲接管），
 * 但着色器仍要能用 `SpotLight` / `RectAreaLight` 这两个结构体（`getUserFloorLight` 里构造），
 * 所以把闸门放宽到 `HB_FLOOR_*`；同时用 `#ifndef` 把「按灯数长度的 uniform 数组」挡掉，
 * 否则会变成 `uniform SpotLight spotLights[ 0 ]` 这种非法声明。
 */
function patchLightsParsBegin(THREE: any) {
  return THREE.ShaderChunk.lights_pars_begin
    .replace("#if NUM_SPOT_LIGHTS > 0", "#if NUM_SPOT_LIGHTS > 0 || defined(HB_FLOOR_LIGHTS)")
    .replace("#if NUM_RECT_AREA_LIGHTS > 0", "#if NUM_RECT_AREA_LIGHTS > 0 || defined(HB_FLOOR_AREA_LIGHTS)")
    .replace(
      "uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];",
      "#ifndef HB_FLOOR_AREA_LIGHTS\nuniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];\n#endif",
    )
    .replace(
      "uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];",
      "#ifndef HB_FLOOR_LIGHTS\nuniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];\n#endif",
    );
}
function patchLightsPhysicalPars(THREE: any) {
  return THREE.ShaderChunk.lights_physical_pars_fragment.replaceAll(
    "#if NUM_RECT_AREA_LIGHTS > 0",
    "#if NUM_RECT_AREA_LIGHTS > 0 || defined(HB_FLOOR_AREA_LIGHTS)",
  );
}
/** 定位灯光着色器里「聚光灯直接光」那一段分支，返回 [start, end) 半开区间。
 *
 * 不能简单截到 `#if ( NUM_DIR_LIGHTS > 0 )`：r186 的灯光链在聚光灯与平行光之间还夹了一段
 * 「太阳光」（NUM_SUN_LIGHTS），那段里同样只有一次 RE_Direct，一路截过去会让分支内的调用点
 * 计数变成 2，守卫就会误判成「three.js 改版」。因此这里先取聚光灯分支自己的
 * `#pragma unroll_loop_end` 与收尾 `#endif`，再从 `#endif` 之后找同级的下一个灯光块边界。
 *
 * @returns {{start: number, end: number} | null} 结构不匹配时返回 null，由调用方决定如何报错。
 */
function spotLightBlockRange(lightsShader: any) {
  const spotBlockStart = lightsShader.indexOf("#if ( NUM_SPOT_LIGHTS > 0 )");
  if (spotBlockStart < 0) return null;
  const loopEnd = lightsShader.indexOf("#pragma unroll_loop_end", spotBlockStart);
  if (loopEnd < 0) return null;
  const spotEndif = lightsShader.indexOf("#endif", loopEnd);
  if (spotEndif < 0) return null;
  const nextLightBlock = lightsShader.indexOf("#if ( NUM_", spotEndif + "#endif".length);
  return {
    start: spotBlockStart,
    end: nextLightBlock >= 0 ? nextLightBlock : spotEndif + "#endif".length,
  };
}
function guardZeroContributionSpotLights(lightsShader: any) {
  const blockRange = spotLightBlockRange(lightsShader),
    directLightCall =
      "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
    spotLightBranch = blockRange ? lightsShader.slice(blockRange.start, blockRange.end) : "";

  if (!blockRange || spotLightBranch.split(directLightCall).length !== 2)
    throw new Error("当前 Three.js 聚光灯反射 Shader 与零贡献优化不兼容。");
  const guardedCall =
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      if ( dot( directLight.color, directLight.color ) > 0.0 ) {\n    #endif\n      " +
    directLightCall +
    "\n    #ifdef HB_SKIP_ZERO_SPOT_LIGHT\n      }\n    #endif";
  return (
    lightsShader.slice(0, blockRange.start) +
    spotLightBranch.replace(directLightCall, guardedCall) +
    lightsShader.slice(blockRange.end)
  );
}
function patchLightsFragmentBegin(THREE: any) {
  const spotShadowLoopSnippet =
      "\n\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )",
    atlasShadowPatch = `
    #if defined( USE_USER_SPOT_SHADOW_ATLAS )
    {
      #if NUM_SPOT_LIGHTS > USER_SPOT_SHADOW_VERTEX_LIMIT || defined(HB_FLOOR_LIGHTS)
        // A fixed pair of interpolants avoids the per-light varying limit.
        // Float32 data also avoids moving that limit to fragment uniforms.
        vec4 userShadowRect = userSpotShadowValue( UNROLLED_LOOP_INDEX, 4 );
        vec4 userShadowParams = userSpotShadowValue( UNROLLED_LOOP_INDEX, 5 );
        mat4 userShadowMatrix = mat4( userSpotShadowValue( UNROLLED_LOOP_INDEX, 0 ), userSpotShadowValue( UNROLLED_LOOP_INDEX, 1 ),
          userSpotShadowValue( UNROLLED_LOOP_INDEX, 2 ), userSpotShadowValue( UNROLLED_LOOP_INDEX, 3 ) );
        // Keep the interpolated vertex normal unnormalized, preserving bias.
        vec4 userSpotShadowCoord = userShadowMatrix *
          ( vUserShadowWorldPosition + vec4( vUserShadowWorldNormal * userShadowParams.w, 0.0 ) );
      #else
        vec4 userShadowRect = userSpotShadowRect[ i ];
        vec4 userShadowParams = userSpotShadowParams[ i ];
        vec4 userSpotShadowCoord = vUserSpotShadowCoord[ i ];
      #endif
      directLight.color *= ( directLight.visible && receiveShadow )
        ? getUserSpotAtlasShadow( userShadowRect, userShadowParams, userSpotShadowCoord )
        : 1.0;
    }
    #endif
`,
    /**
     * 方向光那一段的补丁。
     *
     * 分层阴影的方向光矩阵是在「楼层锚点空间」里算的，旋转户型 / 楼层堆叠预览时世界空间
     * 已经变了，这里用 `userFloorSun[6..8]`（锚点旋转）把 three 自己的方向折回锚点空间，
     * 再乘本层方向光的阴影因子。`userFloorHeader.w` 是本层方向光在 `userFloorSun` 里的槽位，
     * 只有它对应的那一轮循环才乘阴影，别的平行光不受影响。
     */
    directionalPatch = `getDirectionalLightInfo( directionalLight, directLight );
#if defined(HB_FLOOR_LIGHTS)
 directLight.direction = normalize(mat3(userFloorSun[6].xyz,userFloorSun[7].xyz,userFloorSun[8].xyz)*directLight.direction);
 if(UNROLLED_LOOP_INDEX == int(userFloorHeader.w)) directLight.color *= userFloorDirectionalShadow();
#endif`,
    lightsFragmentBegin = THREE.ShaderChunk.lights_fragment_begin;
  if (!lightsFragmentBegin.includes(spotShadowLoopSnippet))
    throw new Error("当前 Three.js 灯光 Shader 与阴影图集不兼容。");
  if (!lightsFragmentBegin.includes("getDirectionalLightInfo( directionalLight, directLight );"))
    throw new Error("当前 Three.js 方向光 Shader 与分层阴影不兼容。");
  if (!lightsFragmentBegin.includes("#if ( NUM_DIR_LIGHTS > 0 )"))
    throw new Error("当前 Three.js 平行光 Shader 与分层阴影不兼容。");
  return guardZeroContributionSpotLights(
    lightsFragmentBegin
      .replace(
        "getDirectionalLightInfo( directionalLight, directLight );",
        "" + directionalPatch,
      )
      // 分层灯光的直接光循环排在 three 自己的点光/聚光灯/平行光之前：它们共用
      // `directLight` 与 `reflectedLight`，顺序只影响加法次序，不影响结果。
      .replace(
        "#if ( NUM_DIR_LIGHTS > 0 )",
        "" + floorLightShaderLoop() + "\n#if ( NUM_DIR_LIGHTS > 0 )",
      )
      .replace(spotShadowLoopSnippet, "" + atlasShadowPatch + spotShadowLoopSnippet),
  );
}
/** 只用来触发一次渲染的临时网格（`renderDepth` 借它进 `onBeforeRender`）。 */
interface DepthCaptureMesh {
  geometry: { setAttribute(name: string, attribute: unknown): void; dispose(): void };
  material: { colorWrite: boolean; depthWrite: boolean; dispose(): void };
  layers: { mask: number };
  frustumCulled: boolean;
  onBeforeRender: () => void;
}
function disposeShadowTargets(disposedLight: any) {
  (disposedLight?.shadow?.map?.dispose?.(),
    disposedLight?.shadow?.mapPass?.dispose?.(),
    disposedLight?.shadow &&
      ((disposedLight.shadow.map = null), (disposedLight.shadow.mapPass = null)));
}
/** 聚光灯阴影图集控制器的外部依赖。
 *
 * 四个 Three.js 上下文标成可选是有意的：构造时会在下面显式校验并抛出可读错误，
 * 这样「不传参数直接调用」拿到的是中文提示而不是解构报错。
 */
type SpotShadowAtlasOptions = {
  THREE?: any;
  renderer?: any;
  scene?: any;
  camera?: any;
  /** 请求下一帧。 */
  requestFrame?: () => void;
  /** 图集彻底失败（已回退到逐灯阴影）时回调，调用方借此重排原生阴影。 */
  onFallback?: (root: unknown) => void;
  /** 是否允许建图集（例如性能吃紧时返回 false）。 */
  canBuild?: () => boolean;
  /** 合图集的延迟（毫秒），用来把开销摊到空闲帧。 */
  buildDelay?: number;
  /** 建完是否同步等待 GPU。 */
  syncBeforeRender?: boolean;
  /** 楼层淡出期间保留已离开楼层的阴影层，避免切层闪烁。 */
  retainDetachedFloors?: boolean;
  /** 楼层锚点空间 → 当前世界空间（楼层堆叠预览用）。 */
  getFloorFrame?: (floorId: string) => FloorMatrix4;
};

export function createSpotShadowAtlasController({
  THREE: three,
  renderer: renderer,
  scene: scene,
  camera: camera,
  requestFrame: requestFrame = () => {},
  onFallback: onFallback = () => {},
  canBuild: canBuild = () => true,
  buildDelay: buildDelay = 80,
  syncBeforeRender: syncBeforeRender = false,
  retainDetachedFloors: retainDetachedFloors = false,
  getFloorFrame: getFloorFrame,
}: SpotShadowAtlasOptions = {}) {
  if (!three || !renderer || !scene || !camera)
    throw new Error("创建阴影图集时缺少 Three.js 渲染上下文。");
  const uniforms = {
      userSpotShadowAtlas: {
        value: null as any,
      },
      userSpotShadowAtlasEnabled: {
        value: 0,
      },
      userSpotShadowMatrix: {
        value: [] as any[],
      },
      userSpotShadowRect: {
        value: [] as any[],
      },
      userSpotShadowParams: {
        value: [] as any[],
      },
      userSpotShadowData: {
        value: null as any,
      },
      // 分层方向光的阴影数组纹理；分层路径关闭时保持 null（着色器那一段被 `#ifdef` 裁掉）。
      userFloorDirectionalMap: {
        value: null as unknown,
      },
    },
    // 每盏聚光灯默认要占用 5 个 varying（矩阵 4 列 + 参数 vec4），顶点着色器能同时表达的
    // 灯数上限就是「可用 varying 向量数」减去基础骨架预留的余量。超过这个上限时改用
    // sampler2D(texelFetch) 或 `std140` 的 UBO 搬运参数，把顶点 stage 的 varying 压到固定的两个。
    glContext = renderer.getContext?.(),
    maxVaryingVectors = toPositiveInt(
      glContext?.getParameter?.(glContext.MAX_VARYING_VECTORS),
      16,
    ),
    maxVertexVaryingLights = Math.max(0, maxVaryingVectors - 16),
    shadowParameters: ShadowParameterBuffer = createShadowParameterBuffer(glContext),
    sharedDefinesChunk = `
#ifndef USE_USER_SPOT_SHADOW_ATLAS
  #define USE_USER_SPOT_SHADOW_ATLAS 1
#endif
#ifndef USER_SPOT_SHADOW_VERTEX_LIMIT
  #define USER_SPOT_SHADOW_VERTEX_LIMIT ${maxVertexVaryingLights}
#endif
#ifndef USER_SPOT_SHADOW_BUFFER_LIMIT
  #define USER_SPOT_SHADOW_BUFFER_LIMIT ${shadowParameters.capacity}
#endif
`,
    floorLights: FloorLightBuffer = createFloorLightBuffer({
      THREE: three,
      gl: glContext,
    }),
    patchedLightsFragment = patchLightsFragmentBegin(three),
    patchedLightsParsBegin = patchLightsParsBegin(three),
    patchedLightsPhysicalPars = patchLightsPhysicalPars(three),
    textureCopy: ShadowTextureCopy = createShadowTextureCopy(renderer),
    /**
     * 分层方向光阴影。
     *
     * `renderDepth` 是「只渲染这一层方向光的深度」的入口（见 `renderFloorDepth`）：
     * 分层路径要把方向光逐层挪到楼层锚点空间再渲一次，渲染整帧会把可见色也画一遍，
     * 又多花几十毫秒，所以这里只在阴影 pass 里渲。
     */
    directionalShadow: FloorDirectionalShadow = createFloorDirectionalShadow({
      THREE: three,
      renderer: renderer,
      scene: scene,
      renderDepth: renderFloorDepth,
      requestFrame: requestFrame,
      retainDetachedFloors: retainDetachedFloors,
      getFloorFrame: getFloorFrame,
      copyTexture: textureCopy.copy,
    }),
    // 方向光条目在 `directionalShadow.entries` 里是「逐楼层」的，字段在捕获后才补齐；
    // 分层缓冲区只读其中已补齐的那几个，所以这里直接按 `FloorSunEntry` 视图传入。
    sunEntries = directionalShadow.entries as unknown as ReadonlyMap<string, FloorSunEntry>,
    entryByLightKey = new Map<string, SpotShadowEntry>();
  let atlasTarget: any = null,
    scratchTarget: any = null,
    preparedMaterialSet = new WeakSet(),
    pendingRoot: any = null,
    buildTimer: ReturnType<typeof setTimeout> | number = 0,
    revision = 0,
    isBuilding = false,
    isDirty = false,
    isDisposed = false,
    isWebglLost = false,
    isEnabled = true,
    isBudgetAvailable = true,
    // 图集彻底失败后的回退态：分层灯光与图集一起停用，直到下一次 schedule 再试一次。
    isFallback = false,
    shadowDataTexture: any = null,
    syncedLights: any = null,
    syncedEntries: (SpotShadowEntry | undefined)[] = [],
    previousLights: any = [],
    previousEntries: (SpotShadowEntry | undefined)[] = [],
    depthScene: { add(child: unknown): void } | null = null,
    depthMesh: DepthCaptureMesh | null = null;
  const scratchMatrix = new three.Matrix4(),
    scratchVector = new three.Vector4();
  let lightIndex = syncBeforeRender ? createRenderLightIndex() : null,
    lastLightIndexStats = "";

  /**
   * 只渲染一层方向光的阴影贴图。
   *
   * 做法和 three 自己的 `shadowMap.render` 一样，但借一个「只有 9 个零顶点」的临时场景
   * 触发 `onBeforeRender`：`renderer.render` 一进来就立刻执行我们塞进去的阴影 pass，
   * 不画任何可见几何。`colorWrite`/`depthWrite` 关掉后连那次 clear 都省了。
   */
  function renderFloorDepth(directionalLight: FloorDirectionalLight) {
    if (!depthScene) {
      const captureScene = new three.Scene() as { add(child: unknown): void };
      const captureMesh = new three.Mesh(new three.BufferGeometry(), new three.MeshBasicMaterial());
      (captureMesh.geometry.setAttribute(
        "position",
        new three.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3),
      ),
        (captureMesh.frustumCulled = false),
        (captureMesh.material.colorWrite = false),
        (captureMesh.material.depthWrite = false),
        (depthMesh = captureMesh),
        (depthScene = captureScene),
        captureScene.add(captureMesh));
    }
    const captureMesh = depthMesh as DepthCaptureMesh,
      captureScene = depthScene;
    captureMesh.layers.mask = camera.layers.mask;
    const shadowMapState = {
      enabled: renderer.shadowMap.enabled,
      autoUpdate: renderer.shadowMap.autoUpdate,
      needsUpdate: renderer.shadowMap.needsUpdate,
    };
    (scene.updateMatrixWorld(true),
      camera.updateMatrixWorld(true),
      directionalLight.target?.updateWorldMatrix?.(true, false));
    let captureError: unknown = null;
    captureMesh.onBeforeRender = () => {
      try {
        ((renderer.shadowMap.enabled = true),
          (renderer.shadowMap.needsUpdate = true),
          // 渲染本层阴影时其它楼层必须隐藏，否则「隔层漏光」会重新出现在阴影图里。
          floorLights.withFloor(
            directionalLight as unknown as FloorLightNode,
            scene,
            () => renderer.shadowMap.render([directionalLight], scene, camera),
          ));
      } catch (error) {
        captureError = error;
      }
    };
    try {
      ((renderer.shadowMap.autoUpdate = false), renderer.render(captureScene, camera));
      if (captureError) throw captureError;
    } finally {
      ((captureMesh.onBeforeRender = () => {}),
        Object.assign(renderer.shadowMap, shadowMapState));
    }
  }

  /**
   * 参数灯数超出 varying 上限时，把矩阵/rect/params 写进 `std140` 的 UBO；
   * 连 UBO 都放不下才退回 6 列 Float32 数据纹理（行号就是灯槽位，列 0..3 是矩阵列、
   * 4 是 rect、5 是 params，供顶点与片元 texelFetch）。
   */
  function updateShadowParameters() {
    const matrixValues = uniforms.userSpotShadowMatrix.value;
    if (floorLights.enabled) return;
    const domElement = renderer.domElement;
    ((domElement.dataset.spotShadowTextureUnits = String(
      matrixValues.length
        ? matrixValues.length > Math.max(maxVertexVaryingLights, shadowParameters.capacity)
          ? 2
          : 1
        : 0,
    )),
      (domElement.dataset.shadowParameterSource = matrixValues.length
        ? matrixValues.length <= maxVertexVaryingLights
          ? "vertex-uniforms"
          : matrixValues.length <= shadowParameters.capacity
            ? "uniform-buffer"
            : "data-texture"
        : "none"));
    if (matrixValues.length <= maxVertexVaryingLights) return;
    if (matrixValues.length <= shadowParameters.capacity) {
      (shadowParameters.update(
        matrixValues,
        uniforms.userSpotShadowRect.value,
        uniforms.userSpotShadowParams.value,
      ),
        // three 自己的 UBO 绑定点在更高的编号上，这里回到 0 号点重新绑一次，
        // 免得上一帧别的 pass 把 0 号点指向了别的缓冲。
        shadowParameters.bind());
      return;
    }
    const textureHeight = nextPowerOfTwo(matrixValues.length);
    (!shadowDataTexture || shadowDataTexture.image.height < textureHeight) &&
      (shadowDataTexture?.dispose(),
      (shadowDataTexture = new three.DataTexture(
        new Float32Array(6 * textureHeight * 4),
        6,
        textureHeight,
        three.RGBAFormat,
        three.FloatType,
      )),
      (shadowDataTexture.minFilter = shadowDataTexture.magFilter = three.NearestFilter),
      (shadowDataTexture.generateMipmaps = false),
      (shadowDataTexture.name = "HomeOS spot shadow parameters"),
      (uniforms.userSpotShadowData.value = shadowDataTexture));
    const data = shadowDataTexture.image.data,
      rectValues = uniforms.userSpotShadowRect.value,
      paramValues = uniforms.userSpotShadowParams.value;
    for (let lightCursor = 0; lightCursor < matrixValues.length; lightCursor++)
      (matrixValues[lightCursor].toArray(data, lightCursor * 24),
        rectValues[lightCursor].toArray(data, lightCursor * 24 + 16),
        paramValues[lightCursor].toArray(data, lightCursor * 24 + 20));
    shadowDataTexture.needsUpdate = true;
  }
  /**
   * 顺着材质来源链判断是否已经挂过图集补丁。共享材质会被克隆、克隆体又会再被引用，
   * 只看单层 environmentSourceMaterial 会漏判，于是这里沿 runtimeSourceMaterial /
   * environmentSourceMaterial 一路回溯，命中即说明当前材质复用了已准备好的着色器。
   */
  function materialUsesPreparedSource(material: any) {
    const visited = new Set();
    for (let current = material; current && !visited.has(current);) {
      if ((visited.add(current), preparedMaterialSet.has(current))) return true;
      current = current.runtimeSourceMaterial || current.environmentSourceMaterial;
    }
    return false;
  }
  function buildMaterialDefines(material: any) {
    const defines: Record<string, unknown> = {
      ...(material.defines || {}),
      USE_USER_SPOT_SHADOW_ATLAS: 1,
      USER_SPOT_SHADOW_VERTEX_LIMIT: maxVertexVaryingLights,
      USER_SPOT_SHADOW_BUFFER_LIMIT: shadowParameters.capacity,
    };
    return (
      syncBeforeRender &&
        material.isMeshStandardMaterial &&
        (defines.HB_SKIP_ZERO_SPOT_LIGHT = 1),
      // 分层灯光接管期间，three 自己那两套「按灯数展开」的直接光路径必须整段让路，
      // 否则同一盏灯会被算两遍（原生的 + 楼层缓冲的）。
      floorLights.enabled
        ? ((defines.HB_FLOOR_LIGHTS = 1), (defines.HB_FLOOR_AREA_LIGHTS = 1))
        : (delete defines.HB_FLOOR_LIGHTS, delete defines.HB_FLOOR_AREA_LIGHTS),
      defines
    );
  }
  function setAtlasEnabled(enabled: any) {
    uniforms.userSpotShadowAtlasEnabled.value =
      enabled && isEnabled && isBudgetAvailable && !isFallback && entryByLightKey.size ? 1 : 0;
  }
  /**
   * 材质级的逐对象绑定钩子。
   *
   * 注意 three 对 `material.onBeforeRender` 传的是
   * `(renderer, scene, camera, geometry, object, group)` —— 第 5 个参数是**对象**而不是材质，
   * 正好是 `floorLights.bind` 需要的「当前这个网格属于哪层」。每个材质各自持有一份
   * 楼层 UBO 的绑定，切层那一下不必再重编着色器。
   */
  function attachFloorLightBinding(material: any) {
    const previousOnBeforeRender = material.onBeforeRender;
    material.onBeforeRender = function (this: unknown, ...args: unknown[]) {
      (previousOnBeforeRender?.apply(this, args),
        floorLights.bind(
          args[4] as FloorLightNode,
          args[1] as FloorLightNode,
          args[2] as FloorCamera,
          entryByLightKey,
          sunEntries,
        ));
    };
  }
  function prepareMaterial(materialToPrepare: any) {
    if (!isShadowableMaterial(materialToPrepare)) return;
    if (preparedMaterialSet.has(materialToPrepare)) {
      // 分层灯光的开关会随容量/预算翻转，已经编过的材质只要刷一下 defines 就行。
      !!materialToPrepare.defines?.HB_FLOOR_LIGHTS !== floorLights.enabled &&
        ((materialToPrepare.defines = buildMaterialDefines(materialToPrepare)),
        (materialToPrepare.needsUpdate = true));
      return;
    }
    if (materialUsesPreparedSource(materialToPrepare)) {
      ((materialToPrepare.defines = buildMaterialDefines(materialToPrepare)),
        (materialToPrepare.needsUpdate = true),
        preparedMaterialSet.add(materialToPrepare),
        attachFloorLightBinding(materialToPrepare));
      return;
    }
    (preparedMaterialSet.add(materialToPrepare), attachFloorLightBinding(materialToPrepare));
    const previousOnBeforeCompile = materialToPrepare.onBeforeCompile,
      previousCacheKey = materialToPrepare.customProgramCacheKey?.bind(materialToPrepare);
    ((materialToPrepare.defines = buildMaterialDefines(materialToPrepare)),
      (materialToPrepare.onBeforeCompile = (shader: any, rendererInstance: any) => {
        (previousOnBeforeCompile?.call(materialToPrepare, shader, rendererInstance),
          Object.assign(shader.uniforms, uniforms),
          (shader.vertexShader =
            sharedDefinesChunk +
            shader.vertexShader
              .replace(
                "#include <shadowmap_pars_vertex>",
                "#include <shadowmap_pars_vertex>\n" + buildAtlasVertexParsChunk(),
              )
              .replace(
                "#include <worldpos_vertex>",
                three.ShaderChunk.worldpos_vertex.replace(
                  "#if ",
                  "#if defined( USE_USER_SPOT_SHADOW_ATLAS ) || ",
                ),
              )
              .replace(
                "#include <shadowmap_vertex>",
                "#include <shadowmap_vertex>\n" + buildAtlasVertexChunk(),
              )),
          (shader.fragmentShader =
            sharedDefinesChunk +
            shader.fragmentShader
              .replace(
                "#include <lights_pars_begin>",
                patchedLightsParsBegin + floorLightShaderPars(floorLights.capacity),
              )
              .replace("#include <lights_physical_pars_fragment>", patchedLightsPhysicalPars)
              .replace(
                "#include <shadowmap_pars_fragment>",
                "#include <shadowmap_pars_fragment>\n" +
                  buildAtlasFragmentChunk() +
                  "\n" +
                  floorDirectionalShader(),
              )
              .replace("#include <lights_fragment_begin>", patchedLightsFragment)));
      }),
      (materialToPrepare.customProgramCacheKey = () =>
        (previousCacheKey?.() || "") + "|user-spot-shadow-atlas-v14-source-program"),
      (materialToPrepare.needsUpdate = true));
  }
  const materialCloneBySource = new WeakMap(),
    materialCloneSet = new Set<{ dispose: () => void }>();
  function cloneSharedMaterial(sourceMaterial: any) {
    if (
      !isShadowableMaterial(sourceMaterial) ||
      materialCloneSet.has(sourceMaterial) ||
      materialUsesPreparedSource(sourceMaterial)
    )
      return sourceMaterial;
    let materialClone = materialCloneBySource.get(sourceMaterial);
    return (
      materialClone ||
        ((materialClone = sourceMaterial.clone()),
        (materialClone.onBeforeCompile = sourceMaterial.onBeforeCompile),
        (materialClone.customProgramCacheKey = sourceMaterial.customProgramCacheKey),
        materialCloneBySource.set(sourceMaterial, materialClone),
        materialCloneSet.add(materialClone)),
      materialClone
    );
  }
  /**
   * 给整棵树挂补丁。
   *
   * 这里**不能**跳过 `receiveShadow === false` 的网格：分层灯光接管后 three 自己的
   * `NUM_SPOT_LIGHTS` 会是 0，没挂补丁的材质会直接不参与这些灯的光照。不接收阴影只影响
   * `receiveShadow` 那个 uniform，不影响是否参与光照。
   */
  function prepareRoot(root: any) {
    isDisposed ||
      root?.traverse((child: any) => {
        if (!child.isMesh) return;
        (child.userData.externalModelSharedMaterial ||
          child.userData.sofaSharedMaterial ||
          child.userData.rugSharedMaterial ||
          child.userData.architectureSharedMaterial) &&
          (child.material = Array.isArray(child.material)
            ? child.material.map(cloneSharedMaterial)
            : cloneSharedMaterial(child.material));
        const materials = Array.isArray(child.material)
          ? child.material
          : child.material
            ? [child.material]
            : [];
        for (const candidateMaterial of materials) prepareMaterial(candidateMaterial);
      });
  }
  function collectActiveLights(activeRoot: any) {
    return collectShadowLights(activeRoot, {
      includeHidden: false,
    });
  }
  function syncUniforms(syncRoot = pendingRoot) {
    if (isDisposed) return 0;
    (prepareRoot(syncRoot), (syncedLights = null));
    const matrixUniforms = uniforms.userSpotShadowMatrix.value,
      rectUniforms = uniforms.userSpotShadowRect.value,
      paramUniforms = uniforms.userSpotShadowParams.value;
    ((matrixUniforms.length = 0), (rectUniforms.length = 0), (paramUniforms.length = 0));
    for (const light of collectActiveLights(syncRoot)) {
      const lightEntry = entryByLightKey.get(spotLightKey(light));
      (matrixUniforms.push(lightEntry?.matrix || new three.Matrix4()),
        rectUniforms.push(lightEntry?.rect || new three.Vector4()),
        paramUniforms.push(
          lightEntry
            ? new three.Vector4(lightEntry.bias, lightEntry.intensity, 1, lightEntry.normalBias)
            : new three.Vector4(0, 0, 0, 0),
        ),
        isBudgetAvailable && !isFallback && (light.castShadow = false));
    }
    (updateShadowParameters(),
      (uniforms.userSpotShadowAtlas.value = atlasTarget?.texture || null),
      setAtlasEnabled(true));
    const enabledLightCount = paramUniforms.filter(
      (lightParam: any) => lightParam.z > 0.5,
    ).length;
    return (
      (renderer.domElement.dataset.activeSpotShadows = String(enabledLightCount)),
      enabledLightCount
    );
  }
  function syncRenderLights(renderedScene: any, renderedCamera: any) {
    if (isDisposed || isWebglLost || !renderedScene || !renderedCamera) return;
    if (floorLights.enabled)
      try {
        (directionalShadow.sync(floorLights.enabled),
          (uniforms.userFloorDirectionalMap.value = directionalShadow.texture));
        const activeUserLightCount = floorLights.update(
          renderedScene,
          renderedCamera,
          entryByLightKey,
          sunEntries,
        );
        ((renderer.domElement.dataset.activeUserLights = String(activeUserLightCount ?? 0)),
          (renderer.domElement.dataset.spotShadowTextureUnits = "1"),
          (renderer.domElement.dataset.shadowParameterSource = "floor-buffer"),
          (renderer.domElement.dataset.floorDirectionalShadow = JSON.stringify(
            directionalShadow.stats,
          )));
        return;
      } catch (floorError) {
        // 分层缓冲在驱动上不可用（UBO 分配失败 / 灯光超容量）：整体退回原生灯光路径，
        // 并让所有材质重新编译一次，把 `HB_FLOOR_*` 拿掉。
        (floorLights.setEnabled(false),
          floorLights.release(),
          prepareRoot(renderedScene),
          (syncedLights = null),
          console.warn("分层灯光缓冲不可用，恢复原生灯光。", floorError));
      }
    (directionalShadow.sync(false), shadowParameters.bind());
    lightIndex ||= createRenderLightIndex();
    const renderLights = previousLights,
      renderEntries = previousEntries;
    renderLights.length = renderEntries.length = 0;
    for (const renderLight of lightIndex.read(renderedScene, renderedCamera))
      renderLights.push(renderLight);
    const lightIndexStats = lightIndex.stats.builds + ":" + lightIndex.stats.sorts;
    lightIndexStats !== lastLightIndexStats &&
      ((lastLightIndexStats = lightIndexStats),
      (renderer.domElement.dataset.lightIndexBuilds = String(lightIndex.stats.builds)),
      (renderer.domElement.dataset.lightIndexSorts = String(lightIndex.stats.sorts)));
    let isSame = syncedLights?.length === renderLights.length;
    for (let changeIndex = 0; changeIndex < renderLights.length; changeIndex++)
      (renderEntries.push(entryByLightKey.get(spotLightKey(renderLights[changeIndex]))),
        (renderLights[changeIndex] !== syncedLights?.[changeIndex] ||
          renderEntries[changeIndex] !== syncedEntries[changeIndex]) &&
          (isSame = false));
    if (isSame) return;
    ((previousLights = syncedLights || []),
      (previousEntries = syncedEntries),
      (syncedLights = renderLights),
      (syncedEntries = renderEntries));
    const matrixValues = uniforms.userSpotShadowMatrix.value,
      rectValues = uniforms.userSpotShadowRect.value,
      paramValues = uniforms.userSpotShadowParams.value;
    matrixValues.length = rectValues.length = paramValues.length = 0;
    for (const lightSource of renderEntries)
      (matrixValues.push(lightSource?.matrix || scratchMatrix),
        rectValues.push(lightSource?.rect || scratchVector),
        paramValues.push(
          lightSource
            ? (lightSource.uniformParams ||= new three.Vector4(
                lightSource.bias,
                lightSource.intensity,
                1,
                lightSource.normalBias,
              ))
            : scratchVector,
        ));
    updateShadowParameters();
  }
  function createAtlasTarget(targetSize: any) {
    const textureTarget = new three.WebGLRenderTarget(targetSize, targetSize, {
      format: three.RGFormat,
      type: three.HalfFloatType,
      minFilter: three.LinearFilter,
      magFilter: three.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    return (
      (textureTarget.texture.name = "HomeOS shared spot shadow atlas"),
      (textureTarget.texture.generateMipmaps = false),
      textureTarget
    );
  }
  function clearAtlasTarget(target: any) {
    const previousTarget = renderer.getRenderTarget(),
      previousClearColor = renderer.getClearColor(new three.Color()).clone(),
      previousClearAlpha = renderer.getClearAlpha();
    (renderer.setRenderTarget(target),
      renderer.setClearColor(16777215, 1),
      renderer.clear(true, false, false),
      renderer.setRenderTarget(previousTarget),
      renderer.setClearColor(previousClearColor, previousClearAlpha));
  }
  async function yieldToScheduler() {
    return globalThis.scheduler?.yield
      ? globalThis.scheduler.yield()
      : new Promise((resolve) => setTimeout(resolve, 0));
  }
  /** 建图集的一步：先拷图集里那盏灯的瓦片，再让分层方向光逐层渲一遍。 */
  function* rebuildAtlasSteps(
    buildRoot: any,
    buildRevision: any,
    { reuse = false, immediate = false }: { reuse?: boolean; immediate?: boolean } = {},
  ): Generator<undefined, void, undefined> {
    if (isDisposed || isWebglLost || !isBudgetAvailable || isBuilding || buildRevision !== revision)
      return;
    if (!buildRoot) {
      isDirty = false;
      return;
    }
    if (!immediate && !canBuild()) {
      scheduleBuild(160);
      return;
    }
    isDirty = false;
    const shadowLights = collectShadowLights(buildRoot),
      buildFloorIds = new Set<string>(),
      retainedEntries: SpotShadowEntry[] = [];
    buildRoot.traverse((builtObject: FloorLightNode) => {
      builtObject.isMesh && buildFloorIds.add(objectFloorId(builtObject));
    });
    if (retainDetachedFloors)
      for (const retainedEntry of entryByLightKey.values())
        retainedEntry.light &&
          !buildFloorIds.has(objectFloorId(retainedEntry.light)) &&
          retainedEntries.push(retainedEntry);
    const retainedLightSet = new Set(retainedEntries.map((retainedEntry) => retainedEntry.light)),
      atlasLights = [...shadowLights, ...retainedEntries.map((retainedEntry) => retainedEntry.light)];
    // 仅灯光参数变了（比如调亮度）时不必重渲阴影：把旧瓦片原地搬到新图集，再只重建
    // 分层方向光。这一步省掉的是「每盏灯一次 shadow map 渲染」，切灯效时最明显。
    if (
      reuse &&
      atlasTarget &&
      entryByLightKey.size === atlasLights.length &&
      shadowLights.every(
        (shadowLight: unknown) => entryByLightKey.get(spotLightKey(shadowLight))?.light === shadowLight,
      )
    ) {
      (yield* directionalShadow.buildSteps(
        buildRoot,
        () => buildRevision === revision && !isDisposed && !isWebglLost,
        { reuse: true },
      ),
        syncUniforms(buildRoot),
        requestFrame());
      return;
    }
    const maxTextureSize = toPositiveInt(renderer.capabilities?.maxTextureSize, 4096),
      lightMapSizes = atlasLights.map((atlasLight) =>
        toPositiveInt(atlasLight?.shadow?.mapSize?.x, 256),
      ),
      layout = atlasLights.length
        ? packSpotShadowAtlasTiles(lightMapSizes, maxTextureSize)
        : {
            size: 1,
            tiles: [] as AtlasTile[],
          };
    if (!layout)
      throw new Error(
        "当前设备最大阴影图集 " + maxTextureSize + "px 无法容纳 " + atlasLights.length + " 盏灯。",
      );
    let nextAtlasTarget: any = null;
    const nextEntryByLightKey = new Map<string, SpotShadowEntry>(),
      previousRenderTarget = renderer.getRenderTarget();
    isBuilding = true;
    try {
      (prepareRoot(buildRoot),
        (nextAtlasTarget = createAtlasTarget(layout.size)),
        renderer.initRenderTarget(nextAtlasTarget),
        clearAtlasTarget(nextAtlasTarget),
        (scratchTarget ||= new three.WebGLRenderTarget(1, 1, {
          depthBuffer: true,
          stencilBuffer: false,
        })),
        setAtlasEnabled(false));
      for (let lightCursor = 0; lightCursor < atlasLights.length; lightCursor += 1) {
        if (buildRevision !== revision) return;
        const activeLight = atlasLights[lightCursor] as any,
          targetTile = layout.tiles[lightCursor] as AtlasTile,
          lightKey = spotLightKey(activeLight),
          previousEntry = entryByLightKey.get(lightKey);
        if (
          previousEntry &&
          previousEntry.light === activeLight &&
          (reuse || retainedLightSet.has(activeLight)) &&
          atlasTarget
        ) {
          // 复用旧瓦片：图集尺寸/排布可能变了，逐个矩形 blit 过去。
          (textureCopy.copy(
            atlasTarget.texture,
            nextAtlasTarget.texture,
            new three.Box2(
              new three.Vector2(previousEntry.tile.x, previousEntry.tile.y),
              new three.Vector2(
                previousEntry.tile.x + previousEntry.tile.size,
                previousEntry.tile.y + previousEntry.tile.size,
              ),
            ),
            new three.Vector2(targetTile.x, targetTile.y),
          ),
            nextEntryByLightKey.set(lightKey, {
              ...previousEntry,
              tile: {
                ...targetTile,
              },
              rect: new three.Vector4(
                (targetTile.x + 0.5) / layout.size,
                (targetTile.y + 0.5) / layout.size,
                Math.max(0, targetTile.size - 1) / layout.size,
                Math.max(0, targetTile.size - 1) / layout.size,
              ),
            }),
            yield);
          continue;
        }
        const lightState = {
          visible: activeLight.visible,
          intensity: activeLight.intensity,
          castShadow: activeLight.castShadow,
          target: renderer.getRenderTarget(),
        };
        try {
          ((activeLight.visible = true),
            (activeLight.intensity = Math.max(
              Number(activeLight.userData?.lightOnIntensity || activeLight.intensity || 1),
              0.001,
            )),
            (activeLight.castShadow = true),
            (activeLight.shadow.autoUpdate = false),
            (activeLight.shadow.needsUpdate = true),
            renderer.setRenderTarget(scratchTarget),
            // 只渲这一盏灯的阴影 pass：整帧渲染会把可见色也画一遍，大户型上贵得多。
            renderFloorDepth(activeLight));
          const shadowTexture = activeLight.shadow?.map?.texture;
          if (!shadowTexture)
            throw new Error("灯光 " + lightKey + " 未生成阴影贴图。");
          (textureCopy.copy(
            shadowTexture,
            nextAtlasTarget.texture,
            new three.Box2(
              new three.Vector2(0, 0),
              new three.Vector2(targetTile.size, targetTile.size),
            ),
            new three.Vector2(targetTile.x, targetTile.y),
          ));
          const halfPixelInset = 0.5;
          nextEntryByLightKey.set(lightKey, {
            light: activeLight as FloorLightNode,
            tile: {
              ...targetTile,
            },
            matrix: activeLight.shadow.matrix.clone(),
            lightWorld: activeLight.matrixWorld.clone(),
            rect: new three.Vector4(
              (targetTile.x + halfPixelInset) / layout.size,
              (targetTile.y + halfPixelInset) / layout.size,
              Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size,
              Math.max(0, targetTile.size - halfPixelInset * 2) / layout.size,
            ),
            bias: Number(activeLight.shadow.bias || 0),
            normalBias: Number(activeLight.shadow.normalBias || 0),
            intensity: Number(activeLight.shadow.intensity ?? 1),
          });
        } finally {
          ((activeLight.visible = lightState.visible),
            (activeLight.intensity = lightState.intensity),
            (activeLight.castShadow = isBudgetAvailable && !isFallback ? false : lightState.castShadow),
            disposeShadowTargets(activeLight),
            renderer.setRenderTarget(lightState.target));
        }
        yield;
      }
      if (buildRevision !== revision) return;
      // 分层方向光要等聚光灯图集定下来再建：它的着色器复用同一组 `vUserShadowWorldPosition`。
      (yield* directionalShadow.buildSteps(
        buildRoot,
        () => buildRevision === revision && !isDisposed && !isWebglLost,
        { reuse: reuse },
      ));
      if (buildRevision !== revision) return;
      (atlasTarget?.dispose?.(), (atlasTarget = nextAtlasTarget), entryByLightKey.clear());
      for (const [lightKey, atlasEntry] of nextEntryByLightKey)
        entryByLightKey.set(lightKey, atlasEntry);
      uniforms.userSpotShadowAtlas.value = atlasTarget.texture;
      const domElement = renderer.domElement;
      ((domElement.dataset.spotShadowMode = "atlas"),
        (domElement.dataset.spotShadowAtlasSize = String(layout.size)),
        (domElement.dataset.spotShadowAtlasLights = String(entryByLightKey.size)));
    } finally {
      (renderer.setRenderTarget(previousRenderTarget),
        atlasTarget !== nextAtlasTarget && nextAtlasTarget?.dispose(),
        (isBuilding = false),
        isDisposed || isWebglLost
          ? disposeAtlases()
          : (syncUniforms(pendingRoot), isDirty && !buildTimer && scheduleBuild(0), requestFrame()));
    }
  }
  async function runAtlasBuild(buildRoot: unknown, buildRevision: number) {
    if (isBuilding) return;
    const buildSteps = rebuildAtlasSteps(buildRoot, buildRevision);
    try {
      for (const _step of buildSteps) await yieldToScheduler();
    } finally {
      buildSteps.return?.(undefined);
    }
  }
  function scheduleBuild(delay: any) {
    isDisposed ||
      isWebglLost ||
      !isBudgetAvailable ||
      !isDirty ||
      (clearTimeout(buildTimer),
      (buildTimer = setTimeout(
        () => {
          if (((buildTimer = 0), isDisposed || isBuilding || !isDirty)) return;
          const scheduledRoot = pendingRoot,
            scheduledRevision = revision;
          runAtlasBuild(scheduledRoot, scheduledRevision).catch((error) =>
            reportBuildFailure(error, scheduledRoot),
          );
        },
        Math.max(0, Number(delay) || 0),
      )));
  }
  /**
   * 图集失败：停掉分层灯光、退回逐灯原生阴影，并让调用方重排阴影。
   *
   * 只在「还是同一个 root / revision」时生效，避免过期的失败把新一轮建图也标成失败。
   */
  function reportBuildFailure(error: unknown, failedRoot: unknown) {
    if (isDisposed || isWebglLost || failedRoot !== pendingRoot) return;
    const failedRevision = revision;
    ((isFallback = true),
      (isDirty = false),
      clearTimeout(buildTimer),
      (buildTimer = 0),
      floorLights.setEnabled(false),
      disposeAtlases(),
      prepareRoot(failedRoot),
      syncUniforms(failedRoot));
    try {
      !isWebglLost &&
        failedRoot === pendingRoot &&
        failedRevision === revision &&
        (globalThis.window?.HomeOSLog?.report as any)?.(
          "warning",
          "3D 阴影",
          "聚光灯阴影图集生成失败，本次缓存未完成",
          {
            phase: "studio-shadow-atlas",
            code: "STUDIO_SHADOW_ATLAS_FAILED",
          },
          (error as { stack?: string })?.stack || String(error),
        );
    } catch {
      /* 诊断上报 best-effort：上报失败不应掩盖后面的渲染回退（真正的 console.error 在 catch 之外） */
    }
    ((console.error(error), (renderer.domElement.dataset.spotShadowMode = "fallback")),
      onFallback(failedRoot),
      requestFrame());
  }
  /** 上一次回退后，新的 schedule 到了就再给分层路径一次机会。 */
  function retryFloorLightsIfFallback() {
    isFallback &&
      ((isFallback = false),
      floorLights.setEnabled(isEnabled && isBudgetAvailable),
      directionalShadow.sync(floorLights.enabled));
  }
  function schedule(scheduledRoot: any, { delay: scheduleDelay = buildDelay } = {}) {
    if (isDisposed || !isBudgetAvailable) return 0;
    if (((pendingRoot = scheduledRoot), isWebglLost)) return ((isDirty = !!scheduledRoot), 0);
    retryFloorLightsIfFallback();
    prepareRoot(scheduledRoot);
    for (const scheduledLight of collectShadowLights(scheduledRoot))
      scheduledLight.castShadow = false;
    return (
      syncUniforms(scheduledRoot),
      (revision += 1),
      (isDirty = true),
      scheduleBuild(scheduleDelay),
      collectShadowLights(scheduledRoot).length
    );
  }
  /**
   * 同步重建（截图 / 单层导出用）。
   *
   * 空闲帧那套异步流程会把开销摊到多帧，但截图必须一帧内拿到正确的阴影，所以这里
   * 直接把生成器跑干。`reuse` 默认开：多数导出只是换机位，阴影没变。
   */
  function prepareLayout(prepareRootNode: unknown, { reuse: prepareReuse = true } = {}) {
    if (isDisposed || isWebglLost || !isEnabled || !isBudgetAvailable || !floorLights.available)
      return false;
    ((revision += 1), (isDirty = false));
    const prepareRevision = revision;
    ((pendingRoot = prepareRootNode), retryFloorLightsIfFallback());
    try {
      for (const _step of rebuildAtlasSteps(prepareRootNode, prepareRevision, {
        reuse: prepareReuse,
        immediate: true,
      }))
        continue;
      return true;
    } catch (error) {
      return (reportBuildFailure(error, prepareRootNode), false);
    }
  }
  /** 楼层被删掉时同步清掉它的阴影层与图集条目。 */
  function forgetFloor(floorId: string) {
    (directionalShadow.forgetFloor(floorId),
      [...entryByLightKey].forEach(([lightKey, atlasEntry]) => {
        atlasEntry.light && objectFloorId(atlasEntry.light) === floorId && entryByLightKey.delete(lightKey);
      }));
  }
  let lastRoot: any = null,
    lastRevision = -1,
    lastLightIndexBuilds = -1,
    trackedLights: any[] = [];
  function refreshGeometry(refreshRoot = pendingRoot, viewBoxes: any = null) {
    if (isDisposed || !isBudgetAvailable || isFallback) return true;
    if (isBuilding || buildTimer || isDirty) return false;
    // 分层方向光每帧都可能被家具/墙体的移动影响；它自己判断有没有变化，变了就重排一次。
    if (floorLights.enabled && !directionalShadow.refresh(viewBoxes)) {
      (schedule(refreshRoot, {
        delay: 0,
      }),
        floorLights.invalidateFrame());
      return false;
    }
    floorLights.invalidateFrame();
    if (!atlasTarget || !entryByLightKey.size) return true;
    const lightIndexBuilds = lightIndex?.stats.builds || 0;
    (lastRoot !== refreshRoot ||
      lastRevision !== revision ||
      lastLightIndexBuilds !== lightIndexBuilds) &&
      ((lastRoot = refreshRoot),
      (lastRevision = revision),
      (lastLightIndexBuilds = lightIndexBuilds),
      (trackedLights = []),
      refreshRoot?.traverse((trackedLight: any) => {
        trackedLight.isSpotLight &&
          trackedLight.shadow &&
          entryByLightKey.has(spotLightKey(trackedLight)) &&
          trackedLights.push(trackedLight);
      }));
    const frustumBoxes =
        viewBoxes === null ? null : viewBoxes.filter((box: any) => box?.isBox3 && !box.isEmpty()),
      updates: any[] = [];
    refreshRoot?.updateWorldMatrix(true, true);
    for (const updateLight of trackedLights) {
      const geometryEntry = entryByLightKey.get(spotLightKey(updateLight));
      geometryEntry?.tile &&
        (updateLight.target?.updateWorldMatrix(true, false),
        updateLight.shadow.updateMatrices(updateLight),
        !(
          frustumBoxes &&
          !frustumBoxes.some((viewBox: any) => updateLight.shadow.getFrustum().intersectsBox(viewBox))
        ) &&
          updates.push({
            light: updateLight,
            entry: geometryEntry,
            matrix: updateLight.shadow.matrix.clone(),
            lightWorld: updateLight.matrixWorld.clone(),
            cast: updateLight.castShadow,
            visible: updateLight.visible,
            autoUpdate: updateLight.shadow.autoUpdate,
            needsUpdate: updateLight.shadow.needsUpdate,
            map: updateLight.shadow.map,
            mapPass: updateLight.shadow.mapPass,
          }));
    }
    if (!updates.length) return true;
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
      needsUpdate: renderer.shadowMap.needsUpdate,
    };
    try {
      renderer.shadowMap.enabled = true;
      for (const update of updates) {
        const { light: refreshLight } = update;
        try {
          if (
            ((refreshLight.castShadow = true),
            (refreshLight.visible = true),
            (refreshLight.shadow.autoUpdate = false),
            (refreshLight.shadow.needsUpdate = true),
            (renderer.shadowMap.needsUpdate = true),
            // 单盏灯重渲时其它楼层也要隐藏，否则这张局部阴影图里会混进隔壁楼层的遮挡。
            !floorLights.enabled
              ? renderer.shadowMap.render([refreshLight], scene, camera)
              : floorLights.withFloor(refreshLight, scene, () =>
                  renderer.shadowMap.render([refreshLight], scene, camera),
                ),
            !refreshLight.shadow.map?.texture)
          )
            return false;
          ((update.texture = refreshLight.shadow.map.texture),
            update.matrix.copy(refreshLight.shadow.matrix));
        } finally {
          ((refreshLight.castShadow = update.cast), (refreshLight.visible = update.visible));
        }
      }
      for (const { texture: texture, entry: updatedEntry, matrix: lightMatrix } of updates) {
        const tileDefinition = updatedEntry.tile;
        (textureCopy.copy(
          texture,
          atlasTarget.texture,
          new three.Box2(
            new three.Vector2(0, 0),
            new three.Vector2(tileDefinition.size, tileDefinition.size),
          ),
          new three.Vector2(tileDefinition.x, tileDefinition.y),
        ),
          updatedEntry.matrix.copy(lightMatrix));
      }
      updateShadowParameters();
    } finally {
      for (const previousUpdate of updates) {
        const { light: restoreLight } = previousUpdate;
        ((restoreLight.castShadow = previousUpdate.cast),
          (restoreLight.visible = previousUpdate.visible),
          (restoreLight.shadow.autoUpdate = previousUpdate.autoUpdate),
          (restoreLight.shadow.needsUpdate = previousUpdate.needsUpdate),
          restoreLight.shadow.map !== previousUpdate.map && restoreLight.shadow.map?.dispose(),
          restoreLight.shadow.mapPass !== previousUpdate.mapPass &&
            restoreLight.shadow.mapPass?.dispose(),
          (restoreLight.shadow.map = previousUpdate.map),
          (restoreLight.shadow.mapPass = previousUpdate.mapPass));
      }
      ((renderer.shadowMap.enabled = rendererState.enabled),
        (renderer.shadowMap.autoUpdate = rendererState.autoUpdate),
        (renderer.shadowMap.needsUpdate = rendererState.needsUpdate),
        renderer.setViewport(rendererState.viewport),
        renderer.setScissor(rendererState.scissor),
        renderer.setScissorTest(rendererState.scissorTest),
        renderer.setRenderTarget(rendererState.target, rendererState.face, rendererState.mip),
        renderer.setClearColor(rendererState.clear, rendererState.alpha));
    }
    return (
      (renderer.domElement.dataset.curtainShadowUpdates = String(
        Number(renderer.domElement.dataset.curtainShadowUpdates || 0) + 1,
      )),
      true
    );
  }
  function setEnabled(nextEnabled: any) {
    if (isDisposed) return;
    ((isEnabled = nextEnabled !== false),
      floorLights.setEnabled(isEnabled && isBudgetAvailable && !isFallback),
      directionalShadow.sync(floorLights.enabled),
      prepareRoot(pendingRoot),
      setAtlasEnabled(true),
      requestFrame());
  }
  /**
   * 性能预算开关。关掉时立即作废本轮建图（revision 自增让编译中的任务自行退出），
   * 并清掉待执行定时器；重新打开则只是恢复 uniform 开关，等下一次 schedule 再建。
   *
   * 分层灯光同样吃这个预算：纹理单元不够时它必须关掉，否则 4 盏面光的 8 个单元会
   * 把材质自己的贴图挤出去。
   */
  function setBudgetAvailable(budgetAvailable: any) {
    const nextBudgetAvailable = budgetAvailable !== false;
    return isDisposed || nextBudgetAvailable === isBudgetAvailable
      ? false
      : ((isBudgetAvailable = nextBudgetAvailable),
        floorLights.setEnabled(isEnabled && isBudgetAvailable && !isFallback),
        directionalShadow.sync(floorLights.enabled),
        prepareRoot(pendingRoot),
        nextBudgetAvailable ||
          ((revision += 1), (isDirty = false), clearTimeout(buildTimer), (buildTimer = 0)),
        setAtlasEnabled(true),
        true);
  }
  function disposeAtlases() {
    (textureCopy.release(),
      atlasTarget?.dispose(),
      scratchTarget?.dispose(),
      shadowDataTexture?.dispose(),
      depthMesh?.geometry.dispose(),
      depthMesh?.material.dispose(),
      (depthScene = null),
      (depthMesh = null),
      (shadowDataTexture = null),
      (uniforms.userSpotShadowData.value = null),
      shadowParameters.release(),
      floorLights.release(),
      directionalShadow.release(),
      (uniforms.userFloorDirectionalMap.value = null),
      (renderer.domElement.dataset.spotShadowAtlasSize = "0"),
      (renderer.domElement.dataset.spotShadowAtlasLights = "0"),
      (renderer.domElement.dataset.floorDirectionalShadow = JSON.stringify(
        directionalShadow.stats,
      )),
      (syncedLights = null),
      (atlasTarget = null),
      (scratchTarget = null),
      entryByLightKey.clear(),
      (uniforms.userSpotShadowAtlas.value = null),
      setAtlasEnabled(false));
  }
  function setWebglLost(webglLost: any) {
    isDisposed ||
      isWebglLost === !!webglLost ||
      ((isWebglLost = !!webglLost),
      isWebglLost
        ? ((revision += 1),
          (isDirty = isBudgetAvailable && !!pendingRoot),
          clearTimeout(buildTimer),
          (buildTimer = 0),
          disposeAtlases())
        : pendingRoot &&
          schedule(pendingRoot, {
            delay: 0,
          }));
  }
  function dispose() {
    if (!isDisposed) {
      ((isDisposed = true), (revision += 1), (isDirty = false));
      for (const clonedMaterial of materialCloneSet) clonedMaterial.dispose();
      (materialCloneSet.clear(),
        clearTimeout(buildTimer),
        (buildTimer = 0),
        (pendingRoot = null),
        lightIndex?.dispose(),
        (lastRoot = null),
        (trackedLights = []),
        (syncedLights = null),
        (syncedEntries = []),
        (previousLights = []),
        (previousEntries = []),
        floorLights.dispose(),
        directionalShadow.dispose(),
        isBuilding || disposeAtlases());
    }
  }

  // 分层路径要每帧按当前相机把楼层 UBO 重新绑定一遍；`syncBeforeRender` 的逐灯路径同理。
  if (syncBeforeRender || floorLights.capacity) {
    const previousOnBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = function (...args: any[]) {
      (previousOnBeforeRender?.apply(this, args),
        syncRenderLights(args[1] || scene, args[2] || camera));
    };
  }
  return {
    prepareRoot: prepareRoot,
    prepareLayout: prepareLayout,
    forgetFloor: forgetFloor,
    floorLightsEnabled: () => floorLights.enabled,
    floorLightsAvailable: () => isBudgetAvailable && !isFallback && floorLights.available,
    isFallback: () => isFallback,
    /** 分层面光占的纹理单元数（三线性 LTC 两张）。 */
    areaTextureUnits: () => (floorLights.capacity ? 2 : 0),
    /** 分层方向光阴影数组纹理占的纹理单元数。 */
    directionalTextureUnits: () => (floorLights.capacity ? 1 : 0),
    refreshGeometry: refreshGeometry,
    schedule: schedule,
    sync: syncUniforms,
    syncRenderUniforms: (renderedScene = scene, renderedCamera = camera) =>
      syncRenderLights(renderedScene, renderedCamera),
    setEnabled: setEnabled,
    setBudgetAvailable: setBudgetAvailable,
    setContextLost: setWebglLost,
    dispose: dispose,
    activeCount: () => entryByLightKey.size,
    isBuilding: () => isBuilding,
    isPending: () => !!buildTimer || isDirty,
    releaseRenderIndex: () => lightIndex?.dispose(),
    /** 单盏灯需要占用的纹理单元数：超过 varying 上限时矩阵/参数走 UBO 或数据纹理，多占一个。 */
    textureUnitsFor: (lightCount: any) =>
      lightCount > Math.max(maxVertexVaryingLights, shadowParameters.capacity) ? 2 : 1,
  };
}
