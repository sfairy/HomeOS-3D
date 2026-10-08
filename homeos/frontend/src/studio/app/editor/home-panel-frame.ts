/**
 * 底图框（panel-frame）控件检查器子域。
 *
 * 原实现位于 `home.ts` 的 `bootEditor` 闭包内，函数与监听共享闭包内的 DOM 元素
 * 引用与可变状态。此处将其按子域抽出：DOM 元素引用与共享可变状态/函数通过
 * `PanelFrameContext` 注入，行为与原闭包实现完全一致。
 */
import { clampNumber as clampNumber2, roundField as roundField2 } from "./editor-utils";
import { findComponent as findComponent2 } from "./component-tree";
import { setInspectorToggle as setInspectorToggle2 } from "./editor-basic-inspectors";

export interface PanelFrameContext {
  panelFrameInspectorFormElement: any;
  panelFrameTypeTextInputElement: any;
  panelFrameLabelTextInputElement: any;
  panelFrameMainVisibleButtonElement: any;
  panelFrameMainTextInputElement: any;
  panelFrameMainColorInputElement: any;
  panelFrameMainSizeInputElement: any;
  panelFrameMainWeightInputElement: any;
  panelFrameMainOpacityInputElement: any;
  panelFrameMainSpacingInputElement: any;
  panelFrameMainLeftInputElement: any;
  panelFrameMainTopInputElement: any;
  panelFrameSecondaryVisibleButtonElement: any;
  panelFrameSecondaryTextInputElement: any;
  panelFrameSecondaryColorInputElement: any;
  panelFrameSecondarySizeInputElement: any;
  panelFrameSecondaryWeightInputElement: any;
  panelFrameSecondaryOpacityInputElement: any;
  panelFrameSecondarySpacingInputElement: any;
  panelFrameSecondaryLeftInputElement: any;
  panelFrameSecondaryTopInputElement: any;
  panelFrameEdgeVisibleButtonElement: any;
  panelFrameEdgeColorInputElement: any;
  panelFrameEdgeWidthInputElement: any;
  panelFrameEdgeOpacityInputElement: any;
  panelFrameRadiusInputElement: any;
  panelFrameEdgeAngleInputElement: any;
  panelFrameGlowVisibleButtonElement: any;
  panelFrameGlowColorInputElement: any;
  panelFrameGlowStrengthInputElement: any;
  panelFrameGlowSizeInputElement: any;
  panelFrameGlowAngleInputElement: any;
  panelFrameLeftInputElement: any;
  panelFrameTopInputElement: any;
  panelFrameWidthInputElement: any;
  panelFrameHeightInputElement: any;
  panelFrameScaleInputElement: any;
  panelFrameRotationInputElement: any;
  panelFrameApplyStyleButtonElement: any;
  panelFrameApplyCountElement: any;
  getSelectedComponentId: () => any;
  getSelectedComponentIdsSet: () => Set<any>;
  getActiveProject: () => any;
  getEditorRenderer: () => any;
  removedComponent: () => any;
  mutateDocument: (mutateDraft: (draftDocument: any) => void) => void;
  findReplaceableComponents: (sourceComponent: any) => any[];
  runVariantExtra: (runVariantAlt: any) => any[];
  coverMotorButtonElement: () => void;
  setComponentsRotation: (
    draftDocument: any,
    componentId: any,
    rotation: number,
  ) => void;
}

