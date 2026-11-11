/**
 * 灯带的唯一口径：安装方式、位姿、发光面尺寸、光度、影响半径、旧档迁移与建议离地高度。
 *
 * 建灯（`strip-light-model.ts`）、选中箭头、渲染循环的淡入淡出、
 * 导出与嵌入舞台的区域灯都从这里取值，不再各自拼「倾斜 × 翻滚 × 立装」三层旋转。
 *
 * 坐标约定：位姿给的是**物件组局部空间**（物件组已经绕 Y 转过平面旋转、并放在
 * 离地高度处）。灯带的「锚点」就是安装面：吸顶贴天花、灯槽贴槽底、立装是顶端。
 * 这里不依赖 three，便于单测；向量一律用 `[x, y, z]` 元组。
 */

import { clamp as clamp2 } from '../../../plan/geometry'
import { finite as finite2, normalizeFullRotation } from '../../../loaders/studio-number'
import {
  lightBrightnessResponse,
  lightFluxLumens,
  lightIntensityFactor,
  lightPresetCatalog,
  renderLuminanceFromFlux,
} from '../studio-app-light-data'

const STRIP_MOUNTS = ['ceiling-down', 'cove-up', 'wall-wash', 'under-cabinet', 'vertical', 'custom'] as const
export type StripMount = (typeof STRIP_MOUNTS)[number]
export const DEFAULT_STRIP_MOUNT: StripMount = 'ceiling-down'

const stripMountSet = new Set<string>(STRIP_MOUNTS)

function normalizeStripMount(rawMount: unknown): StripMount | null {
  return typeof rawMount === 'string' && stripMountSet.has(rawMount) ? (rawMount as StripMount) : null
}

/** 发光面相对物件尺寸的系数：两端的端子和边框不发光。 */
const STRIP_EMITTER_SCALE = 0.94
/** 灯带长度 / 发光宽度的上下限（米）。 */
const STRIP_SIZE_MIN = 0.1
const STRIP_SIZE_MAX = 8
/** 发光面离安装面的距离：贴得太近会和天花 / 槽底共面闪烁。 */
const STRIP_SURFACE_GAP = 0.01

export type Vec3 = [number, number, number]

/** 灯带口径只读到的物件字段。 */
export type StripLightLike = {
  type?: string
  width?: unknown
  depth?: unknown
  elevation?: unknown
  rotation?: unknown
  verticalRotation?: unknown
  stripRollRotation?: unknown
  stripAxis?: unknown
  stripMount?: unknown
  lightBrightness?: unknown
}

/** 物件宽 = 灯带长度，物件深 = 发光宽度；发光面再各乘 0.94。 */
export function stripLightSize(item: StripLightLike) {
  const length = clamp2(finite2(item.width, 2), STRIP_SIZE_MIN, STRIP_SIZE_MAX),
    width = clamp2(finite2(item.depth, 0.28), STRIP_SIZE_MIN, STRIP_SIZE_MAX)
  return {
    length,
    width,
    emitLength: length * STRIP_EMITTER_SCALE,
    emitWidth: width * STRIP_EMITTER_SCALE,
  }
}

const nearAngle = (angleDeg: number, targetDeg: number) => {
  const delta = Math.abs(((((angleDeg - targetDeg) % 360) + 540) % 360) - 180)
  return delta < 0.5
}
const legacyAxisOf = (item: StripLightLike) => (item.stripAxis === 'vertical' ? 'vertical' : 'horizontal')

/**
 * 旧档（没有 `stripMount`）的位姿翻译成安装方式。
 *
 * 旧口径是三层嵌套旋转：绕 Z 倾斜 `verticalRotation` → 绕 X（长度轴）翻滚
 * `stripRollRotation` → 面光朝下；立装再整体绕 Z 立起 90°。四个直角翻滚正好对应
 * 吸顶 / 洗墙 / 灯槽 / 反向洗墙，反向洗墙把 180° 并进平面旋转；立装的翻滚是绕竖轴转，
 * 同样并进平面旋转。其余组合（带倾斜、斜角翻滚）一律落到「自定义」，保持原样。
 */
