/**
 * 能源字段静态映射表（attr keys / aliases / field defs）
 *
 * 职责：
 * - 维护能源统计类别（grid / gas / water / ct / cu）的约定命名前缀。
 * - 维护综合 balance 实体上的属性键映射表（ENERGY_BALANCE_ATTR_KEYS）。
 * - 维护字段推断别名表（ENERGY_FIELD_ALIASES），用于从实体后缀 / 属性名 / friendly_name 推断字段。
 * - 维护各类别的逻辑字段定义表（ENERGY_FIELD_DEFS），含 label / unit / conventionSuffix / defaultAttr。
 *
 * 依赖：无外部依赖，纯静态映射表。
 *
 * 注意：
 * - 类别 key（grid / gas / water / ct / cu）为能源类别配置 key，不翻译。
 * - `ENERGY_CONVENTION_PREFIX` value（ele / gas / ...）为 HA entity_id 前缀片段，不翻译。
 * - `ENERGY_BALANCE_ATTR_KEYS` / `defaultAttr` 中的中文属性名（如「账户余额」）为 HA 集成返回的
 *   属性 key，不翻译。
 * - `conventionSuffix` 为 HA entity_id 后缀（小写），不翻译。
 * - 仅 `label`（面向用户的字段显示名）使用简体中文。
 */
/** 能源统计类别 ID */

export const ENERGY_CATEGORIES = ['grid', 'gas', 'water', 'ct', 'cu'] as const
/** 能源统计类别（与 ENERGY_CATEGORIES 元组元素对齐） */
export type EnergyCategory = (typeof ENERGY_CATEGORIES)[number]
/** 约定命名前缀（sensor.{prefix}_{accountLast4}_） */
export const ENERGY_CONVENTION_PREFIX = {
  grid: 'ele',
  gas: 'gas',
  water: 'water',
  ct: 'ct',
  cu: 'cu',
}

/** CT 为运营商字段基模板；对齐 china_comm CT/CU sensor 实体后缀 */
const COMM_CARRIER_BASE = [
  {
    key: 'balance',
    label: '账户余额',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'balance',
    defaultAttr: '账户余额',
    balancePrimary: true,
  },
  {
    key: 'monthlyFee',
    label: '本月消费',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'currentmonthcost',
    defaultAttr: '本月消费',
  },
  {
    key: 'arrear',
    label: '欠费',
    unit: '¥',
    type: 'number',
    conventionSuffix: '',
    defaultAttr: '欠费',
    balanceAttrOnly: true,
  },
  {
    key: 'dataTotal',
    label: '流量总量',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'flowtotal',
    defaultAttr: '流量总量',
  },
  {
    key: 'dataUsed',
    label: '流量已用',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'flowuse',
    defaultAttr: '流量已用',
  },
  {
    key: 'dataRemaining',
    label: '流量剩余',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'flowbalance',
    defaultAttr: '流量剩余',
  },
  {
    key: 'dataOverlimit',
    label: '流量超出',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'flowover',
    defaultAttr: '流量超出',
  },
  {
    key: 'dataUsageRate',
    label: '流量使用率',
    unit: '%',
    type: 'number',
    conventionSuffix: 'flowpercent',
    defaultAttr: '流量使用率',
  },
  {
    key: 'dataCommonTotal',
    label: '通用流量总量',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'commontotal',
    defaultAttr: '通用流量总量',
  },
  {
    key: 'dataCommonUsed',
    label: '通用流量已用',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'commonuse',
    defaultAttr: '通用流量已用',
  },
  {
    key: 'dataCommonRemaining',
    label: '通用流量剩余',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'commonbalance',
    defaultAttr: '通用流量剩余',
  },
  {
    key: 'dataSpecialTotal',
    label: '专用流量总量',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'specialtotal',
    defaultAttr: '专用流量总量',
  },
  {
    key: 'dataSpecialUsed',
    label: '专用流量已用',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'specialuse',
    defaultAttr: '专用流量已用',
  },
  {
    key: 'dataSpecialRemaining',
    label: '专用流量剩余',
    unit: 'GB',
    type: 'number',
    conventionSuffix: 'specialbalance',
    defaultAttr: '专用流量剩余',
  },
  {
    key: 'talkTotal',
    label: '通话总量',
    unit: '分钟',
    type: 'number',
    conventionSuffix: 'voicetotal',
    defaultAttr: '通话总量',
  },
  {
    key: 'talkUsed',
    label: '通话已用',
    unit: '分钟',
    type: 'number',
    conventionSuffix: 'voiceusage',
    defaultAttr: '通话已用',
  },
  {
    key: 'talkRemaining',
    label: '通话剩余',
    unit: '分钟',
    type: 'number',
    conventionSuffix: 'voicebalance',
    defaultAttr: '通话剩余',
  },
  {
    key: 'talkUsageRate',
    label: '通话使用率',
    unit: '%',
    type: 'number',
    conventionSuffix: 'voicepercent',
    defaultAttr: '通话使用率',
  },
  {
    key: 'smsTotal',
    label: '短信总量',
    unit: '条',
    type: 'number',
    conventionSuffix: 'smstotal',
    defaultAttr: '短信总量',
  },
  {
    key: 'smsUsed',
    label: '短信已用',
    unit: '条',
    type: 'number',
    conventionSuffix: 'smsusage',
    defaultAttr: '短信已用',
  },
  {
    key: 'smsRemaining',
    label: '短信剩余',
    unit: '条',
    type: 'number',
    conventionSuffix: 'smsbalance',
    defaultAttr: '短信剩余',
  },
  {
    key: 'smsUsageRate',
    label: '短信使用率',
    unit: '%',
    type: 'number',
    conventionSuffix: 'smspercent',
    defaultAttr: '短信使用率',
  },
  {
    key: 'points',
    label: '积分',
    unit: '分',
    type: 'number',
    conventionSuffix: 'points',
    defaultAttr: '积分',
  },
  {
    key: 'refreshTime',
    label: '最近刷新时间',
    type: 'string',
    conventionSuffix: 'lastrefreshtime',
    defaultAttr: '最近刷新时间',
  },
] as const

