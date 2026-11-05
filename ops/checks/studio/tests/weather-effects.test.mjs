/**
 * 3D 天气特效层的纯函数回归测试。
 *
 * 这几块都是「出错也不抛异常、只是画面不对」的类型，所以这里把口径钉死：
 *
 * 1. `normalizeGroundQuad`：舞台按世界轴顺序发角点，相机绕户型转时屏幕上的近远会变；
 *    输出必须是「近左 → 近右 → 远右 → 远左」。**旋转视角下相邻两边的中点纵向
 *    位置几乎相同**，只比 y 会选到侧边，所以打平时要按边长决胜。
 * 2. 地面落点：水花与积雪只准出现在画面**下部**（按屏幕纵向位置取点），
 *    不能按四边形参数 `v` 加权——`v` 会跟着相机旋转，落点就会挤回画布中间。
 * 3. `weatherEffectKey`：`unknown` / `unavailable` 必须判空（属性里的机读枚举是上一轮残留）。
 *    六种效果 = 雨 / 雪 / 雷雨 / 雨夹雪（降水）+ 多云 / 晴夜（只有云或星）；
 *    晴、阴、雾、霾、大风、冰雹不出 3D 天气层，属性残留也不能把它们翻成下雪。
 *    离线实体继续下雪是最常见的线上反馈。
 * 4. `WEATHER_EFFECT_PRESETS`：只允许出现「物体」参数，绝不许加背景遮盖层。
 * 5. `createQualityGovernor`：升档阈值必须高于 60fps 的帧间隔，否则降档之后
 *    永远升不回来（表现为「卡过一次之后一直很糊」）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const groundQuadModule = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/environment/weather/ground-quad.ts', import.meta.url),
)
const settingsModule = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/platform/weather-settings.ts', import.meta.url),
)
const qualityModule = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/environment/weather/quality.ts', import.meta.url),
)
const groundEmitterModule = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/core/stage/weather-ground.ts', import.meta.url),
)
const presetsModule = fileURLToPath(
  new URL('../../../../homeos/frontend/src/studio/runtime/environment/weather/presets.ts', import.meta.url),
)

const {
  normalizeGroundQuad,
  fallbackGroundQuad,
  pointOnQuad,
  quadVerticalRange,
  quadDepthAt,
  quadSheenSpan,
  nearGroundCutY,
  sampleNearGroundPoint,
  createSeededRandom,
} = await import(groundQuadModule)
const { weatherEffectKey, weatherWindSpeed, weatherEntityIds, boundWeatherEntityId, WEATHER_PREVIEWS } = await import(
  settingsModule
)
const { createQualityGovernor } = await import(qualityModule)
const { createWeatherGroundEmitter } = await import(groundEmitterModule)
const { WEATHER_EFFECT_PRESETS } = await import(presetsModule)

/* ---------------------------------------------------------------- 地面四边形 */

/** 舞台真实顺序：[minX,minZ] → [maxX,minZ] → [maxX,maxZ] → [minX,maxZ]。 */
const worldOrderFarFirst = [
  [0.1, 0.2],
  [0.9, 0.2],
  [0.95, 0.9],
  [0.05, 0.9],
]

test('世界轴顺序（远端在前）会被重排成近左 → 近右 → 远右 → 远左', () => {
  const quad = normalizeGroundQuad(worldOrderFarFirst)
  assert.deepEqual(quad, [
    [0.05, 0.9],
    [0.95, 0.9],
    [0.9, 0.2],
    [0.1, 0.2],
  ])
})

test('已经是规范顺序的四边形保持原样（归一化是幂等的）', () => {
  const once = normalizeGroundQuad(worldOrderFarFirst)
  assert.deepEqual(normalizeGroundQuad(once), once)
})

