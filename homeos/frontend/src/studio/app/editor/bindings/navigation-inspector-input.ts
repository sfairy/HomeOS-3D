// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 导航检视面板的表单 input 监听（写回当前编辑中的导航形状/样式字段）

import { clampNumber as clampNumber2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
export interface NavigationInspectorInputDeps {
  navigationInspectorFormElement: any;
  removedComponent: any;
  navigationLabelTextInputElement: any;
  navigationColorPropertiesByElement: any;
  airConditionerInspectorSubmitEventById: any;
  editorRenderer: any;
  navigationPropertyConfigsByElement: any;
  syncNavigationPreviewFromElement: any;
  navigationTransformInputSet: any;
  activeProject: any;
  navigationLeftElement: any;
  navigationTopElement: any;
  navigationWidthElement: any;
  navigationHeightElement: any;
  navigationScaleElement: any;
  navigationRotationElement: any;
  selectedComponentId: any;
  navigationToggleStateByElement: any;
  navigationPropertyNameFromElement: any;
  navigationLabelElement: any;
  coverMotorButtonElement: any;
  mutateDocument: any;
  entryStateRecord: any;
  setComponentsRotation: any;
  onImageAssetUploadButtonClick: any;
}

export function attachNavigationInspectorInput(deps: NavigationInspectorInputDeps) {
(deps.navigationInspectorFormElement.addEventListener("input", (navigationInputEvent: any) => {
  const navigationInputComponent = deps.removedComponent();
  if (!navigationInputComponent || !deps.navigationLabelTextInputElement(navigationInputComponent))
    return;
  const navigationInputElement = navigationInputEvent.target,
    navigationInputColorProperty = deps.navigationColorPropertiesByElement.get(navigationInputElement);
  if (navigationInputColorProperty) {
    deps.airConditionerInspectorSubmitEventById.has(navigationInputElement) ||
      deps.editorRenderer?.previewComponentProperties(navigationInputComponent.id, {
        [navigationInputColorProperty]: navigationInputElement.value,
      });
    return;
  }
  const navigationInputPropertyConfig =
    deps.navigationPropertyConfigsByElement.get(navigationInputElement);
  if (navigationInputPropertyConfig) {
    if (
      String(navigationInputElement.value).trim() === "" ||
      !Number.isFinite(Number(navigationInputElement.value))
    )
      return;
    const navigationInputPropertyValue = clampNumber2(
      Number(navigationInputElement.value),
      navigationInputPropertyConfig.minimum,
      navigationInputPropertyConfig.maximum,
    );
    (deps.syncNavigationPreviewFromElement(navigationInputElement),
      deps.editorRenderer?.previewComponentProperties(navigationInputComponent.id, {
        [navigationInputPropertyConfig.property]:
          navigationInputPropertyValue / navigationInputPropertyConfig.divisor,
      }));
    return;
  }
  if (
    !deps.navigationTransformInputSet.has(navigationInputElement) ||
    String(navigationInputElement.value).trim() === "" ||
    !Number.isFinite(Number(navigationInputElement.value))
  )
    return;
  const navigationTransformInputNumber = Number(navigationInputElement.value),
    navigationTransformCanvasWidth = Number(deps.activeProject.document.canvas.width || 2778),
    navigationTransformCanvasHeight = Number(deps.activeProject.document.canvas.height || 1940),
    navigationTransformComponentWidth = Number(navigationInputComponent.position?.width || 100),
    navigationTransformComponentHeight = Number(navigationInputComponent.position?.height || 100);
  if (navigationInputElement === deps.navigationLeftElement) {
    const navigationLeftPercent = clampNumber2(navigationTransformInputNumber, 0, 100);
    deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
      x:
        (navigationTransformCanvasWidth * navigationLeftPercent) / 100 -
        navigationTransformComponentWidth / 2,
    });
  } else {
    if (navigationInputElement === deps.navigationTopElement) {
      const navigationTopPercent = clampNumber2(navigationTransformInputNumber, 0, 100);
      deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        y:
          (navigationTransformCanvasHeight * navigationTopPercent) / 100 -
          navigationTransformComponentHeight / 2,
      });
    } else {
      if (navigationInputElement === deps.navigationWidthElement) {
        const navigationWidthPercent = clampNumber2(navigationTransformInputNumber, 0.1, 100),
          navigationPreviewWidthPx =
            (navigationTransformCanvasWidth * navigationWidthPercent) / 100,
          navigationCenterX =
            Number(navigationInputComponent.position?.x || 0) +
            navigationTransformComponentWidth / 2;
        deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
          x: navigationCenterX - navigationPreviewWidthPx / 2,
          width: navigationPreviewWidthPx,
        });
      } else {
        if (navigationInputElement === deps.navigationHeightElement) {
          const navigationHeightPercent = clampNumber2(navigationTransformInputNumber, 0.1, 100),
            navigationPreviewHeightPx =
              (navigationTransformCanvasHeight * navigationHeightPercent) / 100,
            navigationCenterY =
              Number(navigationInputComponent.position?.y || 0) +
              navigationTransformComponentHeight / 2;
          deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
            y: navigationCenterY - navigationPreviewHeightPx / 2,
            height: navigationPreviewHeightPx,
          });
        } else {
          if (navigationInputElement === deps.navigationScaleElement) {
            const navigationScalePercent = clampNumber2(navigationTransformInputNumber, 1, 500);
            deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
              scale: navigationScalePercent / 100,
            });
          } else {
            if (navigationInputElement === deps.navigationRotationElement) {
              const navigationRotationDegrees = clampNumber2(
                navigationTransformInputNumber,
                -360,
                360,
              );
              deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
                rotation: navigationRotationDegrees,
              });
            }
          }
        }
      }
    }
  }
}),
  deps.navigationInspectorFormElement.addEventListener("focusin", (onNavigationInspectorFormChange: any) => {
    deps.syncNavigationPreviewFromElement(onNavigationInspectorFormChange.target);
  }),
  deps.navigationInspectorFormElement.addEventListener("change", (navigationChangeEvent: any) => {
    const navigationChangeInputElement = navigationChangeEvent.target,
      navigationChangeComponentId = deps.selectedComponentId;
    if (!navigationChangeComponentId) return;
    const navigationChangePropertyConfig = deps.navigationColorPropertiesByElement.get(
        navigationChangeInputElement,
      ),
      navigationChangeToggleState = deps.navigationPropertyConfigsByElement.get(
        navigationChangeInputElement,
      ),
      navigationChangePropertyName = deps.navigationToggleStateByElement.get(
        navigationChangeInputElement,
      ),
      eI2 = deps.navigationPropertyNameFromElement(navigationChangeInputElement);
    if (!(
      navigationChangeInputElement !== deps.navigationLabelElement &&
      !navigationChangePropertyConfig &&
      !navigationChangeToggleState &&
      !deps.navigationTransformInputSet.has(navigationChangeInputElement)
    )) {
      if (
        (navigationChangeToggleState ||
          deps.navigationTransformInputSet.has(navigationChangeInputElement)) &&
        (String(navigationChangeInputElement.value).trim() === "" ||
          !Number.isFinite(Number(navigationChangeInputElement.value)))
      ) {
        deps.coverMotorButtonElement();
        return;
      }
      (navigationChangePropertyName &&
        deps.syncNavigationPreviewFromElement(navigationChangeInputElement),
        deps.mutateDocument((navigationChangeDraftDocument: any) => {
          const navigationPreviousActionValue = findComponent2(
            navigationChangeDraftDocument,
            navigationChangeComponentId,
          )?.component;
          if (
            !navigationPreviousActionValue ||
            !deps.navigationLabelTextInputElement(navigationPreviousActionValue)
          )
            return;
          ((navigationPreviousActionValue.properties = {
            ...(navigationPreviousActionValue.properties || {}),
          }),
            (navigationPreviousActionValue.position = {
              ...(navigationPreviousActionValue.position || {}),
            }),
            (navigationPreviousActionValue.style = {
              ...(navigationPreviousActionValue.style || {}),
            }),
            (navigationPreviousActionValue.actions = {
              ...(navigationPreviousActionValue.actions || {}),
            }));
          const $e6 = eI2 ? deps.entryStateRecord(navigationPreviousActionValue, eI2) : undefined,
            navigationChangeCanvasWidth = Number(
              navigationChangeDraftDocument.canvas.width || 2778,
            ),
            navigationChangeCanvasHeight = Number(
              navigationChangeDraftDocument.canvas.height || 1940,
            ),
            navigationChangeInputNumber = Number(navigationChangeInputElement.value);
          if (navigationChangeInputElement === deps.navigationLabelElement)
            navigationPreviousActionValue.properties.label =
              navigationChangeInputElement.value.trim();
          else {
            if (navigationChangePropertyConfig)
              navigationPreviousActionValue.properties[navigationChangePropertyConfig] =
                navigationChangeInputElement.value;
            else {
              if (navigationChangeToggleState)
                navigationPreviousActionValue.properties[navigationChangeToggleState.property] =
                  clampNumber2(
                    navigationChangeInputNumber,
                    navigationChangeToggleState.minimum,
                    navigationChangeToggleState.maximum,
                  ) / navigationChangeToggleState.divisor;
              else {
                if (navigationChangeInputElement === deps.navigationLeftElement)
                  navigationPreviousActionValue.position.x =
                    (navigationChangeCanvasWidth *
                      clampNumber2(navigationChangeInputNumber, 0, 100)) /
                      100 -
                    Number(navigationPreviousActionValue.position.width || 100) / 2;
                else {
                  if (navigationChangeInputElement === deps.navigationTopElement)
                    navigationPreviousActionValue.position.y =
                      (navigationChangeCanvasHeight *
                        clampNumber2(navigationChangeInputNumber, 0, 100)) /
                        100 -
                      Number(navigationPreviousActionValue.position.height || 100) / 2;
                  else {
                    if (navigationChangeInputElement === deps.navigationWidthElement) {
                      const navigationChangeWidthPx =
                          (navigationChangeCanvasWidth *
                            clampNumber2(navigationChangeInputNumber, 0.1, 100)) /
                          100,
                        navigationChangeCenterX =
                          Number(navigationPreviousActionValue.position.x || 0) +
                          Number(navigationPreviousActionValue.position.width || 100) / 2;
                      ((navigationPreviousActionValue.position.x =
                        navigationChangeCenterX - navigationChangeWidthPx / 2),
                        (navigationPreviousActionValue.position.width = navigationChangeWidthPx));
                    } else {
                      if (navigationChangeInputElement === deps.navigationHeightElement) {
                        const navigationChangeHeightPx =
                            (navigationChangeCanvasHeight *
                              clampNumber2(navigationChangeInputNumber, 0.1, 100)) /
                            100,
                          navigationChangeCenterY =
                            Number(navigationPreviousActionValue.position.y || 0) +
                            Number(navigationPreviousActionValue.position.height || 100) / 2;
                        ((navigationPreviousActionValue.position.y =
                          navigationChangeCenterY - navigationChangeHeightPx / 2),
                          (navigationPreviousActionValue.position.height =
                            navigationChangeHeightPx));
                      } else
                        navigationChangeInputElement === deps.navigationScaleElement
                          ? (navigationPreviousActionValue.style.scale =
                              clampNumber2(navigationChangeInputNumber, 1, 500) / 100)
                          : navigationChangeInputElement === deps.navigationRotationElement &&
                            deps.setComponentsRotation(
                              navigationChangeDraftDocument,
                              navigationChangeComponentId,
                              clampNumber2(navigationChangeInputNumber, -360, 360),
                            );
                    }
                  }
                }
              }
            }
          }
          eI2 &&
            deps.onImageAssetUploadButtonClick(
              navigationChangeComponentId,
              eI2,
              $e6,
              deps.entryStateRecord(navigationPreviousActionValue, eI2),
            );
        }));
    }
  }));
}
