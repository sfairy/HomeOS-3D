/**
 * `studio-lighting-shader-chunks`（分层灯光 GLSL 补丁）的契约测试。
 *
 * 这些补丁失败时的表现是**整支片元着色器编不过**，而 three 只在控制台打一行
 * `Fragment shader is not compiled.`，接着整套灯光退回原生逐灯 —— 现场看到的是
 * 「分层灯光没了」，不是「补丁写错了」。
 *
 * 这里钉死的是最容易踩的那条：
 * - 分层路径放宽了 `lights_pars_begin` 的闸门，好让 `getUserFloorLight` 能构造
 *   `SpotLight` / `RectAreaLight` 结构体；
 * - 但**不能**因此把 `spotLights[ NUM_SPOT_LIGHTS ]` / `rectAreaLights[ NUM_RECT_AREA_LIGHTS ]`
 *   这两条 uniform 声明删掉：只要还有一盏灯留在相机图层上（还没被楼层缓冲接管、
 *   或超预算没进缓冲），`NUM_SPOT_LIGHTS > 0`，three 自己的直接光循环仍在索引它，
 *   声明缺席就是 `'spotLights' : undeclared identifier`。
 *
 * 所以两份声明必须重新套回它们本来的 `#if NUM_* > 0` 闸门：计数为 0 时不会出现
 * 非法的零长数组，计数 > 0 时数组照旧存在。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/3d-studio/authoring/scene/studio-lighting-shader-chunks.ts',
    import.meta.url,
  ),
)
const { patchLightsParsBegin, patchLightsPhysicalPars } = await import(moduleUrl)

/** three r186 的 `lights_pars_begin` 里与本补丁有关的最小结构。 */
const shaderChunks = {
  lights_pars_begin: [
    '#if NUM_POINT_LIGHTS > 0',
    '\tuniform PointLight pointLights[ NUM_POINT_LIGHTS ];',
    '#endif',
    '#if NUM_SPOT_LIGHTS > 0',
    '\tstruct SpotLight {',
    '\t\tvec3 position;',
    '\t};',
    '\tuniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];',
    '#endif',
    '#if NUM_RECT_AREA_LIGHTS > 0',
    '\tstruct RectAreaLight {',
    '\t\tvec3 color;',
    '\t};',
    '\tuniform sampler2D ltc_1;',
    '\tuniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];',
    '#endif',
  ].join('\n'),
  lights_physical_pars_fragment: '#if NUM_RECT_AREA_LIGHTS > 0\nvoid RE_Direct_RectArea(){}\n#endif',
}

test('分层路径放宽闸门：结构体在 NUM_*_LIGHTS 为 0 时仍可用', () => {
  const patched = patchLightsParsBegin({ ShaderChunk: shaderChunks })

  assert.match(patched, /#if NUM_SPOT_LIGHTS > 0 \|\| defined\(HB_FLOOR_LIGHTS\)/)
  assert.match(patched, /#if NUM_RECT_AREA_LIGHTS > 0 \|\| defined\(HB_FLOOR_AREA_LIGHTS\)/)
  // 结构体本身没有额外闸门，分层路径才构造得出 SpotLight / RectAreaLight。
  assert.match(patched, /struct SpotLight \{/)
  assert.match(patched, /struct RectAreaLight \{/)
})

test('uniform 数组保留原闸门：计数 > 0 时声明仍在，计数为 0 时不会出现零长数组', () => {
  const patched = patchLightsParsBegin({ ShaderChunk: shaderChunks })

  // 不许用 `#ifndef HB_FLOOR_*` 把声明整条删掉 —— 这正是 `spotLights undeclared` 的来源。
  assert.doesNotMatch(patched, /#ifndef HB_FLOOR_LIGHTS/)
  assert.doesNotMatch(patched, /#ifndef HB_FLOOR_AREA_LIGHTS/)

  assert.match(
    patched,
    /#if NUM_SPOT_LIGHTS > 0\s*\n\s*uniform SpotLight spotLights\[ NUM_SPOT_LIGHTS \];\s*\n\s*#endif/,
  )
  assert.match(
    patched,
    /#if NUM_RECT_AREA_LIGHTS > 0\s*\n\s*uniform RectAreaLight rectAreaLights\[ NUM_RECT_AREA_LIGHTS \];\s*\n\s*#endif/,
  )
  // 声明本身永远紧跟在闸门后面：GLSL ES 不允许 `spotLights[ 0 ]`。
  assert.equal(enclosingGuard(patched, 'uniform SpotLight spotLights['), '#if NUM_SPOT_LIGHTS > 0')
  assert.equal(enclosingGuard(patched, 'uniform RectAreaLight rectAreaLights['), '#if NUM_RECT_AREA_LIGHTS > 0')
})

/** 取某条声明上一行的预处理器指令（空行会被跳过）。 */
function enclosingGuard(source, declaration) {
  const declarationIndex = source.indexOf(declaration)
  assert.notEqual(declarationIndex, -1, `找不到声明：${declaration}`)
  const aboveLines = source
    .slice(0, declarationIndex)
    .split('\n')
    .filter((line) => line.trim())
  return aboveLines[aboveLines.length - 1].trim()
}

test('物理材质的矩形光分支同样放宽到分层路径', () => {
  const patched = patchLightsPhysicalPars({ ShaderChunk: shaderChunks })
  assert.equal(
    patched,
    '#if NUM_RECT_AREA_LIGHTS > 0 || defined(HB_FLOOR_AREA_LIGHTS)\nvoid RE_Direct_RectArea(){}\n#endif',
  )
})
