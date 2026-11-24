/**
 * 能源实体前缀推导的回归测试（燃气 / 水务日历读不出数据的根因）。
 *
 * ## 被钉住的 bug
 *
 * `resolveEntityPrefix` 在 convention 模式下原本**先**从实体 ID 猜前缀，规则是
 * 「取最后一个 `_` 之前」。对 convention 家族的多段后缀不成立：
 *
 *     sensor.gas_3430_daily_usage → "sensor.gas_3430_daily_"
 *     → balance 兄弟 = "sensor.gas_3430_daily_balance"（不存在）
 *
 * 于是 `daylist` / `monthlist` 全部取不到，日历整片 `--`。
 * 电力卡看起来正常只是因为它在服务端聚合表里有数据（走了另一条路）。
 *
 * 正确规则：convention 模式下**账户号是权威来源** → `sensor.<前缀>_<账号后4位>_`。
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveEntityPrefix,
  resolvePopupBalanceId,
} from '../../../homeos/frontend/src/shared/energy/utils/source.util'

/** 与 homeos.db 里真实的 gas 配置同形（含 accountEntries，缺它无法推导前缀）。 */
const gasConfig = {
  energySources: {
    gas: {
      mode: 'convention',
      account: '510193430',
      attrMap: {},
      entityId: '',
      entityMap: {},
      accountEntries: [{ label: '', number: '510193430' }],
      primaryAccountIndex: 0,
    },
  },
}

const gridConfig = {
  energySources: {
    grid: {
      mode: 'convention',
      account: '6504001248107',
      attrMap: {},
      entityId: '',
      entityMap: {},
      accountEntries: [{ label: '', number: '6504001248107' }],
      primaryAccountIndex: 0,
    },
  },
}

describe('resolveEntityPrefix（convention 模式）', () => {
  test('balance 实体自身', () => {
    expect(resolveEntityPrefix('gas', gasConfig as never, 'sensor.gas_3430_balance')).toBe('sensor.gas_3430_')
  })

  test('多段后缀的家族实体不能按最后一个下划线截断', () => {
    // 这是 bug 的原始形态：曾返回 "sensor.gas_3430_daily_"
    expect(resolveEntityPrefix('gas', gasConfig as never, 'sensor.gas_3430_daily_usage')).toBe('sensor.gas_3430_')
    expect(resolveEntityPrefix('gas', gasConfig as never, 'sensor.gas_3430_current_reading')).toBe('sensor.gas_3430_')
  })

  test('电力同样走账户前缀（账号后 4 位）', () => {
    expect(resolveEntityPrefix('grid', gridConfig as never, 'sensor.ele_8107_year_ele_num')).toBe('sensor.ele_8107_')
  })

  test('没有 accountEntries 时退回实体 ID 推导（不打挂）', () => {
    const noAccounts = { energySources: { gas: { mode: 'convention', attrMap: {} } } }
    expect(resolveEntityPrefix('gas', noAccounts as never, 'sensor.gas_3430_balance')).toBe('sensor.gas_3430_')
  })
})

describe('resolvePopupBalanceId', () => {
  test('从任意家族实体重定向到 balance 兄弟', () => {
    expect(resolvePopupBalanceId('gas', gasConfig as never, 'sensor.gas_3430_daily_usage')).toBe(
      'sensor.gas_3430_balance',
    )
    expect(resolvePopupBalanceId('gas', gasConfig as never, 'sensor.gas_3430_current_reading')).toBe(
      'sensor.gas_3430_balance',
    )
  })

  test('balance 实体自身保持原样', () => {
    expect(resolvePopupBalanceId('gas', gasConfig as never, 'sensor.gas_3430_balance')).toBe('sensor.gas_3430_balance')
  })
})
