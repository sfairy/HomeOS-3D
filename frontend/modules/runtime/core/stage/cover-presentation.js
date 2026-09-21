/*
 * 幕帘反馈呈现。
 *
 * 幕帘反馈的呈现解算与同步，以及刀片预览的过期清理与下一次反馈延迟。
 *
 * 由 core/stage.js 的 mountStage 外提而来：这里只放函数，对外部状态与兄弟函数的读写一律经
 * ctx —— ctx 的每一项都是 stage.js 里的 getter/setter，读到的始终是调用时刻的值。
 */
export function createCoverPresentation(ctx) {
  /**
   * 合成窗帘标记的展示状态：标准反馈叠加（梦幻帘才有的）叶片反馈。
   * 叶片在等待回报时强制覆盖成「打开中」：那一刻整体已停、叶片还在转，
   * 不覆盖的话图标会闪回静止态。
   */
  function resolveCoverPresentation(
    coverBindingItem,
    baseCoverState = ctx.coverState(
      coverBindingItem.entityId,
      ctx.statesByEntityId[coverBindingItem.entityId],
      coverBindingItem
    )
  ) {
    const standardPresentation = ctx.coverFeedback.read(coverBindingItem.entityId, baseCoverState);
    if (coverBindingItem.coverKind !== "dream") {
      return standardPresentation;
    }
    const dreamCoverState = ctx.dreamCoverFeedback.read(coverBindingItem.entityId);
    const isBladePending = ctx.bladePendingByEntityId.has(coverBindingItem.entityId);
    return {
      ...standardPresentation,
      ...(isBladePending
        ? {
            state: "opening",
            opening: true,
            closing: false,
            moving: true,
            closedConfirmed: false
          }
        : {}),
      tiltPosition: dreamCoverState?.position ?? baseCoverState.tiltPosition,
      tiltTarget: dreamCoverState?.targetPosition ?? null,
      error: dreamCoverState?.error || standardPresentation?.error || ""
    };
  }

  // 把窗帘展示状态同步给标记图标与 3D 窗帘动画；
  // immediate 表示不做插值直接置位，供拖拽预览等需要即时反馈的场景使用。
  function syncCoverFeedback() {
    for (const coverMarkerBinding of ctx.coverBindings) {
      const coverIconState = resolveCoverPresentation(coverMarkerBinding);
      ctx.curtainMotion.setState(coverMarkerBinding.id, coverIconState, {
        immediate: true
      });
      const coverMarkerElement = ctx.markersById.get("cover:" + coverMarkerBinding.id);
      if (coverMarkerElement) {
        coverMarkerElement.classList.toggle(
          "is-on",
          ctx.coverIconIsOn(coverMarkerBinding, coverIconState)
        );
      }
    }
  }

  // 清理「叶片待确认」状态。梦幻帘的整体动作与叶片动作是两条反馈：
  // 只有整体位置回报到位、且叶片反馈回到 50（水平）时，才认为整体动作结束、
  // 可以开始叶片预览；否则一直挂着，避免两条反馈互相打架。
  function pruneBladePreviews() {
    for (const [previewEntityId, pendingBladeRequest] of ctx.bladePendingByEntityId) {
      const standardFeedback = ctx.coverFeedback.read(previewEntityId);
      const dreamFeedback = ctx.dreamCoverFeedback.read(previewEntityId);
      if (!standardFeedback?.available || !dreamFeedback?.available) {
        ctx.bladePendingByEntityId.delete(previewEntityId);
        continue;
      }
      if (
        standardFeedback.positionReported &&
        standardFeedback.raw.attributes.current_position !== pendingBladeRequest.reported
      ) {
        ctx.bladePendingByEntityId.delete(previewEntityId);
        continue;
      }
      if (!(Math.abs((dreamFeedback.position ?? -100) - 50) > 0.01)) {
        ctx.bladePendingByEntityId.delete(previewEntityId);
        ctx.coverFeedback.startPreview(previewEntityId, pendingBladeRequest.requestId);
      }
    }
  }

  // 两个窗帘反馈源取较小延迟，让动画节奏跟随更活跃的那个。
  const nextCoverDelayMs = () =>
    Math.min(ctx.coverFeedback.nextDelay(), ctx.dreamCoverFeedback.nextDelay());
  return { nextCoverDelayMs, pruneBladePreviews, resolveCoverPresentation, syncCoverFeedback };
}