export function migrateLegacyStripPose(item: StripLightLike) {
  const rotation = normalizeFullRotation(item.rotation),
    tilt = normalizeFullRotation(item.verticalRotation),
    roll = normalizeFullRotation(item.stripRollRotation),
    axis = legacyAxisOf(item),
    custom = {
      stripMount: 'custom' as StripMount,
      rotation,
      verticalRotation: tilt,
      stripRollRotation: roll,
      stripAxis: axis,
    }
  if (!nearAngle(tilt, 0)) return custom
  const withMount = (stripMount: StripMount, nextRotation = rotation) => ({
    stripMount,
    rotation: normalizeFullRotation(nextRotation),
    ...stripLegacyFields(stripMount),
  })
  if (axis === 'vertical') return withMount('vertical', rotation - roll)
  if (nearAngle(roll, 0)) return withMount(finite2(item.elevation, 2.7) < 1.8 ? 'under-cabinet' : 'ceiling-down')
  if (nearAngle(roll, 180)) return withMount('cove-up')
  if (nearAngle(roll, 90)) return withMount('wall-wash')
  if (nearAngle(roll, 270)) return withMount('wall-wash', rotation + 180)
  return custom
}

/**
 * 安装方式对应的旧字段：读档时写回去，旧版本读到同一份存档仍然摆得一样。
 * 自定义不改旧字段（它们就是自定义的数据本身）。
 */
function stripLegacyFields(mount: StripMount) {
  return mount === 'cove-up'
    ? { verticalRotation: 0, stripRollRotation: 180, stripAxis: 'horizontal' }
    : mount === 'wall-wash'
      ? { verticalRotation: 0, stripRollRotation: 90, stripAxis: 'horizontal' }
      : mount === 'vertical'
        ? { verticalRotation: 0, stripRollRotation: 0, stripAxis: 'vertical' }
        : { verticalRotation: 0, stripRollRotation: 0, stripAxis: 'horizontal' }
}

/**
 * 读档时的灯带位姿字段：没有 `stripMount` 的旧档按位姿迁移；
 * 有的话非自定义安装把旧字段收拢成该安装方式的值（防止手改存档后两套口径打架）。
 */
export function normalizeStripPoseRecord(item: StripLightLike) {
  const mount = normalizeStripMount(item.stripMount)
  if (!mount) return migrateLegacyStripPose(item)
  const rotation = normalizeFullRotation(item.rotation)
  return mount === 'custom'
    ? {
        stripMount: mount,
        rotation,
        verticalRotation: normalizeFullRotation(item.verticalRotation),
        stripRollRotation: normalizeFullRotation(item.stripRollRotation),
        stripAxis: legacyAxisOf(item),
      }
    : { stripMount: mount, rotation, ...stripLegacyFields(mount) }
}

/**
 * 读档时灯带的尺寸与位姿（非灯带返回 null）。
 * 平躺朝下 / 朝上的灯带统一成「宽 ≥ 深」时同步转 90°，否则读档后整条灯带横过来；
 * 有倾斜 / 翻滚时交换会改变它们绕的轴，立姿灯带的宽是竖向长度：这两种都保持原值。
 */
export function stripLoadRecord(raw: StripLightLike | null | undefined, width: number, depth: number) {
  if (raw?.type !== 'striplight') return null
  const swapsAxes =
    depth > width &&
    legacyAxisOf(raw) === 'horizontal' &&
    nearAngle(normalizeFullRotation(raw.verticalRotation), 0) &&
    nearAngle(normalizeFullRotation(raw.stripRollRotation), 0)
  return {
    width: swapsAxes ? depth : width,
    depth: swapsAxes ? width : depth,
    ...normalizeStripPoseRecord({
      ...raw,
      rotation: normalizeFullRotation(normalizeFullRotation(raw.rotation) + (swapsAxes ? 90 : 0)),
    }),
  }
}

