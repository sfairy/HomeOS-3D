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
import * as THREE from '/static/vendor/three/0.187.0/three.module.min.js'
import {
  type StripLightLike,
  stripInfluenceRadius,
  stripLightIntensity,
  stripLightPose,
  stripLightSize,
  stripLuminance,
} from './strip-light-spec'

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
