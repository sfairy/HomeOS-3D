

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface SyncProjectTemplateOptionsDeps {
  projectTemplateOptionsElement: any;
  cameraCommandState: any;
  resizeWarningResolveState: any;
  projectCanvasFieldsElement: any;
  projectDialogMode: any;
  projectFormElement: any;
  projectCanvasWidthElement: any;
  projectCanvasHeightElement: any;
  isAspectLockedState: any;
  isAspectLockedValue: any;
  projectCanvasHintElement: any;
  lightStatisticsEntityListClickEvent: any;
  imageEntityDraftDocument: any;
}

export function syncProjectTemplateOptions(deps: SyncProjectTemplateOptionsDeps) {
  if (
    (deps.projectTemplateOptionsElement.replaceChildren(
      ...deps.cameraCommandState.map((cameraCommandValue: any) => {
        const diagramPreviewFrame = document.createElement("div");
        ((diagramPreviewFrame.className =
          "project-template-option" +
          (cameraCommandValue.id === deps.resizeWarningResolveState ? " active" : "")),
          (diagramPreviewFrame.dataset.projectTemplateId = cameraCommandValue.id),
          (diagramPreviewFrame.dataset.previewUrls = JSON.stringify(
            cameraCommandValue.previewUrls,
          )),
          (diagramPreviewFrame.dataset.previewLabels = JSON.stringify(
            cameraCommandValue.previewLabels,
          )),
          (diagramPreviewFrame.dataset.previewIndex = "0"),
          diagramPreviewFrame.setAttribute("role", "radio"),
          diagramPreviewFrame.setAttribute(
            "aria-checked",
            String(cameraCommandValue.id === deps.resizeWarningResolveState),
          ),
          (diagramPreviewFrame.tabIndex = 0));
        const floorDiagramFrame = document.createElement("div");
        if (
          ((floorDiagramFrame.className =
            "project-template-carousel" + (cameraCommandValue.previewUrls.length ? "" : " blank")),
          cameraCommandValue.previewUrls.length)
        ) {
          const overlayElement = document.createElement("button");
          ((overlayElement.type = "button"),
            (overlayElement.className = "project-template-preview-open"),
            (overlayElement.dataset.projectPreviewAction = "open"),
            (overlayElement.title = "点击放大预览"));
          const licenseWarningElement = document.createElement("img");
          ((licenseWarningElement.src = cameraCommandValue.previewUrls[0]),
            (licenseWarningElement.alt =
              cameraCommandValue.previewLabels[0] || cameraCommandValue.name + "预览 1"),
            (licenseWarningElement.loading = "eager"),
            overlayElement.append(licenseWarningElement));
          const licenseError = document.createElement("button");
          ((licenseError.type = "button"),
            (licenseError.className = "project-template-carousel-arrow previous"),
            (licenseError.dataset.projectPreviewAction = "previous"),
            licenseError.setAttribute("aria-label", "上一张预览"),
            (licenseError.textContent = "‹"));
          const hideReactivateElement = document.createElement("button");
          ((hideReactivateElement.type = "button"),
            (hideReactivateElement.className = "project-template-carousel-arrow next"),
            (hideReactivateElement.dataset.projectPreviewAction = "next"),
            hideReactivateElement.setAttribute("aria-label", "下一张预览"),
            (hideReactivateElement.textContent = "›"));
          const recoveryHintElement = document.createElement("div");
          recoveryHintElement.className = "project-template-carousel-meta";
          const featureSignatureElement = document.createElement("strong");
          featureSignatureElement.textContent = cameraCommandValue.previewLabels[0] || "HomeOS预览";
          const focusedComponentRecordElement = document.createElement("span");
          ((focusedComponentRecordElement.textContent =
            "1 / " + cameraCommandValue.previewUrls.length),
            recoveryHintElement.append(featureSignatureElement, focusedComponentRecordElement),
            floorDiagramFrame.append(overlayElement),
            cameraCommandValue.previewUrls.length > 1 &&
              floorDiagramFrame.append(licenseError, hideReactivateElement),
            floorDiagramFrame.append(recoveryHintElement));
        } else
          floorDiagramFrame.replaceChildren(
            ...Array.from(
              {
                length: 4,
              },
              () => document.createElement("i"),
            ),
          );
        const editStateElement = document.createElement("strong");
        editStateElement.textContent = cameraCommandValue.name;
        const hiddenContentElement = document.createElement("span");
        return (
          (hiddenContentElement.textContent = cameraCommandValue.description),
          diagramPreviewFrame.append(floorDiagramFrame, editStateElement, hiddenContentElement),
          diagramPreviewFrame
        );
      }),
    ),
    (deps.projectCanvasFieldsElement.hidden = false),
    deps.projectDialogMode === "create")
  ) {
    const effectPreviewComponent = deps.cameraCommandState.find(
      (previewToggleElement: any) => previewToggleElement.id === deps.resizeWarningResolveState,
    );
    deps.projectFormElement.elements.name.value = effectPreviewComponent?.id
      ? effectPreviewComponent.name
      : "我的仪表盘";
    const isPreviewActive = !!effectPreviewComponent?.id;
    ((deps.projectCanvasWidthElement.readOnly = isPreviewActive),
      (deps.projectCanvasHeightElement.readOnly = isPreviewActive),
      (deps.projectCanvasWidthElement.value = String(
        isPreviewActive ? effectPreviewComponent.canvasWidth : deps.isAspectLockedState,
      )),
      (deps.projectCanvasHeightElement.value = String(
        isPreviewActive ? effectPreviewComponent.canvasHeight : deps.isAspectLockedValue,
      )),
      deps.projectCanvasFieldsElement.classList.toggle("fixed", isPreviewActive),
      deps.projectCanvasFieldsElement.classList.remove("name-only"),
      (deps.projectCanvasHintElement.textContent = isPreviewActive
        ? "HomeOS使用固定画布分辨率，创建时会完整保留页面布局与比例。"
        : "编辑器和仪表盘将共用该分辨率与比例，显示时只做等比缩放。"),
      deps.lightStatisticsEntityListClickEvent(),
      deps.imageEntityDraftDocument(isPreviewActive));
  }
}
