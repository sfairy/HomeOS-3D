/**
 * 柔光范围（照射范围）编辑器的**全部用户文案**（0.8.9 `light-range-editor.js` +
 * `config-editor.js` 的柔光段）。
 *
 * 为什么集中：同一句「柔光范围已保存到户型」在保存成功、共用回写、仍待保存三种
 * 情形下措辞不同，分散写必然出现「三种说法指同一件事」。集中后由状态决定用哪条。
 */

export const LIGHT_RANGE_COPY = Object.freeze({
  /** 对话框标题与 aria。 */
  title: '轻量柔光 · 照射范围',
  ariaLabel: '照射范围',
  close: '关闭照射范围',
  save: '保存',
  resave: '保存暂未收到确认，可以再次保存。',

  /** 引导语。 */
  dragCenter: '拖动中心十字移动光区。',
  dragShared: '拖动调整柔光覆盖区。已载入的绘制户型可以共用范围，内置模板沿用控件自己的范围。',
  planEdit: '平面编辑调整照射范围，3D 预览实时查看高度效果。',

  /** 保存结果（三种情形）。 */
  savedToPlan: '柔光范围已保存到户型。',
  savedShared: '柔光范围已保存到户型，使用此户型的轻量柔光控件会同步。',
  savedPending: '柔光范围已保存到户型，还有本控件的修改待保存。',

  /** 前置条件与失败。 */
  needPlanSave: '请先保存户型，再编辑柔光照射范围。',
  /** 保存成功且保存后没有新改动（上游 `range-dialog.js` 的两条分支）。 */
  savedToLightConfig: '已保存到灯光配置，可继续调整。关闭后点击“保存配置”完成保存。',
  savedWithMoreChanges: '已保存，另有新修改待保存。',
  previewUnavailable: '轻量柔光预览暂时无法打开。',
  saveFailed: '照射范围保存失败。',

  /** 单灯 / 同组切换（0.8.9 的「只看这盏灯」）。 */
  onlyThisLight: '只看这盏灯',
  onlyThisGroup: '只看这一组',
  sameGroup: '同组',
  singleLightHint: '盏，当前只调这一盏',
  distance: '照射距离',
  applyToPlan: '保存到户型',
  applyToPlanHint: '保存到户型后，户型绘制与引用该户型的 3D 交互会使用同一范围。',
})
