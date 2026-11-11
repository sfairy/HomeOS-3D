/**
 * 舞台标记的纯函数部分：预览定位信息、绑定坐标回填、固定位置告警的百分比换算、标记激活分流。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage` 闭包里外移（计划 2.3 的第一块）。这里只放
 * **不持有闭包状态**的函数：需要的宿主值一律走参数（`ctx`、`stageElement`），
 * 从 `_shared` 取的 `postHostMessage` 本来就是模块级依赖，外移后不变。
 */

import { postHostMessage } from './_shared'

/** 标记 → 切回配置编辑器所需的模块定位信息（0.7.8 `previewSelection`）。 */
export function previewSelectionOf(previewMarkerItem: any) {
  const isVacuumShortcutItem = previewMarkerItem.deviceKind === 'vacuum-room'
  return {
    // 扫地机快捷指令：编辑器要的是裸 shortcutId（vacuumId 单独带），不是 `vacuum-room:` 标记 id。
    id:
      isVacuumShortcutItem && previewMarkerItem.shortcutId
        ? previewMarkerItem.shortcutId
        : previewMarkerItem.entryId || previewMarkerItem.id,
    floorId: previewMarkerItem.floorId,
    module: previewMarkerItem.waterHeater
      ? 'water-heater'
      : previewMarkerItem.airPurifier
        ? 'purifier'
        : previewMarkerItem.pedestalFan
          ? 'fan'
          : previewMarkerItem.airer
            ? 'airer'
            : isVacuumShortcutItem
              ? 'vacuum-shortcut'
              : previewMarkerItem.deviceKind,
    ...(previewMarkerItem.vacuumId ? { vacuumId: previewMarkerItem.vacuumId } : {}),
  }
}

/** 预览标记的缓存键：模块归属 + 标记 id。 */
export function previewReferenceKey(previewMarkerItem: any) {
  return JSON.stringify([
    previewMarkerItem.waterHeater
      ? 'water-heater'
      : previewMarkerItem.airPurifier
        ? 'purifier'
        : previewMarkerItem.pedestalFan
          ? 'fan'
          : previewMarkerItem.airer
            ? 'airer'
            : previewMarkerItem.deviceKind,
    previewMarkerItem.id,
  ])
}

/** 绑定条目的世界坐标：绑定里写了就用，否则按模型所在位置回填。 */
export function modelBindingPosition(
  binding: { x?: unknown; y?: unknown },
  model: { x?: number; y?: number } | undefined,
) {
  return {
    x: typeof binding.x === 'number' && Number.isFinite(binding.x) ? binding.x : (model?.x ?? 0),
    y: typeof binding.y === 'number' && Number.isFinite(binding.y) ? binding.y : (model?.y ?? 0),
  }
}

/**
 * 标记点击分流：摄像头 / 扫地机在「已聚焦且控制就绪」时直接开宿主弹窗，其余交给面板。
 *
 * @param ctx 舞台上下文（只读该函数用到的几个字段）
 * @param markerEntry 被点击的标记条目
 */
export function handleMarkerActivate(markerEntry: any, ctx: any) {
  if (
    !ctx.isEditing &&
    ctx.isControlReady &&
    markerEntry.deviceKind === 'camera' &&
    markerEntry.entityId &&
    ctx.focusedItemId === markerEntry.id &&
    ctx.panelDisplayMode !== 'edit'
  ) {
    postHostMessage({
      type: 'camera-popup',
      id: markerEntry.id,
    })
    return
  }
  !ctx.followVacuumId &&
    !ctx.isEditing &&
    ctx.isControlReady &&
    markerEntry.deviceKind === 'vacuum' &&
    markerEntry.entityId &&
    (ctx.panelDisplayMode === 'panel' || markerEntry.clickAction !== 'focus') &&
    ctx.focusedItemId === markerEntry.id &&
    postHostMessage({
      type: 'vacuum-popup',
      id: markerEntry.id,
    })
}

/** 固定位置告警标签：`positionMode: "fixed"` 时不跟随户型，按画面百分比定位。 */
export function isFixedPositionAlarm(
  markerItem: { securityAlarm?: boolean; positionMode?: string } | null | undefined,
) {
  return markerItem?.securityAlarm === true && markerItem.positionMode === 'fixed'
}

/** 画面百分比：非有限数落回 50（居中），其余夹到 0–100。 */
export function clampScreenPercent(value: unknown) {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? Math.max(0, Math.min(100, numericValue)) : 50
}

/** 指针位置 → 舞台画面百分比；舞台尺寸为 0 时返回 `null`（由调用方跳过定位）。 */
export function screenPointToFixedPercent(
  pointerEvent: { clientX: number; clientY: number },
  stageElement: { getBoundingClientRect: () => DOMRect },
) {
  const stageRect = stageElement.getBoundingClientRect()
  return stageRect.width > 0 && stageRect.height > 0
    ? {
        x: ((pointerEvent.clientX - stageRect.left) / stageRect.width) * 100,
        y: ((pointerEvent.clientY - stageRect.top) / stageRect.height) * 100,
      }
    : null
}
