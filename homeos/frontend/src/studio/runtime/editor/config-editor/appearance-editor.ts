import {
  requestInteraction3dAccess as requestInteraction3dAccess2,
  getInteraction3dEditorView as getInteraction3dEditorView2,
} from "@app/bridge/bridge";
import { normalizeInteraction3dLightingMode as normalizeInteraction3dLightingMode2 } from "@app/bridge/definition";

const APPEARANCE_GROUPS: [string, [string, string, number, number, number][]][] = [
  [
    "整体",
    [
      ["曝光", "exposure", 0.5, 2, 0.05],
      ["半球光", "hemisphereIntensity", 0, 3, 0.05],
      ["环境光", "ambientIntensity", 0, 2, 0.05],
    ],
  ],
  [
    "主光与阴影",
    [
      ["强度", "mainIntensity", 0, 5, 0.05],
      ["水平角", "mainAzimuth", -180, 180, 5],
      ["高度角", "mainElevation", 5, 89, 5],
      ["阴影浓度", "mainShadowIntensity", 0, 1, 0.05],
    ],
  ],
  [
    "侧面补光",
    [
      ["强度", "fillIntensity", 0, 3, 0.05],
      ["水平角", "fillAzimuth", -180, 180, 5],
      ["高度角", "fillElevation", 0, 89, 5],
    ],
  ],
  [
    "顶部补光",
    [
      ["强度", "topIntensity", 0, 3, 0.05],
      ["水平角", "topAzimuth", -180, 180, 5],
      ["高度角", "topElevation", 0, 89, 5],
    ],
  ],
];

export { APPEARANCE_GROUPS };

