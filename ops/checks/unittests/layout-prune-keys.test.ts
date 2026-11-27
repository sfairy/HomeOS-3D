/**
 * 布局顶层键裁剪：切换方案 / 换账号 / 回滚备份时必须让本地对象与基线**键集合一致**。
 *
 * 只做 `Object.assign` 会留下上一份数据独有的键，下一次保存又把它们写回服务端：
 * 「切回默认方案后仍带着另一个方案的设置」「删掉的配置段过一会自己回来」都是这条。
 */
import { describe, expect, test } from 'bun:test'

import { pruneMissingLayoutKeys } from '../../../homeos/frontend/src/domain/layout/store/prune-layout-keys'

describe('pruneMissingLayoutKeys', () => {
  test('删除基线里没有的顶层键', () => {
    const target: Record<string, unknown> = { a: 1, stale: { x: 1 } }
    expect(pruneMissingLayoutKeys(target, { a: 2 })).toBe(true)
    expect(Object.keys(target)).toEqual(['a'])
  })

  test('基线里没有值但键存在时保留（显式空值也是一份数据）', () => {
    const target: Record<string, unknown> = { a: null }
    expect(pruneMissingLayoutKeys(target, { a: {} })).toBe(false)
    expect('a' in target).toBe(true)
  })

  test('没有多余键时不动且返回 false', () => {
    const target: Record<string, unknown> = { a: 1 }
    expect(pruneMissingLayoutKeys(target, { a: 1, b: 2 })).toBe(false)
    expect(target).toEqual({ a: 1 })
  })
})
