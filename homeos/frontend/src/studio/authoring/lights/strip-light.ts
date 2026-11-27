import { RectAreaLightUniformsLib } from '/static/vendor/three/0.187.0/RectAreaLightUniformsLib.js'
import * as THREE from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../plan/geometry'
import { finite as finite2, normalizeFullRotation } from '../loaders/studio-number'
import { lightBrightnessResponse, lightFluxLumens, lightIntensityFactor, lightPresetCatalog, renderLuminanceFromFlux } from './studio-app-light-data'
import { projectMeshTriangles, segmentsWithin, type OccluderMesh, type Scratch, type VisibilityRenderer, type VisibilityThree } from '../plan/studio-region'

/**
 * 面光（灯带）的 LTC 查找表。
 *
 * three 的 `RectAreaLight` 着色靠两张 LTC 纹理，必须先 `RectAreaLightUniformsLib.init()`
 * 把它们挂到 `UniformsLib` 上；之前从没初始化，镜面项恒为 0、个别像素读出 NaN。
 * 支持浮点线性过滤时用 FLOAT 版，否则用 HALF 版（与 three 的 `WebGLLights` 同一判定）。
 */

type LtcThree = { UniformsLib: Record<string, unknown> }
type LtcRenderer = { extensions?: { has?(name: string): boolean } }

let initialized = false

export function stripLightLtcTextures(THREE: LtcThree, renderer: LtcRenderer | null | undefined) {
  if (!initialized) RectAreaLightUniformsLib.init(), (initialized = true)
  const floatLinear = renderer?.extensions?.has?.('OES_texture_float_linear') === true,
    library = THREE.UniformsLib
  return {
    ltc1: floatLinear ? library.LTC_FLOAT_1 : library.LTC_HALF_1,
    ltc2: floatLinear ? library.LTC_FLOAT_2 : library.LTC_HALF_2,
  }
}

/**
 * 灯带的三维表达：面光、可选发光本体、选中时的朝向箭头。
 *
 * 位姿、尺寸、亮度全部取自 `strip-light-spec.ts`，三者共用同一个「位姿组」，
 * 看到的发光线、箭头和真正出光的面光永远重合。
 *
 * - 面光 `RectAreaLight`：只向局部 −Z 发光，宽沿局部 X（灯带长度），高沿局部 Y（发光宽度）；
 *   不投影，穿墙由墙体可见性图（`strip-wall-visibility.ts`）挡住。
 * - 发光本体：`MeshBasicMaterial` + `toneMapped: false`，颜色 = 灯色 × 亮度，关灯时暗灰；
 *   挂在面光的 `userData.stripFixture` 上，渲染循环淡入淡出时一起改色，开关不闪。
 *   默认不显示（户型总览里不挂黑灰细条），选中且「显示光源」开着才露出。
 * - 朝向箭头：与发光本体同一开关，沿出光方向。
 */

/** 关灯时发光本体的颜色（灯珠 + 扩散罩的本色）。 */
const STRIP_FIXTURE_OFF_COLOR = 0x3a3c40
/** 发光本体截面：宽（垂直于长度、平行于安装面）与厚（沿出光方向）。 */
const STRIP_FIXTURE_THICKNESS = 0.012
const STRIP_FIXTURE_WIDTH_RANGE: [number, number] = [0.012, 0.04]

type StripObject = {
  position: { set(x: number, y: number, z: number): unknown }
  quaternion: { setFromRotationMatrix(matrix: unknown): unknown }
}

/** 把对象摆到灯带发光面的位姿上（局部 X = 长度，局部 −Z = 出光方向）。 */
export function applyStripPose(object: StripObject, item: StripLightLike) {
  const pose = stripLightPose(item),
    lengthAxis = new THREE.Vector3(...pose.lengthAxis).normalize(),
    backAxis = new THREE.Vector3(...pose.emitDirection).normalize().negate(),
    acrossAxis = new THREE.Vector3().crossVectors(backAxis, lengthAxis)
  // 自定义倾斜把长度轴拧到和出光轴几乎平行时，叉积会退化成零向量，面光姿态变成 NaN。
  if (acrossAxis.lengthSq() < 1e-10) {
    const fallback = Math.abs(backAxis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    acrossAxis.crossVectors(backAxis, fallback)
  }
  if (acrossAxis.lengthSq() < 1e-10) acrossAxis.set(0, 1, 0)
  acrossAxis.normalize()
  lengthAxis.crossVectors(acrossAxis, backAxis).normalize()
  if (lengthAxis.lengthSq() < 1e-10) lengthAxis.set(1, 0, 0)
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(lengthAxis, acrossAxis, backAxis))
  object.position.set(...pose.center)
  return pose
}