type CommCarrierField = {
  key: string
  label: string
  unit?: string
  type: string
  conventionSuffix: string
  defaultAttr: string
  balancePrimary?: boolean
  balanceAttrOnly?: boolean
}

type CommCarrierFieldOverrides = {
  conventionSuffix?: Record<string, string>
  balanceAttrOnly?: Record<string, boolean>
  omitKeys?: string[]
  extraFields?: Array<CommCarrierField & { insertAfter: string }>
}

/** 以 CT 为基模板，按运营商覆盖 conventionSuffix / balanceAttrOnly，并插入额外字段 */
function createCommCarrierFields(overrides: CommCarrierFieldOverrides = {}): CommCarrierField[] {
  const { conventionSuffix = {}, balanceAttrOnly = {}, omitKeys = [], extraFields = [] } =
    overrides
  const omit = new Set(omitKeys)
  const result: CommCarrierField[] = []
  for (const base of COMM_CARRIER_BASE) {
    if (omit.has(base.key)) continue
    const field: CommCarrierField = { ...base }
    if (Object.prototype.hasOwnProperty.call(conventionSuffix, base.key)) {
      field.conventionSuffix = conventionSuffix[base.key]!
    }
    if (Object.prototype.hasOwnProperty.call(balanceAttrOnly, base.key)) {
      if (balanceAttrOnly[base.key]) field.balanceAttrOnly = true
      else delete field.balanceAttrOnly
    }
    result.push(field)
    for (const extra of extraFields) {
      if (extra.insertAfter !== base.key) continue
      const { insertAfter: _insertAfter, ...rest } = extra
      result.push(rest)
    }
  }
  return result
}

/** CT 电信：sensor.ct_{last4}_{key}（对齐 china_comm/CT/sensor.py） */
const CT_FIELDS = createCommCarrierFields({
  extraFields: [
    {
      insertAfter: 'dataCommonRemaining',
      key: 'dataCommonOver',
      label: '通用流量超量',
      unit: 'GB',
      type: 'number',
      conventionSuffix: 'commonover',
      defaultAttr: '通用流量超量',
    },
  ],
})