test('兜底地面本身就是规范顺序，且四条边围出可用面积', () => {
  const fallback = fallbackGroundQuad()
  assert.deepEqual(normalizeGroundQuad(fallback), fallback)
  // (0,0) 是近左、(1,1) 是远右：插值口径必须与 `pointOnQuad` 的注释一致。
  assert.deepEqual(pointOnQuad(fallback, 0, 0), [0.02, 0.96])
  const [farRightX, farRightY] = pointOnQuad(fallback, 1, 1)
  assert.ok(Math.abs(farRightX - 0.82) < 1e-9)
  assert.equal(farRightY, 0.5)
})

test('相机推近、四角大幅越出画面时不整块拒绝', () => {
  const closeUp = [
    [-1.5, 1.8],
    [2.5, 1.8],
    [2.2, 0.4],
    [-1.2, 0.4],
  ]
  const quad = normalizeGroundQuad(closeUp)
  assert.notEqual(quad, null, '越界坐标不该让水花冻在上一帧的位置')
  // 近边必须是 y 更大的那条（画面底部）。
  assert.ok(quad[0][1] > quad[2][1])
})

test('退化与非法输入返回 null，调用方沿用上一块有效地面', () => {
  assert.equal(
    normalizeGroundQuad([
      [0.1, 0.9],
      [0.9, 0.9],
      [0.1, 0.9],
      [0.9, 0.9],
    ]),
    null,
  )
  assert.equal(
    normalizeGroundQuad([
      [0, 0],
      [1, 0],
      [1, 1],
      [Number.NaN, 1],
    ]),
    null,
  )
  assert.equal(
    normalizeGroundQuad([
      [0, 0],
      [1, 0],
      [1, 1],
    ]),
    null,
  )
  assert.equal(normalizeGroundQuad(null), null)
})

/**
 * 线上真实相机视角：地板投影是个旋转过的菱形，相邻两条边的中点纵向位置
 * 只差 0.0005。只比 y 会选到左侧那条边，`u/v` 方向随之歪掉。
 */
const rotatedGroundQuad = [
  [0.06828157830822623, 0.5969934273732932],
  [0.6943782362863243, 0.44315415837399014],
  [0.9436893460249622, 0.5959309165543359],
  [0.19564843055131798, 0.8496490893542262],
]

function edgeLength(quad, index) {
  const [x1, y1] = quad[index]
  const [x2, y2] = quad[(index + 1) % 4]
  return Math.hypot(x2 - x1, y2 - y1)
}

test('旋转视角下近边按边长决胜：选到最靠下且最长的那条边', () => {
  const quad = normalizeGroundQuad(rotatedGroundQuad)
  assert.notEqual(quad, null)
  // 近左 = 画面最靠下的角；近边必须是四条边里最长的（透视下近边不会被压缩）。
  assert.equal(quad[0][1], Math.max(...quad.map(([, y]) => y)))
  assert.equal(edgeLength(quad, 0), Math.max(...quad.map((_, index) => edgeLength(quad, index))))
  // 归一化必须幂等，否则相机每动一次顺序都会抖一下。
  assert.deepEqual(normalizeGroundQuad(quad), quad)
})

