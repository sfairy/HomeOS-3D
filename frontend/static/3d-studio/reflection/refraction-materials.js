/**
 * 折射材质的「无折射克隆」：反射通道专用的材质克隆与三个缓存。
 */
export function createRefractionMaterialResolver() {
    // 反射渲染会临时把半透明 / 折射材质换成「不折射」的克隆：折射材质在镜像相机下
    const refractionFreeMaterialBySource = new WeakMap();
    const disposeHandlerByClone = new Map();
    // 数组材质 → 复用数组：每次渲染都新建数组会让 three.js 误判材质变化，
    const materialArrayEntryByInput = new WeakMap();
    /**
     * 克隆材质，但让所有「渲染目标纹理」uniform 继续指向原贴图。
     */
    function cloneMaterialSharingRenderTargets(material) {
      const renderTargetUniforms = [];
      const uniforms = material.uniforms;
      if (uniforms) {
        for (const uniformName of Object.keys(uniforms)) {
          const uniform = uniforms[uniformName];
          const texture = uniform?.value;
          if (texture?.isTexture && texture.isRenderTargetTexture) {
            renderTargetUniforms.push([uniformName, texture]);
            uniform.value = null;
          }
        }
      }
      let clonedMaterial;
      try {
        clonedMaterial = material.clone();
      } finally {
        for (const [uniformName, texture] of renderTargetUniforms) {
          uniforms[uniformName].value = texture;
          if (clonedMaterial?.uniforms?.[uniformName]) {
            clonedMaterial.uniforms[uniformName].value = texture;
          }
        }
      }
      return clonedMaterial;
    }
    function getRefractionFreeMaterial(material) {
      if (!material || (!(material.transmission > 0) && !material.userData.alphaWallBand)) {
        return material;
      }
      if (!refractionFreeMaterialBySource.has(material)) {
        const refractionFreeMaterial = cloneMaterialSharingRenderTargets(material);
        refractionFreeMaterial.transmission = 0;
        refractionFreeMaterial.forceSinglePass = true;
        refractionFreeMaterial.onBeforeCompile = material.onBeforeCompile;
        refractionFreeMaterial.customProgramCacheKey = () =>
          material.customProgramCacheKey() + "|reflection-no-refraction";
        // 源材质被释放时，连带把克隆体也释放掉：克隆体引用着源材质的贴图与
        const handleMaterialDispose = () => {
          material.removeEventListener("dispose", handleMaterialDispose);
          refractionFreeMaterialBySource.delete(material);
          disposeHandlerByClone.delete(refractionFreeMaterial);
          refractionFreeMaterial.dispose();
        };
        material.addEventListener("dispose", handleMaterialDispose);
        refractionFreeMaterialBySource.set(material, refractionFreeMaterial);
        disposeHandlerByClone.set(refractionFreeMaterial, handleMaterialDispose);
      }
      return refractionFreeMaterialBySource.get(material);
    }
    /**
     * 处理数组材质：逐项取无折射版本。
     */
    function getRefractionFreeMaterials(materialInput) {
      if (!Array.isArray(materialInput)) {
        return getRefractionFreeMaterial(materialInput);
      }
      let cachedArrayEntry = materialArrayEntryByInput.get(materialInput);
      if (!cachedArrayEntry) {
        cachedArrayEntry = {
          next: []
        };
        materialArrayEntryByInput.set(materialInput, cachedArrayEntry);
      }
      cachedArrayEntry.next.length = materialInput.length;
      let materialArrayChanged = false;
      for (let materialIndex = 0; materialIndex < materialInput.length; materialIndex++) {
        cachedArrayEntry.next[materialIndex] = getRefractionFreeMaterial(
          materialInput[materialIndex]
        );
        materialArrayChanged ||=
          cachedArrayEntry.next[materialIndex] !== materialInput[materialIndex];
      }
      if (materialArrayChanged) {
        return cachedArrayEntry.next;
      } else {
        return materialInput;
      }
    }

  /**
   * 释放全部克隆材质（控制器 dispose 时调用）：逐个走一次它们的 dispose 处理器。
   */
  function disposeMaterialClones() {
    for (const disposeListener of [...disposeHandlerByClone.values()]) {
      disposeListener();
    }
  }

  return { getRefractionFreeMaterials, disposeMaterialClones };
}
