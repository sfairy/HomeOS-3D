// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// document 级点击兜底：点空白处关闭实体选择弹层与检视面板

import { clampNumber as clampNumber2, clone as clone2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
export interface DocumentEntityPickerDismissDeps {
  closePopupEntityMenus: any;
  renderPopupEntityOptions: any;
  positionPopupEntityMenu: any;
  syncPopupEntityButton: any;
  iconButtonPreviewDetailsElement: any;
  removedComponent: any;
  ensureEditorRenderer: any;
  handleOperationError: any;
  airConditionerPreviewDetailsElement: any;
  imageLayoutOptionsElement: any;
  selectedComponentId: any;
  mutateDocument: any;
  imageInspectorElement: any;
  activeProject: any;
  imageOpacityInputElement: any;
  editorRenderer: any;
  imageLeftInputElement: any;
  imageTopInputElement: any;
  imageScaleInputElement: any;
  imageRotationInputElement: any;
  imageLabelElement: any;
  coverMotorButtonElement: any;
  setComponentsRotation: any;
}

export function attachDocumentEntityPickerDismiss(deps: DocumentEntityPickerDismissDeps) {
(document.addEventListener("click", (documentClickEvent) => {
  const entityPickerButton = (documentClickEvent.target as Element).closest("[data-popup-entity-button]");
  if (entityPickerButton) {
    const entityTriggerHost = entityPickerButton.closest("[data-action-trigger]"),
      entityMenuWasHiddenElement = entityTriggerHost?.querySelector<HTMLElement>("[data-popup-entity-menu]");
    if (!entityTriggerHost || !entityMenuWasHiddenElement) return;
    const hidden4 = entityMenuWasHiddenElement.hidden;
    if (
      (deps.closePopupEntityMenus(hidden4 ? entityTriggerHost : null),
      (entityMenuWasHiddenElement.hidden = !hidden4),
      entityPickerButton.setAttribute("aria-expanded", String(hidden4)),
      hidden4)
    ) {
      const entitySearchInput = entityTriggerHost.querySelector<HTMLInputElement>("[data-popup-entity-search]");
      ((entitySearchInput!.value = ""),
        deps.renderPopupEntityOptions(entityTriggerHost, ""),
        deps.positionPopupEntityMenu(entityTriggerHost),
        window.requestAnimationFrame(() =>
          entitySearchInput!.focus({
            preventScroll: true,
          }),
        ));
    }
    return;
  }
  const popupActionEntityOptionElement = (documentClickEvent.target as Element).closest<HTMLElement>(
    "[data-popup-action-entity-id]",
  );
  if (!popupActionEntityOptionElement) return;
  const entityActionTriggerHost = popupActionEntityOptionElement.closest("[data-action-trigger]"),
    popupEntityIdInput = entityActionTriggerHost?.querySelector<HTMLInputElement>("[data-popup-entity]");
  !entityActionTriggerHost ||
    !popupEntityIdInput ||
    ((popupEntityIdInput.value = popupActionEntityOptionElement.dataset.popupActionEntityId!),
    deps.syncPopupEntityButton(entityActionTriggerHost),
    deps.closePopupEntityMenus(),
    popupEntityIdInput.dispatchEvent(
      new Event("change", {
        bubbles: true,
      }),
    ));
}),
  document.addEventListener("input", (documentInputEvent) => {
    const entitySearchField = (documentInputEvent.target as Element).closest<HTMLInputElement>("[data-popup-entity-search]"),
      searchTriggerHost = entitySearchField?.closest("[data-action-trigger]");
    !entitySearchField ||
      !searchTriggerHost ||
      (deps.renderPopupEntityOptions(searchTriggerHost, entitySearchField.value),
      deps.positionPopupEntityMenu(searchTriggerHost));
  }),
  deps.iconButtonPreviewDetailsElement.addEventListener("click", () => {
    const previewIconComponent = deps.removedComponent(),
      previewIconEntityId = previewIconComponent?.bindings?.entity?.entityId || "";
    if (!(previewIconComponent?.type !== "icon-button" || !previewIconEntityId))
      try {
        deps.ensureEditorRenderer().showEntityDetails(previewIconComponent, {
          preview: true,
        });
      } catch (onAirConditionerPreviewDetailsButtonClick: any) {
        deps.handleOperationError(onAirConditionerPreviewDetailsButtonClick);
      }
  }),
  deps.airConditionerPreviewDetailsElement.addEventListener("click", () => {
    const previewAirConditioner = deps.removedComponent(),
      previewAcEntityId = previewAirConditioner?.bindings?.entity?.entityId || "";
    if (!(previewAirConditioner?.type !== "air-conditioner" || !previewAcEntityId))
      try {
        deps.ensureEditorRenderer().showEntityDetails(previewAirConditioner, {
          preview: true,
        });
      } catch (onImageLayoutOptionsClick: any) {
        deps.handleOperationError(onImageLayoutOptionsClick);
      }
  }),
  deps.imageLayoutOptionsElement.addEventListener("click", (imageLayoutClickEvent: any) => {
    const imageLayoutOptionElementElement =
        imageLayoutClickEvent.target.closest("[data-image-layout]"),
      layoutComponentId = deps.selectedComponentId;
    if (!imageLayoutOptionElementElement || !layoutComponentId) return;
    const requestedLayout =
        imageLayoutOptionElementElement.dataset.imageLayout === "fill" ? "fill" : "free",
      layoutComponent = deps.removedComponent(),
      currentLayout = layoutComponent?.properties?.layoutMode === "fill" ? "fill" : "free";
    !layoutComponent ||
      layoutComponent.type !== "image" ||
      currentLayout === requestedLayout ||
      deps.mutateDocument((layoutDraftDocument: any) => {
        const savedFreeLayout = findComponent2(layoutDraftDocument, layoutComponentId)?.component;
        if (!savedFreeLayout || savedFreeLayout.type !== "image") return;
        if (
          ((savedFreeLayout.properties = {
            ...(savedFreeLayout.properties || {}),
            fit: "contain",
          }),
          (savedFreeLayout.style = {
            ...(savedFreeLayout.style || {}),
          }),
          requestedLayout === "fill")
        ) {
          ((savedFreeLayout.properties.freeLayout = {
            position: clone2(savedFreeLayout.position || {}),
            scale: clampNumber2(Number(savedFreeLayout.style.scale || 1), 0.01, 5),
          }),
            (savedFreeLayout.properties.layoutMode = "fill"),
            (savedFreeLayout.position = {
              ...(savedFreeLayout.position || {}),
              x: 0,
              y: 0,
              width: Number(layoutDraftDocument.canvas?.width || 2778),
              height: Number(layoutDraftDocument.canvas?.height || 1940),
              rotation: 0,
            }),
            (savedFreeLayout.style.scale = 1));
          return;
        }
        const freeLayout2 = savedFreeLayout.properties.freeLayout;
        if (((savedFreeLayout.properties.layoutMode = "free"), freeLayout2?.position))
          ((savedFreeLayout.position = clone2(freeLayout2.position)),
            (savedFreeLayout.style.scale = clampNumber2(Number(freeLayout2.scale || 1), 0.01, 5)));
        else {
          const naturalImageWidth = Number(
              savedFreeLayout.properties.naturalWidth || savedFreeLayout.position?.width || 100,
            ),
            naturalImageHeight = Number(
              savedFreeLayout.properties.naturalHeight || savedFreeLayout.position?.height || 100,
            ),
            imageCanvasWidth = Number(layoutDraftDocument.canvas?.width || 2778),
            imageCanvasHeight = Number(layoutDraftDocument.canvas?.height || 1940);
          ((savedFreeLayout.position = {
            ...(savedFreeLayout.position || {}),
            x: (imageCanvasWidth - naturalImageWidth) / 2,
            y: (imageCanvasHeight - naturalImageHeight) / 2,
            width: naturalImageWidth,
            height: naturalImageHeight,
            rotation: 0,
          }),
            (savedFreeLayout.style.scale = 1));
        }
        delete savedFreeLayout.properties.freeLayout;
      });
  }),
  deps.imageInspectorElement.addEventListener("input", (imageInspectorInputEvent: any) => {
    const inspectedImage = deps.removedComponent();
    if (!inspectedImage || inspectedImage.type !== "image") return;
    const editedFieldInput = imageInspectorInputEvent.target;
    if (String(editedFieldInput.value).trim() === "") return;
    const fieldNumberValue = Number(editedFieldInput.value);
    if (!Number.isFinite(fieldNumberValue)) return;
    const canvasPixelWidth = Number(deps.activeProject.document.canvas.width || 2778),
      canvasPixelHeight = Number(deps.activeProject.document.canvas.height || 1940),
      imagePositionWidth = Number(inspectedImage.position?.width || 100),
      imagePositionHeight = Number(inspectedImage.position?.height || 100);
    if (editedFieldInput === deps.imageOpacityInputElement) {
      const clampedOpacity = clampNumber2(fieldNumberValue, 0, 100);
      deps.editorRenderer?.previewComponentProperties(inspectedImage.id, {
        opacity: clampedOpacity / 100,
      });
    } else {
      if (editedFieldInput === deps.imageLeftInputElement) {
        const leftPercent = clampNumber2(fieldNumberValue, 0, 100);
        deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
          x: (canvasPixelWidth * leftPercent) / 100 - imagePositionWidth / 2,
        });
      } else {
        if (editedFieldInput === deps.imageTopInputElement) {
          const topPercent = clampNumber2(fieldNumberValue, 0, 100);
          deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
            y: (canvasPixelHeight * topPercent) / 100 - imagePositionHeight / 2,
          });
        } else {
          if (editedFieldInput === deps.imageScaleInputElement) {
            const scalePercent = clampNumber2(fieldNumberValue, 1, 500);
            deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
              scale: scalePercent / 100,
            });
          } else {
            if (editedFieldInput === deps.imageRotationInputElement) {
              const rotationDeg = clampNumber2(fieldNumberValue, -360, 360);
              deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
                rotation: rotationDeg,
              });
            }
          }
        }
      }
    }
  }),
  deps.imageInspectorElement.addEventListener("change", (imageInspectorChangeEvent: any) => {
    const changedInputElement = imageInspectorChangeEvent.target,
      imageComponentId = deps.selectedComponentId;
    if (!(
      !imageComponentId ||
      ![
        deps.imageLabelElement,
        deps.imageOpacityInputElement,
        deps.imageLeftInputElement,
        deps.imageTopInputElement,
        deps.imageScaleInputElement,
        deps.imageRotationInputElement,
      ].includes(changedInputElement)
    )) {
      if (
        [
          deps.imageOpacityInputElement,
          deps.imageLeftInputElement,
          deps.imageTopInputElement,
          deps.imageScaleInputElement,
          deps.imageRotationInputElement,
        ].includes(changedInputElement) &&
        (String(changedInputElement.value).trim() === "" ||
          !Number.isFinite(Number(changedInputElement.value)))
      ) {
        deps.coverMotorButtonElement();
        return;
      }
      deps.mutateDocument((imageChangeDraftDocument: any) => {
        const imageComponentInDraft = findComponent2(
          imageChangeDraftDocument,
          imageComponentId,
        )?.component;
        if (!imageComponentInDraft || imageComponentInDraft.type !== "image") return;
        ((imageComponentInDraft.properties = {
          ...(imageComponentInDraft.properties || {}),
        }),
          (imageComponentInDraft.position = {
            ...(imageComponentInDraft.position || {}),
          }),
          (imageComponentInDraft.style = {
            ...(imageComponentInDraft.style || {}),
          }),
          (imageComponentInDraft.bindings = {
            ...(imageComponentInDraft.bindings || {}),
          }),
          (imageComponentInDraft.actions = {
            ...(imageComponentInDraft.actions || {}),
          }),
          (imageComponentInDraft.properties.fit = "contain"));
        const canvasWidthForImage = Number(imageChangeDraftDocument.canvas.width || 2778),
          canvasHeightForImage = Number(imageChangeDraftDocument.canvas.height || 1940),
          imageInputNumber = Number(changedInputElement.value);
        changedInputElement === deps.imageLabelElement
          ? (imageComponentInDraft.properties.label = changedInputElement.value.trim())
          : changedInputElement === deps.imageOpacityInputElement
            ? (imageComponentInDraft.properties.opacity =
                clampNumber2(imageInputNumber, 0, 100) / 100)
            : changedInputElement === deps.imageLeftInputElement
              ? (imageComponentInDraft.position.x =
                  (canvasWidthForImage * clampNumber2(imageInputNumber, 0, 100)) / 100 -
                  Number(imageComponentInDraft.position.width || 100) / 2)
              : changedInputElement === deps.imageTopInputElement
                ? (imageComponentInDraft.position.y =
                    (canvasHeightForImage * clampNumber2(imageInputNumber, 0, 100)) / 100 -
                    Number(imageComponentInDraft.position.height || 100) / 2)
                : changedInputElement === deps.imageScaleInputElement
                  ? (imageComponentInDraft.style.scale =
                      clampNumber2(imageInputNumber, 1, 500) / 100)
                  : changedInputElement === deps.imageRotationInputElement &&
                    deps.setComponentsRotation(
                      imageChangeDraftDocument,
                      imageComponentId,
                      clampNumber2(imageInputNumber, -360, 360),
                    );
      });
    }
  }));
}
