/**
 * 实体选择器的「域白名单」回归（`studio/app/bridge/pickers/editor-pickers.ts`）。
 *
 * 守护的故障：选择器的可选实体由 `entityIdPattern` **一条三元链**决定，链上按
 * `deviceKind` 逐类收窄。新接入一类设备时若忘记给链上加分支，就会悄悄落到链尾的
 * `^(light|switch)\.` —— 调用方明明声明了 `deviceKind: "weather"`，列表里却全是灯，
 * 或（住宅里没有灯/开关时）直接空列表。0.7.6 移植时就漏了 `weather` 与 `nas`
 * 两个分支，用户看到的是「绑天气实体点开一个都找不到，实际 HA 里明明有」。
 *
 * 所以这里守两条**通用不变量**（不是逐个 DOM 交互，而是逐个 deviceKind 的域收口）：
 *  1. **不漏收窄**：数据里有该 deviceKind 的实体时，列表必须非空
 *     —— 漏分支只会静默变空，空列表是唯一能被机器抓住的信号。
 *  2. **不越域**：返回的实体域必须落在该 deviceKind 允许集合内
 *     —— 防止「链尾兜底」把不相干域（灯 / 开关）混进来。
 *
 * 只有 `pattern` 允许任意域（`^[a-z_]+\.`，如 人在 / 状态 / 房间指令）的 deviceKind
 * 不做第 2 条，它们的收窄靠 `recommended` 排序与调用方过滤。
 *
 * 用法：`bun run scripts/_entity_picker_domains_smoke.ts`（由 `verify:smoke:frontend` 串起来）。
 *
 * 本文件豁免 `@typescript-eslint/no-explicit-any`：依赖注入袋（`openPicker` / `elements`）
 * 的真实类型属于 MONOLITH_BASELINE 的「deps bag 接口化」范围，这里只需要假对象能接住调用。
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createInteraction3dEditorPickers } from '../../src/studio/app/bridge/pickers/editor-pickers'

import { check, report, section } from '../_smoke_harness'

/* ------------------------------------------------------------------ *
 * 夹具：跨域实体表 + 每个 deviceKind 的「应有域」清单
 * ------------------------------------------------------------------ */

/** 一张刻意跨域的实体表：每个 deviceKind 都至少有一条实体落在它的允许域里。 */
const ENTITIES = [
  { entityId: 'weather.home', name: '家里天气' },
  { entityId: 'weather.forecast_home', name: '天气预报' },
  { entityId: 'light.kitchen', name: '厨房灯' },
  { entityId: 'switch.fan_plug', name: '风扇插座' },
  { entityId: 'binary_sensor.front_door', name: '入户门' },
  { entityId: 'sensor.front_door_battery', name: '入户门电量' },
  { entityId: 'camera.front_door', name: '门口摄像头' },
  { entityId: 'image.doorbell', name: '门铃快照' },
  { entityId: 'vacuum.robot', name: '扫地机' },
  { entityId: 'cover.living_curtain', name: '客厅窗帘' },
  { entityId: 'climate.ac', name: '空调' },
  { entityId: 'water_heater.boiler', name: '热水器' },
  { entityId: 'fan.vent', name: '排气扇' },
  { entityId: 'media_player.tv', name: '电视' },
  { entityId: 'input_boolean.night', name: '夜间模式' },
  { entityId: 'script.good_night', name: '晚安' },
]

/**
 * `deviceKind` → 允许的域集合。`null` 表示「任意域」（链上是宽松 pattern）。
 * 与 0.7.6 dist 的 `entityIdPattern` 三元链逐条对齐 —— 改动链时这份表必须同步改。
 */
const DEVICE_DOMAIN_MATRIX: ReadonlyArray<readonly [string, readonly string[] | null]> = [
  ['weather', ['weather']],
  ['camera', ['camera']],
  ['vacuum', ['vacuum']],
  ['vacuum-map', ['camera', 'image']],
  ['vacuum-room', null],
  ['cover', ['cover']],
  ['airer', ['cover']],
  ['climate', ['climate']],
  ['water-heater', ['water_heater']],
  ['fan', ['fan']],
  ['purifier', ['fan']],
  ['bath-heater', ['climate', 'fan']],
  // `light` 是**缺省**的名字（`pickers` 工厂的 `deviceKind` 缺省值就是它），dist 给它的是
  // 任意域 `^[a-z_]+\.[a-z0-9_]+$`：灯 / 开关只是排到最前（`recommended` 里 light→2、switch→1），
  // 其余域仍要能选（如「设备组」要挑传感器类实体）。所以这里按「任意域」登记，不参与域收口检查。
  ['light', null],
  // 报警实体的来源域不定（binary_sensor / sensor / event），dist 给的是「任意域」。
  // 本仓报警选择器走 `pickers.alarm`，所以这条分支目前没有调用方 —— 登记在这里是为了
  // 至少守住「不漏成空列表」这条不变量。
  ['security-alarm', null],
  ['nas', ['binary_sensor', 'switch', 'input_boolean']],
  ['television', ['media_player']],
  ['speaker', ['media_player']],
  ['lock-door', ['binary_sensor', 'sensor']],
  ['lock-battery', ['sensor']],
  ['device-status', null],
  ['presence', null],
]

/* ------------------------------------------------------------------ *
 * 驱动桩：只要 openPicker 的载荷 + getPage 的筛选结果
 * ------------------------------------------------------------------ */

