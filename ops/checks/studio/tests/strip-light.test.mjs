/**
 * 灯带口径（`strip-light-spec`）与墙体可见性图（`strip-wall-visibility`）的契约测试。
 *
 * 失败模式全是视觉上的：灯带朝错方向、读旧档后翻了个面、亮度随照射范围乱跳、
 * 隔壁房间被照亮。这里把安装方式 → 出光方向、旧档迁移、建议高度和可见性瓦片钉死。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fileURLToPath } from 'node:url'

const moduleUrl = (relativePath) =>
  fileURLToPath(
    new URL(
      `../../../../homeos/frontend/src/studio/app/3d-studio/authoring/lights/strip-light/${relativePath}`,
      import.meta.url,
    ),
  )
const spec = await import(moduleUrl('strip-light-spec.ts'))
const { createStripWallVisibility, stripRayOrigins, STRIP_VISIBILITY_ANGLES, STRIP_VISIBILITY_HEADER } = await import(
  moduleUrl('strip-wall-visibility.ts')
)

const near = (actual, expected, message) =>
  assert.ok(
    actual.every((value, index) => Math.abs(value - expected[index]) < 1e-9),
    `${message}: ${actual} ≠ ${expected}`,
  )

test('每种安装方式的出光方向和长度轴', () => {
  const expectations = {
    'ceiling-down': [
      [1, 0, 0],
      [0, -1, 0],
    ],
    'under-cabinet': [
      [1, 0, 0],
      [0, -1, 0],
    ],
    'cove-up': [
      [1, 0, 0],
      [0, 1, 0],
    ],
    'wall-wash': [
      [1, 0, 0],
      [0, 0, -1],
    ],
    vertical: [
      [0, 1, 0],
      [1, 0, 0],
    ],
  }
  for (const [stripMount, [lengthAxis, emitDirection]] of Object.entries(expectations)) {
    const pose = spec.stripLightPose({ stripMount, width: 2 })
    near(pose.lengthAxis, lengthAxis, `${stripMount} 长度轴`)
    near(pose.emitDirection, emitDirection, `${stripMount} 出光`)
    assert.equal(pose.standing, stripMount === 'vertical')
  }
  // 竖装以顶端为锚点向下延伸一个长度。
  assert.ok(Math.abs(spec.stripLightPose({ stripMount: 'vertical', width: 2 }).center[1] + 1) < 1e-9)
})

test('自定义安装沿用旧的「倾斜 → 翻滚 → 朝下」公式', () => {
  near(spec.stripLightPose({ stripMount: 'custom' }).emitDirection, [0, -1, 0], '无倾斜无翻滚 = 朝下')
  near(spec.stripLightPose({ stripMount: 'custom', stripRollRotation: 90 }).emitDirection, [0, 0, -1], '翻滚 90°')
  const tilted = spec.stripLightPose({ stripMount: 'custom', verticalRotation: 30 })
  near(tilted.lengthAxis, [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0], '倾斜后长度轴抬起')
})

test('旧档迁移：直角翻滚落到对应安装方式，其余保持自定义', () => {
  const migrate = (fields) => spec.migrateLegacyStripPose({ rotation: 30, elevation: 2.7, ...fields })
  assert.equal(migrate({}).stripMount, 'ceiling-down')
  assert.equal(migrate({ elevation: 1.2 }).stripMount, 'under-cabinet', '低于 1.8m 的朝下灯带是柜底灯')
  assert.equal(migrate({ stripRollRotation: 180 }).stripMount, 'cove-up')
  assert.equal(migrate({ stripRollRotation: 90 }).stripMount, 'wall-wash')
  const reverseWash = migrate({ stripRollRotation: 270 })
  assert.deepEqual([reverseWash.stripMount, reverseWash.rotation], ['wall-wash', 210], '反向洗墙并进平面旋转')
  const standing = migrate({ stripAxis: 'vertical', stripRollRotation: 90 })
  assert.deepEqual([standing.stripMount, standing.rotation, standing.stripAxis], ['vertical', 300, 'vertical'])
  assert.equal(migrate({ verticalRotation: 15 }).stripMount, 'custom')
  assert.equal(migrate({ stripRollRotation: 45 }).stripMount, 'custom')
})

test('旧档迁移前后世界出光方向一致（含立装与反向洗墙）', () => {
  // 物件组绕 Y 转 -rotation，与 `applyStripPose` / 平面旋转同口径。
  const worldEmit = (item) => {
    const [x, y, z] = spec.stripLightPose(item).emitDirection,
      angle = (-Number(item.rotation) * Math.PI) / 180
    return [x * Math.cos(angle) + z * Math.sin(angle), y, -x * Math.sin(angle) + z * Math.cos(angle)]
  }
  for (const legacy of [
    { rotation: 30, stripRollRotation: 270 },
    { rotation: 30, stripRollRotation: 90 },
    { rotation: 70, stripRollRotation: 180 },
    { rotation: 10, stripRollRotation: 120, stripAxis: 'vertical' },
  ]) {
    const custom = { ...legacy, stripMount: 'custom' },
      migrated = { ...legacy, ...spec.migrateLegacyStripPose(legacy) }
    near(worldEmit(migrated), worldEmit(custom), JSON.stringify(legacy))
  }
})

test('读档收拢：非自定义安装把旧字段改回该安装方式的值', () => {
  const record = spec.normalizeStripPoseRecord({ stripMount: 'wall-wash', stripRollRotation: 12, verticalRotation: 40 })
  assert.deepEqual(
    [record.stripMount, record.stripRollRotation, record.verticalRotation, record.stripAxis],
    ['wall-wash', 90, 0, 'horizontal'],
  )
  const custom = spec.normalizeStripPoseRecord({ stripMount: 'custom', stripRollRotation: 12 })
  assert.equal(custom.stripRollRotation, 12, '自定义保留原数据')
  assert.equal(spec.normalizeStripPoseRecord({ stripMount: 'bogus' }).stripMount, 'ceiling-down', '无效值按旧档迁移')
})

test('切换安装方式按层高给建议离地高度，同一安装方式不改高度', () => {
  const item = { stripMount: 'ceiling-down', elevation: 2.5 }
  assert.equal(spec.applyStripMountSelection(item, 'cove-up', 2.8), true)
  assert.deepEqual([item.elevation, item.stripRollRotation], [2.65, 180])
  item.elevation = 2.4
  assert.equal(spec.applyStripMountSelection(item, 'cove-up', 2.8), false)
  assert.equal(item.elevation, 2.4)
  assert.equal(spec.suggestedStripElevation('custom', 2.8), null)
  assert.equal(spec.suggestedStripElevation('ceiling-down', 99), 6 - 0.02, '层高夹在 6m 内')
})

test('亮度只跟光通量和发光面有关：照射范围、离地高度不影响', () => {
  const base = { width: 2, depth: 0.28, lightBrightness: 80 }
  const reference = spec.stripLightIntensity(base)
  assert.ok(reference > 0)
  assert.equal(spec.stripLightIntensity({ ...base, lightRange: 9, elevation: 0.5 }), reference)
  assert.equal(spec.stripLuminance({ ...base, width: 4 }), spec.stripLuminance(base), '加长灯带亮度不变')
  assert.equal(spec.stripLightIntensity({ ...base, lightBrightness: 0 }), 0)
  const size = spec.stripLightSize({ width: 99, depth: 0 })
  assert.deepEqual([size.length, size.width], [8, 0.1])
})

test('导出字段带安装方式和出光方向', () => {
  const fields = spec.stripExportFields({ stripMount: 'wall-wash', width: 3, depth: 0.2 })
  assert.equal(fields.stripMount, 'wall-wash')
  assert.deepEqual(fields.emitDirection, { x: 0, y: 0, z: -1 })
  assert.equal(fields.stripLength, 3)
})

// ── 墙体可见性 ────────────────────────────────────────────────────────────
/** 一段沿 z 方向的墙：x ∈ [-0.075, 0.075]。 */
function wallMesh(zMin, zMax, bottom = 0, top = 2.8) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, top - bottom, zMax - zMin))
  mesh.position.set(0, (top + bottom) / 2, (zMin + zMax) / 2)
  mesh.userData.lightOccluder = true
  mesh.updateMatrixWorld(true)
  return mesh
}

