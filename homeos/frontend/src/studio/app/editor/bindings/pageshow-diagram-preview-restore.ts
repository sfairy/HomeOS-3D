// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// pageshow 回退恢复：从 bfcache 回来时重挂平面图预览帧

import { clampNumber as clampNumber2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface PageshowDiagramPreviewRestoreDeps {
  cancelRemovesComponent: any;
  floorplanAutoDiagramCameraViewElement: any;
  selectedComponentId: any;
  mutateDocument: any;
  findDiagramPreviewFrame: any;
  floorplanAutoDiagramFloorSelectElement: any;
  removedComponent: any;
  lightInputElement: any;
  floorplanAutoDiagramCameraModeElement: any;
  floorplanAutoDiagramFocalLengthInputElement: any;
  coverMotorButtonElement: any;
  floorplanAutoDiagramRotateTopButtonElement: any;
}

export function attachPageshowDiagramPreviewRestore(deps: PageshowDiagramPreviewRestoreDeps) {
(window.addEventListener("pageshow", (restoredDiagramPreview) => {
  if (restoredDiagramPreview.persisted) {
    for (const onFloorplanAutoDiagramCameraViewClick of document.querySelectorAll(
      ".hb-floorplan-auto-diagram-preview",
    ))
      deps.cancelRemovesComponent(onFloorplanAutoDiagramCameraViewClick);
  }
}),
  deps.floorplanAutoDiagramCameraViewElement.addEventListener("click", (cameraViewClickEvent: any) => {
    const cameraViewOptionElement = cameraViewClickEvent.target.closest(
        "[data-floorplan-camera-view]",
      ),
      cameraViewComponentId = deps.selectedComponentId;
    if (!cameraViewOptionElement || !cameraViewComponentId) return;
    const requestedCameraView =
      cameraViewOptionElement.dataset.floorplanCameraView === "top" ? "top" : "free";
    (deps.mutateDocument((cameraViewDraftDocument: any) => {
      const cameraViewComponent = findComponent2(
        cameraViewDraftDocument,
        cameraViewComponentId,
      )?.component;
      cameraViewComponent?.type === "floorplan-auto-diagram" &&
        (cameraViewComponent.properties = {
          ...(cameraViewComponent.properties || {}),
          cameraView: requestedCameraView,
        });
    }),
      deps.findDiagramPreviewFrame(cameraViewComponentId, "set-view", requestedCameraView));
  }),
  deps.floorplanAutoDiagramFloorSelectElement.addEventListener("change", () => {
    const floorSelectComponentId = deps.selectedComponentId,
      selectedFloorValue = String(deps.floorplanAutoDiagramFloorSelectElement.value || ""),
      floorSelectComponent = deps.removedComponent();
    !floorSelectComponentId ||
      !selectedFloorValue ||
      floorSelectComponent?.type !== "floorplan-auto-diagram" ||
      (deps.mutateDocument((floorSelectDraftDocument: any) => {
        const floorSelectComponentInDraft = findComponent2(
          floorSelectDraftDocument,
          floorSelectComponentId,
        )?.component;
        floorSelectComponentInDraft?.type === "floorplan-auto-diagram" &&
          (floorSelectComponentInDraft.properties = {
            ...(floorSelectComponentInDraft.properties || {}),
            floorSelection: selectedFloorValue,
          });
      }),
      deps.lightInputElement(floorSelectComponentId, selectedFloorValue),
      deps.findDiagramPreviewFrame(floorSelectComponentId, "restore", {
        view: floorSelectComponent.properties?.cameraView || "free",
        mode: floorSelectComponent.properties?.cameraMode || "orthographic",
        topRotation: Number(floorSelectComponent.properties?.cameraTopRotation || 0),
        focalLength: Number(floorSelectComponent.properties?.cameraFocalLength || 50),
      }));
  }),
  deps.floorplanAutoDiagramCameraModeElement.addEventListener("click", (cameraModeClickEvent: any) => {
    const cameraModeOptionElement = cameraModeClickEvent.target.closest(
        "[data-floorplan-camera-mode]",
      ),
      cameraModeComponentId = deps.selectedComponentId;
    if (!cameraModeOptionElement || !cameraModeComponentId) return;
    const requestedCameraMode =
      cameraModeOptionElement.dataset.floorplanCameraMode === "perspective"
        ? "perspective"
        : "orthographic";
    (deps.mutateDocument((cameraModeDraftDocument: any) => {
      const cameraModeComponent = findComponent2(
        cameraModeDraftDocument,
        cameraModeComponentId,
      )?.component;
      cameraModeComponent?.type === "floorplan-auto-diagram" &&
        (cameraModeComponent.properties = {
          ...(cameraModeComponent.properties || {}),
          cameraMode: requestedCameraMode,
        });
    }),
      deps.findDiagramPreviewFrame(cameraModeComponentId, "set-mode", requestedCameraMode));
  }),
  deps.floorplanAutoDiagramFocalLengthInputElement.addEventListener("change", () => {
    const focalLengthComponentId = deps.selectedComponentId;
    if (
      !focalLengthComponentId ||
      String(deps.floorplanAutoDiagramFocalLengthInputElement.value).trim() === ""
    )
      return deps.coverMotorButtonElement();
    const clampedFocalLength = clampNumber2(
      Number(deps.floorplanAutoDiagramFocalLengthInputElement.value),
      18,
      120,
    );
    (deps.mutateDocument((focalLengthDraftDocument: any) => {
      const focalLengthComponent = findComponent2(
        focalLengthDraftDocument,
        focalLengthComponentId,
      )?.component;
      focalLengthComponent?.type === "floorplan-auto-diagram" &&
        (focalLengthComponent.properties = {
          ...(focalLengthComponent.properties || {}),
          cameraFocalLength: clampedFocalLength,
        });
    }),
      deps.findDiagramPreviewFrame(focalLengthComponentId, "set-focal-length", clampedFocalLength));
  }),
  deps.floorplanAutoDiagramRotateTopButtonElement.addEventListener("click", () => {
    const rotateTopComponentId = deps.selectedComponentId;
    rotateTopComponentId &&
      (deps.mutateDocument((rotateTopDraftDocument: any) => {
        const rotateTopComponent = findComponent2(
          rotateTopDraftDocument,
          rotateTopComponentId,
        )?.component;
        rotateTopComponent?.type === "floorplan-auto-diagram" &&
          (rotateTopComponent.properties = {
            ...(rotateTopComponent.properties || {}),
            cameraView: "top",
            cameraTopRotation:
              (Number(rotateTopComponent.properties?.cameraTopRotation || 0) + 90) % 360,
          });
      }),
      deps.findDiagramPreviewFrame(rotateTopComponentId, "rotate-top"));
  }));
}
