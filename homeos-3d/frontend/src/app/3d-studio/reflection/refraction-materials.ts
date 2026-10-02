/**
 * 折射材质的「无折射克隆」：反射通道专用的材质克隆、缓存与生命周期。
 *
 * 反射通道会把场景用镜像相机再画一遍。玻璃 / 水体（transmission > 0）和带 alphaWallBand 的墙
 * 在镜像相机下会再折射一次，倒影里出现双重折射的脏边，所以捕获前必须换成「不折射」的克隆。
 *
 * 本模块只管「克隆 + 复用 + 释放」；倒影的高度淡出克隆是另一层，在 studio-ground-reflections 里叠加。
 */

type RenderTargetUniform = {
  value: { isTexture?: boolean; isRenderTargetTexture?: boolean } | null;
};

/**
 * onBeforeCompile 拿到的着色器对象：只需要读写 uniform 与两段源码。
 * （three 传进来的是完整 WebGLProgram 参数对象，这里只声明本模块用到的部分。）
 */
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
  // 非折射材质也要过一遍倒影通道自己的材质替换（passes.material 会换掉光照写法），因此留一个回调。
  material: resolveMaterial = (sourceMaterial: MaterialLike) => sourceMaterial,
}: { material?: (sourceMaterial: MaterialLike) => MaterialLike } = {}) {
  // 源材质 → 无折射克隆：WeakMap 让材质被回收后缓存自动失效。
  const refractionFreeMaterialBySource = new WeakMap<MaterialLike, MaterialLike>();
  // 克隆体 → 它的释放处理器。WeakMap 无法遍历，所以另存一份 Map 供 dispose 时逐个收尾。
  const disposeHandlerByClone = new Map<MaterialLike, () => void>();

  /**
   * 克隆材质，但让「渲染目标纹理」类 uniform 继续指向源贴图。
   *
   * UniformsUtils.clone 会把带 clone() 的 uniform 值一并深拷贝；渲染目标纹理深拷贝等于又开一张
   * 同样大小的贴图（光照图、反射贴图都会被复制），显存直接翻倍。所以克隆前先把它们摘下来，
   * 克隆完成后两边都补回源贴图（源材质的 uniform 是就地置空，必须还原，否则主画面材质会掉图）。
   */
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

  /**
   * 取某个材质的「无折射版本」。不需要折射处理的材质原样返回（只过一遍材质替换回调）。
   */
  function getRefractionFreeMaterial(
    sourceMaterial: MaterialLike | null | undefined,
  ): MaterialLike | null | undefined {
    if (
      !sourceMaterial ||
      (!(sourceMaterial.transmission > 0) && !sourceMaterial.userData?.alphaWallBand)
    )
      return resolveMaterial(sourceMaterial) || sourceMaterial;
    if (!refractionFreeMaterialBySource.has(sourceMaterial)) {
      const refractionFreeClone = cloneReflectionMaterial(sourceMaterial);
      // forceSinglePass：克隆体是壳类几何（墙带 / 玻璃），单遍渲染足够，省一半绘制。
      ((refractionFreeClone.transmission = 0),
        (refractionFreeClone.forceSinglePass = true),
        // onBeforeCompile 与 cache key 必须继承，否则克隆体会退回默认着色器、和主画面光照对不上。
        (refractionFreeClone.onBeforeCompile = sourceMaterial.onBeforeCompile),
        (refractionFreeClone.customProgramCacheKey = () =>
          sourceMaterial.customProgramCacheKey() + "|reflection-no-refraction"));
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

  /**
   * 释放全部克隆材质（控制器 dispose 时调用）：逐个走一次它们的释放处理器。
   */
  function disposeMaterialClones() {
    for (const releaseClone of [...disposeHandlerByClone.values()]) releaseClone();
  }

  return { getRefractionFreeMaterial, cloneReflectionMaterial, disposeMaterialClones };
}
