/**
 * 把「自然木语」饰面套到外部模型材质上（0.8.7 `materialTheme` 的落点）。
 *
 * 调用点在外部模型加载器的**材质流水线末端**（所有颜色 / 档位 / 石材板都算完之后），
 * 这样主题饰面能盖住家族底表与模型专用配方，且不会干扰既有的暖木逻辑。
 *
 * 幂等：已经带 `userData.naturalWoodKind` 的材质直接跳过（缓存命中时会被复用）。
 */

import { naturalWoodModelCoverage, type NaturalWoodMaterialLibrary } from './natural-wood-materials'
import {
  NATURAL_CABINET_TYPES,
  NATURAL_HOME_FINISHES,
  naturalCabinetSurface,
  naturalHomeSurface,
  type NaturalWoodSurface,
} from './natural-wood-finishes'

/** 材质名里出现的部位关键词 → 部位语义（柜类 / 家具共用）。 */
const ROLE_KEYWORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/handle|pull|knob|把手|拉手/i, 'handle'],
  [/countertop|worktop|台面/i, 'countertop'],
  [/top(?:$|[-_])|桌面|面板顶/i, 'top'],
  [/door|柜门|门板/i, 'door'],
  [/drawer|抽屉/i, 'drawer'],
  [/panel|板|侧板/i, 'panel'],
  [/mirror|镜/i, 'mirror'],
  [/glass|玻璃/i, 'glass'],
  [/fabric|upholster|布|织物|坐垫/i, 'fabric'],
  [/leather|皮革/i, 'leather'],
  [/bedding|被|床品/i, 'bedding'],
  [/rug|carpet|毯|地毯/i, 'rug'],
  [/cushion|pillow|靠垫|抱枕/i, 'cushion'],
  [/leg|腿|脚/i, 'legs'],
  [/frame|框|边框/i, 'frame'],
  [/trim|饰条|嵌条/i, 'trim'],
  [/metal|steel|金属|钢/i, 'metal'],
  [/leaf|foliage|叶/i, 'leaf'],
  [/soil|泥土/i, 'soil'],
  [/stone|marble|石材|大理石/i, 'stone'],
  [/inset|内嵌/i, 'inset'],
  [/body|shell|柜体|机身/i, 'body'],
]

/** 从材质名推断部位；推不出时返回空串（调用方按主体处理）。 */
export function naturalWoodRoleForMaterial(materialName: unknown): string {
  const text = String(materialName || '')
  for (const [pattern, role] of ROLE_KEYWORDS) if (pattern.test(text)) return role
  return ''
}

/** 按模型类型取饰面：柜类查柜表，其余查家具表。 */
export function naturalWoodSurfaceFor(itemType: string, materialName: unknown): NaturalWoodSurface | null {
  const role = naturalWoodRoleForMaterial(materialName)
  if (NATURAL_CABINET_TYPES.has(itemType)) return naturalCabinetSurface(role || 'body')
  if (naturalWoodModelCoverage(itemType)) return naturalHomeSurface(role || 'wood')
  return null
}

/**
 * 当前启用的材质库（由 `studio-natural-wood-runtime` 在切到自然木语时写入）。
 *
 * 为什么用模块级注册而不是层层传参：外部模型加载器是个 2,500 行的深层闭包，
 * 为「可能不存在」的主题再加一个参数会污染每一层调用；而主题本来就是**全局单例**语义。
 */
let activeLibrary: NaturalWoodMaterialLibrary | null = null

export function setActiveNaturalWoodLibrary(library: NaturalWoodMaterialLibrary | null): void {
  activeLibrary = library
}

/** 只读取当前启用的材质库（庭院/软装等非外部模型路径用）。未启用时为 `null`。 */
export function activeNaturalWoodLibrary(): NaturalWoodMaterialLibrary | null {
  return activeLibrary
}

/** 按当前是否启用自然木语应用饰面；未启用时是 O(1) 的空操作。 */
export function applyNaturalWoodThemeIfActive(itemType: string, materialName: unknown, material: any): boolean {
  if (!activeLibrary) return false
  return applyNaturalWoodTheme({ itemType, materialName, material, library: activeLibrary })
}

/** 本模块只用到材质的这几个面（PBR 数值 + shader 钩子所在的 `userData`）。 */
type NaturalWoodMaterialLike = {
  userData?: Record<string, unknown>
  color?: { set?: (value: number) => void }
  roughness?: number
  metalness?: number
  transparent?: boolean
  opacity?: number
  depthWrite?: boolean
  needsUpdate?: boolean
  map?: { isTexture?: boolean }
}