/** 导出条目里灯带专有的字段：旧字段照留，另带安装方式、出光方向和发光尺寸（米）。 */
export function stripExportFields(item: StripLightLike) {
  const { mount, emitDirection } = stripLightPose(item),
    { length, emitLength, emitWidth } = stripLightSize(item)
  return {
    stripMount: mount,
    stripAxis: legacyAxisOf(item),
    emitDirection: { x: emitDirection[0], y: emitDirection[1], z: emitDirection[2] },
    stripLength: length,
    emitSize: { length: emitLength, width: emitWidth },
  }
}

/** 物件上的安装方式；旧档按位姿推断。 */
export function resolveStripMount(item: StripLightLike): StripMount {
  return normalizeStripMount(item.stripMount) ?? migrateLegacyStripPose(item).stripMount
}

/**
 * 设置面板选了安装方式：写 `stripMount`，非自定义时同步旧字段；
 * 真的换了安装方式才按层高给建议离地高度（自定义保持原值）。返回是否换了安装方式。
 */
export function applyStripMountSelection(item: StripLightLike, rawMount: unknown, wallHeight: unknown) {
  if (!normalizeStripMount(item.stripMount)) Object.assign(item, migrateLegacyStripPose(item))
  const previous = resolveStripMount(item),
    next = normalizeStripMount(rawMount) ?? previous
  item.stripMount = next
  if (next !== 'custom') Object.assign(item, stripLegacyFields(next))
  if (next === previous) return false
  const elevation = suggestedStripElevation(next, wallHeight)
  if (elevation !== null) item.elevation = Math.round(elevation * 100) / 100
  return true
}

/** 检查器提交位姿输入：翻滚只在自定义安装时可改，其余安装方式的旧字段由规格决定。 */
export function applyStripInspectorPose(
  item: StripLightLike & { lightSourceVisible?: boolean },
  rollValue: unknown,
  lightSourceVisible: boolean,
) {
  item.stripRollRotation = normalizeFullRotation(rollValue, finite2(item.stripRollRotation, 0))
  item.lightSourceVisible = lightSourceVisible
  const mount = resolveStripMount(item)
  if (mount !== 'custom') Object.assign(item, stripLegacyFields(mount))
}

/** 旧口径「倾斜 → 翻滚 → 朝下」的长度轴与出光方向（自定义安装用）。 */
function customAxes(item: StripLightLike): { lengthAxis: Vec3; emitDirection: Vec3 } {
  const tilt = (normalizeFullRotation(item.verticalRotation) * Math.PI) / 180,
    roll = (normalizeFullRotation(item.stripRollRotation) * Math.PI) / 180,
    lengthAxis: Vec3 = [Math.cos(tilt), Math.sin(tilt), 0],
    emitDirection: Vec3 = [Math.cos(roll) * Math.sin(tilt), -Math.cos(roll) * Math.cos(tilt), -Math.sin(roll)]
  if (legacyAxisOf(item) !== 'vertical') return { lengthAxis, emitDirection }
  // 立装：整体绕 Z 转 +90°，(x, y, z) → (-y, x, z)。
  const standUp = (v: Vec3): Vec3 => [-v[1], v[0], v[2]]
  return { lengthAxis: standUp(lengthAxis), emitDirection: standUp(emitDirection) }
}

/**
 * 发光面位姿（物件组局部空间）。
 *
 * - `lengthAxis`：灯带长度方向（RectAreaLight 的局部 +X）；
 * - `emitDirection`：出光方向（RectAreaLight 只向局部 −Z 一侧发光）；
 * - `center`：发光面中心。立装与自定义立装以顶端为锚点，向下延伸一个长度。
 */