/** 吸顶朝下的灯带，位于墙左侧 x = -1.5。 */
function stripLight(x = -1.5, z = 0) {
  const light = new THREE.RectAreaLight(0xffffff, 1, 2, 0.2)
  light.position.set(x, 2.7, z)
  light.lookAt(x, 0, z)
  light.updateMatrixWorld(true)
  light.userData.stripInfluenceRadius = 5
  return light
}

/** 与着色器 `userFloorAreaVisibility` 相同的判定（不含法线偏移），返回 0~1。 */
function visibleAt(visibility, tile, x, z) {
  const width = (STRIP_VISIBILITY_HEADER + STRIP_VISIBILITY_ANGLES) * 4,
    data = visibility.uniforms.userStripVisibility.value.image.data,
    base = tile.tile * width,
    count = data[base + 6],
    smooth = (edge0, edge1, value) => {
      const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1)
      return t * t * (3 - 2 * t)
    }
  let visible = 0
  for (let index = 0; index < count; index++) {
    const ox = data[base + index * 2],
      oz = data[base + index * 2 + 1],
      distance = Math.hypot(x - ox, z - oz),
      position = ((Math.atan2(z - oz, x - ox) + Math.PI) / (2 * Math.PI)) * STRIP_VISIBILITY_ANGLES - 0.5,
      lower = Math.floor(position),
      binVisibility = (bin) => {
        const wrapped = (bin + STRIP_VISIBILITY_ANGLES) % STRIP_VISIBILITY_ANGLES,
          hit = data[base + (STRIP_VISIBILITY_HEADER + wrapped) * 4 + index]
        return 1 - smooth(hit + 0.02, hit + 0.12, distance)
      }
    visible = Math.max(
      visible,
      binVisibility(lower) + (binVisibility(lower + 1) - binVisibility(lower)) * (position - lower),
    )
  }
  return visible
}

