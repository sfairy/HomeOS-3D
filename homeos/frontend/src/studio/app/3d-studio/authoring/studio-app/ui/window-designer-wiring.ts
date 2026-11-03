/**
 * 「自定义窗型…」入口（0.8.4）。
 *
 * 只做三件事：把当前窗户 + 楼层快照交给绘制器、把绘制结果写回场景、把「使用普通窗户」
 * 改成普通模式。写回时重新贴回墙上（`t` 要按新宽度重新夹），并且整场景过一遍
 * `windowSceneError` —— 窗型合法但尺寸超出墙体时不能落盘，否则 3D 里窗框会穿墙。
 *
 * 绘制器是动态加载的：窗户是低频功能，没必要把 three 预览 + SVG 编辑器打进首屏。
 */

import {
  clampWindowT as clampWindowT2,
  closedWallFloorPolygons,
  doorInteriorSide,
} from "../../../plan/geometry";
import { isCustomWindow } from "../../../plan/window/layout";
import { windowSceneError } from "../../../plan/window/window-scene-guard";

export function bindWindowDesignerWiring(deps: Record<string, any>): void {
  const {
    appCtx,
    applyPlacementChange,
    captureUndoSnapshot,
    getActiveFloor,
    getPixelsPerMeter,
    getSelectedObject,
    isEmbeddedStage,
    markDocumentDirty,
    refreshScopeItems,
    selectElement,
    showToast,
  } = deps;

  let designerHandle: any = null;
  let openingDesigner = false;

  const currentFloorId = () => getActiveFloor?.()?.id ?? appCtx.activeFloorId;
  const pixelsPerMeter = () => getPixelsPerMeter() || 100;

  /**
   * 把绘制结果写回当前场景。抛错时绘制器留在原地并把 message 显示在自己的提示条里。
   * 快照不一致说明期间改过楼层或这扇窗，继续写回会把别的改动覆盖掉。
   *
   * 这里**不能**用 `showToast` 报错：绘制器是模态 `<dialog>`（top layer），外壳通知层
   * 在 backdrop 后面，用户只会看到「点了应用窗型没反应」。
   */
  const applyWindowDesign = (draft: any, openedWindow: any) => {
    if (currentFloorId() !== openedWindow.floorId)
      throw Error("窗户或楼层已变化，请关闭后重新打开窗型绘制。");
    const sceneState = appCtx.studioState,
      targetWindow = sceneState.windows.find((windowEntry: any) => windowEntry.id === openedWindow.id);
    if (!targetWindow || JSON.stringify(targetWindow) !== openedWindow.snapshot)
      throw Error("窗户或楼层已变化，请关闭后重新打开窗型绘制。");

    // 先按候选对象验证整场景，通过了才真的落改动（失败时不留半截状态）。
    const candidateWindow = {
        ...targetWindow,
        width: draft.width,
        height: draft.height,
        windowDesign: structuredClone(draft.windowDesign),
      },
      anchorWall = sceneState.walls.find((wall: any) => wall.id === targetWindow.wallId);
    if (anchorWall) candidateWindow.t = clampWindowT2(anchorWall, candidateWindow, pixelsPerMeter());
    const sceneError = windowSceneError(
      {
        walls: sceneState.walls,
        windows: sceneState.windows.map((windowEntry: any) =>
          windowEntry === targetWindow ? candidateWindow : windowEntry,
        ),
      },
      pixelsPerMeter(),
    );
    if (sceneError) throw Error(sceneError);
    if (JSON.stringify(candidateWindow) === JSON.stringify(targetWindow)) return true;

    const undoSnapshot = captureUndoSnapshot();
    Object.assign(targetWindow, candidateWindow);
    (applyPlacementChange(undoSnapshot), refreshScopeItems("architecture"), markDocumentDirty());
    return true;
  };

  selectElement("#window-customize").addEventListener("click", () => {
    if (openingDesigner || designerHandle?.isOpen) return;
    const selectedWindow = getSelectedObject();
    if (appCtx.selectedItem?.kind !== "window" || !selectedWindow) return;
    // 只有「这扇窗自己越界」时**不能**拦：绘制器正是修它的地方（缩窄窗宽 / 降窗高）。
    // 拦在这里会让用户无路可走 —— 检查器改尺寸同样要过 `validateSelectionChange`，
    // 而后者会因为同一处越界把改动回滚。
    const selectedError = windowSceneError(
      { walls: appCtx.studioState.walls, windows: [selectedWindow] },
      pixelsPerMeter(),
    );
    if (!selectedError) {
      // 这扇窗没问题，但户型里别的窗越界：提前说明（文案已指名是哪一扇），
      // 免得用户画完才在「应用窗型」被拒。
      const sceneError = windowSceneError(appCtx.studioState, pixelsPerMeter());
      if (sceneError) {
        showToast(sceneError, "error");
        return;
      }
    }
    const openedWindow = {
        id: selectedWindow.id,
        floorId: currentFloorId(),
        snapshot: JSON.stringify(selectedWindow),
      },
      anchorWall = appCtx.studioState.walls.find((wall: any) => wall.id === selectedWindow.wallId),
      interiorSide =
        (anchorWall &&
          doorInteriorSide(
            anchorWall,
            selectedWindow,
            closedWallFloorPolygons(appCtx.studioState.walls, 1),
            pixelsPerMeter(),
          )) ||
        1;
    openingDesigner = true;
    import("../../../plan/window/designer")
      .then(({ openWindowDesigner }) => {
        const latestWindow = appCtx.studioState.windows.find(
          (windowEntry: any) => windowEntry.id === openedWindow.id,
        );
        if (
          isEmbeddedStage ||
          currentFloorId() !== openedWindow.floorId ||
          appCtx.selectedItem?.kind !== "window" ||
          appCtx.selectedItem.id !== openedWindow.id ||
          !latestWindow ||
          JSON.stringify(latestWindow) !== openedWindow.snapshot
        )
          return;
        designerHandle = openWindowDesigner({
          record: latestWindow,
          style: deps.backgroundSettings?.(),
          interiorSide,
          onApply: (appliedDraft: any) => applyWindowDesign(appliedDraft, openedWindow),
          onClose: () => {
            designerHandle = null;
            selectElement("#window-customize").focus();
          },
        });
      })
      .catch((designerError: any) => {
        showToast(designerError?.message || "窗型绘制器加载失败。", "error");
      })
      .finally(() => {
        openingDesigner = false;
      });
  });

  selectElement("#window-ordinary").addEventListener("click", () => {
    const selectedWindow = getSelectedObject();
    if (
      appCtx.selectedItem?.kind !== "window" ||
      !selectedWindow ||
      !isCustomWindow(selectedWindow)
    )
      return;
    // 只把模式切回普通窗：分格树留着，下次「编辑自定义窗型…」还能接着改。
    const undoSnapshot = captureUndoSnapshot();
    selectedWindow.windowDesign = {
      ...structuredClone(selectedWindow.windowDesign),
      mode: "ordinary",
    };
    (applyPlacementChange(undoSnapshot), refreshScopeItems("architecture"), markDocumentDirty());
  });
}