export function setupPanelFrameInspector(ctx: PanelFrameContext) {
  const panelFrameColorPropertiesByElement = new Map([
    [ctx.panelFrameMainColorInputElement, "mainColor"],
    [ctx.panelFrameSecondaryColorInputElement, "secondaryColor"],
    [ctx.panelFrameEdgeColorInputElement, "edgeColor"],
    [ctx.panelFrameGlowColorInputElement, "glowColor"],
  ]),
    panelFramePropertyConfigsByElement = new Map([
      [
        ctx.panelFrameMainSizeInputElement,
        {
          property: "mainSize",
          minimum: 8,
          maximum: 500,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameMainWeightInputElement,
        {
          property: "mainWeight",
          minimum: 0,
          maximum: 3,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameMainOpacityInputElement,
        {
          property: "mainOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        ctx.panelFrameMainSpacingInputElement,
        {
          property: "mainSpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameMainLeftInputElement,
        {
          property: "mainTextLeft",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameMainTopInputElement,
        {
          property: "mainTextTop",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameSecondarySizeInputElement,
        {
          property: "secondarySize",
          minimum: 6,
          maximum: 500,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameSecondaryWeightInputElement,
        {
          property: "secondaryWeight",
          minimum: 0,
          maximum: 3,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameSecondaryOpacityInputElement,
        {
          property: "secondaryOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        ctx.panelFrameSecondarySpacingInputElement,
        {
          property: "secondarySpacing",
          minimum: -20,
          maximum: 100,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameSecondaryLeftInputElement,
        {
          property: "secondaryTextLeft",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameSecondaryTopInputElement,
        {
          property: "secondaryTextTop",
          minimum: -100,
          maximum: 200,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameEdgeWidthInputElement,
        {
          property: "edgeWidth",
          minimum: 0,
          maximum: 20,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameEdgeOpacityInputElement,
        {
          property: "edgeOpacity",
          minimum: 0,
          maximum: 100,
          divisor: 100,
        },
      ],
      [
        ctx.panelFrameRadiusInputElement,
        {
          property: "radius",
          minimum: 0,
          maximum: 50,
          divisor: 100,
        },
      ],
      [
        ctx.panelFrameEdgeAngleInputElement,
        {
          property: "edgeAngle",
          minimum: 0,
          maximum: 360,
          divisor: 1,
        },
      ],
      [
        ctx.panelFrameGlowStrengthInputElement,
        {
          property: "glowStrength",
          minimum: 0,
          maximum: 500,
          divisor: 100,
        },
      ],
      [
        ctx.panelFrameGlowSizeInputElement,
        {
          property: "glowSize",
          minimum: 0,
          maximum: 300,
          divisor: 100,
        },
      ],
      [
        ctx.panelFrameGlowAngleInputElement,
        {
          property: "glowAngle",
          minimum: 0,
          maximum: 360,
          divisor: 1,
        },
      ],
    ]),
    panelFrameTransformInputSet = new Set([
      ctx.panelFrameLeftInputElement,
      ctx.panelFrameTopInputElement,
      ctx.panelFrameWidthInputElement,
      ctx.panelFrameHeightInputElement,
      ctx.panelFrameScaleInputElement,
      ctx.panelFrameRotationInputElement,
    ]);
  (ctx.panelFrameInspectorFormElement.addEventListener("input", (panelFrameInputEvent: any) => {
    const panelFrameInputComponent = ctx.removedComponent();
    if (!panelFrameInputComponent || panelFrameInputComponent.type !== "panel-frame") return;
    const panelFrameInputElement = panelFrameInputEvent.target,
      panelFrameInputColorProperty = panelFrameColorPropertiesByElement.get(panelFrameInputElement),
      panelFrameInputPropertyConfig = panelFramePropertyConfigsByElement.get(panelFrameInputElement);
    if (panelFrameInputColorProperty) {
      ctx.getEditorRenderer()?.previewComponentProperties(panelFrameInputComponent.id, {
        [panelFrameInputColorProperty]: panelFrameInputElement.value,
      });
      return;
    }
    if (panelFrameInputPropertyConfig) {
      if (
        String(panelFrameInputElement.value).trim() === "" ||
        !Number.isFinite(Number(panelFrameInputElement.value))
      )
        return;
      const panelFrameInputPropertyValue = clampNumber2(
        Number(panelFrameInputElement.value),
        panelFrameInputPropertyConfig.minimum,
        panelFrameInputPropertyConfig.maximum,
      );
      ctx.getEditorRenderer()?.previewComponentProperties(panelFrameInputComponent.id, {
        [panelFrameInputPropertyConfig.property]:
          panelFrameInputPropertyValue / panelFrameInputPropertyConfig.divisor,
      });
      return;
    }
    if (
      !panelFrameTransformInputSet.has(panelFrameInputElement) ||
      String(panelFrameInputElement.value).trim() === "" ||
      !Number.isFinite(Number(panelFrameInputElement.value))
    )
      return;
    const panelFrameTransformInputNumber = Number(panelFrameInputElement.value),
      panelFrameTransformCanvasWidth = Number(ctx.getActiveProject().document.canvas.width || 2778),
      panelFrameTransformCanvasHeight = Number(ctx.getActiveProject().document.canvas.height || 1940),
      panelFrameTransformComponentWidth = Number(panelFrameInputComponent.position?.width || 100),
      panelFrameTransformComponentHeight = Number(panelFrameInputComponent.position?.height || 100),
      panelFrameTransformCenterX =
        Number(panelFrameInputComponent.position?.x || 0) + panelFrameTransformComponentWidth / 2,
      panelFrameTransformCenterY =
        Number(panelFrameInputComponent.position?.y || 0) + panelFrameTransformComponentHeight / 2;
    if (panelFrameInputElement === ctx.panelFrameLeftInputElement)
      ctx.getEditorRenderer()?.previewComponentTransform(panelFrameInputComponent.id, {
        x:
          (panelFrameTransformCanvasWidth * clampNumber2(panelFrameTransformInputNumber, 0, 100)) /
            100 -
          panelFrameTransformComponentWidth / 2,
      });
    else {
      if (panelFrameInputElement === ctx.panelFrameTopInputElement)
        ctx.getEditorRenderer()?.previewComponentTransform(panelFrameInputComponent.id, {
          y:
            (panelFrameTransformCanvasHeight * clampNumber2(panelFrameTransformInputNumber, 0, 100)) /
              100 -
            panelFrameTransformComponentHeight / 2,
        });
      else {
        if (panelFrameInputElement === ctx.panelFrameWidthInputElement) {
          const panelFrameTransformWidthPx =
            (panelFrameTransformCanvasWidth *
              clampNumber2(panelFrameTransformInputNumber, 0.1, 100)) /
            100;
          ctx.getEditorRenderer()?.previewComponentTransform(panelFrameInputComponent.id, {
            x: panelFrameTransformCenterX - panelFrameTransformWidthPx / 2,
            width: panelFrameTransformWidthPx,
          });
        } else {
          if (panelFrameInputElement === ctx.panelFrameHeightInputElement) {
            const panelFrameTransformHeightPx =
              (panelFrameTransformCanvasHeight *
                clampNumber2(panelFrameTransformInputNumber, 0.1, 100)) /
              100;
            ctx.getEditorRenderer()?.previewComponentTransform(panelFrameInputComponent.id, {
              y: panelFrameTransformCenterY - panelFrameTransformHeightPx / 2,
              height: panelFrameTransformHeightPx,
            });
          } else
            panelFrameInputElement === ctx.panelFrameScaleInputElement
              ? ctx.getEditorRenderer()?.previewComponentTransform(panelFrameInputComponent.id, {
                  scale: clampNumber2(panelFrameTransformInputNumber, 1, 500) / 100,
                })
              : panelFrameInputElement === ctx.panelFrameRotationInputElement &&
                ctx.getEditorRenderer()?.previewComponentTransform(panelFrameInputComponent.id, {
                  rotation: clampNumber2(panelFrameTransformInputNumber, -360, 360),
                });
        }
      }
    }
  }),
    ctx.panelFrameInspectorFormElement.addEventListener("change", (panelFrameChangeEvent: any) => {
      const panelFrameChangeInputElement = panelFrameChangeEvent.target,
        panelFrameChangeComponentId = ctx.getSelectedComponentId();
      if (!panelFrameChangeComponentId) return;
      const panelFrameChangeColorProperty = panelFrameColorPropertiesByElement.get(
          panelFrameChangeInputElement,
        ),
        panelFrameChangePropertyConfig = panelFramePropertyConfigsByElement.get(
          panelFrameChangeInputElement,
        );
      if (!(
        !panelFrameChangeColorProperty &&
        !panelFrameChangePropertyConfig &&
        !panelFrameTransformInputSet.has(panelFrameChangeInputElement)
      )) {
        if (
          (panelFrameChangePropertyConfig ||
            panelFrameTransformInputSet.has(panelFrameChangeInputElement)) &&
          (String(panelFrameChangeInputElement.value).trim() === "" ||
            !Number.isFinite(Number(panelFrameChangeInputElement.value)))
        ) {
          ctx.coverMotorButtonElement();
          return;
        }
        ctx.mutateDocument((panelFrameChangeDraftDocument: any) => {
          const panelFrameChangeComponent = findComponent2(
            panelFrameChangeDraftDocument,
            panelFrameChangeComponentId,
          )?.component;
          if (!panelFrameChangeComponent || panelFrameChangeComponent.type !== "panel-frame") return;
          ((panelFrameChangeComponent.properties = {
            ...(panelFrameChangeComponent.properties || {}),
          }),
            (panelFrameChangeComponent.position = {
              ...(panelFrameChangeComponent.position || {}),
            }),
            (panelFrameChangeComponent.style = {
              ...(panelFrameChangeComponent.style || {}),
            }));
          const panelFrameChangeCanvasWidth = Number(
              panelFrameChangeDraftDocument.canvas.width || 2778,
            ),
            panelFrameChangeCanvasHeight = Number(
              panelFrameChangeDraftDocument.canvas.height || 1940,
            ),
            panelFrameChangeComponentWidth = Number(panelFrameChangeComponent.position.width || 100),
            panelFrameChangeComponentHeight = Number(
              panelFrameChangeComponent.position.height || 100,
            ),
            panelFrameChangeCenterX =
              Number(panelFrameChangeComponent.position.x || 0) + panelFrameChangeComponentWidth / 2,
            panelFrameChangeCenterY =
              Number(panelFrameChangeComponent.position.y || 0) + panelFrameChangeComponentHeight / 2,
            panelFrameChangeInputNumber = Number(panelFrameChangeInputElement.value);
          panelFrameChangeColorProperty
            ? (panelFrameChangeComponent.properties[panelFrameChangeColorProperty] =
                panelFrameChangeInputElement.value)
            : panelFrameChangePropertyConfig
              ? (panelFrameChangeComponent.properties[panelFrameChangePropertyConfig.property] =
                  clampNumber2(
                    panelFrameChangeInputNumber,
                    panelFrameChangePropertyConfig.minimum,
                    panelFrameChangePropertyConfig.maximum,
                  ) / panelFrameChangePropertyConfig.divisor)
              : panelFrameChangeInputElement === ctx.panelFrameLeftInputElement
                ? (panelFrameChangeComponent.position.x =
                    (panelFrameChangeCanvasWidth *
                      clampNumber2(panelFrameChangeInputNumber, 0, 100)) /
                      100 -
                    panelFrameChangeComponentWidth / 2)
                : panelFrameChangeInputElement === ctx.panelFrameTopInputElement
                  ? (panelFrameChangeComponent.position.y =
                      (panelFrameChangeCanvasHeight *
                        clampNumber2(panelFrameChangeInputNumber, 0, 100)) /
                        100 -
                      panelFrameChangeComponentHeight / 2)
                  : panelFrameChangeInputElement === ctx.panelFrameWidthInputElement
                    ? ((panelFrameChangeComponent.position.width =
                        (panelFrameChangeCanvasWidth *
                          clampNumber2(panelFrameChangeInputNumber, 0.1, 100)) /
                        100),
                      (panelFrameChangeComponent.position.x =
                        panelFrameChangeCenterX - panelFrameChangeComponent.position.width / 2))
                    : panelFrameChangeInputElement === ctx.panelFrameHeightInputElement
                      ? ((panelFrameChangeComponent.position.height =
                          (panelFrameChangeCanvasHeight *
                            clampNumber2(panelFrameChangeInputNumber, 0.1, 100)) /
                          100),
                        (panelFrameChangeComponent.position.y =
                          panelFrameChangeCenterY - panelFrameChangeComponent.position.height / 2))
                      : panelFrameChangeInputElement === ctx.panelFrameScaleInputElement
                        ? (panelFrameChangeComponent.style.scale =
                            clampNumber2(panelFrameChangeInputNumber, 1, 500) / 100)
                        : panelFrameChangeInputElement === ctx.panelFrameRotationInputElement &&
                          ctx.setComponentsRotation(
                            panelFrameChangeDraftDocument,
                            panelFrameChangeComponentId,
                            clampNumber2(panelFrameChangeInputNumber, -360, 360),
                          );
        });
      }
    }));
  for (const [panelFrameVisibilityProperty, onPanelFrameVisibilityButtonClick] of [
    [ctx.panelFrameMainVisibleButtonElement, "mainTextVisible"],
    [ctx.panelFrameSecondaryVisibleButtonElement, "secondaryTextVisible"],
    [ctx.panelFrameEdgeVisibleButtonElement, "edgeVisible"],
    [ctx.panelFrameGlowVisibleButtonElement, "glowVisible"],
  ])
    panelFrameVisibilityProperty.addEventListener("click", () => {
      const panelFrameVisibilityComponentId = ctx.getSelectedComponentId();
      panelFrameVisibilityComponentId &&
        ctx.mutateDocument((panelFrameVisibilityDraftDocument: any) => {
          const panelFrameVisibilityComponent = findComponent2(
            panelFrameVisibilityDraftDocument,
            panelFrameVisibilityComponentId,
          )?.component;
          !panelFrameVisibilityComponent ||
            panelFrameVisibilityComponent.type !== "panel-frame" ||
            (panelFrameVisibilityComponent.properties = {
              ...(panelFrameVisibilityComponent.properties || {}),
              [onPanelFrameVisibilityButtonClick]:
                panelFrameVisibilityComponent.properties?.[onPanelFrameVisibilityButtonClick] ===
                false,
            });
        });
    });
function syncPanelFrameInspector(panelFrameComponent: any) {
  const frameProperties = panelFrameComponent.properties || {},
    framePosition = panelFrameComponent.position || {},
    frameCanvasWidthPx = Number(ctx.getActiveProject().document.canvas.width || 2778),
    frameCanvasHeightPx = Number(ctx.getActiveProject().document.canvas.height || 1940),
    frameWidthPx = Number(framePosition.width || 100),
    frameHeightPx = Number(framePosition.height || 100);
  ((ctx.panelFrameTypeTextInputElement.value = "底图框"),
    (ctx.panelFrameLabelTextInputElement.value = frameProperties.label || ""),
    setInspectorToggle2(
      ctx.panelFrameMainVisibleButtonElement,
      frameProperties.mainTextVisible !== false,
    ),
    (ctx.panelFrameMainTextInputElement.value = frameProperties.mainText || ""),
    (ctx.panelFrameMainColorInputElement.value = frameProperties.mainColor || "#ffffff"),
    (ctx.panelFrameMainSizeInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.mainSize ?? 30), 8, 500),
    )),
    (ctx.panelFrameMainWeightInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.mainWeight ?? 0), 0, 3),
    )),
    (ctx.panelFrameMainOpacityInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.mainOpacity ?? 0.72) * 100, 0, 100),
    )),
    (ctx.panelFrameMainSpacingInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.mainSpacing ?? 2), -20, 100),
    )));
  const defaultTextLeft = Number(frameProperties.textLeft ?? 5.2),
    defaultTextTop = Number(frameProperties.textTop ?? 28);
  ((ctx.panelFrameMainLeftInputElement.value = roundField2(
    clampNumber2(Number(frameProperties.mainTextLeft ?? defaultTextLeft), -100, 200),
  )),
    (ctx.panelFrameMainTopInputElement.value = roundField2(
      clampNumber2(
        Number(
          frameProperties.mainTextTop ??
            defaultTextTop - (Number(frameProperties.lineGap ?? 24) / frameHeightPx) * 100,
        ),
        -100,
        200,
      ),
    )),
    setInspectorToggle2(
      ctx.panelFrameSecondaryVisibleButtonElement,
      frameProperties.secondaryTextVisible !== false,
    ),
    (ctx.panelFrameSecondaryTextInputElement.value = frameProperties.secondaryText || ""),
    (ctx.panelFrameSecondaryColorInputElement.value = frameProperties.secondaryColor || "#ffffff"),
    (ctx.panelFrameSecondarySizeInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.secondarySize ?? 15), 6, 500),
    )),
    (ctx.panelFrameSecondaryWeightInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.secondaryWeight ?? 0), 0, 3),
    )),
    (ctx.panelFrameSecondaryOpacityInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.secondaryOpacity ?? 0.36) * 100, 0, 100),
    )),
    (ctx.panelFrameSecondarySpacingInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.secondarySpacing ?? 2.1), -20, 100),
    )),
    (ctx.panelFrameSecondaryLeftInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.secondaryTextLeft ?? defaultTextLeft), -100, 200),
    )),
    (ctx.panelFrameSecondaryTopInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.secondaryTextTop ?? defaultTextTop), -100, 200),
    )),
    setInspectorToggle2(ctx.panelFrameEdgeVisibleButtonElement, frameProperties.edgeVisible !== false),
    (ctx.panelFrameEdgeColorInputElement.value = frameProperties.edgeColor || "#d4d4d4"),
    (ctx.panelFrameEdgeWidthInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.edgeWidth ?? 0.9), 0, 20),
    )),
    (ctx.panelFrameEdgeOpacityInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.edgeOpacity ?? 1) * 100, 0, 100),
    )),
    (ctx.panelFrameRadiusInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.radius ?? 0.195) * 100, 0, 50),
    )),
    (ctx.panelFrameEdgeAngleInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.edgeAngle ?? 45), 0, 360),
    )),
    setInspectorToggle2(ctx.panelFrameGlowVisibleButtonElement, frameProperties.glowVisible !== false),
    (ctx.panelFrameGlowColorInputElement.value = frameProperties.glowColor || "#ffffff"),
    (ctx.panelFrameGlowStrengthInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.glowStrength ?? 0.5) * 100, 0, 500),
    )),
    (ctx.panelFrameGlowSizeInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.glowSize ?? 1.5) * 100, 0, 300),
    )),
    (ctx.panelFrameGlowAngleInputElement.value = roundField2(
      clampNumber2(Number(frameProperties.glowAngle ?? 242), 0, 360),
    )),
    (ctx.panelFrameLeftInputElement.value = roundField2(
      clampNumber2(
        ((Number(framePosition.x || 0) + frameWidthPx / 2) / frameCanvasWidthPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.panelFrameTopInputElement.value = roundField2(
      clampNumber2(
        ((Number(framePosition.y || 0) + frameHeightPx / 2) / frameCanvasHeightPx) * 100,
        0,
        100,
      ),
    )),
    (ctx.panelFrameWidthInputElement.value = roundField2(
      clampNumber2((frameWidthPx / frameCanvasWidthPx) * 100, 0.1, 100),
    )),
    (ctx.panelFrameHeightInputElement.value = roundField2(
      clampNumber2((frameHeightPx / frameCanvasHeightPx) * 100, 0.1, 100),
    )),
    (ctx.panelFrameScaleInputElement.value = roundField2(
      clampNumber2(Number(panelFrameComponent.style?.scale || 1) * 100, 1, 500),
    )),
    (ctx.panelFrameRotationInputElement.value = roundField2(
      clampNumber2(Number(framePosition.rotation || 0), -360, 360),
    )));
  const isFrameMultiSelection = ctx.getSelectedComponentIdsSet().size > 1;
  ((ctx.panelFrameWidthInputElement.disabled = isFrameMultiSelection),
    (ctx.panelFrameHeightInputElement.disabled = isFrameMultiSelection),
    (ctx.panelFrameScaleInputElement.disabled = false),
    (ctx.panelFrameRotationInputElement.disabled = false));
  const frameReplaceableCount = ctx.findReplaceableComponents(panelFrameComponent).length,
    frameApplyTargetCount = ctx.runVariantExtra(panelFrameComponent).length;
  ((ctx.panelFrameApplyStyleButtonElement.disabled = !frameReplaceableCount || !frameApplyTargetCount),
    (ctx.panelFrameApplyCountElement.textContent = frameApplyTargetCount + " 项修改"),
    (ctx.panelFrameApplyStyleButtonElement.textContent = "一键应用到同类型控件"));
}
  return { syncPanelFrameInspector };
}
