/**
 * 编辑器「样式包」（`editor-navigation-style-metadata` 的 8 张表）契约测试。
 *
 * 0.8.1 把上游 8 个 `*-style.js` 拆包改成「逐键对上游断言」。拆包结构可以不同，
 * 但键名、分组、单位、默认值必须一致 —— 这些表同时驱动检视面板和样式应用，
 * 少一个键的表现是「面板里少一行」，默认值错了则是「新控件一上手就是歪的」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const moduleUrl = fileURLToPath(
  new URL(
    '../../../../homeos/frontend/src/studio/app/editor/metadata/editor-navigation-style-metadata.ts',
    import.meta.url,
  ),
)

const metadata = await import(moduleUrl)

const PACK_NAMES = [
  'navigationVisibilityComponentState',
  'navigationPreviewClickComponentId',
  'onNavigationStyleApplyDialogCloseValue',
  'styleSourceComponentIdState',
  'styleComponentTypeState',
  'navigationIconOptionState',
  'navigationIconDraftDocumentValue',
  'entryStateRef',
]

const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

test('样式包：8 张表都存在且非空', () => {
  const exportedPacks = PACK_NAMES.filter((packName) => metadata[packName] != null)
  assert.deepEqual(exportedPacks, PACK_NAMES)
  for (const packName of PACK_NAMES) {
    assert.ok(Object.keys(metadata[packName]).length > 0, `${packName} 不能是空表`)
  }
})

test('样式包：派生出的分组表每个键都有 group + label', () => {
  for (const packName of PACK_NAMES) {
    const pack = metadata[packName]
    for (const [key, entry] of Object.entries(pack)) {
      if (!entry || typeof entry !== 'object') continue
      if (!('group' in entry) && !('label' in entry)) continue
      assert.equal(typeof entry.group, 'string', `${packName}.${key} 缺 group`)
      assert.ok(entry.group.length > 0, `${packName}.${key} 的 group 不能为空`)
      assert.equal(typeof entry.label, 'string', `${packName}.${key} 缺 label`)
      assert.ok(entry.label.length > 0, `${packName}.${key} 的 label 不能为空`)
    }
  }
})

test('样式包：默认值里没有 undefined，颜色都是 6 位 hex', () => {
  for (const packName of PACK_NAMES) {
    for (const [key, value] of Object.entries(metadata[packName])) {
      assert.notEqual(value, undefined, `${packName}.${key} 默认值缺失`)
      // 分组表的值是 {group,label}，只有默认值表才需要校验颜色/范围。
      if (typeof value !== 'number' && typeof value !== 'string') continue
      if (/Color$/.test(key)) assert.ok(isHexColor(value), `${packName}.${key} 不是 hex 颜色`)
      if (/Opacity$/.test(key)) assert.ok(value >= 0 && value <= 1, `${packName}.${key} 取值越界`)
      if (/Weight$/.test(key)) assert.ok(value >= 0 && value <= 1, `${packName}.${key} 取值越界`)
    }
  }
})

test('样式包：数值组件默认值锁定（当前数值 / 预览 / 图标 / 传感器）', () => {
  assert.deepEqual(
    {
      visible: metadata.navigationVisibilityComponentState.valueVisible,
      precision: metadata.navigationVisibilityComponentState.statePrecision,
      updateInterval: metadata.navigationVisibilityComponentState.updateInterval,
      hours: metadata.navigationVisibilityComponentState.hours,
      cornerRadius: metadata.navigationVisibilityComponentState.cornerRadius,
      thresholdMode: metadata.navigationVisibilityComponentState.thresholdMode,
      color: metadata.navigationVisibilityComponentState.valueColor,
    },
    {
      visible: true,
      precision: 'auto',
      updateInterval: 600,
      hours: 24,
      cornerRadius: 10,
      thresholdMode: 'auto',
      color: '#dce1e5',
    },
  )
  assert.deepEqual(
    {
      mainSize: metadata.styleComponentTypeState.iconSize,
      iconLeft: metadata.styleComponentTypeState.iconLeft,
      iconTop: metadata.styleComponentTypeState.iconTop,
      iconOnColor: metadata.styleComponentTypeState.iconOnColor,
    },
    { mainSize: 42, iconLeft: 50, iconTop: 34, iconOnColor: '#379bff' },
  )
})

test('样式包：按钮/预览/草案包默认值锁定', () => {
  assert.deepEqual(
    {
      mainTextVisible: metadata.navigationPreviewClickComponentId.mainTextVisible,
      mainSize: metadata.navigationPreviewClickComponentId.mainSize,
      mainWeight: metadata.navigationPreviewClickComponentId.mainWeight,
      secondaryLineGap: metadata.navigationPreviewClickComponentId.secondaryLineGap,
      mainColor: metadata.navigationPreviewClickComponentId.mainColor,
    },
    { mainTextVisible: true, mainSize: 34, mainWeight: 0.3, secondaryLineGap: 2, mainColor: '#b9bbc0' },
  )
  assert.deepEqual(
    {
      icon: metadata.onNavigationStyleApplyDialogCloseValue.icon,
      iconSize: metadata.onNavigationStyleApplyDialogCloseValue.iconSize,
      buttonOpacity: metadata.onNavigationStyleApplyDialogCloseValue.buttonOpacity,
      radius: metadata.onNavigationStyleApplyDialogCloseValue.radius,
    },
    { icon: 'mdi:lightbulb-outline', iconSize: 44, buttonOpacity: 0.92, radius: 50 },
  )
  assert.deepEqual(
    {
      mainSize: metadata.navigationIconDraftDocumentValue.mainSize,
      mainOpacity: metadata.navigationIconDraftDocumentValue.mainOpacity,
      mainTextLeft: metadata.navigationIconDraftDocumentValue.mainTextLeft,
    },
    { mainSize: 30, mainOpacity: 0.72, mainTextLeft: 5.2 },
  )
})

test('样式包：摄像头与效果按钮的显示模式/单位锁定', () => {
  assert.deepEqual(
    {
      displayMode: metadata.navigationIconOptionState.displayMode,
      refreshInterval: metadata.navigationIconOptionState.refreshInterval,
      fit: metadata.navigationIconOptionState.fit,
      frameAngle: metadata.navigationIconOptionState.frameAngle,
      radius: metadata.navigationIconOptionState.radius,
    },
    { displayMode: 'live', refreshInterval: 10, fit: 'fill', frameAngle: 45, radius: 0.04 },
  )
  assert.deepEqual(
    {
      iconVisible: metadata.entryStateRef.iconVisible,
      glowVisible: metadata.entryStateRef.glowVisible,
      mainSize: metadata.entryStateRef.mainSize,
      mainWeight: metadata.entryStateRef.mainWeight,
    },
    { iconVisible: true, glowVisible: true, mainSize: 30, mainWeight: 0.5 },
  )
})

test('样式包：图标按钮分组表覆盖核心键且键名唯一', () => {
  const labels = metadata.styleSourceComponentIdState,
    labelKeys = Object.keys(labels)
  assert.deepEqual(labelKeys, [...new Set(labelKeys)], '分组表键名不能重复')
  for (const requiredKey of ['icon', 'iconOffColor', 'buttonOnColor', 'frameColor', 'width', 'height', 'scale', 'rotation'])
    assert.ok(requiredKey in labels, `图标按钮分组表缺少 ${requiredKey}`)
  assert.equal(labels.icon.group, '按钮图标')
  assert.equal(labels.width.group, '按钮尺寸')
  assert.equal(labels.rotation.group, '按钮变换')
})