const renderer = { capabilities: { maxTextureSize: 4096 } }

test('墙后不可见，灯带所在房间可见', () => {
  const visibility = createStripWallVisibility(THREE, renderer)
  visibility.prepare([{ object: wallMesh(-4, 4), floor: 'f1' }])
  const tile = visibility.lookup(stripLight(), 'f1')
  assert.ok(tile)
  assert.equal(visibleAt(visibility, tile, -1.5, 1), 1, '灯带下方')
  assert.equal(visibleAt(visibility, tile, -0.1, -1), 1, '同侧墙根')
  assert.equal(visibleAt(visibility, tile, 1.5, 0), 0, '墙后')
  assert.equal(visibility.uniforms.userStripVisibilityLayout.value.y, STRIP_VISIBILITY_ANGLES)
})

test('起点擦到墙面时同侧房间仍要亮（近距自撞不算遮挡）', () => {
  const visibility = createStripWallVisibility(THREE, renderer)
  visibility.prepare([{ object: wallMesh(-4, 4), floor: 'f1' }])
  // 墙左侧表皮在 x=-0.075；灯紧贴表皮，模拟贴墙安装时射线擦到墙面三角网。
  // 这里只钉死「同侧不能被乘成 0」；贴墙时墙后判定对 2D 线段投影过于敏感，另有专测覆盖。
  const tile = visibility.lookup(stripLight(-0.09), 'f1')
  assert.ok(tile)
  assert.ok(visibleAt(visibility, tile, -1.5, 0) > 0.5, '同侧房间必须看得见')
})

