/**
 * 墙体闭壳（wall shell）契约测试。
 *
 * 这一轮修的四类现场问题都是**静默失败**（不会抛异常，只是难看），所以把可静态
 * 断言的点钉死：
 *
 * 1. 洞口上沿必须有底盖（soffit）：以前每个体块只补了顶盖，门/窗上方的墙块底面
 *    是通的，斜看就是一条能望进墙体内部的缝；
 * 2. 顶盖膜浓度必须等于 `wallFilmOpacity(wallOpacity)`：墙面是双面壳（两层膜），
 *    顶盖是单层平面，以前乘 1.08 就比墙面淡一档；
 * 3. 窗框深度必须按墙厚收口：以前写死 60mm，200mm 的墙两侧各留 70mm 空腔；
 * 4. 并集失败时不得把重叠环原样丢给挤出（会叠出亮边），只允许丢掉被包住的环。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const frontendRoot = fileURLToPath(new URL('../../../../homeos/frontend/src/studio/app/3d-studio/', import.meta.url))
const readModule = (relative) => readFileSync(join(frontendRoot, relative), 'utf8')
const importModule = (relative) => import(pathToFileURL(join(frontendRoot, relative)).href)

const wallShellSource = readModule('authoring/scene/studio-wall-shell.ts')
const wallTopSource = readModule('authoring/scene/studio-wall-top.ts')
const wallsSource = readModule('authoring/scene/studio-walls.ts')
// 按高度层的墙带 / 顶盖 / soffit / 高亮层已切到 studio-wall-levels，断言跟着走。
const wallLevelsSource = readModule('authoring/scene/studio-wall-levels.ts')

test('顶盖膜浓度与墙面等效膜厚一致', async () => {
  const { wallFilmOpacity } = await importModule('materials/studio-wall-finish.ts')

  // 0.36 → 1-(1-0.36)² = 0.5904
  assert.ok(Math.abs(wallFilmOpacity(0.36) - 0.5904) < 1e-9)
  assert.equal(wallFilmOpacity(1), 1)
  assert.equal(wallFilmOpacity(0), 0)

  // studio-wall-top 顶部 import 了 vendor three，node 侧无法直接执行；
  // 这里钉住的是「浓度只走 wallFilmOpacity」这一条事实，够用且不受实现细节影响。
  assert.ok(
    wallTopSource.includes('wallFilmOpacity(wallTopOpacity)'),
    '顶盖浓度必须走 wallFilmOpacity，不得再乘经验系数',
  )
  assert.ok(!/filmScale|filmCap/.test(wallTopSource), '顶盖不得再保留 filmScale / filmCap 的经验缩放')
})

test('洞口底盖（soffit）与顶盖共用同一套盖面逻辑', () => {
  assert.ok(wallShellSource.includes("facing === 'up' ? 'top' : 'soffit'"), 'soffit 必须受 ?wall-debug=soffit 控制')
  assert.ok(/facing === 'up' \? 0\.0005 : -0\.0005/.test(wallShellSource), '底盖要贴在边界下方，避免和顶盖 z-fighting')
  assert.ok(
    wallLevelsSource.includes('wallVolume.bottom > LEVEL_EPSILON'),
    '只有悬空体块（洞口上方的过梁）才需要底盖，落地墙不要和楼板打架',
  )
  assert.ok(
    wallLevelsSource.includes('Math.abs(wallVolume.bottom - height) <= LEVEL_EPSILON'),
    '底盖必须画在「本层下界」那一层，不能画到别的楼层高度上',
  )
})

test('墙脚对齐楼板面', () => {
  assert.ok(
    wallLevelsSource.includes('Math.min(lowerWallLevel, floorSurfaceY)'),
    '最底层墙带要向下吃到楼板面，否则墙脚有一条 8mm 的亮缝',
  )
})

test('墙体去重键包含 wallId', () => {
  assert.ok(
    wallsSource.includes('currentWall.id,\n        canonicalPolygonKey2(jv2, 4)'),
    '两段共线的独立墙不能被判成同一块体',
  )
})

test('竖向渐变按每段墙自己的高度归一化', () => {
  assert.ok(
    wallLevelsSource.includes('heightSpan: group.volumes[0]?.wallHeight'),
    '矮墙要传自己的高度，否则墙根渐变走不满',
  )
  assert.ok(wallsSource.includes('wallBandOptions.heightSpan'), 'buildWallBandMesh 必须读取 heightSpan')
})

test('窗框深度按墙厚收口（普通窗 / 自定义窗 / 门套）', async () => {
  const { windowGeometryParts, openingFrameDepth } = await importModule('plan/studio-window-geometry.ts')

  assert.equal(openingFrameDepth(undefined), 0.06, '缺省仍沿用旧的 60mm')
  assert.ok(Math.abs(openingFrameDepth(0.2) - 0.19) < 1e-9, '200mm 墙 → 190mm 框（两侧各 5mm）')
  assert.equal(openingFrameDepth(0.05), 0.06, '薄墙保底 60mm')
  assert.equal(openingFrameDepth(0.4), 0.2, '厚墙封顶 200mm')

  const parts = windowGeometryParts(1.6, 1.5, 0.9, true, 0.2)
  assert.ok(parts)
  assert.ok(Math.abs(parts.frameDepth - 0.19) < 1e-9)
  for (const [width, height, depth] of parts.frames) {
    assert.ok(width > 0 && height > 0, '框料尺寸必须为正')
    assert.ok(depth >= 0.18, `框深 ${depth} 必须贴近墙厚`)
  }
  // 玻璃保持 25mm 居中：跟着加厚只会让窗更像一块实心板。
  assert.equal(parts.glass[0][2], 0.025)

  assert.ok(wallsSource.includes('openingFrameDepth(openingWall.thickness)'), '自定义窗与门套都要按墙厚取框深')
})

test('并集失败：只丢掉被包住的环，且计数', async () => {
  const { dropContainedWallLoops, recordWallUnionFallback, wallUnionFallbackCount, resetWallUnionFallbackCount } =
    await importModule('plan/studio-wall-union.ts')

  const square = (x, y, size) => [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ]
  const host = square(0, 0, 4)
  const contained = square(1, 1, 1)
  const disjoint = square(10, 10, 2)

  const kept = dropContainedWallLoops([host, contained, disjoint])
  assert.deepEqual(kept, [host, disjoint], '被完全包住的环要去掉，独立环保留')

  // 真正交叉的两个环（T 字墙）不做裁剪：宁可留一条细缝，也不能删掉一面墙。
  const crossing = square(0, 1, 4)
  assert.deepEqual(dropContainedWallLoops([host, crossing]), [host, crossing])

  // 只剩下一个环时原样返回。
  assert.deepEqual(dropContainedWallLoops([host]), [host])

  resetWallUnionFallbackCount()
  recordWallUnionFallback([host, contained])
  recordWallUnionFallback([host])
  assert.equal(wallUnionFallbackCount(), 2)
  resetWallUnionFallbackCount()
  assert.equal(wallUnionFallbackCount(), 0)
})

test('并集失败的回退在墙带/盖面/选中层三条路径上都生效', () => {
  assert.ok(
    wallsSource.includes('recordWallUnionFallback(wallLoopList)'),
    'cachedWallUnionLoops 的失败分支必须走保守回退',
  )
  assert.ok(
    wallsSource.includes('unifiedLoops.length ? unifiedLoops : recordWallUnionFallback'),
    '只有并集为空时才回退',
  )
})

test('舞台启用透明排序与静态方向光阴影', () => {
  assert.ok(!/deps\.isEmbedStageMode \|\|\s*prepareWallSideOrder2/.test(wallsSource), '舞台不得再短路跳过三角形重排')
  assert.ok(wallsSource.includes('prepareWallSideOrder2(ns2, wallBandMesh)'), '墙带必须接入透明重排')
  assert.ok(wallsSource.includes('transmission: 0'), '半透明只由 opacity 表达，别再交 transmission pass 的钱')
})

test('墙面不再被排除在方向光阴影之外', () => {
  const regionLights = readModule('plan/studio-plan2-region-lights.ts')
  assert.ok(!regionLights.includes('materialKind === "wall"\n            ? ""'), 'wall 组不得再跳过太阳阴影 snippet')
  assert.ok(
    !regionLights.includes('activeLightGroup.kind === "wall"\n            ? 0'),
    'wall 组的 sunShadowStrength 不能再固定为 0',
  )
  assert.ok(regionLights.includes('wallOrientationSnippet'), '墙面需要按朝向补偿，否则朝东朝西的墙读数一模一样')
})
