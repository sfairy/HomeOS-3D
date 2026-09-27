/*
 * 人体存在热区。
 */
export function createPresenceHitBoxes(ctx) {
  // 布置人体传感器的点击热区：只有编辑态且开启了命中范围（或已有热区）才算，
  function layoutPresenceHitBoxes() {
    if ((!ctx.isEditing || !ctx.isPresenceHitRangeVisible) && !ctx.presenceHitBoxesById.size) {
      return;
    }
    const presenceHitRects =
      ctx.isEditing && ctx.isPresenceHitRangeVisible
        ? ctx.presenceScene.hitRects(
            ctx.stageOptions.camera,
            ctx.canvasElement,
            ctx.config.security?.presenceSensors || []
          )
        : [];
    const presenceHitRectIds = new Set(presenceHitRects.map(hitRect => hitRect.id));
    const presenceContainerRect = ctx.containerElement.getBoundingClientRect();
    for (const [hitBoxId, staleHitBoxElement] of ctx.presenceHitBoxesById) {
      if (!presenceHitRectIds.has(hitBoxId)) {
        staleHitBoxElement.remove();
        ctx.presenceHitBoxesById.delete(hitBoxId);
      }
    }
    for (const hitBoxRect of presenceHitRects) {
      let hitBoxElement = ctx.presenceHitBoxesById.get(hitBoxRect.id);
      if (!hitBoxElement) {
        hitBoxElement = ctx.makeElement("div", "i3d-presence-hit-box");
        ctx.presenceHitBoxesById.set(hitBoxRect.id, hitBoxElement);
        ctx.presenceHitLayerElement.append(hitBoxElement);
      }
      Object.assign(hitBoxElement.style, {
        left: hitBoxRect.left - presenceContainerRect.left - hitBoxRect.padding + "px",
        top: hitBoxRect.top - presenceContainerRect.top - hitBoxRect.padding + "px",
        width: hitBoxRect.width + hitBoxRect.padding * 2 + "px",
        height: hitBoxRect.height + hitBoxRect.padding * 2 + "px",
        borderRadius: hitBoxRect.padding + "px"
      });
    }
  }
  return { layoutPresenceHitBoxes };
}