test('紧贴墙背面的地板和墙面一点光都不漏（0.2m 墙比旧网格的格子还薄）', () => {
  const visibility = createStripWallVisibility(THREE, renderer)
  visibility.prepare([{ object: wallMesh(-4, 4), floor: 'f1' }])
  const tile = visibility.lookup(stripLight(), 'f1')
  for (let z = -3; z <= 3; z += 0.05) {
    assert.equal(visibleAt(visibility, tile, 0.08, z), 0, `墙背面 z=${z.toFixed(2)}`)
    assert.equal(visibleAt(visibility, tile, 0.2, z), 0, `墙背面 0.2m 处 z=${z.toFixed(2)}`)
  }
})

test('编辑器墙体是 0.2m 一段叠起来的，叠满到 1.2m 以上才算遮挡', () => {
  const bands = [],
    lowBands = []
  for (let bottom = 0; bottom < 2.8 - 1e-6; bottom += 0.2) bands.push(wallMesh(-4, 4, bottom, bottom + 0.2))
  for (let bottom = 0; bottom < 1 - 1e-6; bottom += 0.2) lowBands.push(wallMesh(-4, 4, bottom, bottom + 0.2))
  const visibility = createStripWallVisibility(THREE, renderer)
  visibility.prepare(bands.map((object) => ({ object, floor: 'f1' })))
  const tile = visibility.lookup(stripLight(), 'f1')
  assert.ok(tile, '分段墙也能生成遮挡行')
  assert.equal(visibleAt(visibility, tile, -1.5, 1), 1)
  assert.equal(visibleAt(visibility, tile, 1.5, 0), 0, '分段墙后面不可见')
  const low = createStripWallVisibility(THREE, renderer)
  low.prepare(lowBands.map((object) => ({ object, floor: 'f1' })))
  assert.equal(low.lookup(stripLight(), 'f1'), null, '矮墙不挡')
})

test('行按灯带复用，没变化时不重画；本层没墙时不做遮挡', () => {
  const visibility = createStripWallVisibility(THREE, renderer)
  visibility.prepare([{ object: wallMesh(-4, 4), floor: 'f1' }])
  const light = stripLight(),
    first = visibility.lookup(light, 'f1'),
    texture = visibility.uniforms.userStripVisibility.value,
    versionAfterPaint = texture.version
  assert.equal(visibility.lookup(light, 'f1'), first, '同一盏灯同一行')
  assert.equal(texture.version, versionAfterPaint, '没变化不重传')
  assert.equal(visibility.lookup(stripLight(-1.5, 1), 'f1').tile, 1, '第二盏灯分到下一行')
  assert.equal(visibility.lookup(light, 'f2'), null)
  visibility.dispose()
  // dispose 后仍挂 1×1 占位图，避免材质晚拆时 sampler 落到 null。
  assert.ok(visibility.uniforms.userStripVisibility.value)
  assert.equal(visibility.uniforms.userStripVisibilityLayout.value.x, 0)
})

test('射线起点：中心加两端（往里收 0.1m 免得落进端墙），洗墙灯带起点离开墙面', () => {
  const light = stripLight()
  const origins = stripRayOrigins(light.matrixWorld.elements, 2)
  assert.equal(origins.length, 3)
  const endDistance = Math.hypot(origins[1][0] - origins[2][0], origins[1][1] - origins[2][1])
  assert.ok(Math.abs(endDistance - 1.8) < 1e-6, '两端沿长度轴相距 2m - 2×0.1m')
  const wash = new THREE.RectAreaLight(0xffffff, 1, 2, 0.2)
  wash.position.set(0, 2.5, 0)
  wash.lookAt(1, 2.5, 0)
  wash.updateMatrixWorld(true)
  assert.ok(stripRayOrigins(wash.matrixWorld.elements, 2)[0][0] > 0.04, '沿出光方向前移')
})