export function stripLightPose(item: StripLightLike) {
  const mount = resolveStripMount(item),
    { length } = stripLightSize(item),
    axes =
      mount === 'custom'
        ? customAxes(item)
        : mount === 'cove-up'
          ? { lengthAxis: [1, 0, 0] as Vec3, emitDirection: [0, 1, 0] as Vec3 }
          : mount === 'wall-wash'
            ? { lengthAxis: [1, 0, 0] as Vec3, emitDirection: [0, 0, -1] as Vec3 }
            : mount === 'vertical'
              ? { lengthAxis: [0, 1, 0] as Vec3, emitDirection: [1, 0, 0] as Vec3 }
              : { lengthAxis: [1, 0, 0] as Vec3, emitDirection: [0, -1, 0] as Vec3 },
    standing = mount === 'vertical' || (mount === 'custom' && legacyAxisOf(item) === 'vertical'),
    { emitDirection } = axes,
    center: Vec3 = [
      emitDirection[0] * STRIP_SURFACE_GAP,
      emitDirection[1] * STRIP_SURFACE_GAP - (standing ? length / 2 : 0),
      emitDirection[2] * STRIP_SURFACE_GAP,
    ]
  return { mount, lengthAxis: axes.lengthAxis, emitDirection, center, standing }
}

/**
 * 全亮时的发光面亮度（cd·m⁻²，渲染刻度），不含亮度百分比。
 *
 * 灯带按「每米光通量 × 长度」给总光通量，余弦辐射体 L = Φ / (π·A)：
 * 加长灯带亮度不变、总光量随长度涨；加宽发光面会摊薄亮度。
 * 照射范围、离地高度不再参与 —— 面光本来就按距离自然衰减。
 */
export function stripLuminance(item: StripLightLike) {
  const { emitLength, emitWidth } = stripLightSize(item)
  return (
    renderLuminanceFromFlux('striplight', lightFluxLumens.striplight, emitLength, emitWidth) *
    lightIntensityFactor.striplight
  )
}

/** 亮度百分比（夹在 0–100，嵌入舞台 0–150）→ 比例。 */
function stripBrightnessRatio(item: StripLightLike, isEmbedStage = false) {
  return (
    clamp2(finite2(item.lightBrightness, lightPresetCatalog.striplight.brightness), 0, isEmbedStage ? 150 : 100) / 100
  )
}

/** 当前亮度下的面光强度（`RectAreaLight.intensity`）。 */
export function stripLightIntensity(item: StripLightLike, isEmbedStage = false) {
  return (
    stripLuminance(item) * lightBrightnessResponse('striplight', stripBrightnessRatio(item, isEmbedStage), isEmbedStage)
  )
}

/** 影响半径的照度下限（渲染刻度，约为日光的 7%）。 */
const STRIP_INFLUENCE_FLOOR = 0.15
const STRIP_INFLUENCE_MAX = 12

/**
 * 影响半径（米）：全亮时照度降到 `STRIP_INFLUENCE_FLOOR` 的距离，加上半个长度。
 * 墙体可见性图按这个半径（再被本层墙体范围截断）取瓦片大小。
 */
export function stripInfluenceRadius(item: StripLightLike) {
  const { emitLength, emitWidth, length } = stripLightSize(item),
    equivalentCandela = stripLuminance(item) * emitLength * emitWidth
  return clamp2(Math.sqrt(equivalentCandela / STRIP_INFLUENCE_FLOOR) + length / 2, 2, STRIP_INFLUENCE_MAX)
}

/** 新建灯带（吸顶朝下）的离地高度：贴着天花往下 2 cm。 */
export function defaultStripElevation(wallHeight: unknown) {
  return clamp2(finite2(wallHeight, 2.4), 1.8, 6) - 0.02
}

/**
 * 切换安装方式时建议的离地高度（米）；自定义返回 null（保持原值）。
 *
 * 吸顶贴着天花往下 2 cm；灯槽留 15 cm 槽深；洗墙在天花下 10 cm；
 * 柜底灯在吊柜底（约 1.45 m）；竖装以顶端为锚点，同样贴近天花。
 */
export function suggestedStripElevation(mount: StripMount, wallHeight: unknown) {
  const ceiling = clamp2(finite2(wallHeight, 2.4), 1.8, 6)
  return mount === 'ceiling-down'
    ? defaultStripElevation(wallHeight)
    : mount === 'cove-up'
      ? ceiling - 0.15
      : mount === 'wall-wash'
        ? ceiling - 0.1
        : mount === 'under-cabinet'
          ? 1.45
          : mount === 'vertical'
            ? ceiling - 0.05
            : null
}