export async function openInteraction3dAppearanceEditor({
  component: appearanceComponent,
  onSave: onAppearanceSave,
}: any) {
  if (
    normalizeInteraction3dLightingMode2(appearanceComponent.properties?.lightingMode) === "region"
  )
    return;
  await requestInteraction3dAccess2();
  const editorView = getInteraction3dEditorView2(appearanceComponent.id);
  if (!editorView?.metadata) throw new Error("户型还在加载，请稍候再打开进阶设置。");
  const structuredClone4 = structuredClone(appearanceComponent.properties || {});
  let sourceBaseLighting = {
      ...editorView.metadata.defaults,
      ...structuredClone(structuredClone4.baseLighting || editorView.metadata.baseLighting),
    },
    isAppearanceDirty = false;
  const appearanceStyleLinkElement = document.createElement("link");
  ((appearanceStyleLinkElement.rel = "stylesheet"),
    (appearanceStyleLinkElement.href =
      "/api/v1/modules/interaction3d/core/runtime.css"),
    document.head.append(appearanceStyleLinkElement));
  const createPlainElement = (plainTagName: any, plainText = "") => {
      const plainElement = document.createElement(plainTagName);
      return ((plainElement.textContent = plainText), plainElement);
    },
    appearanceDialogElement = createPlainElement("dialog");
  ((appearanceDialogElement.className = "i3d-editor i3d-appearance-editor"),
    appearanceDialogElement.setAttribute("aria-label", "户型进阶设置"));
  const appearanceHeaderElement = createPlainElement("header"),
    appearanceBodyElement = createPlainElement("div");
  appearanceBodyElement.className = "i3d-appearance-body";
  const appearanceErrorElement = createPlainElement("p");
  ((appearanceErrorElement.className = "i3d-error"),
    appearanceErrorElement.setAttribute("role", "status"));
  let dragState: any;
  const positionAppearanceDialog = (targetLeft: any, targetTop: any) => {
      const boundingClientRect = appearanceDialogElement.getBoundingClientRect();
      Object.assign(appearanceDialogElement.style, {
        margin: "0",
        right: "auto",
        bottom: "auto",
        left:
          Math.max(8, Math.min(targetLeft, window.innerWidth - boundingClientRect.width - 8)) +
          "px",
        top:
          Math.max(8, Math.min(targetTop, window.innerHeight - boundingClientRect.height - 8)) +
          "px",
      });
    },
    repositionAppearanceDialog = () => {
      const currentRect = appearanceDialogElement.getBoundingClientRect();
      positionAppearanceDialog(currentRect.left, currentRect.top);
    };
  ((appearanceHeaderElement.title = "按住标题栏拖动"),
    appearanceHeaderElement.addEventListener("pointerdown", (pointerDownEvent: any) => {
      if (pointerDownEvent.button !== 0 || pointerDownEvent.target.closest("button")) return;
      pointerDownEvent.preventDefault();
      const dragStartRect = appearanceDialogElement.getBoundingClientRect();
      ((dragState = {
        id: pointerDownEvent.pointerId,
        x: pointerDownEvent.clientX,
        y: pointerDownEvent.clientY,
        left: dragStartRect.left,
        top: dragStartRect.top,
      }),
        appearanceHeaderElement.setPointerCapture(pointerDownEvent.pointerId));
    }),
    appearanceHeaderElement.addEventListener("pointermove", (pointerMoveEvent: any) => {
      !dragState ||
        dragState.id !== pointerMoveEvent.pointerId ||
        positionAppearanceDialog(
          dragState.left + pointerMoveEvent.clientX - dragState.x,
          dragState.top + pointerMoveEvent.clientY - dragState.y,
        );
    }));
  for (const pointerEndEventName of ["pointerup", "pointercancel", "lostpointercapture"])
    appearanceHeaderElement.addEventListener(pointerEndEventName, () => {
      dragState = null;
    });
  window.addEventListener("resize", repositionAppearanceDialog);
  const applyAppearanceLighting = () =>
      editorView.update({
        ...structuredClone4,
        baseLighting: sourceBaseLighting,
      }),
    closeAppearanceEditor = (shouldKeepLighting = false) => {
      isAppearanceDirty ||
        ((isAppearanceDirty = true),
        shouldKeepLighting || editorView.update(structuredClone4),
        window.removeEventListener("resize", repositionAppearanceDialog),
        appearanceDialogElement.close(),
        appearanceDialogElement.remove(),
        appearanceStyleLinkElement.remove());
    },
    appearanceSaveButton = createPlainElement("button", "完成");
  ((appearanceSaveButton.type = "button"),
    appearanceSaveButton.addEventListener("click", async () => {
      if (!(isAppearanceDirty || appearanceSaveButton.disabled)) {
        appearanceSaveButton.disabled = true;
        try {
          if ((await requestInteraction3dAccess2(), isAppearanceDirty)) return;
          (await onAppearanceSave(sourceBaseLighting), closeAppearanceEditor(true));
        } catch (appearanceSaveError: any) {
          isAppearanceDirty ||
            ((appearanceErrorElement.textContent = appearanceSaveError.message),
            (appearanceSaveButton.disabled = false));
        }
      }
    }));
  const appearanceCancelButton = createPlainElement("button", "取消");
  ((appearanceCancelButton.type = "button"),
    appearanceCancelButton.addEventListener("click", () => closeAppearanceEditor()));
  const dragHintElement = createPlainElement("span", "拖动");
  ((dragHintElement.className = "i3d-drag-hint"),
    appearanceHeaderElement.append(
      createPlainElement("strong", "户型进阶设置"),
      dragHintElement,
      appearanceSaveButton,
      appearanceCancelButton,
    ));
  const appearanceInputsByKey = new Map(),
    Wi2 = APPEARANCE_GROUPS;
  for (const [sectionTitleText, sectionFields] of Wi2) {
    const appearanceGroupSectionElement = createPlainElement("section"),
      appearanceGridElement = createPlainElement("div");
    ((appearanceGridElement.className = "i3d-appearance-grid"),
      appearanceGroupSectionElement.append(
        createPlainElement("h4", sectionTitleText),
        appearanceGridElement,
      ));
    for (const [
      fieldLabelText,
      appearanceFieldName,
      fieldMinValue,
      fieldMaxValue,
      fieldStepValue,
    ] of sectionFields) {
      const floorBrightnessRangeInput = createPlainElement("label"),
        floorBrightnessNumberInput = createPlainElement("input");
      (Object.assign(floorBrightnessNumberInput, {
        name: "i3d-base-light-" + appearanceFieldName,
        type: "number",
        min: String(fieldMinValue),
        max: String(fieldMaxValue),
        step: String(fieldStepValue),
        value: String(sourceBaseLighting[appearanceFieldName]),
      }),
        floorBrightnessNumberInput.addEventListener("input", () => {
          Number.isFinite(floorBrightnessNumberInput.valueAsNumber) &&
            ((sourceBaseLighting[appearanceFieldName] = Math.max(
              fieldMinValue,
              Math.min(fieldMaxValue, floorBrightnessNumberInput.valueAsNumber),
            )),
            applyAppearanceLighting());
        }),
        floorBrightnessRangeInput.append(
          createPlainElement("span", fieldLabelText),
          floorBrightnessNumberInput,
        ),
        appearanceGridElement.append(floorBrightnessRangeInput),
        appearanceInputsByKey.set(appearanceFieldName, floorBrightnessNumberInput));
    }
    appearanceBodyElement.append(appearanceGroupSectionElement);
  }
  const restoreDefaultsButton = createPlainElement("button", "恢复默认");
  ((restoreDefaultsButton.type = "button"),
    restoreDefaultsButton.addEventListener("click", () => {
      for (const [appearanceInputElement, resetFloorBrightness] of appearanceInputsByKey)
        ((sourceBaseLighting[appearanceInputElement] =
          editorView.metadata.defaults[appearanceInputElement]),
          (resetFloorBrightness.value = String(sourceBaseLighting[appearanceInputElement])));
      applyAppearanceLighting();
    }));
  const appearanceNoteElement = createPlainElement(
    "p",
    "调整当前户型的整体光照与阴影。完成后点击页面上方保存，仅保存至当前 3D 控件。",
  );
  ((appearanceNoteElement.className = "i3d-note"),
    appearanceBodyElement.append(
      restoreDefaultsButton,
      appearanceNoteElement,
      appearanceErrorElement,
    ),
    appearanceDialogElement.append(appearanceHeaderElement, appearanceBodyElement),
    document.body.append(appearanceDialogElement),
    appearanceDialogElement.addEventListener("cancel", (appearanceCancelEvent: any) => {
      (appearanceCancelEvent.preventDefault(), closeAppearanceEditor());
    }),
    appearanceDialogElement.showModal());
}
