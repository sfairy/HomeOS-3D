/**
 * 编辑态标记的「可见性摘要」（0.8.4 `stage.js` v4827）。
 *
 * 选中标记时在右侧挂一个小提示，说明它在运行时会怎样出现：
 * 完全隐藏、隐藏但可点、仅开窗/开门时显示、仅报警时显示、吸尘器房间隐藏图标/名称。
 */

/** 归一化 `labelMode`：三态取值之外回退到旧的 `labelHidden` 布尔。 */
export function resolvedMarkerLabelMode(markerItem: any) {
  const declaredLabelMode = markerItem?.labelMode
  return ['hidden', 'open', 'always'].includes(declaredLabelMode)
    ? declaredLabelMode
    : markerItem?.labelHidden === true
      ? 'hidden'
      : 'always'
}

export function markerVisibilityHint(markerItem: any): string {
  if (!markerItem) return ''
  if (markerItem.visible === false || markerItem.buttonHidden === false) return '运行时隐藏'
  if (markerItem.hiddenClickable === true) return '运行时隐藏（可点击）'
  const effectiveLabelMode =
    markerItem.labelMode !== undefined || markerItem.labelHidden !== undefined
      ? resolvedMarkerLabelMode(markerItem)
      : markerItem.securityAlarm
        ? markerItem.labelMode
        : ''
  if (effectiveLabelMode === 'hidden') return '运行时隐藏'
  if (effectiveLabelMode === 'open') return markerItem.deviceKind === 'window' ? '仅开窗时显示' : '仅开门时显示'
  if (effectiveLabelMode === 'alarm') return '仅报警时显示'
  if (markerItem.deviceKind === 'vacuum-room') {
    const hiddenParts = [markerItem.iconHidden && '图标', markerItem.labelHidden && '名称'].filter(Boolean)
    if (hiddenParts.length) return '运行时隐藏' + hiddenParts.join('和')
  }
  return ''
}
