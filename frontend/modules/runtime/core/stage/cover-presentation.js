/*
 * 幕帘反馈呈现。
 */
export function createCoverPresentation(ctx) {
  /**
   * 合成窗帘标记的展示状态：标准反馈叠加（梦幻帘才有的）叶片反馈。
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
