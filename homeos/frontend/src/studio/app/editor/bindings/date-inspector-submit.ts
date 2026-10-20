// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 日期/时间检视面板提交按钮的批量注册（.component-action-controls）

import { ACTION_TYPES as ACTION_TYPES2, actionPopupData as actionPopupData2, componentActionIsSupported as componentActionIsSupported2 } from "../../shared/action-rules";
import { clone as clone2 } from "../editor-utils";
import { findComponent as findComponent2 } from "../component-tree";
import { manualRelatedEntityConfig as manualRelatedEntityConfig2, relatedPopupContext as relatedPopupContext2 } from "../../shared/related-entities";

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface DateInspectorSubmitDeps {
  selectedComponentId: any;
  mutateDocument: any;
  entities: any;
  pageSelectElement: any;
  entitiesByEntityId: any;
  devicesByDeviceId: any;
  removedComponent: any;
  editorMode: any;
  handleOperationError: any;
  ensureEditorRenderer: any;
}

export function attachDateInspectorSubmit(deps: DateInspectorSubmitDeps) {
for (const onDateInspectorFormSubmit of document.querySelectorAll(".component-action-controls"))
  (onDateInspectorFormSubmit.addEventListener("click", (dateInspectorSubmitEvent) => {
    const onWeatherInspectorFormSubmitElement = (dateInspectorSubmitEvent.target as Element).closest<HTMLElement>(
      "[data-hidden-content-clickable]",
    );
    if (onWeatherInspectorFormSubmitElement && deps.selectedComponentId) {
      deps.mutateDocument((onWeatherInspectorFormSubmit: any) => {
        const onWeatherInspectorFormSubmitState = findComponent2(
          onWeatherInspectorFormSubmit,
          deps.selectedComponentId,
        )?.component;
        !onWeatherInspectorFormSubmitState ||
          !["title-button", "device-button", "icon-button-effect"].includes(
            onWeatherInspectorFormSubmitState.type,
          ) ||
          (onWeatherInspectorFormSubmitState.properties = {
            ...(onWeatherInspectorFormSubmitState.properties || {}),
            hiddenContentClickable:
              onWeatherInspectorFormSubmitElement.dataset.hiddenContentClickable === "on",
          });
      });
      return;
    }
    const onWeatherInspectorFormSubmitElementElement =
        (dateInspectorSubmitEvent.target as Element).closest<HTMLButtonElement>("[data-action-type]"),
      weatherInspectorSubmitEventElement =
        onWeatherInspectorFormSubmitElementElement?.closest<HTMLElement>("[data-action-trigger]"),
      weatherInspectorSubmitEventState = deps.selectedComponentId;
    if (
      !onWeatherInspectorFormSubmitElementElement ||
      !weatherInspectorSubmitEventElement ||
      !weatherInspectorSubmitEventState ||
      onWeatherInspectorFormSubmitElementElement.disabled
    )
      return;
    const actionType = ACTION_TYPES2.includes(
        onWeatherInspectorFormSubmitElementElement.dataset.actionType!,
      )
        ? onWeatherInspectorFormSubmitElementElement.dataset.actionType
        : "none",
      actionTrigger2 = weatherInspectorSubmitEventElement.dataset.actionTrigger;
    ["tap", "doubleTap", "hold"].includes(actionTrigger2!) &&
      deps.mutateDocument((weatherInspectorSubmitEvent: any) => {
        const weatherInspectorSubmitEventValue = findComponent2(
          weatherInspectorSubmitEvent,
          weatherInspectorSubmitEventState,
        )?.component;
        if (!weatherInspectorSubmitEventValue) return;
        const weatherInspectorSubmitEventConfig =
            weatherInspectorSubmitEventValue.bindings?.entity?.entityId,
          isWeatherInspectorSubmitEvent =
            weatherInspectorSubmitEventValue.type === "light-statistics",
          weatherInspectorSubmitEventRef = actionPopupData2(
            weatherInspectorSubmitEventValue.actions?.[actionTrigger2!],
          ),
          weatherInspectorSubmitEventEntry =
            actionType === "more-info" &&
            !weatherInspectorSubmitEventConfig &&
            weatherInspectorSubmitEventRef.source === "current"
              ? (weatherInspectorSubmitEvent.customPopups || []).length
                ? "custom"
                : "entity"
              : weatherInspectorSubmitEventRef.source,
          onLineChartInspectorFormSubmitState =
            actionType === "more-info"
              ? {
                  popupSource: weatherInspectorSubmitEventEntry,
                  ...(weatherInspectorSubmitEventEntry === "entity"
                    ? {
                        entityId:
                          weatherInspectorSubmitEventRef.entityId || deps.entities[0]?.entityId || "",
                      }
                    : {}),
                  ...(weatherInspectorSubmitEventEntry === "custom"
                    ? {
                        popupId:
                          weatherInspectorSubmitEventRef.popupId ||
                          weatherInspectorSubmitEvent.customPopups?.[0]?.id ||
                          "",
                      }
                    : {}),
                }
              : {},
          isOnLineChartInspectorFormSubmit =
            weatherInspectorSubmitEventValue.actions?.[actionTrigger2!]?.type === "more-info",
          onLineChartInspectorFormSubmitValue =
            weatherInspectorSubmitEventValue.actions?.[actionTrigger2!]?.target,
          onLineChartInspectorFormSubmitConfig =
            weatherInspectorSubmitEventValue.type === "navigation-button"
              ? weatherInspectorSubmitEventValue.properties?.targetPage
              : "",
          mappedItemsSet = new Set(
            weatherInspectorSubmitEvent.pages.map(
              (onLineChartInspectorFormSubmit: any) => onLineChartInspectorFormSubmit.path,
            ),
          ),
          onLineChartInspectorFormSubmitRef = mappedItemsSet.has(
            onLineChartInspectorFormSubmitValue,
          )
            ? onLineChartInspectorFormSubmitValue
            : mappedItemsSet.has(onLineChartInspectorFormSubmitConfig)
              ? onLineChartInspectorFormSubmitConfig
              : deps.pageSelectElement.value || weatherInspectorSubmitEvent.pages[0]?.path,
          lineChartInspectorSubmitEventState =
            actionType === "none" ||
            componentActionIsSupported2(
              weatherInspectorSubmitEventValue,
              actionType === "navigate"
                ? {
                    type: "navigate",
                    target: onLineChartInspectorFormSubmitRef,
                  }
                : actionType === "more-info"
                  ? {
                      type: "more-info",
                      data: onLineChartInspectorFormSubmitState,
                    }
                  : {
                      type: actionType,
                    },
              {
                pagePaths: mappedItemsSet,
                popupIds: new Set(
                  (weatherInspectorSubmitEvent.customPopups || []).map(
                    (lineChartInspectorSubmitEvent: any) => lineChartInspectorSubmitEvent.id,
                  ),
                ),
              },
            )
              ? actionType
              : "none";
        ((weatherInspectorSubmitEventValue.actions = {
          ...(weatherInspectorSubmitEventValue.actions || {}),
        }),
          lineChartInspectorSubmitEventState === "none"
            ? weatherInspectorSubmitEventValue.type === "camera" && actionTrigger2 === "tap"
              ? (weatherInspectorSubmitEventValue.actions[actionTrigger2] = {
                  type: "none",
                })
              : delete weatherInspectorSubmitEventValue.actions[actionTrigger2!]
            : lineChartInspectorSubmitEventState === "navigate"
              ? (weatherInspectorSubmitEventValue.actions[actionTrigger2!] = {
                  type: "navigate",
                  target: onLineChartInspectorFormSubmitRef,
                })
              : lineChartInspectorSubmitEventState === "more-info"
                ? (weatherInspectorSubmitEventValue.actions[actionTrigger2!] = {
                    type: "more-info",
                    data:
                      weatherInspectorSubmitEventValue.actions?.[actionTrigger2!]?.type ===
                      "more-info"
                        ? {
                            ...clone2(
                              weatherInspectorSubmitEventValue.actions[actionTrigger2!].data || {},
                            ),
                            ...onLineChartInspectorFormSubmitState,
                          }
                        : onLineChartInspectorFormSubmitState,
                  })
                : (weatherInspectorSubmitEventValue.actions[actionTrigger2!] = {
                    type: lineChartInspectorSubmitEventState,
                  }),
          !isWeatherInspectorSubmitEvent &&
            lineChartInspectorSubmitEventState === "more-info" &&
            !isOnLineChartInspectorFormSubmit &&
            !weatherInspectorSubmitEventValue.properties?.relatedEntities &&
            relatedPopupContext2(
              weatherInspectorSubmitEventValue,
              deps.entitiesByEntityId(),
              deps.devicesByDeviceId(),
            ) &&
            (weatherInspectorSubmitEventValue.properties = {
              ...(weatherInspectorSubmitEventValue.properties || {}),
              relatedEntities: manualRelatedEntityConfig2([]),
            }));
      });
  }),
    onDateInspectorFormSubmit.addEventListener("change", (onPanelFrameInspectorFormSubmit) => {
      const popupSourceElement = (onPanelFrameInspectorFormSubmit.target as Element).closest<HTMLElement>(
          "[data-popup-source], [data-popup-entity], [data-popup-custom]",
        ),
        panelFrameInspectorSubmitEventElement =
          popupSourceElement?.closest<HTMLElement>("[data-action-trigger]");
      if (
        popupSourceElement &&
        panelFrameInspectorSubmitEventElement &&
        deps.selectedComponentId
      ) {
        const actionTrigger3 = panelFrameInspectorSubmitEventElement.dataset.actionTrigger;
        deps.mutateDocument((panelFrameInspectorSubmitEvent: any) => {
          const panelFrameInspectorSubmitEventState = findComponent2(
            panelFrameInspectorSubmitEvent,
            deps.selectedComponentId,
          )?.component;
          if (
            !panelFrameInspectorSubmitEventState ||
            !["tap", "doubleTap", "hold"].includes(actionTrigger3!)
          )
            return;
          const panelFrameInspectorSubmitEventValue =
              panelFrameInspectorSubmitEventElement.querySelector<HTMLSelectElement>("[data-popup-source]")!.value,
            panelFrameInspectorSubmitEventConfig: {
              popupSource: string;
              entityId?: string;
              popupId?: string;
            } = {
              popupSource: panelFrameInspectorSubmitEventValue,
            };
          (panelFrameInspectorSubmitEventValue === "entity" &&
            (panelFrameInspectorSubmitEventConfig.entityId =
              panelFrameInspectorSubmitEventElement.querySelector<HTMLInputElement>("[data-popup-entity]")!.value),
            panelFrameInspectorSubmitEventValue === "custom" &&
              (panelFrameInspectorSubmitEventConfig.popupId =
                panelFrameInspectorSubmitEventElement.querySelector<HTMLSelectElement>("[data-popup-custom]")!.value),
            (panelFrameInspectorSubmitEventState.actions = {
              ...(panelFrameInspectorSubmitEventState.actions || {}),
              [actionTrigger3!]: {
                type: "more-info",
                data: panelFrameInspectorSubmitEventConfig,
              },
            }));
        });
        return;
      }
      const actionTargetElement =
          (onPanelFrameInspectorFormSubmit.target as Element).closest<HTMLSelectElement>("[data-action-target]"),
        onNavigationInspectorFormSubmitElement =
          actionTargetElement?.closest<HTMLElement>("[data-action-trigger]"),
        onNavigationInspectorFormSubmitValue = deps.selectedComponentId;
      if (
        !actionTargetElement ||
        !onNavigationInspectorFormSubmitElement ||
        !onNavigationInspectorFormSubmitValue
      )
        return;
      const actionTrigger4 = onNavigationInspectorFormSubmitElement.dataset.actionTrigger;
      ["tap", "doubleTap", "hold"].includes(actionTrigger4!) &&
        deps.mutateDocument((onNavigationInspectorFormSubmit: any) => {
          const navigationInspectorSubmitEventState = findComponent2(
            onNavigationInspectorFormSubmit,
            onNavigationInspectorFormSubmitValue,
          )?.component;
          !navigationInspectorSubmitEventState ||
            !onNavigationInspectorFormSubmit.pages.some(
              (navigationInspectorSubmitEvent: any) =>
                navigationInspectorSubmitEvent.path === actionTargetElement.value,
            ) ||
            ((navigationInspectorSubmitEventState.actions = {
              ...(navigationInspectorSubmitEventState.actions || {}),
              [actionTrigger4!]: {
                type: "navigate",
                target: actionTargetElement.value,
              },
            }),
            navigationInspectorSubmitEventState.type === "navigation-button" &&
              (navigationInspectorSubmitEventState.properties = {
                ...(navigationInspectorSubmitEventState.properties || {}),
                targetPage: actionTargetElement.value,
              }));
        });
    }),
    onDateInspectorFormSubmit.addEventListener("click", (bindDocumentSection) => {
      const navigationInspectorSubmitEventElement =
          (bindDocumentSection.target as Element).closest<HTMLButtonElement>("[data-popup-preview]"),
        bindDocumentSectionElement =
          navigationInspectorSubmitEventElement?.closest("[data-action-trigger]"),
        entryState = deps.removedComponent();
      if (
        !navigationInspectorSubmitEventElement ||
        !bindDocumentSectionElement ||
        !entryState ||
        navigationInspectorSubmitEventElement.disabled
      )
        return;
      if (deps.editorMode !== "edit") {
        deps.handleOperationError(new Error("请切换到编辑模式后再预览弹窗。"));
        return;
      }
      const entrySectionSelect = bindDocumentSectionElement.querySelector<HTMLSelectElement>("[data-popup-source]")!.value,
        onDocumentClickState: {
          popupSource: string;
          entityId?: string;
          popupId?: string;
        } = {
          popupSource: entrySectionSelect,
        };
      (entrySectionSelect === "entity" &&
        (onDocumentClickState.entityId =
          bindDocumentSectionElement.querySelector<HTMLInputElement>("[data-popup-entity]")!.value),
        entrySectionSelect === "custom" &&
          (onDocumentClickState.popupId =
            bindDocumentSectionElement.querySelector<HTMLSelectElement>("[data-popup-custom]")!.value));
      try {
        deps.ensureEditorRenderer().previewAction(entryState, {
          type: "more-info",
          data: onDocumentClickState,
        });
      } catch (onDocumentClick: any) {
        deps.handleOperationError(onDocumentClick);
      }
    }));
}