/** 发光本体颜色：灯色按亮度在「关灯本色」和「灯色」之间插值。 */
function stripFixtureColor(lightColor: { r: number; g: number; b: number }, glow: number, target = new THREE.Color()) {
  const off = new THREE.Color(STRIP_FIXTURE_OFF_COLOR),
    amount = Math.min(Math.max(Number(glow) || 0, 0), 1)
  return target.setRGB(
    off.r + (lightColor.r - off.r) * amount,
    off.g + (lightColor.g - off.g) * amount,
    off.b + (lightColor.b - off.b) * amount,
  )
}

/**
 * 灯态变化时同步发光本体（渲染循环的淡入淡出每帧调用）。
 * 发光程度按「当前强度 / 100% 亮度时的强度」取平方根，低亮度时灯珠依然看得出在亮。
 */
export function syncStripFixture(light: {
  intensity?: number
  color?: { r: number; g: number; b: number }
  userData?: Record<string, unknown>
}) {
  const fixture = light.userData?.stripFixture as { material?: { color?: unknown } } | undefined,
    fullIntensity = Number(light.userData?.stripFullIntensity) || 0
  if (!fixture?.material?.color || !light.color) return
  const glow = fullIntensity > 0 ? Math.sqrt(Math.max(Number(light.intensity) || 0, 0) / fullIntensity) : 0
  stripFixtureColor(light.color, glow, fixture.material.color as InstanceType<typeof THREE.Color>)
}

/** 灯直接切到全亮（`userData.lightOnIntensity`）或熄灭；灯带灯体跟着变亮 / 变暗。 */
export function applyLightOnState(
  light: Parameters<typeof syncStripFixture>[0] & { intensity: number; visible?: boolean },
  isOn: boolean,
) {
  light.intensity = isOn ? Number(light.userData?.lightOnIntensity) || 0 : 0
  light.visible = isOn
  syncStripFixture(light)
}

export interface StripLightBuildContext {
  colorHex: number
  isOn: boolean
  isEmbedStage: boolean
  floorId: string
  groupId: string
}

/** 建面光（不含发光本体）；返回面光对象，调用方挂到物件组上。 */
export function createStripRectAreaLight(item: StripLightLike & { id: string }, context: StripLightBuildContext) {
  const { emitLength, emitWidth } = stripLightSize(item),
    onIntensity = stripLightIntensity(item, context.isEmbedStage),
    light = new THREE.RectAreaLight(context.colorHex, context.isOn ? onIntensity : 0, emitLength, emitWidth)
  applyStripPose(light, item)
  ;(light.visible = context.isOn),
    (light.userData.lightItemId = item.id),
    (light.userData.lightGroupId = context.groupId),
    (light.userData.lightFloorId = context.floorId),
    (light.userData.lightType = 'striplight'),
    (light.userData.lightSourceType = 'continuous-area-strip'),
    (light.userData.lightOnIntensity = onIntensity),
    (light.userData.stripFullIntensity = stripLuminance(item)),
    (light.userData.stripInfluenceRadius = stripInfluenceRadius(item))
  context.isEmbedStage && (light.userData.regionFullIntensity = stripLuminance(item))
  return light
}

type StripNode = {
  isRectAreaLight?: boolean
  intensity?: number
  color?: { r: number; g: number; b: number }
  userData: Record<string, unknown>
}
type StripParent = {
  add(...objects: unknown[]): unknown
  traverse(callback: (node: StripNode) => void): void
}
type ConfigurePreview = <T>(mesh: T) => T