/** CU 联通：sensor.cu_{last4}_{key}（对齐 china_comm/CU/sensor.py） */
const CU_FIELDS = createCommCarrierFields({
  // 联通有独立欠费实体 arrear；信用额度 / 上月转接 / 其他流量为联通特有
  conventionSuffix: {
    arrear: 'arrear',
  },
  balanceAttrOnly: { arrear: false },
  omitKeys: ['points'],
  extraFields: [
    {
      insertAfter: 'arrear',
      key: 'creditLimit',
      label: '信用额度',
      unit: '¥',
      type: 'number',
      conventionSuffix: 'creditvalue',
      defaultAttr: '信用额度',
    },
    {
      insertAfter: 'dataUsageRate',
      key: 'dataCarryover',
      label: '上月转接流量',
      unit: 'GB',
      type: 'number',
      conventionSuffix: 'flowcarried',
      defaultAttr: '上月转接流量',
    },
    {
      insertAfter: 'dataSpecialRemaining',
      key: 'dataOtherTotal',
      label: '其他流量总量',
      unit: 'GB',
      type: 'number',
      conventionSuffix: 'othertotal',
      defaultAttr: '其他流量总量',
    },
    {
      insertAfter: 'dataSpecialRemaining',
      key: 'dataOtherUsed',
      label: '其他流量已用',
      unit: 'GB',
      type: 'number',
      conventionSuffix: 'otheruse',
      defaultAttr: '其他流量已用',
    },
    {
      insertAfter: 'dataSpecialRemaining',
      key: 'dataOtherRemaining',
      label: '其他流量剩余',
      unit: 'GB',
      type: 'number',
      conventionSuffix: 'otherbalance',
      defaultAttr: '其他流量剩余',
    },
  ],
})

function balanceAttrKeysFromFields(
  fields: CommCarrierField[],
  extraAliases: Record<string, string[]> = {},
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of fields) {
    out[f.key] = [f.defaultAttr, ...(extraAliases[f.key] || [])]
  }
  return out
}

/**
 * 综合 balance 实体上的属性键（entity 模式 attrMap 默认 / 约定模式回退）
 * 对齐 xjele / xjgas / china_comm CT·CU·CM 集成实现。
 */
