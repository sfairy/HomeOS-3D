/**
 * 贴图采样质量的唯一出口：各向异性、色彩空间在**首次上传前**一次定好。
 *
 * three 只在纹理上传时读取 `anisotropy`；上传后再改必须 `needsUpdate = true`，
 * 等于整张图重新 texImage2D + 重建 mipmap。以前运动起止各把全场纹理切一次
 * （4 ↔ 16），每次起步/停下都是一轮全量重传，正是拖拽首帧的卡顿来源。
 */

/** 各向异性上限：8 已覆盖掠射角地面的主要收益，16 在墙板 GPU 上只多花带宽。 */
export const TEXTURE_ANISOTROPY_CAP = 8

/** 本模块管理的材质贴图槽位（含静止档以前漏掉的 emissiveMap / alphaMap）。 */
export const MATERIAL_TEXTURE_SLOTS = Object.freeze([
  'map',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'emissiveMap',
  'lightMap',
  'metalnessMap',
  'normalMap',
  'roughnessMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'transmissionMap',
  'thicknessMap',
])

type RendererLike = { capabilities?: { getMaxAnisotropy?: () => number } } | null | undefined

type TextureLike = {
  isTexture?: boolean
  anisotropy?: number
  colorSpace?: string
}

type MaterialLike = Record<string, unknown> | null | undefined

type SceneNodeLike = {
  material?: MaterialLike | MaterialLike[]
}

type TraversableLike =
  | {
      traverse?: (visit: (node: SceneNodeLike) => void) => void
    }
  | null
  | undefined

/** 设备上限与 `TEXTURE_ANISOTROPY_CAP` 取小；拿不到渲染器时为 1。 */
export function textureAnisotropyFor(rendererOrMax: RendererLike | number): number {
  const deviceMax =
    typeof rendererOrMax === 'number' ? rendererOrMax : rendererOrMax?.capabilities?.getMaxAnisotropy?.()
  return Math.min(Math.max(1, Number(deviceMax) || 1), TEXTURE_ANISOTROPY_CAP)
}

/**
 * 新建纹理时调用：设各向异性；`colorSpace` 给定时一并写入
 * （颜色贴图传 `three.SRGBColorSpace`，数据贴图不传、保持 three 默认的 NoColorSpace）。
 */
export function applyTextureQuality<T extends TextureLike>(
  texture: T,
  rendererOrMax: RendererLike | number,
  colorSpace?: string,
): T {
  texture.anisotropy = textureAnisotropyFor(rendererOrMax)
  if (colorSpace !== undefined) texture.colorSpace = colorSpace
  return texture
}

/**
 * 给一棵节点树里的材质贴图补齐各向异性（只升不降，不设 `needsUpdate`）。
 *
 * 用于模型加载完成、场景版本变化后的首帧之前：此时纹理尚未上传，改值零成本；
 * 已上传的纹理只是把值记下，等它下一次因别的原因重传时生效，绝不主动触发重传。
 */
export function applyTreeTextureAnisotropy(root: TraversableLike, anisotropy: number): number {
  let updated = 0
  root?.traverse?.((node) => {
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : []
    for (const material of materials) {
      if (!material) continue
      for (const slot of MATERIAL_TEXTURE_SLOTS) {
        const texture = material[slot] as TextureLike | undefined
        if (!texture?.isTexture || !((texture.anisotropy ?? 1) < anisotropy)) continue
        texture.anisotropy = anisotropy
        updated++
      }
    }
  })
  return updated
}

/** `?texture-quality=legacy`：恢复运动起止切换各向异性的旧行为（A/B 与回退用，计划 0.9 移除）。 */
export function isLegacyTextureQuality(search = globalThis.location?.search || ''): boolean {
  try {
    return new URLSearchParams(search).get('texture-quality') === 'legacy'
  } catch {
    return false
  }
}
