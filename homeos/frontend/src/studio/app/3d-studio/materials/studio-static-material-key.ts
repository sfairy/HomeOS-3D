/** 静态合批 / 渲染缓存用的**网格材质键**：把 `MeshStandardMaterial` 的可见状态拍平成稳定字符串。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数，无闭包依赖；
 * 不适用的网格（蒙皮 / 批量 / 半透明 / 自定义 shader 钩子…）返回空串，调用方据此跳过合批。
 */
import * as threeModuleMin from "/static/vendor/three/0.186.1/three.module.min.js";

/**
 * 允许出现在合批键里的**程序化共享贴图**通道：加载期统一挂、全场景共享、
 * 且它们的强度参数（`bumpScale` / `normalScale` / `envMapIntensity`）都在材质键里。
 */
const BATCHABLE_PROGRAMMATIC_TEXTURE_KEYS: ReadonlySet<string> = new Set([
  "bumpMap",
  "normalMap",
  "envMap",
]);

export function buildStaticMaterialKey(sourceMesh: any, isTextureAware = false, isColorOnly = false) {
  const meshMaterial = sourceMesh.material;
  if (
    !sourceMesh.isMesh ||
    sourceMesh.isSkinnedMesh ||
    sourceMesh.isBatchedMesh ||
    sourceMesh.morphTargetInfluences ||
    Array.isArray(meshMaterial) ||
    !meshMaterial?.isMeshStandardMaterial ||
    meshMaterial.transparent ||
    meshMaterial.opacity < 1 ||
    meshMaterial.transmission > 0 ||
    meshMaterial.alphaHash ||
    meshMaterial.displacementMap ||
    meshMaterial.onBeforeCompile !== threeModuleMin.Material.prototype.onBeforeCompile ||
    meshMaterial.customProgramCacheKey !== threeModuleMin.Material.prototype.customProgramCacheKey ||
    sourceMesh.onBeforeRender !== threeModuleMin.Object3D.prototype.onBeforeRender ||
    meshMaterial.clippingPlanes?.length ||
    /**
     * 贴图会让「合并几何体」的合批失效（UV 布局可能对不上），所以默认不允许有贴图。
     * **例外是加载期统一挂的三张程序化贴图**：
     * - `bumpMap`：按表面族共享的细节高度图（M3 / S1），加载期已给所有无 UV 的几何体
     *   补了盒式 UV（`materials/studio-box-uv.ts`）；
     * - `normalMap`：2026-10-24 之后不再新挂，但旧模板 / 旧缓存可能还留着，不能因此掉批；
     * - `envMap`：只有金属材质挂，且全场景共享同一张程序化环境图
     *   （`materials/studio-metal-environment.ts`）。
     *
     * 三者的 uuid 都进材质键（`bumpScale` / `envMapIntensity` / `normalScale` 也在），
     * 不同表面族 / 不同强度不会被并进同一批。其余贴图（图集 / 石材板 / 自发光图）
     * 保持原来的「不合批」行为。
     */
    (!isTextureAware &&
      Object.entries(meshMaterial).some(
        ([materialPropKey, materialTextureValue]: any) =>
          materialTextureValue?.isTexture && !BATCHABLE_PROGRAMMATIC_TEXTURE_KEYS.has(materialPropKey),
      ))
  )
    return "";
  const materialKeyParts: any[] = [];
  for (const materialPropKey of Object.keys(meshMaterial).sort()) {
    if (["id", "uuid", "name", "userData", "version", "_listeners"].includes(materialPropKey))
      continue;
    const materialPropValue = meshMaterial[materialPropKey];
    if (materialPropKey === "color" && isColorOnly) {
      materialKeyParts.push([materialPropKey, [1, 1, 1]]);
      continue;
    }
    if (
      materialPropValue == null ||
      ["number", "boolean", "string"].includes(typeof materialPropValue)
    )
      materialKeyParts.push([materialPropKey, materialPropValue]);
    else {
      if (materialPropValue.isTexture)
        materialKeyParts.push([materialPropKey, materialPropValue.uuid]);
      else {
        if (
          materialPropValue.isColor ||
          materialPropValue.isVector2 ||
          materialPropValue.isVector3 ||
          materialPropValue.isVector4 ||
          materialPropValue.isMatrix3 ||
          materialPropValue.isMatrix4 ||
          materialPropValue.isEuler
        )
          materialKeyParts.push([materialPropKey, materialPropValue.toArray()]);
        else {
          if (
            Array.isArray(materialPropValue) &&
            materialPropValue.every((materialArrayItem) =>
              ["number", "boolean", "string"].includes(typeof materialArrayItem),
            )
          )
            materialKeyParts.push([materialPropKey, materialPropValue]);
          else {
            if (materialPropKey === "defines")
              materialKeyParts.push([
                materialPropKey,
                Object.entries(materialPropValue).sort(([entryKeyLeft], [entryKeyRight]) =>
                  entryKeyLeft.localeCompare(entryKeyRight),
                ),
              ]);
            else return "";
          }
        }
      }
    }
  }
  return JSON.stringify([
    materialKeyParts,
    meshMaterial.userData?.plan2SurfaceContact !== false,
    meshMaterial.userData?.plan2SurfaceSlope === true,
    sourceMesh.castShadow,
    sourceMesh.receiveShadow,
    sourceMesh.renderOrder,
    sourceMesh.layers.mask,
  ]);
}
