// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 平面图检视面板的 input 监听（相机/图层字段写回）

import { clampNumber as clampNumber2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface FloorplanDiagramInspectorInputDeps {
  floorplanAutoDiagramInspectorFormElement: any;
  removedComponent: any;
  floorplanDiagramInputSet: any;
  activeProject: any;
  floorplanAutoDiagramLeftInputElement: any;
  editorRenderer: any;
  floorplanAutoDiagramTopInputElement: any;
  floorplanAutoDiagramWidthInputElement: any;
  floorplanAutoDiagramHeightInputElement: any;
  floorplanAutoDiagramScaleInputElement: any;
  floorplanAutoDiagramRotationInputElement: any;
  selectedComponentId: any;
  floorplanAutoDiagramLabelTextInputElement: any;
  floorplanAutoDiagramFolderTextInputElement: any;
  coverMotorButtonElement: any;
  mutateDocument: any;
  setComponentsRotation: any;
  floorplanAutoDiagramLayoutElement: any;
}

export function attachFloorplanDiagramInspectorInput(deps: FloorplanDiagramInspectorInputDeps) {
(deps.floorplanAutoDiagramInspectorFormElement.addEventListener("input", (floorplanInputEvent: any) => {
  const inspectedDiagram = deps.removedComponent(),
    diagramFieldInput = floorplanInputEvent.target;
  if (
    !inspectedDiagram ||
    inspectedDiagram.type !== "floorplan-auto-diagram" ||
    !deps.floorplanDiagramInputSet.has(diagramFieldInput)
  )
    return;
  const diagramNumberValue = Number(diagramFieldInput.value);
  if (!Number.isFinite(diagramNumberValue)) return;
  const diagramCanvasWidth = Number(deps.activeProject.document.canvas.width || 2778),
    diagramCanvasHeight = Number(deps.activeProject.document.canvas.height || 1940),
    diagramPositionWidth = Number(inspectedDiagram.position?.width || 100),
    diagramPositionHeight = Number(inspectedDiagram.position?.height || 100);
  diagramFieldInput === deps.floorplanAutoDiagramLeftInputElement
    ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
        x:
          (diagramCanvasWidth * clampNumber2(diagramNumberValue, 0, 100)) / 100 -
          diagramPositionWidth / 2,
      })
    : diagramFieldInput === deps.floorplanAutoDiagramTopInputElement
      ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
          y:
            (diagramCanvasHeight * clampNumber2(diagramNumberValue, 0, 100)) / 100 -
            diagramPositionHeight / 2,
        })
      : diagramFieldInput === deps.floorplanAutoDiagramWidthInputElement
        ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
            width: (diagramCanvasWidth * clampNumber2(diagramNumberValue, 0.1, 100)) / 100,
          })
        : diagramFieldInput === deps.floorplanAutoDiagramHeightInputElement
          ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
              height: (diagramCanvasHeight * clampNumber2(diagramNumberValue, 0.1, 100)) / 100,
            })
          : diagramFieldInput === deps.floorplanAutoDiagramScaleInputElement
            ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
                scale: clampNumber2(diagramNumberValue, 1, 500) / 100,
              })
            : diagramFieldInput === deps.floorplanAutoDiagramRotationInputElement &&
              deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
                rotation: clampNumber2(diagramNumberValue, -360, 360),
              });
}),
  deps.floorplanAutoDiagramInspectorFormElement.addEventListener("change", (floorplanChangeEvent: any) => {
    const changedDiagramInput = floorplanChangeEvent.target,
      diagramComponentId = deps.selectedComponentId;
    if (!(
      !diagramComponentId ||
      ![
        deps.floorplanAutoDiagramLabelTextInputElement,
        deps.floorplanAutoDiagramFolderTextInputElement,
        ...deps.floorplanDiagramInputSet,
      ].includes(changedDiagramInput)
    )) {
      if (
        deps.floorplanDiagramInputSet.has(changedDiagramInput) &&
        !Number.isFinite(Number(changedDiagramInput.value))
      ) {
        deps.coverMotorButtonElement();
        return;
      }
      deps.mutateDocument((diagramDraftDocument: any) => {
        const diagramComponent = findComponent2(
          diagramDraftDocument,
          diagramComponentId,
        )?.component;
        if (!(!diagramComponent || diagramComponent.type !== "floorplan-auto-diagram")) {
          if (
            ((diagramComponent.properties = {
              ...(diagramComponent.properties || {}),
            }),
            (diagramComponent.position = {
              ...(diagramComponent.position || {}),
            }),
            (diagramComponent.style = {
              ...(diagramComponent.style || {}),
            }),
            changedDiagramInput === deps.floorplanAutoDiagramLabelTextInputElement)
          )
            diagramComponent.properties.label = changedDiagramInput.value.trim();
          else {
            if (changedDiagramInput === deps.floorplanAutoDiagramFolderTextInputElement)
              diagramComponent.properties.exportFolder = changedDiagramInput.value.trim();
            else {
              const diagramDocumentWidth = Number(diagramDraftDocument.canvas.width || 2778),
                diagramDocumentHeight = Number(diagramDraftDocument.canvas.height || 1940),
                diagramFieldValue = Number(changedDiagramInput.value);
              changedDiagramInput === deps.floorplanAutoDiagramLeftInputElement
                ? (diagramComponent.position.x =
                    (diagramDocumentWidth * clampNumber2(diagramFieldValue, 0, 100)) / 100 -
                    Number(diagramComponent.position.width || 100) / 2)
                : changedDiagramInput === deps.floorplanAutoDiagramTopInputElement
                  ? (diagramComponent.position.y =
                      (diagramDocumentHeight * clampNumber2(diagramFieldValue, 0, 100)) / 100 -
                      Number(diagramComponent.position.height || 100) / 2)
                  : changedDiagramInput === deps.floorplanAutoDiagramWidthInputElement
                    ? (diagramComponent.position.width =
                        (diagramDocumentWidth * clampNumber2(diagramFieldValue, 0.1, 100)) / 100)
                    : changedDiagramInput === deps.floorplanAutoDiagramHeightInputElement
                      ? (diagramComponent.position.height =
                          (diagramDocumentHeight * clampNumber2(diagramFieldValue, 0.1, 100)) / 100)
                      : changedDiagramInput === deps.floorplanAutoDiagramScaleInputElement
                        ? (diagramComponent.style.scale =
                            clampNumber2(diagramFieldValue, 1, 500) / 100)
                        : changedDiagramInput === deps.floorplanAutoDiagramRotationInputElement &&
                          deps.setComponentsRotation(
                            diagramDraftDocument,
                            diagramComponentId,
                            clampNumber2(diagramFieldValue, -360, 360),
                          );
            }
          }
        }
      });
    }
  }),
  deps.floorplanAutoDiagramLayoutElement.addEventListener("click", (floorplanLayoutClickEvent: any) => {
    const floorplanLayoutOptionElement =
        floorplanLayoutClickEvent.target.closest("[data-floorplan-layout]"),
      floorplanComponentId = deps.selectedComponentId;
    !floorplanLayoutOptionElement ||
      !floorplanComponentId ||
      deps.mutateDocument((floorplanLayoutDraftDocument: any) => {
        const floorplanComponent = findComponent2(
          floorplanLayoutDraftDocument,
          floorplanComponentId,
        )?.component;
        floorplanComponent?.type === "floorplan-auto-diagram" &&
          (floorplanComponent.properties = {
            ...(floorplanComponent.properties || {}),
            layoutMode:
              floorplanLayoutOptionElement.dataset.floorplanLayout === "fill" ? "fill" : "free",
          });
      });
  }));
}