test('水花与积雪只落在画面下部，不会摊在画布中间', () => {
  const quad = normalizeGroundQuad(rotatedGroundQuad)
  const [minY, maxY] = quadVerticalRange(quad)
  const cutY = nearGroundCutY(quad)
  assert.ok(cutY > minY + (maxY - minY) * 0.45, '近地面分界线必须在四边形纵向中段以下')
  let sumY = 0
  let count = 0
  let misses = 0
  // 用与运行时同一套伪随机：线性同余的连续输出会落在少数几条直线上，测不出真实分布。
  const random = createSeededRandom(20261104)
  for (let index = 0; index < 3000; index += 1) {
    const sample = sampleNearGroundPoint(quad, random)
    if (!sample) {
      // 拒绝采样的正常结果：偶尔采不到就这一滴不画，不能因此卡住或抛异常。
      misses += 1
      continue
    }
    assert.ok(sample.y >= cutY - 1e-9, '落点不能越过近地面分界线')
    // u/v 必须能复算出同一个点：相机绕动后靠它把落点重新投影到地板上。
    const [x, y] = pointOnQuad(quad, sample.u, sample.v)
    assert.ok(Math.abs(x - sample.x) < 1e-9 && Math.abs(y - sample.y) < 1e-9)
    assert.ok(sample.depth >= 0 && sample.depth <= 1)
    sumY += sample.y
    count += 1
  }
  assert.ok(misses / 3000 < 0.02, `采不到点的比例 ${misses}/3000 过高，水花会变稀`)
  const meanY = sumY / count
  assert.ok(meanY > (minY + maxY) / 2 + 0.04, `落点重心 ${meanY.toFixed(3)} 应明显低于地面纵向中心`)
})

test('远近系数按屏幕纵向位置算，不再依赖四边形参数 v', () => {
  const quad = fallbackGroundQuad()
  const [minY, maxY] = quadVerticalRange(quad)
  assert.equal(quadDepthAt(quad, minY), 0)
  assert.equal(quadDepthAt(quad, maxY), 1)
  assert.ok(quadDepthAt(quad, 0.8) > quadDepthAt(quad, 0.6))
  // 越界值夹紧，避免相机抖一下就把水花放大成一片。
  assert.equal(quadDepthAt(quad, minY - 0.4), 0)
  assert.equal(quadDepthAt(quad, maxY + 0.4), 1)
})

test('湿地 / 积雪只铺四边形靠下的那一段，远端完全不铺', () => {
  const quad = normalizeGroundQuad(rotatedGroundQuad)
  const [minY, maxY] = quadVerticalRange(quad)
  const [topY, bottomY] = quadSheenSpan(quad)
  assert.equal(bottomY, maxY)
  // 默认覆盖靠下的 68%：画面里地板的上部 1/3 完全不铺，远端不会再浮出一层色块。
  assert.ok((topY - minY) / (maxY - minY) > 0.25, '远端至少 25% 的地板不能铺')
  assert.ok(topY < maxY, '覆盖段不能是空的')
  // 覆盖比例可调：传 0.5 时正好从纵向中点开始铺。
  const [midTop] = quadSheenSpan(quad, 0.5)
  assert.ok(Math.abs(midTop - (minY + maxY) / 2) < 1e-9)
  const [, fallbackBottom] = quadSheenSpan(fallbackGroundQuad())
  assert.equal(fallbackBottom, quadVerticalRange(fallbackGroundQuad())[1])
})

/* ---------------------------------------------------------------- 实体状态解析 */

test('unknown / unavailable 直接判空，不拿属性里的残留枚举出效果', () => {
  const stale = { attributes: { skycon: 'SNOWY' } }
  assert.equal(weatherEffectKey({ state: 'unknown', ...stale }), '')
  assert.equal(weatherEffectKey({ state: 'unavailable', ...stale }), '')
  assert.equal(weatherEffectKey({ state: 'none', ...stale }), '')
  assert.equal(weatherEffectKey({ state: 'Unknown', ...stale }), '')
  assert.equal(weatherEffectKey({ state: 'snowy', available: false }), '')
})

test('六种效果，顺序即预览按钮顺序', () => {
  assert.deepEqual(
    WEATHER_PREVIEWS.map(([key]) => key),
    ['rainy', 'snowy', 'lightning-rainy', 'snowy-rainy', 'partlycloudy', 'clear-night'],
  )
  assert.deepEqual(
    WEATHER_PREVIEWS.map(([, label]) => label),
    ['雨', '雪', '雷雨', '雨夹雪', '多云', '晴夜'],
  )
})

