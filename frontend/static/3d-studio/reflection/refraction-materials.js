/**
 * 折射材质的「无折射克隆」：反射通道专用的材质克隆与三个缓存。
 *
 * 从 studio-ground-reflections.js 拆出来：那一份只留「逐地面的记录、镜像相机与渲染编排」，
 * 这一份只做材质侧的一件事 —— 折射材质在镜像相机下会做第二次屏幕空间折射（既慢、结果也是错的），
 * 因此每个源材质要有一份把 transmission 关掉的克隆，且这份克隆必须随源材质一起释放。
 * 三个缓存（源→克隆、克隆→dispose 处理器、数组材质→复用数组）都只服务这件事，故一并搬来。
 */
export function createRefractionMaterialResolver() {
    // 反射渲染会临时把半透明 / 折射材质换成「不折射」的克隆：折射材质在镜像相机下
    // 会做第二次屏幕空间折射，既慢又会产生错误的双层折射。
    const refractionFreeMaterialBySource = new WeakMap();
    // 克隆材质 → 它的 dispose 处理器，dispose 时统一注销，避免监听器泄漏。
    const disposeHandlerByClone = new Map();
    // 数组材质 → 复用数组：每次渲染都新建数组会让 three.js 误判材质变化，
    // 这里复用同一个数组对象、只改内容。
    const materialArrayEntryByInput = new WeakMap();
    /**
     * 克隆材质，但让所有「渲染目标纹理」uniform 继续指向原贴图。
     * 为什么不能直接 clone：three.js 的 Material.clone 会把 renderTargetTexture 也复制一份引用（有些版本甚至复制内容），而反射通道要求克隆材质继续用主通道的那张输出贴图；
     * 因此先临时把 uniform 置 null 再 clone，clone 完两边都还原 —— 这也避免了 clone 期间 texture 被标记为「需要上传」而触发额外的 GPU 上传。
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
    /**
     * 取（必要时创建）某材质的「无折射」版本。触发条件：有 transmission 的玻璃，或带 alphaWallBand 的渐变墙。
     * 改动：transmission 置 0、forceSinglePass 打开（折射材质默认双面渲染两次，在只有一张贴图的反射通道里会互相覆盖），并沿用原材质的 onBeforeCompile 与 programCacheKey（否则区域灯注入的代码会丢失 / 程序缓存会串）。
     * 通过源材质的 dispose 事件自动回收这份克隆：源材质没了，克隆也没有存在的意义。
     */
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
        // onBeforeCompile，留着它既不安全也会一直占着显存。
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
     * 复用同一个「结果数组」对象（cachedArrayEntry.next）并在内容没变时直接返回入参，这样调用方可以安全地用 `!==` 判断「材质有没有被换过」，也避免每帧在 three.js 内部触发材质数组的变化检测。
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
   * 克隆体引用着源材质的贴图与 onBeforeCompile，不释放会一直占着显存。
   */
  function disposeMaterialClones() {
    for (const disposeListener of [...disposeHandlerByClone.values()]) {
      disposeListener();
    }
  }

  return { getRefractionFreeMaterials, disposeMaterialClones };
}
