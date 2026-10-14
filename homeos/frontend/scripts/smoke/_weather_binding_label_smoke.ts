/**
 * 天气实体绑定按钮的「显示名」回归（`platform/weather-settings.ts` + `app/bridge/editor.ts`）。
 *
 * 守护的故障：3D 场景检查器的天气分组，按钮文案原本直接印实体 ID
 * （`weather.wulumuqi`）—— 0.7.6 如此，移植时照抄了。用户读不出所以然，
 * 反馈「修改成显示实体名（不要显示实体 ID）」。
 *
 * 这里守两条：
 *  1. **纯函数**：`weatherEntityLabel` 的回退链（实时 `friendly_name` → 实体目录
 *     `attributes.friendly_name` / `name` → 实体 ID）与 `weatherEntityState` 对
 *     `Map` / 普通对象两种状态形状的兼容 —— 回退链断了就会把 ID 印回按钮。
 *  2. **接线**：`app/bridge/editor.ts` 的天气按钮必须经由 `weatherEntityLabel` 生成文案，
 *     且保留 `title = 实体 ID`（排障时仍要能拿到 ID）。这是「把 ID 印回按钮」的唯一入口，
 *     纯函数测得再全，接线断了也白搭。
 *
 * 用法：`bun run scripts/smoke/_weather_binding_label_smoke.ts`（在 homeos/frontend 下执行）。
 */

import fs from 'node:fs'
import path from 'node:path'

import { weatherEntityId, weatherEntityLabel, weatherEntityState } from '../../src/studio/platform/weather-settings'

import { check, report, section } from '../_smoke_harness'

/** 检查器源码：天气分组那段是「把 ID 印回按钮」的唯一入口，直接在源码上钉住接线。 */
const EDITOR_SOURCE_PATH = path.join(import.meta.dir, '../../src/studio/app/bridge/editor.ts')
const EDITOR_SOURCE = fs.readFileSync(EDITOR_SOURCE_PATH, 'utf8')

section('① 显示名回退链')

check(
  '实时状态的 friendly_name 优先（HA 改名立即生效）',
  weatherEntityLabel('weather.wulumuqi', { name: '目录里的旧名字' }, {
    attributes: { friendly_name: '乌鲁木齐' },
  }) === '乌鲁木齐',
)

check(
  '状态中枢包在 newState 里的也认',
  weatherEntityLabel('weather.home', null, {
    newState: { attributes: { friendly_name: '家里的天气' } },
  }) === '家里的天气',
)

check(
  '没有实时状态时用实体目录的 name',
  weatherEntityLabel('weather.home', { entityId: 'weather.home', name: '天气预报' }, null) ===
    '天气预报',
)

check(
  '目录只给了 attributes.friendly_name 也用',
  weatherEntityLabel('weather.home', { attributes: { friendly_name: '客厅气象站' } }, null) ===
    '客厅气象站',
)

check(
  '什么都没有才回落到实体 ID（至少不是空白）',
  weatherEntityLabel('weather.home', null, null) === 'weather.home',
)

check(
  '未绑定（空 ID）返回空串，由调用方决定占位文案',
  weatherEntityLabel('', { name: '不该被用上' }, null) === '',
)

check(
  '名字两侧空白被裁掉（HA 里手填过空格）',
  weatherEntityLabel('weather.home', { name: '  阳台天气  ' }, null) === '阳台天气',
)

check(
  '非字符串名字（HA 返回数字 / 对象）不当作显示名',
  weatherEntityLabel('weather.home', { name: 42 }, null) === 'weather.home',
)

section('② 状态形状：Map（状态中枢）与普通对象都要能读')

{
  const hubWeatherState = { attributes: { friendly_name: '中枢天气' } }
  const statesByEntityId = new Map([['weather.home', hubWeatherState]])
  check(
    'Map 形状',
    weatherEntityState(statesByEntityId, 'weather.home') === hubWeatherState,
  )
  check(
    '普通对象形状',
    weatherEntityState({ 'weather.home': { state: 'rainy' } }, 'weather.home')?.state === 'rainy',
  )
  check('缺 ID / 缺表都返回 null（不抛）', weatherEntityState(null, 'weather.home') === null)
  check(
    '表里没有这个实体返回 undefined',
    weatherEntityState(statesByEntityId, 'weather.missing') === undefined,
  )
}

section('③ 绑定校验：只有合法 weather.* 才算已绑定')

check('合法 ID 原样返回', weatherEntityId({ entityId: 'weather.wulumuqi' }) === 'weather.wulumuqi')
check('缺省返回空串', weatherEntityId(undefined) === '')
check('别的域不算绑定（防止把灯当天气）', weatherEntityId({ entityId: 'light.kitchen' }) === '')
check(
  '大小写 / 非法字符不算绑定',
  weatherEntityId({ entityId: 'Weather.Wulumuqi' }) === '' &&
    weatherEntityId({ entityId: 'weather.wulumuqi-2' }) === '',
)

section('④ 接线：检查器按钮的文案来自 weatherEntityLabel')

{
  const source = EDITOR_SOURCE
  const sectionStart = source.indexOf('createSection("天气效果")')
  const sectionEnd = source.indexOf('stopWeatherPreviewButton', sectionStart)
  const weatherBindingSource =
    sectionStart >= 0 && sectionEnd > sectionStart ? source.slice(sectionStart, sectionEnd) : ''

  check('定位到天气分组源码', weatherBindingSource.length > 0, EDITOR_SOURCE_PATH)
  check(
    '按钮文案经由 weatherEntityLabel 解析',
    /weatherEntityButton = createElement\([\s\S]*?weatherEntityLabel\(/.test(weatherBindingSource),
  )
  check(
    '不再把实体 ID 直接当按钮文案',
    !/createElement\(\s*"button",\s*"secondary-button",\s*weatherEntityId\s*\)/.test(
      weatherBindingSource,
    ),
  )
  check(
    'ID 退到 title（排障仍拿得到）',
    weatherEntityButtonTitleAssignments(weatherBindingSource) >= 2,
  )
  check(
    '选中后立即换文案（不等面板重建）',
    /onSelect:[\s\S]*?weatherEntityButton\.textContent\s*=/.test(weatherBindingSource),
  )
}

/** 统计把实体 ID 写进按钮 `title` 的位置：初次渲染 + 选中回调，少一处就说明漏了刷新。 */
function weatherEntityButtonTitleAssignments(weatherBindingSource: string) {
  return (weatherBindingSource.match(/weatherEntityButton\.title\s*=/g) || []).length
}

report('天气实体绑定按钮显示名回归')
