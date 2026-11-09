/**
 * 区域灯（轻量柔光）墙体遮挡的契约测试。
 *
 * 失败模式都是视觉上的：灯光穿墙照进隔壁房间、门洞被过梁堵死、墙根一圈发暗。
 * 这里用真实的 three 几何把这三条钉死。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fileURLToPath } from 'node:url'

const { createRegionWallVisibility, WALL_VISIBILITY_SIZE } = await import(
  fileURLToPath(
    new URL(
      '../../../../homeos/frontend/src/studio/app/3d-studio/plan/studio-region-wall-visibility.ts',
      import.meta.url,
    ),
  )
)
const { buildShaderChunk } = await import(
  fileURLToPath(
    new URL(
      '../../../../homeos/frontend/src/studio/app/3d-studio/plan/studio-plan2-region-light-data.ts',
      import.meta.url,
    ),
  )
)

const renderer = { capabilities: { maxTextureSize: 4096, maxTextures: 16 } }

/** 一段沿 z 方向的墙：x ∈ [-0.075, 0.075]，y ∈ [bottom, top]，z ∈ [zMin, zMax]。 */
function wallMesh(zMin, zMax, bottom = 0, top = 2.8) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15, top - bottom, zMax - zMin))
  mesh.position.set(0, (top + bottom) / 2, (zMin + zMax) / 2)
  mesh.userData.lightOccluder = true
  return mesh
}

const region = (lampX, lampZ, size = 6) => ({
  center: [lampX, 2.7, lampZ],
  lampCenter: [lampX, 2.7, lampZ],
  width: size,
  depth: size,
  defaults: { axis: [1, 0] },
})

function visibilityAt(visibility, halfSize, area, x, z) {
  const cell = (halfSize * 2) / WALL_VISIBILITY_SIZE,
    column = Math.floor((x - (area.center[0] - halfSize)) / cell),
    row = Math.floor((z - (area.center[2] - halfSize)) / cell)
  return visibility.texture.image.data[row * WALL_VISIBILITY_SIZE + column]
}

function setup(meshes) {
  const controller = createRegionWallVisibility(THREE, renderer)
  assert.equal(controller.resize('f1', 16), true)
  for (const mesh of meshes) controller.addOccluder(mesh, 'f1')
  return controller
}

test('墙后被挡住，同侧照亮，墙根同侧不发暗', () => {
  const controller = setup([wallMesh(-4, 4)]),
    area = region(-1.5, 0),
    halfSize = controller.update('f1', 0, area, null)
  assert.ok(halfSize > 0)
  const texture = { texture: controller.uniform('f1').value }
  assert.equal(visibilityAt(texture, halfSize, area, -1.5, 0.5), 255, '灯所在房间')
  assert.equal(visibilityAt(texture, halfSize, area, -0.2, 1), 255, '同侧墙根')
  assert.equal(visibilityAt(texture, halfSize, area, 1.5, 0), 0, '墙后房间')
  assert.equal(visibilityAt(texture, halfSize, area, 0.6, 1.5), 0, '墙后紧贴墙根')
})

test('门洞上方的过梁不挡光，矮于 1.2m 的墙不挡光', () => {
  const controller = setup([
      wallMesh(-4, -0.5),
      wallMesh(0.5, 4),
      wallMesh(-0.5, 0.5, 2.1, 2.8), // 门洞过梁
    ]),
    area = region(-1.5, 0),
    halfSize = controller.update('f1', 0, area, null),
    texture = { texture: controller.uniform('f1').value }
  assert.equal(visibilityAt(texture, halfSize, area, 1.2, 0), 255, '穿过门洞')
  assert.equal(visibilityAt(texture, halfSize, area, 1.5, 2.5), 0, '门洞旁的实墙仍挡光')

  const lowWall = setup([wallMesh(-4, -0.5), wallMesh(0.5, 4), wallMesh(-0.5, 0.5, 0, 0.9)])
  const lowHalf = lowWall.update('f1', 0, area, null)
  assert.equal(visibilityAt({ texture: lowWall.uniform('f1').value }, lowHalf, area, 1.2, 0), 255)
})

test('没有墙体或纹理不可用时返回 0（着色器跳过遮挡）', () => {
  const noWalls = createRegionWallVisibility(THREE, renderer)
  noWalls.resize('f1', 16)
  assert.equal(noWalls.update('f1', 0, region(0, 0), null), 0)
  const tooBig = createRegionWallVisibility(THREE, { capabilities: { maxTextureSize: 256, maxTextures: 16 } })
  assert.equal(tooBig.resize('f1', 16), false)
})

test('着色器按开关编入可见性采样，且沿法线偏移采样点', () => {
  const group = { capacity: 16, textureMode: false, gridSupported: false, visibilitySupported: true }
  const chunk = buildShaderChunk(group)
  assert.match(chunk, /#define PLAN2_WALL_VISIBILITY 1/)
  assert.match(chunk, /uniform sampler2D plan2Visibility;/)
  assert.match(chunk, /layoutNormal\.xz \* \(visibilityHalf \* 1\.5/)
  assert.match(buildShaderChunk({ ...group, visibilitySupported: false }), /#define PLAN2_WALL_VISIBILITY 0/)
})
