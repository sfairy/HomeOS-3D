/** 静态合批 / 渲染缓存用的**网格材质键**：把 `MeshStandardMaterial` 的可见状态拍平成稳定字符串。
 *
 * 从 `../studio/studio-app.ts` 的巨型闭包中抽出（P4 拆单体）：纯函数，无闭包依赖；
 * 不适用的网格（蒙皮 / 批量 / 半透明 / 自定义 shader 钩子…）返回空串，调用方据此跳过合批。
 */
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";

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
    (!isTextureAware &&
      Object.values(meshMaterial).some((materialTextureValue: any) => materialTextureValue?.isTexture))
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