export const ENERGY_BALANCE_ATTR_KEYS = {
  grid: {
    dailyNum: ['daily_ele_num'],
    dailyCost: ['daily_ele_cost'],
    monthNum: ['month_ele_num'],
    monthCost: ['month_ele_cost'],
    lastMonthNum: ['last_month_ele_num'],
    lastMonthCost: ['last_month_ele_cost'],
    yearNum: ['year_ele_num'],
    yearCost: ['year_ele_cost'],
    dailyDate: ['daily_lasted_date', 'date'],
    refreshTime: ['refresh_time', 'date'],
    remainingDays: ['remaining_days'],
    daylist: ['daylist'],
    monthlist: ['monthlist'],
    yearlist: ['yearlist'],
    billingStandard: ['计费标准'],
  },
  gas: {
    dailyNum: ['daily_usage'],
    monthNum: ['month_gas_num'],
    monthCost: ['month_gas_cost'],
    lastMonthNum: ['last_month_gas_num'],
    lastMonthCost: ['last_month_gas_cost'],
    yearNum: ['year_gas_num'],
    yearCost: ['year_gas_cost'],
    dailyDate: ['latest_data', 'syn'],
    refreshTime: ['syn', 'update_time'],
    remainingDays: ['remaining_days'],
    daylist: ['daylist'],
    monthlist: ['monthlist'],
    yearlist: ['yearlist'],
    billingStandard: ['计费标准'],
  },
  water: {
    dailyNum: ['daily_usage'],
    monthNum: ['month_water_num'],
    monthCost: ['month_water_cost'],
    lastMonthNum: ['last_month_water_num'],
    lastMonthCost: ['last_month_water_cost'],
    yearNum: ['year_water_num'],
    yearCost: ['year_water_cost'],
    dailyDate: ['latest_data'],
    refreshTime: ['syn', 'refresh_time'],
    daylist: ['daylist'],
    monthlist: ['monthlist'],
    yearlist: ['yearlist'],
    billingStandard: ['计费标准'],
  },
  ct: balanceAttrKeysFromFields(CT_FIELDS),
  cu: balanceAttrKeysFromFields(CU_FIELDS, {
    balance: ['当前余额'],
    arrear: ['总欠费'],
  }),
}
/** 推断映射时的别名（实体后缀 / 属性名 / friendly_name 关键词） */
export const ENERGY_FIELD_ALIASES = {
  balance: ['balance', '账户余额', '当前余额'],
  arrear: ['arrear', '欠费', '总欠费', 'allbowe'],
  dailyNum: [
    'daily_ele_num',
    'daily_usage',
    'daily_water_num',
    'daily_gas_num',
    '日用气量',
    '日用水量',
    '日用电',
  ],
  dailyCost: [
    'daily_ele_cost',
    'daily_cost',
    'daily_gas_cost',
    'daily_water_cost',
    '日账单',
    '日费用',
  ],
  monthNum: [
    'month_ele_num',
    'month_gas_num',
    'month_water_num',
    'last_usage',
    'month_data_num',
    'month_call_num',
    '月度用气量',
    '月度用水量',
  ],
  monthCost: [
    'month_ele_cost',
    'month_gas_cost',
    'month_water_cost',
    'last_fee',
    'month_data_cost',
    'month_call_cost',
    '月度账单',
    'month_cost',
  ],
  lastMonthNum: [
    'last_month_ele_num',
    'last_month_gas_num',
    'last_month_water_num',
    'last_month_data_num',
    'last_month_call_num',
  ],
  lastMonthCost: [
    'last_month_ele_cost',
    'last_month_gas_cost',
    'last_month_water_cost',
    'last_month_data_cost',
    'last_month_call_cost',
  ],
  yearNum: [
    'year_ele_num',
    'year_gas_num',
    'year_water_num',
    'year_data_num',
    'year_call_num',
    'year_usage',
    '年度用气量',
  ],
  yearCost: [
    'year_ele_cost',
    'year_gas_cost',
    'year_water_cost',
    'year_data_cost',
    'year_call_cost',
    'annual_fee',
    '年度账单',
  ],
  lastPayment: ['last_payment', '最近交费'],
  dailyDate: ['daily_lasted_date', 'latest_data', 'latest_data_time', 'data_date', '最新数据时间'],
  refreshTime: [
    'refresh_time',
    'syn',
    'update_time',
    'lastrefreshtime',
    'last_refresh_time',
    '最近刷新时间',
  ],
  voltage: ['voltage', '电压'],
  power: ['power', '功率'],
  meterReading: ['current_reading', 'meter_reading', '当前抄表数', '抄表数'],
  currentTier: ['current_tier', '当前计价阶梯', 'tier'],
  unitPrice: [
    'unit_price',
    'price',
    'current_unit_price',
    '当前用气单价',
    '当前用水单价',
    'avg_price',
    'fixed_price',
  ],
  remainingDays: ['remaining_days', '剩余天数'],
  creditLimit: ['credit_limit', 'creditvalue', 'credit_value', '信用额度'],
  monthlyFee: [
    'month_cost',
    'monthly_fee',
    'plan_fee',
    'currentmonthcost',
    'realfeenew',
    '月费',
    '本月消费',
  ],
  smsTotal: ['sms_total', 'total_sms', 'smstotal', '短信总量'],
  smsUsed: ['sms_used', 'smsusage', '短信已用'],
  smsRemaining: ['sms_balance', 'smsbalance', 'smsavailable', '短信剩余'],
  smsUsageRate: ['sms_percent', 'smspercent', 'smsusageratio', 'smspercentused', '短信使用率'],
  points: ['points', '积分'],
  dataOverlimit: ['data_overlimit', 'data_exceed', 'flowover', '流量超出'],
  dataRemaining: ['data_remaining', 'data_left', 'flowbalance', '流量剩余'],
  dataUsageRate: [
    'data_usage_rate',
    'flowpercent',
    'percentused',
    'flowusageratio',
    '流量使用率',
  ],
  dataUsed: ['data_used', 'flowuse', 'month_data_num', '流量已用'],
  dataTotal: ['data_total', 'flowtotal', '流量总量'],
  dataCarryover: [
    'data_carryover',
    'flowcarried',
    'lastmonthflow',
    'flowcarry',
    'flow_carryover',
    '上月转接流量',
  ],
  dataCommonTotal: ['commontotal', '通用流量总量'],
  dataCommonUsed: ['commonuse', '通用流量已用'],
  dataCommonRemaining: ['commonbalance', '通用流量剩余'],
  dataCommonOver: ['commonover', '通用流量超量'],
  dataSpecialTotal: ['specialtotal', '专用流量总量'],
  dataSpecialUsed: ['specialuse', '专用流量已用'],
  dataSpecialRemaining: ['specialbalance', '专用流量剩余'],
  dataOtherTotal: ['othertotal', '其他流量总量'],
  dataOtherUsed: ['otheruse', '其他流量已用'],
  dataOtherRemaining: ['otherbalance', '其他流量剩余'],
  talkRemaining: [
    'talk_remaining',
    'call_remaining',
    'voicebalance',
    'voiceavailable',
    '通话剩余',
  ],
  talkUsageRate: [
    'talk_usage_rate',
    'call_usage_rate',
    'voicepercent',
    'voicepercentused',
    'voiceusageratio',
    '通话使用率',
  ],
  talkUsed: ['talk_used', 'voiceusage', 'month_call_num', '通话已用'],
  talkTotal: ['talk_total', 'call_total', 'voicetotal', '通话总量'],
  planName: ['plan_name', '套餐名称'],
  daylist: ['daylist', '日明细'],
  monthlist: ['monthlist', '月明细'],
  yearlist: ['yearlist', '年明细'],
  billingStandard: ['计费标准', 'billing_standard'],
}
/** 燃气与水务共享的字段定义（水务按需覆盖 conventionSuffix / defaultAttr） */
const GAS_WATER_SHARED = [
  {
    key: 'balance',
    label: '余额',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'balance',
    defaultAttr: 'balance',
    balancePrimary: true,
  },
  {
    key: 'meterReading',
    label: '当前抄表数',
    unit: 'm³',
    type: 'number',
    conventionSuffix: 'current_reading',
    defaultAttr: 'current_reading',
  },
  {
    key: 'currentTier',
    label: '计价阶梯',
    type: 'number',
    conventionSuffix: 'current_tier',
    defaultAttr: 'current_tier',
  },
  {
    key: 'unitPrice',
    label: '单价',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'current_unit_price',
    defaultAttr: 'current_unit_price',
  },
  {
    key: 'dailyNum',
    label: '今日用量',
    unit: 'm³',
    type: 'number',
    conventionSuffix: 'daily_usage',
    defaultAttr: 'daily_usage',
  },
  {
    key: 'dailyCost',
    label: '今日费用',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'daily_cost',
    defaultAttr: 'daily_cost',
  },
  {
    key: 'monthNum',
    label: '本月用量',
    unit: 'm³',
    type: 'number',
    conventionSuffix: 'last_usage',
    defaultAttr: 'month_gas_num',
    balanceAttrOnly: true,
  },
  {
    key: 'monthCost',
    label: '本月费用',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'last_fee',
    defaultAttr: 'month_gas_cost',
    balanceAttrOnly: true,
  },
  {
    key: 'lastMonthNum',
    label: '上月用量',
    unit: 'm³',
    type: 'number',
    conventionSuffix: '',
    defaultAttr: 'last_month_gas_num',
    balanceAttrOnly: true,
  },
  {
    key: 'lastMonthCost',
    label: '上月费用',
    unit: '¥',
    type: 'number',
    conventionSuffix: '',
    defaultAttr: 'last_month_gas_cost',
    balanceAttrOnly: true,
  },
  {
    key: 'yearNum',
    label: '年度用量',
    unit: 'm³',
    type: 'number',
    conventionSuffix: 'year_gas_num',
    defaultAttr: 'year_gas_num',
    balanceAttrOnly: true,
  },
  {
    key: 'yearCost',
    label: '年度费用',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'annual_fee',
    defaultAttr: 'year_gas_cost',
    balanceAttrOnly: true,
  },
  {
    key: 'lastPayment',
    label: '最近缴费',
    unit: '¥',
    type: 'number',
    conventionSuffix: 'last_payment',
    defaultAttr: 'last_payment_amount',
  },
  {
    key: 'dailyDate',
    label: '数据日期',
    type: 'string',
    conventionSuffix: 'latest_data_time',
    defaultAttr: 'latest_data',
    balanceAttrOnly: true,
  },
  {
    key: 'refreshTime',
    label: '刷新时间',
    type: 'string',
    conventionSuffix: 'update_time',
    defaultAttr: 'syn',
    balanceAttrOnly: true,
  },
  {
    key: 'remainingDays',
    label: '预计可用天数',
    type: 'number',
    conventionSuffix: '',
    defaultAttr: 'remaining_days',
    balanceAttrOnly: true,
  },
  {
    key: 'daylist',
    label: '日明细列表',
    type: 'list',
    conventionSuffix: '',
    defaultAttr: 'daylist',
  },
  {
    key: 'monthlist',
    label: '月明细列表',
    type: 'list',
    conventionSuffix: '',
    defaultAttr: 'monthlist',
  },
  {
    key: 'yearlist',
    label: '年明细列表',
    type: 'list',
    conventionSuffix: '',
    defaultAttr: 'yearlist',
  },
  {
    key: 'billingStandard',
    label: '计费标准',
    type: 'object',
    conventionSuffix: '',
    defaultAttr: '计费标准',
  },
]
/**
 * 各类别可映射逻辑字段
 * conventionSuffix 对齐 HA 集成 entity_id 后缀（小写）
 */