test('多云与晴夜要出效果：前者是云，后者是星', () => {
  for (const state of ['多云', '局部多云', '晴间多云', 'partlycloudy', 'PARTLY_CLOUDY_DAY']) {
    assert.equal(weatherEffectKey({ state }), 'partlycloudy', `${state} 应出云朵`)
  }
  for (const state of ['晴夜', '晴朗夜晚', '夜晚', '夜间', '星空', 'clear-night', 'CLEAR_NIGHT', 'night']) {
    assert.equal(weatherEffectKey({ state }), 'clear-night', `${state} 应出星星`)
  }
})

test('其余无可画元素的天气一律不出特效，也不采信属性里的残留枚举', () => {
  for (const state of ['晴', '阴', '雾', '霾', '大风', '冰雹', 'sunny', 'cloudy', 'fog', 'haze', 'windy', 'hail']) {
    assert.equal(weatherEffectKey({ state }), '', `${state} 不该产生 3D 天气层`)
  }
  // 「晴」是确定没有特效，属性里上一轮的机读枚举不能把它翻成下雪。
  assert.equal(weatherEffectKey({ state: '晴', attributes: { skycon: 'SNOWY' } }), '')
  assert.equal(weatherEffectKey({ state: '阴', attributes: { condition: 'rainy' } }), '')
})

test('中文描述、HA 枚举与机读枚举都能归并到六种效果', () => {
  assert.equal(weatherEffectKey({ state: '雷阵雨' }), 'lightning-rainy')
  assert.equal(weatherEffectKey({ state: 'thunderstorm' }), 'lightning-rainy')
  assert.equal(weatherEffectKey({ state: '雨' }), 'rainy')
  assert.equal(weatherEffectKey({ state: '中雨' }), 'rainy')
  assert.equal(weatherEffectKey({ state: 'MODERATE_RAIN_DAY' }), 'rainy')
  assert.equal(weatherEffectKey({ state: '雪' }), 'snowy')
  assert.equal(weatherEffectKey({ state: 'HEAVY_SNOW' }), 'snowy')
  assert.equal(weatherEffectKey({ state: '雨夹雪' }), 'snowy-rainy')
  assert.equal(weatherEffectKey({ state: 'sleet' }), 'snowy-rainy')
  // 大雨按普通下雨处理，不单独出更重的效果。
  assert.equal(weatherEffectKey({ state: 'pouring' }), 'rainy')
  assert.equal(weatherEffectKey({ state: '暴雨' }), 'rainy')
})

test('state 是词表外的自定义文案时，才回退到 attributes', () => {
  assert.equal(weatherEffectKey({ state: '阴转小雨', attributes: { skycon: 'MODERATE_RAIN_DAY' } }), 'rainy')
  // 属性里优先级更高的「晴」同样能挡住后面的残留枚举。
  assert.equal(weatherEffectKey({ state: '未知转晴', attributes: { condition_desc: '晴', skycon: 'SNOWY' } }), '')
})

test('风速按单位归一为 m/s：km/h、mph、节', () => {
  const wind = (value, unit) => weatherWindSpeed({ attributes: { wind_speed: value, wind_speed_unit: unit } })
  assert.equal(wind(36, 'km/h'), 10)
  assert.equal(wind(10, 'm/s'), 10)
  assert.ok(Math.abs(wind(10, 'kn') - 5.14444) < 1e-6, '节必须换算，否则大风被当成微风')
  assert.ok(Math.abs(wind(10, 'knots') - 5.14444) < 1e-6)
  assert.equal(wind(10, 'furlongs/fortnight'), 10, '未知单位按 m/s 处理')
  assert.equal(weatherWindSpeed({ attributes: {} }), 0)
  assert.equal(weatherWindSpeed(null), 0)
})

/* ---------------------------------------------------------------- 绑定形状 */