async function pickEntities(deviceKind: string) {
  let payload: any = null
  const pickers: any = createInteraction3dEditorPickers({
    getEntities: () => ENTITIES,
    ensureEntities: async () => undefined,
    entityPickerText: (entity: any) => entity.name,
    openPicker: (pickerPayload: any) => {
      payload = pickerPayload
      return pickerPayload
    },
    // 载荷里的这几个渲染回调是**闭包**，本冒烟不触发；给空桩即可。
    elements: {
      createEditorPickerCurrentEntity: () => null,
      createEditorEntityPickerOption: () => null,
      editorPickerClearAction: () => null,
    },
  })
  await pickers.entity({
    trigger: { isConnected: true, setAttribute: () => undefined },
    current: '',
    deviceKind,
    // 刻意**不传** `title`：标题链是「调用方没给标题时」的兜底文案，第 ④ 节要测的正是它。
    onSelect: () => undefined,
  })
  if (!payload) return null
  // `getPage` 就是选择器列举实体的那条路（内部经过 `entityIdPattern` 过滤）。
  const page = payload.getPage({ query: '', page: 1 })
  return { payload, items: (page?.items || []) as any[] }
}

/* ------------------------------------------------------------------ *
 * ① 不漏收窄：声明的 deviceKind 必须能列出实体
 * ------------------------------------------------------------------ */

section('① 声明的 deviceKind 必须列出实体（漏分支只会静默变空）')

{
  for (const [deviceKind] of DEVICE_DOMAIN_MATRIX) {
    const picked = await pickEntities(deviceKind)
    check(
      `${deviceKind} → 列表非空`,
      !!picked && picked.items.length > 0,
      picked ? picked.items.map((entity) => entity.entityId) : null,
    )
  }
}

/* ------------------------------------------------------------------ *
 * ② 不越域：返回的实体域必须落在允许集合内（防链尾兜底混入灯/开关）
 * ------------------------------------------------------------------ */

section('② 返回的实体域必须落在该 deviceKind 的允许集合内')

{
  for (const [deviceKind, allowedDomains] of DEVICE_DOMAIN_MATRIX) {
    if (!allowedDomains) continue
    const picked = await pickEntities(deviceKind)
    const returnedDomains = (picked?.items || []).map(
      (entity) => String(entity.entityId).split('.')[0],
    )
    const outOfDomain = returnedDomains.filter((domain) => !allowedDomains.includes(domain))
    check(
      `${deviceKind} → 全部落在 [${allowedDomains.join(', ')}]`,
      outOfDomain.length === 0,
      outOfDomain,
    )
  }
}

/* ------------------------------------------------------------------ *
 * ③ 空列表文案要说清缺什么（用户看到的第一句话）
 * ------------------------------------------------------------------ */

section('③ 空列表文案：不得回落到「没有匹配的灯光或开关」')

{
  const weather = await pickEntities('weather')
  const emptyText = String(weather?.payload?.emptyText || '')
  check(
    'weather 的空列表文案不指向灯/开关',
    emptyText.length > 0 && !emptyText.includes('灯光'),
    emptyText,
  )

  const nas = await pickEntities('nas')
  check(
    'nas 的空列表文案不指向灯/开关',
    !String(nas?.payload?.emptyText || '').includes('灯光'),
    nas?.payload?.emptyText,
  )
}

/* ------------------------------------------------------------------ *
 * ④ 标题 / 空列表文案与 0.7.6 dist 逐字对齐
 * ------------------------------------------------------------------ */

section('④ 标题 / 空列表文案：逐字对齐 dist')

/**
 * `deviceKind` → [标题, 空列表文案]。这几条是移植时对不上、又最容易再飘的：
 * `security-alarm` / `nas` 的标题链、`fan` / `purifier` 的标题与空列表。
 * 期望值取自 0.7.6 dist 的字符串表（`editor-pickers.js` 的 `_0x3147` 解码）。
 */
const DEVICE_COPY_MATRIX: ReadonlyArray<readonly [string, string, string]> = [
  ['security-alarm', '选择报警传感器', '没有匹配的实体，请检查搜索条件或 Home Assistant 的实体列表'],
  ['fan', '选择风扇主实体（可不选）', '没有标准 fan 主实体，可返回直接绑定设备并选择附加功能。'],
  [
    'purifier',
    '选择空气净化器实体',
    '没有标准 fan 主实体，可返回直接绑定设备并选择附加功能。',
  ],
  ['nas', '选择 NAS 指示灯状态实体（旧版兼容）', '没有匹配的开关或二元传感器'],
  // 天气选择器的标题由调用方显式传（`绑定天气实体`）；空列表文案是本仓补的（dist 会说到灯/开关）。
  ['weather', '选择灯光实体', '没有匹配的天气（weather）实体，请先在 Home Assistant 接入天气服务'],
]

{
  for (const [deviceKind, expectedTitle, expectedEmptyText] of DEVICE_COPY_MATRIX) {
    const picked = await pickEntities(deviceKind)
    check(
      `${deviceKind} → 标题`,
      String(picked?.payload?.title || '') === expectedTitle,
      picked?.payload?.title,
    )
    check(
      `${deviceKind} → 空列表文案`,
      String(picked?.payload?.emptyText || '') === expectedEmptyText,
      picked?.payload?.emptyText,
    )
  }
}

report('实体选择器域白名单回归')
