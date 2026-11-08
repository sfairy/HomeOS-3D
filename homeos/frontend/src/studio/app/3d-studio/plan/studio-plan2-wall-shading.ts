/**
 * `plan2` 光照补丁用到的 GLSL 片段（方向光阴影 + 墙面朝向补偿）。
 *
 * 都是「拼进 `#include <lights_fragment_end>` 之后」的字符串常量与纯函数，和
 * `studio-plan2-region-lights.ts` 的灯光组装配没有关系；放在那边只会让那个文件继续变长
 * （它已经贴着文件规模门禁）。
 */

/**
 * 太阳方向（`normalize` 后的世界/布局方向，指向光源）的缺省值。
 *
 * 只是 uniform 的兜底：舞台启动时 `refreshBaseLighting` 会按基础光的
 * `mainAzimuth / mainElevation` 用 `setSunDirection` 覆盖它。取的是出厂预设
 * （方位 139°、高度 55°）的单位向量，和 `positionLightFromAngles` 同一份公式。
 */
export const PLAN2_SUN_DIRECTION_DEFAULT = Object.freeze({
  x: -0.4338823,
  y: 0.819152,
  z: 0.3760907,
})

/**
 * 方向光阴影：所有材质共用同一张常驻 VSM 图，不额外抓一次。
 *
 * 以前这段对 wall 组返回空串，理由是「墙面由区域光场负责明暗」；实际效果是墙成了全场
 * 唯一**永远接收不到投影**的受体 —— 柜体、门套、隔墙在墙上都不落影，每个房间的墙面亮度
 * 一模一样。舞台现在启用静态方向光阴影（见 `createStudioRenderer`），编辑器沿用常驻
 * VSM 图，两边都能直接复用。
 *
 * 结果写在 `plan2SunShadow`（1 = 无遮挡）。**它只能压太阳那一路**：这张图记录的是
 * 主方向光被遮挡的程度，拿它去压区域灯等于「柜子挡住了太阳，于是射灯也灭了」。
 * `plan2SunShadowScale` 是参考强度（= 主光的 `shadow.intensity`），用来把浓度归一化到
 * 「参考强度 × 强度滑杆 = 满遮挡」，这样相机/场景改了阴影浓度后滑杆仍然线性。
 */
export const PLAN2_SUN_SHADOW_SNIPPET =
  "\n          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n            if (receiveShadow && plan2SunShadowStrength > 0.0 && directionalLightShadows[0].shadowIntensity > 0.0) {\n              // The studio's single shadow-casting directional light is the\n              // first shadow slot. Reuse its resident VSM map; no new capture.\n              DirectionalLightShadow plan2SunShadowData = directionalLightShadows[0];\n              plan2SunShadow = getShadow(directionalShadowMap[0], plan2SunShadowData.shadowMapSize,\n                min(1.0, plan2SunShadowData.shadowIntensity * plan2SunShadowStrength / max(plan2SunShadowScale, 0.02)),\n                plan2SunShadowData.shadowBias, plan2SunShadowData.shadowRadius, vDirectionalShadowCoord[0]);\n            }\n          #endif"

/**
 * 墙面**朝向**补偿（只给明细材质用）。
 *
 * 明细材质（玻璃、有透射的饰面）保留 three 的完整 PBR，原生环境项（半球 + 环境 + 补光）
 * 会压过太阳，垂直墙面的 `dot(N,L)` 又天然很小 —— 朝东与朝西两面墙读数几乎一致，整圈墙
 * 像一张贴图。这里只按「与太阳方向的夹角」缩放**区域光**贡献：同一面墙内部的空间梯度
 * （射灯锥、窗边亮带）完全不动，只把不同朝向拉开一档。
 *
 * **简化分支不要再叠加这一项**：那条路已经有一条 `PLAIN_WALL_SUN_GAIN` 的太阳项，两条
 * 一起乘会让同一面墙被拉两次（实测朝向比会到 2.3:1）。所以调用方只在明细材质上传
 * `isDetailedSurface = true`。
 */
export function plan2WallOrientationSnippet(isDetailedSurface: boolean, isWallSurface: boolean) {
  if (!isDetailedSurface || !isWallSurface) return ''
  // 复用调用方刚算好的 `plan2LayoutNormal`（布局空间法线），不再重复 normalize。
  return '\n          float plan2WallSun = max(dot(plan2LayoutNormal, plan2SunDirection), 0.0);\n          plan2ReceivingColor *= mix(0.80, 1.16, plan2WallSun);'
}

/**
 * `lights_fragment_begin` 顶部那几个几何量的作用域声明。
 *
 * 简化分支会把整个 chunk 换成一段常量光照，**但这个 chunk 不只是「打光」** —— 它在开头声明
 * `geometryPosition / geometryNormal / geometryViewDir / geometryClearcoatNormal`，而 three
 * 自己的 `meshphysical_frag` 在这些 chunk **之后**还有一段清漆尾项：
 *
 * ```glsl
 * #ifdef USE_CLEARCOAT
 *   float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
 * ```
 *
 * chunk 一换，这两个名字就没人声明了 —— 整条 program 编译失败（`undeclared identifier`），
 * 链接失败 → `useProgram` 无效，清漆材质（墙带、漆面家具）**一个像素都画不出来**。表现就是
 * 「墙只显示顶盖、墙身高透明」。所以简化分支必须把这几个声明原样补回去。
 */
export const PLAN2_GEOMETRY_SCOPE_DECLARATIONS =
  '\n          vec3 geometryPosition = - vViewPosition;\n          vec3 geometryNormal = normal;\n          vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0.0, 0.0, 1.0 ) : normalize( vViewPosition );\n          vec3 geometryClearcoatNormal = vec3( 0.0 );\n          #ifdef USE_CLEARCOAT\n            geometryClearcoatNormal = clearcoatNormal;\n          #endif'
