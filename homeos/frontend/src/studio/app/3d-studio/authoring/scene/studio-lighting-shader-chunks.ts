/**
 * 分层灯光的 GLSL 补丁（图集采样段 / 顶点段 / `lights_fragment_begin`）。
 *
 * 从 `studio-shadow-atlas.ts` 拆出来的：那边已经逼近文件规模棘轮（≥800 行不许再涨），
 * 而这一整段只依赖 `THREE.ShaderChunk` 的**字符串结构**，与图集的控制面（分配、渲染、
 * 回退状态机）完全解耦。补丁本身不持有任何运行期状态，失败一律通过 `onIncompatible`
 * 回调上报，由控制器决定退回原生逐灯。
 */

import { floorLightShaderLoop } from "./studio-floor-lights";

/** 只用到 `ShaderChunk` 里的字符串模板。 */
type ThreeShaderChunkOwner = { ShaderChunk: Record<string, string> };

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
export function buildAtlasFragmentChunk() {
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
export function buildAtlasVertexParsChunk() {
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
export function buildAtlasVertexChunk() {
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
 * 分层路径下 `NUM_SPOT_LIGHTS` / `NUM_RECT_AREA_LIGHTS` 通常是 0（灯被楼层缓冲接管、
 * `layers.mask` 已清零），但着色器仍要能用 `SpotLight` / `RectAreaLight` 这两个结构体
 * （`getUserFloorLight` 里构造），所以把闸门放宽到 `HB_FLOOR_*`。
 *
 * **只靠 `#ifndef HB_FLOOR_*` 把整条 uniform 数组删掉是错的**：三层里只要还有任何一盏
 * 射灯留在相机图层上（没被楼层缓冲接管的灯、刚建好尚未屏蔽的灯、超预算的灯），
 * `NUM_SPOT_LIGHTS > 0`，three 自己的直接光循环仍在遍历 `spotLights[ i ]`，
 * 而声明被删掉 → `'spotLights' : undeclared identifier`，整支片元着色器编不过。
 * 正确做法是把数组重新套回它本来的闸门 `#if NUM_SPOT_LIGHTS > 0`：
 * 计数为 0 时不会出现 `spotLights[ 0 ]` 这种非法零长数组，计数 > 0 时声明照旧存在。
 */
export function patchLightsParsBegin(THREE: ThreeShaderChunkOwner) {
  return THREE.ShaderChunk.lights_pars_begin
    .replace("#if NUM_SPOT_LIGHTS > 0", "#if NUM_SPOT_LIGHTS > 0 || defined(HB_FLOOR_LIGHTS)")
    .replace("#if NUM_RECT_AREA_LIGHTS > 0", "#if NUM_RECT_AREA_LIGHTS > 0 || defined(HB_FLOOR_AREA_LIGHTS)")
    .replace(
      "uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];",
      "#if NUM_RECT_AREA_LIGHTS > 0\nuniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];\n#endif",
    )
    .replace(
      "uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];",
      "#if NUM_SPOT_LIGHTS > 0\nuniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];\n#endif",
    );
}
export function patchLightsPhysicalPars(THREE: ThreeShaderChunkOwner) {
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
function spotLightBlockRange(lightsShader: string) {
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
function guardZeroContributionSpotLights(lightsShader: string) {
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
/**
 * 生成 `lights_fragment_begin` 的补丁版本。
 *
 * 补丁依赖 three 的 chunk 结构（锚点字符串）；three 改版或有人动过 chunk 时补丁必须**跳过**
 * 而不是抛错：调用方（`createSpotShadowAtlasController`）拿到原样 chunk 后会把分层灯光整体
 * 退回原生逐灯，场景还能正常出光。直接抛错会让整条灯光构建中断，而捕获到上层又只是
 * 「3D 初始化失败」——两者都远不如退化。
 *
 * @param onIncompatible 补丁被跳过时的回调（消息给日志/诊断用，不抛）。
 */
export function patchLightsFragmentBegin(THREE: ThreeShaderChunkOwner, onIncompatible: (message: string) => void = () => {}) {
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
    lightsFragmentBegin = THREE.ShaderChunk.lights_fragment_begin,
    /** 跳过补丁：上报原因并原样返回 chunk（退原生逐灯的入口）。 */
    skipPatch = (message: string) => (onIncompatible(message), lightsFragmentBegin);
  if (!lightsFragmentBegin.includes(spotShadowLoopSnippet))
    return skipPatch("当前 Three.js 灯光 Shader 与阴影图集不兼容，已退回原生逐灯阴影。");
  if (!lightsFragmentBegin.includes("getDirectionalLightInfo( directionalLight, directLight );"))
    return skipPatch("当前 Three.js 方向光 Shader 与分层阴影不兼容，已退回原生逐灯阴影。");
  if (!lightsFragmentBegin.includes("#if ( NUM_DIR_LIGHTS > 0 )"))
    return skipPatch("当前 Three.js 平行光 Shader 与分层阴影不兼容，已退回原生逐灯阴影。");
  const patchedLightsFragment = lightsFragmentBegin
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
    .replace(spotShadowLoopSnippet, "" + atlasShadowPatch + spotShadowLoopSnippet);
  try {
    return guardZeroContributionSpotLights(patchedLightsFragment);
  } catch (guardError) {
    // 零贡献优化只是性能项：结构对不上就丢掉它，补丁本身仍然可用。
    return (
      onIncompatible(
        `零贡献聚光灯优化已跳过：${guardError instanceof Error ? guardError.message : String(guardError)}`,
      ),
      patchedLightsFragment
    );
  }
}