/** 灯带物件组里已经建好的面光（`addLightModel` 先于发光本体执行）。 */
function findStripLight(parent: StripParent, itemId: string) {
  let found: StripNode | null = null
  parent.traverse((node) => {
    if (!found && node.isRectAreaLight && node.userData?.lightItemId === itemId) found = node
  })
  return found as StripNode | null
}

/**
 * 发光本体 + 朝向箭头（物件模型阶段调用，不进灯光缓存）。
 *
 * @param showFixture 是否显示发光本体（选中且「显示光源」开着）。
 * @param showArrow 是否显示朝向箭头（与发光本体同一开关）。
 */
export function addStripFixture(
  parent: StripParent,
  item: StripLightLike & { id: string },
  options: { colorHex: number; showFixture: boolean; showArrow: boolean; configurePreview: ConfigurePreview },
) {
  const { emitLength, emitWidth } = stripLightSize(item),
    poseGroup = new THREE.Group(),
    light = findStripLight(parent, item.id),
    fixtureWidth = Math.min(Math.max(emitWidth * 0.15, STRIP_FIXTURE_WIDTH_RANGE[0]), STRIP_FIXTURE_WIDTH_RANGE[1]),
    fixtureMaterial = new THREE.MeshBasicMaterial({ color: STRIP_FIXTURE_OFF_COLOR, toneMapped: false }),
    fixture = new THREE.Mesh(new THREE.BoxGeometry(emitLength, fixtureWidth, STRIP_FIXTURE_THICKNESS), fixtureMaterial)
  applyStripPose(poseGroup, item)
  ;(poseGroup.userData.exportRole = 'light-fixture'), (poseGroup.userData.stripFixtureRoot = true)
  // 本体贴着安装面，发光面在它前方 4 mm：本体不挡自己的光。
  fixture.position.set(0, 0, STRIP_FIXTURE_THICKNESS / 2 + 0.004)
  ;(fixture.visible = options.showFixture),
    (fixture.castShadow = false),
    (fixture.receiveShadow = false),
    (fixture.userData.stripFixture = true),
    (fixture.userData.stripFixtureItemId = item.id)
  // 面光只在开灯（或预览）时才建；没建就是关灯，本体保持暗灰，开灯会整体重建。
  if (light) (light.userData.stripFixture = fixture), syncStripFixture(light)
  poseGroup.add(fixture)
  if (options.showArrow)
    poseGroup.add(createStripArrow(options.colorHex, emitLength, emitWidth, options.configurePreview))
  parent.add(poseGroup)
  return fixture
}

/** 选中时的朝向标记：发光面轮廓 + 沿出光方向（局部 −Z）的箭头，长灯带两端各加一支。 */
function createStripArrow(colorHex: number, emitLength: number, emitWidth: number, configurePreview: ConfigurePreview) {
  const arrowGroup = new THREE.Group(),
    material = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, depthWrite: false }),
    outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(emitLength, emitWidth)),
      new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9, depthWrite: false }),
    ),
    arrowOffsets = emitLength > 1 ? [-emitLength * 0.35, 0, emitLength * 0.35] : [0]
  ;(arrowGroup.userData.exportRole = 'light-source-preview'), (arrowGroup.userData.lightSourcePreview = true)
  arrowGroup.add(configurePreview(outline))
  for (const offsetX of arrowOffsets) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8), material),
      head = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 12), material)
    // 圆柱 / 圆锥默认沿 +Y，绕 X 转 −90° 后指向 −Z（出光方向）。
    ;(shaft.rotation.x = head.rotation.x = -Math.PI / 2),
      shaft.position.set(offsetX, 0, -0.11),
      head.position.set(offsetX, 0, -0.265),
      arrowGroup.add(configurePreview(shaft), configurePreview(head))
  }
  return arrowGroup
}

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
  if (next === 'custom') {
    /**
     * `stripAxis` 是看不见的旧口径：`vertical` 会整体绕 Z 立起 90°，让「安装倾斜」绕竖轴转。
     * 从「竖装」切到自定义时它会把自定义角度解释成立装 —— 输入框里的数字和画面对不上。
     * 自定义 = 平躺灯带的自由倾斜 / 翻滚，立装是独立预设，不该在这里继续隐式生效。
     */
    if (previous === 'vertical') item.stripAxis = 'horizontal'
  } else Object.assign(item, stripLegacyFields(next))
  if (next === previous) return false
  const elevation = suggestedStripElevation(next, wallHeight)
  if (elevation !== null) item.elevation = Math.round(elevation * 100) / 100
  return true
}