/**
 * 窗帘布的「自然木语」饰面（0.8.7 `curtainPart === 'cloth'` 分支）。
 *
 * 为什么单独一条而不是走 `applyNaturalWoodTheme`：
 * - 帘布的材质名是 `material-2/3/4/5`，按名称推断出的部位一定是「主体」，会被当木饰面；
 * - 帘布是**随物体旋转**的软性面，必须用**局部坐标**采样（`localCoordinates: true`），
 *   否则帘子一转向木纹就跟着世界坐标滑动 —— 这是肉眼可见的错。
 *
 * 纱帘（`sheer`）不套：它是半透明的，换亚麻饰面会变成一块实心布。
 */
export function applyNaturalWoodCurtainCloth(
  mesh: { material?: NaturalWoodMaterialLike; geometry?: unknown },
  fabric?: unknown,
): boolean {
  const library = activeLibrary
  if (!library || String(fabric || '') === 'sheer') return false
  const material = mesh?.material
  if (!material || material.userData?.naturalWoodKind === 'linen') return false
  const surface = NATURAL_HOME_FINISHES.fabric
  // **换实例**而不是就地改色：帘布与帘杆 / 帘头共用同一份源材质（同色同粗糙度会被缓存成
  // 同一个实例），就地改色会把杆和边饰一起变成亚麻布。上游同样是换一份新材质。
  const clothMaterial = library.create({
    kind: surface.kind,
    color: surface.color,
    roughness: surface.roughness,
    localCoordinates: true,
  })
  clothMaterial.userData = {
    ...(clothMaterial.userData || {}),
    // `prepareGeometry` 据此补 `nwLocalPosition` / `nwLocalNormal`。
    naturalWoodLocalCoordinates: true,
  }
  // 双面 + 顶点色沿用原材质（帘布靠顶点色做褶皱明暗，丢了会变成一块平板）。
  const previous = material as { side?: unknown; vertexColors?: boolean }
  if (previous.side !== undefined) clothMaterial.side = previous.side
  if (previous.vertexColors === true) clothMaterial.vertexColors = true
  mesh.material = clothMaterial
  library.prepareGeometry({ geometry: mesh.geometry, material: clothMaterial })
  return true
}

export interface NaturalWoodThemeContext {
  itemType: string
  materialName: unknown
  /** 已经算好的材质（会被就地改色 / 换粗糙度）。 */
  material: any
  library: NaturalWoodMaterialLibrary
  /** 该模型的木纹是否应沿竖直方向（柜门 / 墙板）。 */
  verticalGrain?: boolean
}

/**
 * 就地应用自然木语饰面。
 *
 * 只改**颜色 / 粗糙度 / 金属度 + shader 细节**，不换材质实例 ——
 * 外部模型可能有 skinned mesh / morph target，换实例会丢绑定。
 *
 * @returns 是否真的改过（供诊断 / 测试断言）
 */
/** 颜色 / 粗糙度 / 金属度 / 透明度：纯赋值，抽出来是为了让主函数只有分支判断。 */
function applySurfaceNumbers(material: any, surface: NaturalWoodSurface): void {
  material.color?.set?.(surface.color)
  if (typeof surface.roughness === 'number') material.roughness = surface.roughness
  if (typeof surface.metalness === 'number') material.metalness = surface.metalness
  if (typeof surface.opacity !== 'number') return
  material.transparent = true
  material.opacity = surface.opacity
  material.depthWrite = false
}

/**
 * 就地应用自然木语饰面。
 *
 * 只改**颜色 / 粗糙度 / 金属度 + shader 细节**，不换材质实例 ——
 * 外部模型可能有 skinned mesh / morph target，换实例会丢绑定。
 *
 * @returns 是否真的改过（供诊断 / 测试断言）
 */
export function applyNaturalWoodTheme({
  itemType,
  materialName,
  material,
  library,
  verticalGrain,
}: NaturalWoodThemeContext): boolean {
  if (!material || material.userData?.naturalWoodKind) return false
  const surface = naturalWoodSurfaceFor(itemType, materialName)
  // 石材板 / 贴图材质自带整块纹理，强行覆盖会破坏 UV 布局。
  if (!surface || (material.map?.isTexture && surface.kind !== 'stone')) return false
  applySurfaceNumbers(material, surface)
  material.userData = { ...(material.userData || {}), naturalWoodKind: surface.kind }
  // 注入细节 shader：走库里的工厂建一份「同参数材质」，再把它编译钩子搬过来。
  library.retainShader(
    material,
    library.create({
      kind: surface.kind,
      color: surface.color,
      roughness: surface.roughness,
      metalness: surface.metalness,
      verticalGrain: verticalGrain ?? surface.verticalGrain,
      detailScale: surface.detailScale,
    }),
  )
  material.needsUpdate = true
  return true
}
