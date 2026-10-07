/** 折射材质的「无折射克隆」：反射通道专用的材质克隆、缓存与生命周期。 */

type RenderTargetUniform = {
  value: { isTexture?: boolean; isRenderTargetTexture?: boolean } | null;
};

/** onBeforeCompile 拿到的着色器对象：只需要读写 uniform 与两段源码。 */
type ShaderLike = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

type MaterialLike = {
  uniforms?: Record<string, RenderTargetUniform>;
  transmission?: number;
  forceSinglePass?: boolean;
  transparent?: boolean;
  premultipliedAlpha?: boolean;
  /** 材质版本号：three 在任意参数变更时自增，用来判断缓存克隆体是否要跟着刷新。 */
  version?: number;
  /** 反射通道跳过着色器材质（它们自带渲染逻辑，替换反而会画错）。 */
  isShaderMaterial?: boolean;
  userData?: { alphaWallBand?: unknown };
  onBeforeCompile?: (shader: ShaderLike, renderer: unknown) => void;
  customProgramCacheKey?: () => string;
  clone: () => MaterialLike;
  dispose: () => void;
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

export function createRefractionMaterialResolver({

  material: resolveMaterial = (sourceMaterial: MaterialLike) => sourceMaterial,
}: { material?: (sourceMaterial: MaterialLike) => MaterialLike } = {}) {

  const refractionFreeMaterialBySource = new WeakMap<MaterialLike, MaterialLike>();

  const disposeHandlerByClone = new Map<MaterialLike, () => void>();

  /** 克隆材质，但让「渲染目标纹理」类 uniform 继续指向源贴图。 */
  function cloneReflectionMaterial(sourceMaterial: MaterialLike): MaterialLike {
    const renderTargetUniforms: Array<[string, RenderTargetUniform['value']]> = [],
      sourceUniforms = sourceMaterial.uniforms;
    if (sourceUniforms)
      for (const uniformName of Object.keys(sourceUniforms)) {
        const uniformValue = sourceUniforms[uniformName]?.value;
        if (uniformValue?.isTexture && uniformValue.isRenderTargetTexture) {
          (renderTargetUniforms.push([uniformName, uniformValue]),
            (sourceUniforms[uniformName].value = null));
        }
      }
    let clonedMaterial: MaterialLike | undefined;
    try {
      clonedMaterial = sourceMaterial.clone();
    } finally {
      for (const [uniformName, renderTargetTexture] of renderTargetUniforms)
        ((sourceUniforms![uniformName].value = renderTargetTexture),
          clonedMaterial?.uniforms?.[uniformName] &&
            (clonedMaterial.uniforms[uniformName].value = renderTargetTexture));
    }
    return clonedMaterial!;
  }

  /** 取某个材质的「无折射版本」。 */
  function getRefractionFreeMaterial(
    sourceMaterial: MaterialLike | null | undefined,
  ): MaterialLike | null | undefined {
    if (
      !sourceMaterial ||
      (!(sourceMaterial.transmission! > 0) && !sourceMaterial.userData?.alphaWallBand)
    )
      return resolveMaterial(sourceMaterial!) || sourceMaterial;
    if (!refractionFreeMaterialBySource.has(sourceMaterial)) {
      const refractionFreeClone = cloneReflectionMaterial(sourceMaterial);

      ((refractionFreeClone.transmission = 0),
        (refractionFreeClone.forceSinglePass = true),

        (refractionFreeClone.onBeforeCompile = sourceMaterial.onBeforeCompile),
        (refractionFreeClone.customProgramCacheKey = () =>
          sourceMaterial.customProgramCacheKey!() + "|reflection-no-refraction"));
      const handleCloneDispose = () => {
        (sourceMaterial.removeEventListener("dispose", handleCloneDispose),
          refractionFreeMaterialBySource.delete(sourceMaterial),
          disposeHandlerByClone.delete(refractionFreeClone),
          refractionFreeClone.dispose());
      };
      (sourceMaterial.addEventListener("dispose", handleCloneDispose),
        refractionFreeMaterialBySource.set(sourceMaterial, refractionFreeClone),
        disposeHandlerByClone.set(refractionFreeClone, handleCloneDispose));
    }
    return refractionFreeMaterialBySource.get(sourceMaterial);
  }

  /** 释放全部克隆材质（控制器 dispose 时调用）：逐个走一次它们的释放处理器。 */
  function disposeMaterialClones() {
    for (const releaseClone of [...disposeHandlerByClone.values()]) releaseClone();
  }

  return { getRefractionFreeMaterial, cloneReflectionMaterial, disposeMaterialClones };
}
