/**
 * `plan2` 光照补丁用到的两段 GLSL 片段（方向光阴影 + 墙面朝向补偿）。
 *
 * 都是「拼进 `#include <lights_fragment_end>` 之后」的字符串常量与纯函数，和
 * `studio-plan2-region-lights.ts` 的灯光组装配没有关系；放在那边只会让那个文件继续变长
 * （它已经贴着文件规模门禁）。
 */

/**
 * 方向光阴影：所有材质共用同一张常驻 VSM 图，不额外抓一次。
 *
 * 以前这段对 wall 组返回空串，理由是「墙面由区域光场负责明暗」；实际效果是墙成了全场
 * 唯一**永远接收不到投影**的受体 —— 柜体、门套、隔墙在墙上都不落影，每个房间的墙面亮度
 * 一模一样。舞台现在启用静态方向光阴影（见 `createStudioRenderer`），编辑器沿用常驻
 * VSM 图，两边都能直接复用。
 */
export const PLAN2_SUN_SHADOW_SNIPPET =
  "\n          #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0\n            if (receiveShadow && plan2SunShadowStrength > 0.0 && directionalLightShadows[0].shadowIntensity > 0.0) {\n              // The studio's single shadow-casting directional light is the\n              // first shadow slot. Reuse its resident VSM map; no new capture.\n              DirectionalLightShadow plan2SunShadow = directionalLightShadows[0];\n              plan2ShadowMask = getShadow(directionalShadowMap[0], plan2SunShadow.shadowMapSize,\n                min(1.0, plan2SunShadow.shadowIntensity * plan2SunShadowStrength / 0.18),\n                plan2SunShadow.shadowBias, plan2SunShadow.shadowRadius, vDirectionalShadowCoord[0]);\n            }\n          #endif";

/** 只要墙面（`alphaWallBand`）材质的朝向补偿，其它材质返回空串。 */
interface WallBandMaterial {
  userData?: { alphaWallBand?: boolean };
}

/**
 * 墙面**朝向**补偿。
 *
 * 舞台墙面是 `alphaWallBand`：它同时吃原生直射光与区域光场，而原生那一路里环境项
 * （半球 1.12 + 环境 0.42 + 补光 1.4）压过太阳，垂直墙面的 `dot(N,L)` 又天然很小 ——
 * 于是朝东与朝西的两面墙读数几乎一致，整圈墙像一张贴图。这里只对墙面按「与太阳方向的
 * 夹角」缩放区域光贡献：同一面墙内部的空间梯度（射灯锥、窗边亮带）完全不动，只把不同
 * 朝向拉开一档。
 */
export function plan2WallOrientationSnippet(sourceMaterial: WallBandMaterial) {
  if (!sourceMaterial.userData?.alphaWallBand) return "";
  return "\n          vec3 plan2WallNormal = normalize(mat3(plan2ViewToWorld) * normal);\n          float plan2WallSun = max(dot(plan2WallNormal, normalize(vec3(-0.29, 0.91, 0.25))), 0.0);\n          plan2ReceivingColor *= mix(0.80, 1.16, plan2WallSun);";
}