test('三种天气绑定形状都能解析出来（订阅与读取共用同一份清单）', () => {
  assert.deepEqual(weatherEntityIds({ weather: { entityId: 'weather.wulumuqi' } }), ['weather.wulumuqi'])
  // 旧版扁平字段：只认 `weather.entityId` 时实体不会进订阅集合，
  // 表现就是「绑了实体却没有任何天气」。
  assert.deepEqual(weatherEntityIds({ weatherEntityId: 'weather.beijing' }), ['weather.beijing'])
  assert.deepEqual(weatherEntityIds({ weather: { entity_id: 'weather.shanghai' } }), ['weather.shanghai'])
  assert.equal(boundWeatherEntityId({ weatherEntityId: 'weather.beijing' }), 'weather.beijing')
})

test('非法 / 重复 / 非 weather 域一律当未绑定', () => {
  assert.deepEqual(weatherEntityIds({ weather: { entityId: 'sensor.temperature' } }), [])
  assert.deepEqual(weatherEntityIds({ weather: { entityId: 'weather.Wulumuqi' } }), [])
  assert.deepEqual(weatherEntityIds({ weather: { entityId: '' } }), [])
  assert.deepEqual(weatherEntityIds({}), [])
  assert.deepEqual(weatherEntityIds(null), [])
  assert.equal(boundWeatherEntityId(null), '')
  // 同值出现两次只保留一条，避免重复订阅 / 重复注册句柄。
  assert.deepEqual(
    weatherEntityIds({ weather: { entityId: 'weather.wulumuqi' }, weatherEntityId: 'weather.wulumuqi' }),
    ['weather.wulumuqi'],
  )
})

/* ---------------------------------------------------------------- 地面投影发送器 */

/**
 * 假时钟 + 假定时器：`weather-ground` 的补发逻辑是纯时序问题，
 * 不注入这两样就只能靠真实 `setTimeout` 等 120ms，测试会变慢并且偶发。
 */
function createGroundEmitterHarness() {
  const messages = []
  const timers = new Map()
  let nextTimerId = 1
  const clock = { now: 0 }
  const camera = { key: 'camera-a', offset: 0 }
  const emitter = createWeatherGroundEmitter({
    getBounds: () => ({ minX: camera.offset, maxX: 10, minZ: 0, maxZ: 10, y: 0 }),
    // 世界坐标 → NDC：把 10×10 的地板铺满画面，四角构成面积 1 的凸四边形。
    getProjector: () => (x, _y, z) => [x / 5 - 1, 1 - z / 5, 0],
    getCameraKey: () => camera.key,
    getViewportSize: () => ({ width: 800, height: 600 }),
    postMessage: (message) => messages.push(message),
    now: () => clock.now,
    minIntervalMs: 120,
    schedule: (callback, delayMs) => {
      const timerId = nextTimerId++
      timers.set(timerId, { callback, at: clock.now + delayMs })
      return timerId
    },
    cancel: (timerId) => timers.delete(timerId),
  })
  return {
    emitter,
    messages,
    camera,
    advance(ms) {
      clock.now += ms
    },
    runTimers() {
      for (const [timerId, timer] of [...timers]) {
        timers.delete(timerId)
        clock.now = Math.max(clock.now, timer.at)
        timer.callback()
      }
    },
    pendingTimerCount: () => timers.size,
  }
}

test('节流窗口内被丢掉的那一帧必须补发，否则相机停下后地面永久贴偏', () => {
  const harness = createGroundEmitterHarness()
  harness.emitter.sync()
  assert.equal(harness.messages.length, 1)

  // 相机在窗口内又动了：这一帧被节流，但必须挂一个补发定时器。
  harness.advance(16)
  harness.camera.key = 'camera-b'
  harness.camera.offset = 1
  harness.emitter.sync()
  assert.equal(harness.messages.length, 1, '节流窗口内不应立刻发')
  assert.equal(harness.pendingTimerCount(), 1)

  harness.runTimers()
  assert.equal(harness.messages.length, 2, '窗口结束后必须补发最后一帧')
  assert.notDeepEqual(
    harness.messages[1].quad,
    harness.messages[0].quad,
    '补发的必须是停下来时的地面，不是窗口开头那一帧',
  )
  assert.ok(harness.messages[1].revision > harness.messages[0].revision)
})

