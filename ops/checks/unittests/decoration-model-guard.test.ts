/**
 * 导出前的装饰模型体检（对齐 0.8.9「有装饰模型暂时无法载入，请检查后再导图。」）。
 *
 * 这条判定最容易出两种错，两个都会让导出被无故挡住：
 * 1. 把**静态件**的加载失败也算进来（`sofa` 从来没进过诊断列表的 model 键空间）；
 * 2. 把 `fallback` / `render` 阶段当成失败 —— 前者是回退**成功**，模型已经画出来了。
 * 反过来漏判的表现更隐蔽：导出的底图里少一件装饰，却显示「导出成功」。
 */
import { describe, expect, test } from 'bun:test'

import {
  missingDecorationNames,
  exportFolderNameError,
} from '../../../homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/export/export'

const ASSET = 'a576b34cf6f04eb9a855401574ad10e8'
const OTHER = 'ff9ef1fe8eed4e3b9b712d424df235b4'

const floorWith = (items: Array<Record<string, unknown>>) => [{ scene: { items } }]
const decoration = (assetId: string, name = '3D 模型') => ({ type: 'user-decoration', assetId, name })
const loadFailure = (assetId: string) => ({ stage: 'load', itemType: `model:${assetId}` })

describe('导出前的装饰模型体检', () => {
  test('引用了加载失败的装饰 → 报出它的名字', () => {
    const names = missingDecorationNames(floorWith([decoration(ASSET, '打印件')]), [loadFailure(ASSET)])
    expect(names).toEqual(['打印件'])
  })

  test('同名多件只报一次', () => {
    const names = missingDecorationNames(floorWith([decoration(ASSET, '打印件'), decoration(ASSET, '打印件')]), [
      loadFailure(ASSET),
    ])
    expect(names).toEqual(['打印件'])
  })

  test('失败的装饰没摆进户型 → 不拦（用户可能只是删掉了模型）', () => {
    expect(missingDecorationNames(floorWith([decoration(OTHER, '另一个')]), [loadFailure(ASSET)])).toEqual([])
  })

  test('静态件失败不拦导出', () => {
    // `sofa` 这类静态件的 itemType 不带 `model:` 前缀，不属于装饰键空间。
    expect(missingDecorationNames(floorWith([decoration(ASSET, 'x')]), [{ stage: 'load', itemType: 'sofa' }])).toEqual(
      [],
    )
  })

  test('回退成功（fallback）不算缺失', () => {
    // lite 坏了但完整件加载成功：模型已经画出来了，拦下等于误报。
    expect(
      missingDecorationNames(floorWith([decoration(ASSET, 'x')]), [{ stage: 'fallback', itemType: `model:${ASSET}` }]),
    ).toEqual([])
  })

  test('assetId 大小写不敏感（后端下发可能是大写 hex）', () => {
    const names = missingDecorationNames(floorWith([decoration(ASSET.toUpperCase(), '打印件')]), [loadFailure(ASSET)])
    expect(names).toEqual(['打印件'])
  })

  test('缺名字时给占位文案，不产出空格', () => {
    expect(missingDecorationNames(floorWith([decoration(ASSET, '   ')]), [loadFailure(ASSET)])).toEqual(['未命名装饰'])
  })

  test('没有诊断记录 → 直接放行（不需要遍历楼层）', () => {
    expect(missingDecorationNames(null, [])).toEqual([])
    expect(missingDecorationNames(floorWith([decoration(ASSET)]), [])).toEqual([])
  })
})

/**
 * 导出名校验（从 `generateExportBundle` 抽出来后锁住行为）。
 *
 * 它是「搬家」不是「改规则」，所以断言直接照着原条件写：空 / 控制字符 / 保留字符 /
 * 隐藏文件 / 末尾点号或空格都得拒。漏一条的表现是文件名写坏在 NAS 上。
 */
describe('导出文件夹名校验', () => {
  test('合法名放行（含中文、空格、点号在中间）', () => {
    expect(exportFolderNameError('客厅 底图 v1.2')).toBeNull()
    expect(exportFolderNameError('floor-plan')).toBeNull()
  })

  test('空名 / 纯空白拒绝', () => {
    expect(exportFolderNameError('')).toBe('请输入有效的文件夹名')
    expect(exportFolderNameError('   ')).toBe('请输入有效的文件夹名')
  })

  test('保留字符与控制字符拒绝', () => {
    for (const badName of ['a<b', 'a>b', 'a:b', 'a"b', 'a/b', 'a\\b', 'a|b', 'a?b', 'a*b', 'a\u0001b'])
      expect(exportFolderNameError(badName)).toBe('请输入有效的文件夹名')
  })

  test('隐藏文件（以点开头）与末尾点号 / 空格拒绝', () => {
    expect(exportFolderNameError('.hidden')).toBe('请输入有效的文件夹名')
    // 末尾空格先被 trim 掉，所以只有末尾点号会到规则里。
    expect(exportFolderNameError('name.')).toBe('请输入有效的文件夹名')
    expect(exportFolderNameError('name ')).toBeNull()
  })
})