/**
 * 检查器提交位姿输入。0.8.7 的「安装倾斜 / 出光方向」对**每条**灯带都可见可改，
 * 所以不能用「非自定义安装就把输入写回预设值」—— 那会让输入框看起来能改、改完弹回去。
 *
 * 口径与 3D 手柄一致：预设安装方式下输入框显的就是该方式的规范角度，改了任一轴就落成
 * 「自定义角度」；照旧时仍把旧字段收拢成预设值，保证两套口径不打架。
 *
 * `mountChanged` 是同一笔提交里「安装方式下拉换过」：此时输入框里还是切换前的角度，
 * 以安装方式为准（只把旧字段收拢成预设值），不能让上一组角度把刚选的预设顶成自定义。
 *
 * 返回检查器是否需要回刷：切成了自定义，或这笔提交本来就换过安装方式（下拉 / 旧字段都变了）。
 */
export function applyStripInspectorPose(
  item: StripLightLike & { lightSourceVisible?: boolean },
  rollValue: unknown,
  lightSourceVisible: boolean,
  mountChanged = false,
): boolean {
  const roll = normalizeFullRotation(rollValue, finite2(item.stripRollRotation, 0))
  item.stripRollRotation = roll
  item.lightSourceVisible = lightSourceVisible
  const mount = resolveStripMount(item)
  if (mount === 'custom') return mountChanged
  const preset = stripLegacyFields(mount)
  const matchesPreset =
    nearAngle(normalizeFullRotation(item.verticalRotation), preset.verticalRotation) &&
    nearAngle(roll, preset.stripRollRotation)
  if (mountChanged || matchesPreset) {
    Object.assign(item, preset)
    return mountChanged
  }
  // 手调角度 → 自定义角度；竖装切过来时同步把旧口径的「立装」标记收回（见 applyStripMountSelection）。
  if (mount === 'vertical') item.stripAxis = 'horizontal'
  item.stripMount = 'custom'
  return true
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

/**
 * 灯带（面光）的墙体可见性：极坐标遮挡距离图（2D 版的点光源阴影）。
 *
 * `RectAreaLight` 向整个半球发光、没有距离截断，也不投影：隔着一堵墙，隔壁房间照样被
 * 照亮。以前烘过一张俯视可见性网格，但格子（0.15~0.4 m）比墙（0.2 m）还宽，线性过滤
 * 会把墙这边的「可见」糊到墙那边，墙根和墙面上留下一团团光斑。
 *
 * 现在每条灯带占图集里的一行：开头两个像素存射线起点（灯带中心和两端，世界 xz），
 * 后面 `STRIP_VISIBILITY_ANGLES` 个像素按方位角存「从各起点出发第一次碰到墙的距离」。
 * 着色器算出片元到起点的方位角和距离，与那一格的碰墙距离比较（见 `floorLightShaderPars`
 * 的 `userFloorAreaVisibility`）：墙的边界是精确的，不随房间大小变糊。
 *
 * 只有灯带位姿、影响范围或墙体变了才重画对应的行；亮度渐变不会触发。
 * 坐标全部是世界空间；楼层堆叠动画会让墙的世界矩阵变化，这时按墙的矩阵签名重新收集线段。
 */

/** 每行开头存射线起点的像素数：`(o0.xz, o1.xz)`、`(o2.xz, 起点数, 影响半径)`。 */
export const STRIP_VISIBILITY_HEADER = 2
/** 方位角分格数；行宽 = 表头 + 分格 = 2048，WebGL2 保证的最小纹理边长。 */
export const STRIP_VISIBILITY_ANGLES = 2046
const STRIP_VISIBILITY_WIDTH = STRIP_VISIBILITY_HEADER + STRIP_VISIBILITY_ANGLES
/** 这个方向上没有墙。 */
const STRIP_NO_HIT = 1e4
/** 影响半径上限（米），与 `stripInfluenceRadius` 的上限一致。 */
const STRIP_MAX_INFLUENCE = 12
/** 射线起点沿水平出光方向前移的距离：洗墙灯带贴墙安装，起点不能落在墙里。 */
const STRIP_ORIGIN_LIFT = 0.05
/** 两端起点往里收的距离：灯带常常顶到两头的墙，端点不能落进墙里。 */
const STRIP_END_INSET = 0.1

/** 墙要从地面起连续这么高才挡光：门洞过梁、窗台下的矮墙都不算。 */
const MIN_OCCLUDER_HEIGHT = 1.2
const FLOOR_TOLERANCE = 0.1
/** 合并同一条墙线的高度区间时允许的缝隙（米）：相邻墙带之间的浮点误差。 */
const STACK_GAP = 0.02
/** 墙线端点的量化步长（米），同一面墙各层墙带的投影落到同一个键上。 */
const SEGMENT_KEY_STEP = 0.01
/**
 * 忽略比这更近的墙命中（米）。
 *
 * 灯带贴墙安装时起点会擦到墙面三角网，第一下命中只有几厘米；当真遮挡会把同房间
 * 乘成 0。阈值必须小于墙厚（默认 0.2 m），否则会把整堵墙「看穿」漏到隔壁。
 */
const MIN_WALL_HIT = 0.05

type Elements = ArrayLike<number>

export interface StripVisibilityLight {
  uuid?: string
  width?: number
  matrixWorld?: { elements: Elements }
  userData?: Record<string, unknown>
}

interface StripVisibilityMesh {
  isMesh?: boolean
  userData?: Record<string, unknown>
}

/** 灯带在图集里的行号。 */
export interface StripVisibilityTile {
  tile: number
}

interface StripTexture {
  image: { data: Float32Array }
  minFilter: number
  magFilter: number
  generateMipmaps: boolean
  needsUpdate: boolean
  dispose(): void
}

interface FloorRecord {
  meshes: OccluderMesh[]
  segments: Float32Array | null
  signature: string
}

interface TileRecord extends StripVisibilityTile {
  key: string
}

type StripVisibilityThree = Pick<VisibilityThree, 'Vector3' | 'Matrix4'> & {
  Vector2: new (x: number, y: number) => { x: number; y: number; set(x: number, y: number): unknown }
  DataTexture: new (data: Float32Array, width: number, height: number, format: number, type: number) => StripTexture
  RGBAFormat: number
  FloatType: number
  NearestFilter: number
}

/** 墙线的键：端点量化后按字典序排好，两个方向投影出来的同一条线落到同一个键。 */
function segmentKey(triangles: number[], offset: number) {
  const q = (value: number) => Math.round(value / SEGMENT_KEY_STEP),
    a = `${q(triangles[offset])},${q(triangles[offset + 1])}`,
    b = `${q(triangles[offset + 2])},${q(triangles[offset + 3])}`
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

/** 高度区间按下沿排序后，从地面起连续覆盖到的最高点。 */
function contiguousTop(intervals: number[][], floorY: number) {
  intervals.sort((first, second) => first[0] - second[0])
  if (intervals[0][0] > floorY + FLOOR_TOLERANCE) return floorY
  let top = floorY
  for (const [bottom, upper] of intervals) {
    if (bottom > top + STACK_GAP) break
    top = Math.max(top, upper)
  }
  return top
}

/**
 * 本层墙带投影成 `[ax, az, bx, bz]` 线段。
 *
 * 编辑器的墙是一层层 0.2 m 高的墙带叠起来的（每层一个网格），单个三角形永远不够高；
 * 所以先把投影到同一条墙线上的三角形高度区间合并，再判断是否「从地面起连续够高」。
 */
function collectStackedSegments(meshes: OccluderMesh[], scratch: Scratch) {
  const triangles: number[] = [],
    lines = new Map<string, { offset: number; intervals: number[][] }>(),
    segments: number[] = []
  for (const mesh of meshes) projectMeshTriangles(mesh, null, scratch, triangles)
  let floorY = Infinity
  for (let offset = 0; offset < triangles.length; offset += 6) floorY = Math.min(floorY, triangles[offset + 4])
  for (let offset = 0; offset < triangles.length; offset += 6) {
    if (triangles[offset + 5] - triangles[offset + 4] < STACK_GAP) continue
    const key = segmentKey(triangles, offset),
      line = lines.get(key) || { offset, intervals: [] }
    line.intervals.push([triangles[offset + 4], triangles[offset + 5]])
    lines.set(key, line)
  }
  for (const { offset, intervals } of lines.values())
    if (contiguousTop(intervals, floorY) - floorY >= MIN_OCCLUDER_HEIGHT - STACK_GAP)
      segments.push(...triangles.slice(offset, offset + 4))
  return new Float32Array(segments)
}

/** 墙带世界矩阵的签名：楼层堆叠 / 旋转户型时变化，线段要重新投影。 */
function meshesSignature(meshes: OccluderMesh[]) {
  const first = meshes[0] as (OccluderMesh & { matrixWorld: { elements?: Elements } }) | undefined,
    elements = first?.matrixWorld?.elements
  if (!elements) return String(meshes.length)
  return [meshes.length, elements[0], elements[2], elements[12], elements[13], elements[14]]
    .map((value) => Number(value).toFixed(3))
    .join(',')
}

/**
 * 灯带的射线起点（世界 xz）：中心 + 两端（各往里收一点）；竖装灯带两端在同一竖线上，只留中心。
 * 起点沿出光方向的水平分量前移一点，避免贴墙安装时起点落进墙体。
 */
export function stripRayOrigins(elements: Elements, width: number) {
  const axisX = elements[0],
    axisY = elements[1],
    axisZ = elements[2],
    axisLength = Math.hypot(axisX, axisY, axisZ) || 1,
    emitX = -elements[8],
    emitZ = -elements[10],
    emitHorizontal = Math.hypot(emitX, emitZ),
    liftX = emitHorizontal > 0.2 ? (emitX / emitHorizontal) * STRIP_ORIGIN_LIFT : 0,
    liftZ = emitHorizontal > 0.2 ? (emitZ / emitHorizontal) * STRIP_ORIGIN_LIFT : 0,
    centerX = elements[12] + liftX,
    centerZ = elements[14] + liftZ,
    halfLength = Math.max(Number(width) || 0, 0) / 2,
    inset = Math.max(halfLength - STRIP_END_INSET, halfLength * 0.5),
    endX = (axisX / axisLength) * inset,
    endZ = (axisZ / axisLength) * inset
  if (Math.hypot(endX, endZ) < 0.05) return [[centerX, centerZ]]
  return [
    [centerX, centerZ],
    [centerX - endX, centerZ - endZ],
    [centerX + endX, centerZ + endZ],
  ]
}

/** 从起点沿 `(dirX, dirZ)` 出发第一次碰到墙线的距离；碰不到返回 `STRIP_NO_HIT`。 */
function firstWallHit(segments: ArrayLike<number>, origin: number[], dirX: number, dirZ: number) {
  let nearest = STRIP_NO_HIT
  for (let offset = 0; offset < segments.length; offset += 4) {
    const ax = segments[offset],
      az = segments[offset + 1],
      segmentX = segments[offset + 2] - ax,
      segmentZ = segments[offset + 3] - az,
      denominator = dirX * segmentZ - dirZ * segmentX
    if (Math.abs(denominator) < 1e-9) continue
    const toStartX = ax - origin[0],
      toStartZ = az - origin[1],
      alongRay = (toStartX * segmentZ - toStartZ * segmentX) / denominator,
      alongSegment = (toStartX * dirZ - toStartZ * dirX) / denominator
    // 比墙厚还近的命中几乎一定是「起点落在墙里」，不能拿来挡同房间的光。
    if (alongRay > MIN_WALL_HIT && alongRay < nearest && alongSegment >= 0 && alongSegment <= 1) nearest = alongRay
  }
  return nearest
}

/** 第 `bin` 格的方位角（弧度，`atan2(z, x)` 的取值范围 [-π, π]，取格子中心）。 */
function stripBinAngle(bin: number) {
  return ((bin + 0.5) / STRIP_VISIBILITY_ANGLES) * 2 * Math.PI - Math.PI
}

/** 画一行：表头写起点和影响半径，各分格的 r/g/b 写三个起点的碰墙距离。 */
function paintStripRow(
  data: Float32Array,
  row: number,
  origins: number[][],
  segments: ArrayLike<number>,
  radius: number,
) {
  const base = row * STRIP_VISIBILITY_WIDTH * 4
  data.fill(0, base, base + STRIP_VISIBILITY_WIDTH * 4)
  origins.forEach(([x, z], index) => {
    const header = base + index * 2
    ;(data[header] = x), (data[header + 1] = z)
  })
  ;(data[base + 6] = origins.length), (data[base + 7] = radius)
  for (let bin = 0; bin < STRIP_VISIBILITY_ANGLES; bin++) {
    const angle = stripBinAngle(bin),
      dirX = Math.cos(angle),
      dirZ = Math.sin(angle),
      texel = base + (STRIP_VISIBILITY_HEADER + bin) * 4
    origins.forEach((origin, index) => (data[texel + index] = firstWallHit(segments, origin, dirX, dirZ)))
  }
}

function influenceRadius(light: StripVisibilityLight) {
  const radius = Number(light.userData?.stripInfluenceRadius)
  return Number.isFinite(radius) && radius > 0 ? Math.min(radius, STRIP_MAX_INFLUENCE) : STRIP_MAX_INFLUENCE
}

/** 本层墙带线段；墙的世界矩阵变了就重新投影，并让所有行重画。 */
function floorSegments(record: FloorRecord | undefined, scratch: Scratch, invalidateTiles: () => void) {
  if (!record?.meshes.length) return null
  const signature = meshesSignature(record.meshes)
  if (!record.segments || record.signature !== signature) {
    ;(record.segments = collectStackedSegments(record.meshes, scratch)), (record.signature = signature)
    invalidateTiles()
  }
  return record.segments.length ? record.segments : null
}

/** 灯带位姿或影响半径变了才重画它那一行；返回是否画过。 */
function repaintLightRow(
  data: Float32Array,
  tile: TileRecord,
  light: StripVisibilityLight,
  elements: Elements,
  segments: Float32Array,
) {
  const width = Number(light.width) || 0,
    radius = influenceRadius(light),
    origins = stripRayOrigins(elements, width),
    // 出光轴 / 长度轴也进缓存键：原地扭转而不动中心时也要重画。
    key = [radius, elements[0], elements[2], elements[8], elements[10], ...origins.flat()]
      .map((v) => Number(v).toFixed(3))
      .join(',')
  if (tile.key === key) return false
  tile.key = key
  const reach = radius + width / 2 + STRIP_ORIGIN_LIFT,
    [centerX, centerZ] = origins[0]
  paintStripRow(
    data,
    tile.tile,
    origins,
    segmentsWithin(segments, [centerX - reach, centerX + reach, centerZ - reach, centerZ + reach]),
    radius,
  )
  return true
}

function createBlankTexture(THREE: StripVisibilityThree, width: number, height: number) {
  const texture = new THREE.DataTexture(
    new Float32Array(width * height * 4),
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType,
  )
  ;(texture.minFilter = texture.magFilter = THREE.NearestFilter),
    (texture.generateMipmaps = false),
    (texture.needsUpdate = true)
  return texture
}

/** 一行一条灯带的浮点图集：放不下时容量翻倍（受最大纹理边长限制），换纹理后由调用方重画。 */
function createRowAtlas(THREE: StripVisibilityThree, renderer: VisibilityRenderer | null | undefined) {
  const maxTextureSize = Number(renderer?.capabilities?.maxTextureSize) || 4096,
    maxCapacity = maxTextureSize >= STRIP_VISIBILITY_WIDTH ? maxTextureSize : 0,
    // 先挂 1×1 占位图：材质编译时 sampler 不能是 null，否则 WebGL 报警、个别驱动整段面光丢掉。
    // layout.x = 0 时着色器仍跳过遮挡采样。
    texture = { value: createBlankTexture(THREE, 1, 1) as StripTexture | null },
    /** x = 行数（0 = 不做遮挡），y = 方位角分格数。 */
    layout = { value: new THREE.Vector2(0, STRIP_VISIBILITY_ANGLES) }
  let capacity = 0
  return {
    texture,
    layout,
    /** 返回 true 表示已经换了一张新纹理。 */
    grow(required: number) {
      const nextCapacity = Math.min(maxCapacity, Math.max(4, capacity * 2, required))
      if (required <= capacity || nextCapacity < required) return false
      texture.value?.dispose()
      ;(texture.value = createBlankTexture(THREE, STRIP_VISIBILITY_WIDTH, nextCapacity)),
        (capacity = nextCapacity),
        layout.value.set(capacity, STRIP_VISIBILITY_ANGLES)
      return true
    },
    fits: (required: number) => required <= capacity,
    dispose() {
      // 仍挂 1×1 占位：材质可能晚一帧才拆，sampler 不能回到 null。
      texture.value?.dispose()
      ;(texture.value = createBlankTexture(THREE, 1, 1)), (capacity = 0)
      layout.value.set(0, STRIP_VISIBILITY_ANGLES)
    },
  }
}

export function createStripWallVisibility(
  THREE: StripVisibilityThree,
  renderer: VisibilityRenderer | null | undefined,
  ltc: { ltc1: unknown; ltc2: unknown } = { ltc1: null, ltc2: null },
) {
  const floors = new Map<string, FloorRecord>(),
    tiles = new Map<string, TileRecord>(),
    scratch: Scratch = { vertex: new THREE.Vector3(), matrix: new THREE.Matrix4() },
    atlas = createRowAtlas(THREE, renderer),
    invalidateTiles = () => tiles.forEach((tile) => (tile.key = ''))

  /** 这盏灯的行；新灯放不下图集时返回 null。 */
  function tileFor(light: StripVisibilityLight) {
    const lightKey = String(light.uuid || ''),
      existing = tiles.get(lightKey)
    if (existing) return existing
    if (!atlas.fits(tiles.size + 1)) {
      if (!atlas.grow(tiles.size + 1)) return null
      invalidateTiles()
    }
    const tile: TileRecord = { tile: tiles.size, key: '' }
    tiles.set(lightKey, tile)
    return tile
  }

  return {
    /** 面光要用的全部 uniform：LTC 查找表 + 遮挡距离图集。 */
    uniforms: {
      userLtc1: { value: ltc.ltc1 },
      userLtc2: { value: ltc.ltc2 },
      userStripVisibility: atlas.texture,
      userStripVisibilityLayout: atlas.layout,
    },
    /** 场景结构变了（楼层缓冲重扫时调用）：按楼层重收墙带，丢掉所有行分配。 */
    prepare(meshes: ReadonlyArray<{ object: StripVisibilityMesh; floor: string }>) {
      floors.clear(), tiles.clear()
      for (const { object, floor } of meshes) {
        if (object.userData?.lightOccluder !== true) continue
        let record = floors.get(floor)
        if (!record) floors.set(floor, (record = { meshes: [], segments: null, signature: '' }))
        record.meshes.push(object as unknown as OccluderMesh)
      }
    },
    /** 取（必要时重画）一条灯带的行；null 表示不做墙体遮挡（本层没有墙、图集放不下）。 */
    lookup(light: StripVisibilityLight, floorId: string): StripVisibilityTile | null {
      const elements = light.matrixWorld?.elements,
        segments = elements ? floorSegments(floors.get(floorId), scratch, invalidateTiles) : null,
        tile = segments ? tileFor(light) : null,
        texture = atlas.texture.value
      if (!elements || !segments || !tile || !texture) return null
      if (repaintLightRow(texture.image.data, tile, light, elements, segments)) texture.needsUpdate = true
      return tile
    },
    dispose() {
      atlas.dispose(), floors.clear(), tiles.clear()
    },
  }
}
