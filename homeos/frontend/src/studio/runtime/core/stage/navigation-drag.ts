/**
 * 导航拖拽绑定：把导航控件的指针拖动接到位置回写上。
 *
 * 从 `runtime/core/stage.ts` 的 `mountStage()` 闭包切出，依赖袋 `StageNavigationDragDeps`。
 */

import { postHostMessage } from "./_shared";

/** 依赖袋（宿主 `bootEditor` 作用域）：**每次调用现取**的普通对象，等价于闭包读值。
 * 本族切片只读不写（外层写入 0），所以不需要 getter / state 袋；宿主侧每个函数一个同名
 * 薄转发器，调用点零改写（函数声明保持提升语义）。族内互调留在模块内，不进依赖袋。
 */
export interface StageNavigationDragDeps {
  options: any;
  navigationEditing: any;
  element: any;
  NAVIGATION_DRAG_THRESHOLD: any;
  syncLayoutMetrics: any;
}

export function bindNavigationDragCore(deps: StageNavigationDragDeps, dragElement: any, navigationKey: any, fallbackPosition: any) {

    let navigationDrag: any = null;

    const readOffsetPercent = (axisName: any) => {
      const configuredPercent = deps.options.navigation?.[navigationKey]?.[axisName];
      return Number.isFinite(configuredPercent)
        ? Math.max(0, Math.min(100, configuredPercent))
        : fallbackPosition[axisName === "x" ? 0 : 1];
    };

    const writeOffsetPercent = (percentX: any, percentY: any) => {
      deps.options = {
        ...deps.options,
        navigation: {
          ...(deps.options.navigation || {}),
          [navigationKey]: {
            ...(deps.options.navigation?.[navigationKey] || {}),
            x: Math.round(percentX * 100) / 100,
            y: Math.round(percentY * 100) / 100,
          },
        },
      };
    };
    const stopNavigationDrag = () => {
      if (!navigationDrag) return;
      navigationDrag = null;
      dragElement.classList.remove("is-navigation-dragging");
    };
    dragElement.addEventListener("pointerdown", (dragStartEvent: any) => {

      if (!deps.navigationEditing || dragStartEvent.button !== 0 || dragStartEvent.isPrimary === false)
        return;


      if (navigationDrag?.pointerId === dragStartEvent.pointerId) return;
      const containerRect = deps.element.getBoundingClientRect();
      if (!(containerRect.width > 0) || !(containerRect.height > 0)) return;

      dragElement.dataset.dragged = "";
      dragStartEvent.preventDefault();

      dragStartEvent.stopPropagation();
      navigationDrag = {
        pointerId: dragStartEvent.pointerId,
        clientX: dragStartEvent.clientX,
        clientY: dragStartEvent.clientY,
        startPercentX: readOffsetPercent("x"),
        startPercentY: readOffsetPercent("y"),
        percentPerClientPxX: 100 / containerRect.width,
        percentPerClientPxY: 100 / containerRect.height,
        moved: false,
      };
      dragElement.setPointerCapture?.(dragStartEvent.pointerId);
      dragElement.classList.add("is-navigation-dragging");
    });
    dragElement.addEventListener("pointermove", (dragMoveEvent: any) => {
      if (!navigationDrag || navigationDrag.pointerId !== dragMoveEvent.pointerId) return;

      if (!deps.navigationEditing) {
        (stopNavigationDrag(), (dragElement.dataset.dragged = ""));
        return;
      }
      const movedClientX = dragMoveEvent.clientX - navigationDrag.clientX,
        movedClientY = dragMoveEvent.clientY - navigationDrag.clientY;
      if (
        !navigationDrag.moved &&
        Math.hypot(movedClientX, movedClientY) < deps.NAVIGATION_DRAG_THRESHOLD
      )
        return;
      navigationDrag.moved = true;


      const nextPercentX = Math.max(
          0,
          Math.min(
            100,
            navigationDrag.startPercentX + movedClientX * navigationDrag.percentPerClientPxX,
          ),
        ),
        nextPercentY = Math.max(
          0,
          Math.min(
            100,
            navigationDrag.startPercentY + movedClientY * navigationDrag.percentPerClientPxY,
          ),
        );
      if (nextPercentX === readOffsetPercent("x") && nextPercentY === readOffsetPercent("y"))
        return;
      (writeOffsetPercent(nextPercentX, nextPercentY), deps.syncLayoutMetrics());
    });
    dragElement.addEventListener("pointerup", (dragEndEvent: any) => {
      if (!navigationDrag || navigationDrag.pointerId !== dragEndEvent.pointerId) return;
      const finishedDrag = navigationDrag;
      stopNavigationDrag();
      if (!finishedDrag.moved) {

        return;
      }

      dragElement.dataset.dragged = "true";
      postHostMessage({
        type: "edit",
        action: "navigation-position",
        target: navigationKey,
        x: readOffsetPercent("x"),
        y: readOffsetPercent("y"),
      });
    });

    dragElement.addEventListener("pointercancel", () => {
      if (!navigationDrag) return;
      const cancelledDrag = navigationDrag;
      stopNavigationDrag();
      if (cancelledDrag.moved) {
        (writeOffsetPercent(cancelledDrag.startPercentX, cancelledDrag.startPercentY),
          deps.syncLayoutMetrics());
      }
    });
  }