test('窗口外的新变化直接发送，并取消待补发的那一帧（不重复发）', () => {
  const harness = createGroundEmitterHarness()
  harness.emitter.sync()
  harness.advance(16)
  harness.camera.key = 'camera-b'
  harness.camera.offset = 1
  harness.emitter.sync()
  assert.equal(harness.pendingTimerCount(), 1)

  harness.advance(200)
  harness.emitter.sync()
  assert.equal(harness.messages.length, 2)
  assert.equal(harness.pendingTimerCount(), 0, '已经直发，补发定时器必须一起收掉')

  harness.runTimers()
  assert.equal(harness.messages.length, 2)
})

test('位置没变时不挂补发定时器；dispose 后补发也不再发生', () => {
  const harness = createGroundEmitterHarness()
  harness.emitter.sync()
  harness.advance(16)
  harness.emitter.sync()
  assert.equal(harness.pendingTimerCount(), 0, '同一个相机姿态不该排队补发')

  harness.camera.key = 'camera-b'
  harness.camera.offset = 1
  harness.emitter.sync()
  assert.equal(harness.pendingTimerCount(), 1)
  harness.emitter.dispose()
  assert.equal(harness.pendingTimerCount(), 0)
  harness.runTimers()
  assert.equal(harness.messages.length, 1)
})

/* ---------------------------------------------------------------- 预设不含背景遮盖层 */

test('所有预设只描述「物体」，没有任何背景遮盖层参数', () => {
  // 天气层是透明画布：一旦出现天空 / 云幕 / 雾幕 / 全屏调色 / 暗角这类整屏填充，
  // 就会把 3D 户型与设备图标压暗。这里把允许出现的字段钉死，
  // 将来谁想加「给整屏上一层色」的参数，会先在门禁上失败。
  const allowedKeys = new Set([
    'rain',
    'rainScale',
    'rainSpeed',
    'rainDepth',
    'snow',
    'snowScale',
    'splash',
    'wet',
    'snowCover',
    'thunder',
    'clouds',
    'cloudDrift',
    'stars',
    'meteor',
  ])
  for (const [key, preset] of Object.entries(WEATHER_EFFECT_PRESETS)) {
    for (const presetKey of Object.keys(preset))
      assert.ok(allowedKeys.has(presetKey), `${key} 的 ${presetKey} 不是「物体」参数`)
  }
  // 多云必须有会动的云，晴夜必须有星，否则这两个场景等于没加。
  assert.ok(WEATHER_EFFECT_PRESETS.partlycloudy.clouds > 0, '多云要画云')
  assert.ok(WEATHER_EFFECT_PRESETS.partlycloudy.cloudDrift > 0, '多云的云必须在移动')
  assert.ok(WEATHER_EFFECT_PRESETS['clear-night'].stars > 0, '晴夜要画星星')
})

/* ---------------------------------------------------------------- 画质治理 */

test('持续慢帧降档，恢复流畅后必须能升回满档', () => {
  const governor = createQualityGovernor()
  assert.equal(governor.factor, 1)

  for (let frame = 0; frame < 200; frame++) governor.sample(0.04)
  assert.equal(governor.factor, 0.55, '40ms 的帧连续 90+ 次应降到最低档')

  for (let frame = 0; frame < 700; frame++) governor.sample(0.0167)
  assert.equal(governor.factor, 1, '60fps 帧间隔必须能触发升档，否则降档是不可逆的')
})

test('定格重绘（deltaSeconds 为 0）不计入帧耗时', () => {
  const governor = createQualityGovernor()
  for (let frame = 0; frame < 500; frame++) governor.sample(0)
  assert.equal(governor.factor, 1)
})