export const ENERGY_FIELD_DEFS = {
  grid: [
    {
      key: 'balance',
      label: '余额',
      unit: '¥',
      type: 'number',
      conventionSuffix: 'balance',
      defaultAttr: 'balance',
      balancePrimary: true,
    },
    {
      key: 'dailyNum',
      label: '今日用量',
      unit: 'kWh',
      type: 'number',
      conventionSuffix: 'daily_ele_num',
      defaultAttr: 'daily_ele_num',
    },
    {
      key: 'dailyCost',
      label: '今日费用',
      unit: '¥',
      type: 'number',
      conventionSuffix: 'daily_ele_cost',
      defaultAttr: 'daily_ele_cost',
    },
    {
      key: 'monthNum',
      label: '本月用量',
      unit: 'kWh',
      type: 'number',
      conventionSuffix: 'month_ele_num',
      defaultAttr: 'month_ele_num',
    },
    {
      key: 'monthCost',
      label: '本月费用',
      unit: '¥',
      type: 'number',
      conventionSuffix: 'month_ele_cost',
      defaultAttr: 'month_ele_cost',
    },
    {
      key: 'lastMonthNum',
      label: '上月用量',
      unit: 'kWh',
      type: 'number',
      conventionSuffix: 'last_month_ele_num',
      defaultAttr: 'last_month_ele_num',
    },
    {
      key: 'lastMonthCost',
      label: '上月费用',
      unit: '¥',
      type: 'number',
      conventionSuffix: 'last_month_ele_cost',
      defaultAttr: 'last_month_ele_cost',
    },
    {
      key: 'yearNum',
      label: '年度用量',
      unit: 'kWh',
      type: 'number',
      conventionSuffix: 'year_ele_num',
      defaultAttr: 'year_ele_num',
    },
    {
      key: 'yearCost',
      label: '年度费用',
      unit: '¥',
      type: 'number',
      conventionSuffix: 'year_ele_cost',
      defaultAttr: 'year_ele_cost',
    },
    {
      key: 'dailyDate',
      label: '数据日期',
      type: 'string',
      conventionSuffix: 'daily_lasted_date',
      defaultAttr: 'daily_lasted_date',
    },
    {
      key: 'refreshTime',
      label: '刷新时间',
      type: 'string',
      conventionSuffix: 'refresh_time',
      defaultAttr: 'refresh_time',
    },
    {
      key: 'remainingDays',
      label: '预计可用天数',
      type: 'number',
      conventionSuffix: '',
      defaultAttr: 'remaining_days',
      balanceAttrOnly: true,
    },
    {
      key: 'daylist',
      label: '日明细列表',
      type: 'list',
      conventionSuffix: 'recent_30_daily_ele_list',
      defaultAttr: 'daylist',
      listAttrFallback: 'daylist',
    },
    {
      key: 'monthlist',
      label: '月明细列表',
      type: 'list',
      conventionSuffix: 'recent_12_monthly_ele_list',
      defaultAttr: 'monthlist',
      listAttrFallback: 'monthlist',
    },
    {
      key: 'yearlist',
      label: '年明细列表',
      type: 'list',
      conventionSuffix: '',
      defaultAttr: 'yearlist',
      balanceAttrOnly: true,
    },
    {
      key: 'billingStandard',
      label: '计费标准',
      type: 'object',
      conventionSuffix: '',
      defaultAttr: '计费标准',
      balanceAttrOnly: true,
    },
  ],
  gas: GAS_WATER_SHARED,
  water: GAS_WATER_SHARED.map((f) => {
    if (f.key === 'monthNum')
      return { ...f, conventionSuffix: 'last_usage', defaultAttr: 'month_water_num' }
    if (f.key === 'monthCost')
      return { ...f, conventionSuffix: 'last_fee', defaultAttr: 'month_water_cost' }
    if (f.key === 'lastMonthNum') return { ...f, defaultAttr: 'last_month_water_num' }
    if (f.key === 'lastMonthCost') return { ...f, defaultAttr: 'last_month_water_cost' }
    if (f.key === 'yearNum')
      return { ...f, conventionSuffix: 'year_water_num', defaultAttr: 'year_water_num' }
    if (f.key === 'yearCost')
      return { ...f, conventionSuffix: 'annual_fee', defaultAttr: 'year_water_cost' }
    if (f.key === 'unitPrice') return { ...f, conventionSuffix: 'current_unit_price' }
    return f
  }),
  ct: CT_FIELDS,
  cu: CU_FIELDS,
}
