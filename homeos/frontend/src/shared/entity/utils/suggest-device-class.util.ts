/**
 * 「从占位符文案推断建议 device_class」的唯一实现。
 *
 * 使用场景：表单里的实体选择器还没选具体实体时，按作者填写的 placeholder
 * （「选择温度传感器」「选择 PM2.5」）预先给候选实体分组 / 打标。
 *
 * 口径说明（为什么这里允许匹配中文）：
 * - 输入是**作者写的界面文案**，不是运行期的用户数据或接口文案 —— 它和代码一起评审、
 *   一起改，不存在「后端改一句提示语就让前端行为漂移」的问题；
 * - 英文 token 是主判据，中文只是同一分支的别名（HA 集成与国内设备名普遍是中文）；
 * - 短英文缩写（``co`` / ``pm25``）必须按词边界匹配：``hint.includes('co')`` 会把
 *   ``comfort`` / ``cool`` 也判成 ``carbon_monoxide``。
 *
 * 之前这份逻辑在 `composables/entity/entity-input.internals.ts` 与
 * `components/common/entity-multi-select/useEntityMultiSelect.ts` 各写了一遍（后者是
 * 前者的子集），两处判据不一致时同一个 placeholder 会在两处给出不同的建议类型。
 */

/** 词边界匹配：ASCII 缩写两侧不能紧邻字母或数字（中文相邻视为边界）。 */
function hasToken(hint: string, token: string): boolean {
  if (!/[a-z0-9]/i.test(token)) return hint.includes(token)
  return new RegExp(`(?:^|[^a-z0-9])${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`, 'i').test(hint)
}

function matchesAny(hint: string, tokens: readonly string[]): boolean {
  return tokens.some((token) =>
    token.length <= 4 && /^[a-z0-9]+$/i.test(token) ? hasToken(hint, token) : hint.includes(token),
  )
}

const SUGGEST_DEVICE_CLASS_RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['temperature', ['temperature', '_temp', 'temp', '温度']],
  ['humidity', ['humidity', 'hum', '湿度']],
  ['pm25', ['pm25', 'pm2.5', 'pm_2_5', '空气质量']],
  ['carbon_dioxide', ['co2', 'carbon_dioxide', '二氧化碳']],
  ['battery', ['battery', '电池']],
  ['power', ['power', 'energy', '功率', '能耗']],
  ['voltage', ['voltage', '电压']],
  ['current', ['current', '电流']],
  ['occupancy', ['presence', 'mmwave', 'occupancy', '存在', '人体']],
  ['motion', ['motion', '运动']],
  ['gas', ['gas', '燃气', 'methane', '甲烷']],
  ['smoke', ['smoke', '烟雾']],
  ['moisture', ['water', 'leak', '漏水', '水浸']],
  ['door', ['lock', 'door', '门锁']],
  ['window', ['window', '窗户']],
  ['carbon_monoxide', ['carbon_monoxide', 'co', '一氧化碳']],
]

/**
 * 从 placeholder / 提示文案推断建议 device_class；推断不出返回空串。
 *
 * 顺序即优先级：``motion`` 必须在 ``door`` 之前、``carbon_monoxide`` 在 ``gas`` 之后，
 * 否则「一氧化碳」会被 ``gas`` 先命中（``一氧化碳`` 里没有 gas，但 ``co`` 会命中
 * ``carbon_monoxide`` 之前的任意分支）—— 修改顺序前先跑既有的分类自检，
 * 确认分类结果没有整体位移。
 */
export function inferSuggestDeviceClassFromPlaceholder(placeholder: string): string {
  const hint = (placeholder || '').toLowerCase()
  if (!hint) return ''
  for (const [deviceClass, tokens] of SUGGEST_DEVICE_CLASS_RULES) {
    if (matchesAny(hint, tokens)) return deviceClass
  }
  return ''
}
