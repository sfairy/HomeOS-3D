import {
  ACTION_TYPES as ACTION_TYPES2,
  actionPopupData as actionPopupData2,
  componentActionIsSupported as componentActionIsSupported2,
} from '../shared/action-rules'
import { clone as clone2, clampNumber as clampNumber2 } from './editor'
import { findComponent as findComponent2 } from './component-tree'
import {
  manualRelatedEntityConfig as manualRelatedEntityConfig2,
  relatedPopupContext as relatedPopupContext2,
} from '../shared/related-entities'
import { domElement } from '@app/shared/util/dom-factory'

// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 日期/时间检视面板提交按钮的批量注册（.component-action-controls）

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface DateInspectorSubmitDeps {
  selectedComponentId: any
  mutateDocument: any
  entities: any
  pageSelectElement: any
  entitiesByEntityId: any
  devicesByDeviceId: any
  removedComponent: any
  editorMode: any
  handleOperationError: any
  ensureEditorRenderer: any
}

export function attachDateInspectorSubmit(deps: DateInspectorSubmitDeps) {
  for (const onDateInspectorFormSubmit of document.querySelectorAll('.component-action-controls'))
    onDateInspectorFormSubmit.addEventListener('click', (dateInspectorSubmitEvent) => {
      const onWeatherInspectorFormSubmitElement = (dateInspectorSubmitEvent.target as Element).closest<HTMLElement>(
        '[data-hidden-content-clickable]',
      )
      if (onWeatherInspectorFormSubmitElement && deps.selectedComponentId) {
        deps.mutateDocument((onWeatherInspectorFormSubmit: any) => {
          const onWeatherInspectorFormSubmitState = findComponent2(
            onWeatherInspectorFormSubmit,
            deps.selectedComponentId,
          )?.component
          !onWeatherInspectorFormSubmitState ||
            !['title-button', 'device-button', 'icon-button-effect'].includes(onWeatherInspectorFormSubmitState.type) ||
            (onWeatherInspectorFormSubmitState.properties = {
              ...(onWeatherInspectorFormSubmitState.properties || {}),
              hiddenContentClickable: onWeatherInspectorFormSubmitElement.dataset.hiddenContentClickable === 'on',
            })
        })
        return
      }
      const onWeatherInspectorFormSubmitElementElement = (
          dateInspectorSubmitEvent.target as Element
        ).closest<HTMLButtonElement>('[data-action-type]'),
        weatherInspectorSubmitEventElement =
          onWeatherInspectorFormSubmitElementElement?.closest<HTMLElement>('[data-action-trigger]'),
        weatherInspectorSubmitEventState = deps.selectedComponentId
      if (
        !onWeatherInspectorFormSubmitElementElement ||
        !weatherInspectorSubmitEventElement ||
        !weatherInspectorSubmitEventState ||
        onWeatherInspectorFormSubmitElementElement.disabled
      )
        return
      const actionType = ACTION_TYPES2.includes(onWeatherInspectorFormSubmitElementElement.dataset.actionType!)
          ? onWeatherInspectorFormSubmitElementElement.dataset.actionType
          : 'none',
        actionTrigger2 = weatherInspectorSubmitEventElement.dataset.actionTrigger
      ;['tap', 'doubleTap', 'hold'].includes(actionTrigger2!) &&
        deps.mutateDocument((weatherInspectorSubmitEvent: any) => {
          const weatherInspectorSubmitEventValue = findComponent2(
            weatherInspectorSubmitEvent,
            weatherInspectorSubmitEventState,
          )?.component
          if (!weatherInspectorSubmitEventValue) return
          const weatherInspectorSubmitEventConfig = weatherInspectorSubmitEventValue.bindings?.entity?.entityId,
            isWeatherInspectorSubmitEvent = weatherInspectorSubmitEventValue.type === 'light-statistics',
            weatherInspectorSubmitEventRef = actionPopupData2(
              weatherInspectorSubmitEventValue.actions?.[actionTrigger2!],
            ),
            weatherInspectorSubmitEventEntry =
              actionType === 'more-info' &&
              !weatherInspectorSubmitEventConfig &&
              weatherInspectorSubmitEventRef.source === 'current'
                ? (weatherInspectorSubmitEvent.customPopups || []).length
                  ? 'custom'
                  : 'entity'
                : weatherInspectorSubmitEventRef.source,
            onLineChartInspectorFormSubmitState =
              actionType === 'more-info'
                ? {
                    popupSource: weatherInspectorSubmitEventEntry,
                    ...(weatherInspectorSubmitEventEntry === 'entity'
                      ? {
                          entityId: weatherInspectorSubmitEventRef.entityId || deps.entities[0]?.entityId || '',
                        }
                      : {}),
                    ...(weatherInspectorSubmitEventEntry === 'custom'
                      ? {
                          popupId:
                            weatherInspectorSubmitEventRef.popupId ||
                            weatherInspectorSubmitEvent.customPopups?.[0]?.id ||
                            '',
                        }
                      : {}),
                  }
                : {},
            isOnLineChartInspectorFormSubmit =
              weatherInspectorSubmitEventValue.actions?.[actionTrigger2!]?.type === 'more-info',
            onLineChartInspectorFormSubmitValue = weatherInspectorSubmitEventValue.actions?.[actionTrigger2!]?.target,
            onLineChartInspectorFormSubmitConfig =
              weatherInspectorSubmitEventValue.type === 'navigation-button'
                ? weatherInspectorSubmitEventValue.properties?.targetPage
                : '',
            mappedItemsSet = new Set(
              weatherInspectorSubmitEvent.pages.map(
                (onLineChartInspectorFormSubmit: any) => onLineChartInspectorFormSubmit.path,
              ),
            ),
            onLineChartInspectorFormSubmitRef = mappedItemsSet.has(onLineChartInspectorFormSubmitValue)
              ? onLineChartInspectorFormSubmitValue
              : mappedItemsSet.has(onLineChartInspectorFormSubmitConfig)
                ? onLineChartInspectorFormSubmitConfig
                : deps.pageSelectElement.value || weatherInspectorSubmitEvent.pages[0]?.path,
            lineChartInspectorSubmitEventState =
              actionType === 'none' ||
              componentActionIsSupported2(
                weatherInspectorSubmitEventValue,
                actionType === 'navigate'
                  ? {
                      type: 'navigate',
                      target: onLineChartInspectorFormSubmitRef,
                    }
                  : actionType === 'more-info'
                    ? {
                        type: 'more-info',
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
                : 'none'
          ;(weatherInspectorSubmitEventValue.actions = {
            ...(weatherInspectorSubmitEventValue.actions || {}),
          }),
            lineChartInspectorSubmitEventState === 'none'
              ? weatherInspectorSubmitEventValue.type === 'camera' && actionTrigger2 === 'tap'
                ? (weatherInspectorSubmitEventValue.actions[actionTrigger2] = {
                    type: 'none',
                  })
                : delete weatherInspectorSubmitEventValue.actions[actionTrigger2!]
              : lineChartInspectorSubmitEventState === 'navigate'
                ? (weatherInspectorSubmitEventValue.actions[actionTrigger2!] = {
                    type: 'navigate',
                    target: onLineChartInspectorFormSubmitRef,
                  })
                : lineChartInspectorSubmitEventState === 'more-info'
                  ? (weatherInspectorSubmitEventValue.actions[actionTrigger2!] = {
                      type: 'more-info',
                      data:
                        weatherInspectorSubmitEventValue.actions?.[actionTrigger2!]?.type === 'more-info'
                          ? {
                              ...clone2(weatherInspectorSubmitEventValue.actions[actionTrigger2!].data || {}),
                              ...onLineChartInspectorFormSubmitState,
                            }
                          : onLineChartInspectorFormSubmitState,
                    })
                  : (weatherInspectorSubmitEventValue.actions[actionTrigger2!] = {
                      type: lineChartInspectorSubmitEventState,
                    }),
            !isWeatherInspectorSubmitEvent &&
              lineChartInspectorSubmitEventState === 'more-info' &&
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
              })
        })
    }),
      onDateInspectorFormSubmit.addEventListener('change', (onPanelFrameInspectorFormSubmit) => {
        const popupSourceElement = (onPanelFrameInspectorFormSubmit.target as Element).closest<HTMLElement>(
            '[data-popup-source], [data-popup-entity], [data-popup-custom]',
          ),
          panelFrameInspectorSubmitEventElement = popupSourceElement?.closest<HTMLElement>('[data-action-trigger]')
        if (popupSourceElement && panelFrameInspectorSubmitEventElement && deps.selectedComponentId) {
          const actionTrigger3 = panelFrameInspectorSubmitEventElement.dataset.actionTrigger
          deps.mutateDocument((panelFrameInspectorSubmitEvent: any) => {
            const panelFrameInspectorSubmitEventState = findComponent2(
              panelFrameInspectorSubmitEvent,
              deps.selectedComponentId,
            )?.component
            if (!panelFrameInspectorSubmitEventState || !['tap', 'doubleTap', 'hold'].includes(actionTrigger3!)) return
            const panelFrameInspectorSubmitEventValue =
                panelFrameInspectorSubmitEventElement.querySelector<HTMLSelectElement>('[data-popup-source]')!.value,
              panelFrameInspectorSubmitEventConfig: {
                popupSource: string
                entityId?: string
                popupId?: string
              } = {
                popupSource: panelFrameInspectorSubmitEventValue,
              }
            panelFrameInspectorSubmitEventValue === 'entity' &&
              (panelFrameInspectorSubmitEventConfig.entityId =
                panelFrameInspectorSubmitEventElement.querySelector<HTMLInputElement>('[data-popup-entity]')!.value),
              panelFrameInspectorSubmitEventValue === 'custom' &&
                (panelFrameInspectorSubmitEventConfig.popupId =
                  panelFrameInspectorSubmitEventElement.querySelector<HTMLSelectElement>('[data-popup-custom]')!.value),
              (panelFrameInspectorSubmitEventState.actions = {
                ...(panelFrameInspectorSubmitEventState.actions || {}),
                [actionTrigger3!]: {
                  type: 'more-info',
                  data: panelFrameInspectorSubmitEventConfig,
                },
              })
          })
          return
        }
        const actionTargetElement = (onPanelFrameInspectorFormSubmit.target as Element).closest<HTMLSelectElement>(
            '[data-action-target]',
          ),
          onNavigationInspectorFormSubmitElement = actionTargetElement?.closest<HTMLElement>('[data-action-trigger]'),
          onNavigationInspectorFormSubmitValue = deps.selectedComponentId
        if (!actionTargetElement || !onNavigationInspectorFormSubmitElement || !onNavigationInspectorFormSubmitValue)
          return
        const actionTrigger4 = onNavigationInspectorFormSubmitElement.dataset.actionTrigger
        ;['tap', 'doubleTap', 'hold'].includes(actionTrigger4!) &&
          deps.mutateDocument((onNavigationInspectorFormSubmit: any) => {
            const navigationInspectorSubmitEventState = findComponent2(
              onNavigationInspectorFormSubmit,
              onNavigationInspectorFormSubmitValue,
            )?.component
            !navigationInspectorSubmitEventState ||
              !onNavigationInspectorFormSubmit.pages.some(
                (navigationInspectorSubmitEvent: any) =>
                  navigationInspectorSubmitEvent.path === actionTargetElement.value,
              ) ||
              ((navigationInspectorSubmitEventState.actions = {
                ...(navigationInspectorSubmitEventState.actions || {}),
                [actionTrigger4!]: {
                  type: 'navigate',
                  target: actionTargetElement.value,
                },
              }),
              navigationInspectorSubmitEventState.type === 'navigation-button' &&
                (navigationInspectorSubmitEventState.properties = {
                  ...(navigationInspectorSubmitEventState.properties || {}),
                  targetPage: actionTargetElement.value,
                }))
          })
      }),
      onDateInspectorFormSubmit.addEventListener('click', (bindDocumentSection) => {
        const navigationInspectorSubmitEventElement = (
            bindDocumentSection.target as Element
          ).closest<HTMLButtonElement>('[data-popup-preview]'),
          bindDocumentSectionElement = navigationInspectorSubmitEventElement?.closest('[data-action-trigger]'),
          entryState = deps.removedComponent()
        if (
          !navigationInspectorSubmitEventElement ||
          !bindDocumentSectionElement ||
          !entryState ||
          navigationInspectorSubmitEventElement.disabled
        )
          return
        if (deps.editorMode !== 'edit') {
          deps.handleOperationError(new Error('请切换到编辑模式后再预览弹窗。'))
          return
        }
        const entrySectionSelect =
            bindDocumentSectionElement.querySelector<HTMLSelectElement>('[data-popup-source]')!.value,
          onDocumentClickState: {
            popupSource: string
            entityId?: string
            popupId?: string
          } = {
            popupSource: entrySectionSelect,
          }
        entrySectionSelect === 'entity' &&
          (onDocumentClickState.entityId =
            bindDocumentSectionElement.querySelector<HTMLInputElement>('[data-popup-entity]')!.value),
          entrySectionSelect === 'custom' &&
            (onDocumentClickState.popupId =
              bindDocumentSectionElement.querySelector<HTMLSelectElement>('[data-popup-custom]')!.value)
        try {
          deps.ensureEditorRenderer().previewAction(entryState, {
            type: 'more-info',
            data: onDocumentClickState,
          })
        } catch (onDocumentClick: any) {
          deps.handleOperationError(onDocumentClick)
        }
      })
}

// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// document 级点击兜底：点空白处关闭实体选择弹层与检视面板

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface DocumentEntityPickerDismissDeps {
  closePopupEntityMenus: any
  renderPopupEntityOptions: any
  positionPopupEntityMenu: any
  syncPopupEntityButton: any
  iconButtonPreviewDetailsElement: any
  removedComponent: any
  ensureEditorRenderer: any
  handleOperationError: any
  airConditionerPreviewDetailsElement: any
  imageLayoutOptionsElement: any
  selectedComponentId: any
  mutateDocument: any
  imageInspectorElement: any
  activeProject: any
  imageOpacityInputElement: any
  editorRenderer: any
  imageLeftInputElement: any
  imageTopInputElement: any
  imageScaleInputElement: any
  imageRotationInputElement: any
  imageLabelElement: any
  coverMotorButtonElement: any
  setComponentsRotation: any
}

export function attachDocumentEntityPickerDismiss(deps: DocumentEntityPickerDismissDeps) {
  document.addEventListener('click', (documentClickEvent) => {
    const entityPickerButton = (documentClickEvent.target as Element).closest('[data-popup-entity-button]')
    if (entityPickerButton) {
      const entityTriggerHost = entityPickerButton.closest('[data-action-trigger]'),
        entityMenuWasHiddenElement = entityTriggerHost?.querySelector<HTMLElement>('[data-popup-entity-menu]')
      if (!entityTriggerHost || !entityMenuWasHiddenElement) return
      const hidden4 = entityMenuWasHiddenElement.hidden
      if (
        (deps.closePopupEntityMenus(hidden4 ? entityTriggerHost : null),
        (entityMenuWasHiddenElement.hidden = !hidden4),
        entityPickerButton.setAttribute('aria-expanded', String(hidden4)),
        hidden4)
      ) {
        const entitySearchInput = entityTriggerHost.querySelector<HTMLInputElement>('[data-popup-entity-search]')
        ;(entitySearchInput!.value = ''),
          deps.renderPopupEntityOptions(entityTriggerHost, ''),
          deps.positionPopupEntityMenu(entityTriggerHost),
          window.requestAnimationFrame(() =>
            entitySearchInput!.focus({
              preventScroll: true,
            }),
          )
      }
      return
    }
    const popupActionEntityOptionElement = (documentClickEvent.target as Element).closest<HTMLElement>(
      '[data-popup-action-entity-id]',
    )
    if (!popupActionEntityOptionElement) return
    const entityActionTriggerHost = popupActionEntityOptionElement.closest('[data-action-trigger]'),
      popupEntityIdInput = entityActionTriggerHost?.querySelector<HTMLInputElement>('[data-popup-entity]')
    !entityActionTriggerHost ||
      !popupEntityIdInput ||
      ((popupEntityIdInput.value = popupActionEntityOptionElement.dataset.popupActionEntityId!),
      deps.syncPopupEntityButton(entityActionTriggerHost),
      deps.closePopupEntityMenus(),
      popupEntityIdInput.dispatchEvent(
        new Event('change', {
          bubbles: true,
        }),
      ))
  }),
    document.addEventListener('input', (documentInputEvent) => {
      const entitySearchField = (documentInputEvent.target as Element).closest<HTMLInputElement>(
          '[data-popup-entity-search]',
        ),
        searchTriggerHost = entitySearchField?.closest('[data-action-trigger]')
      !entitySearchField ||
        !searchTriggerHost ||
        (deps.renderPopupEntityOptions(searchTriggerHost, entitySearchField.value),
        deps.positionPopupEntityMenu(searchTriggerHost))
    }),
    deps.iconButtonPreviewDetailsElement.addEventListener('click', () => {
      const previewIconComponent = deps.removedComponent(),
        previewIconEntityId = previewIconComponent?.bindings?.entity?.entityId || ''
      if (!(previewIconComponent?.type !== 'icon-button' || !previewIconEntityId))
        try {
          deps.ensureEditorRenderer().showEntityDetails(previewIconComponent, {
            preview: true,
          })
        } catch (onAirConditionerPreviewDetailsButtonClick: any) {
          deps.handleOperationError(onAirConditionerPreviewDetailsButtonClick)
        }
    }),
    deps.airConditionerPreviewDetailsElement.addEventListener('click', () => {
      const previewAirConditioner = deps.removedComponent(),
        previewAcEntityId = previewAirConditioner?.bindings?.entity?.entityId || ''
      if (!(previewAirConditioner?.type !== 'air-conditioner' || !previewAcEntityId))
        try {
          deps.ensureEditorRenderer().showEntityDetails(previewAirConditioner, {
            preview: true,
          })
        } catch (onImageLayoutOptionsClick: any) {
          deps.handleOperationError(onImageLayoutOptionsClick)
        }
    }),
    deps.imageLayoutOptionsElement.addEventListener('click', (imageLayoutClickEvent: any) => {
      const imageLayoutOptionElementElement = imageLayoutClickEvent.target.closest('[data-image-layout]'),
        layoutComponentId = deps.selectedComponentId
      if (!imageLayoutOptionElementElement || !layoutComponentId) return
      const requestedLayout = imageLayoutOptionElementElement.dataset.imageLayout === 'fill' ? 'fill' : 'free',
        layoutComponent = deps.removedComponent(),
        currentLayout = layoutComponent?.properties?.layoutMode === 'fill' ? 'fill' : 'free'
      !layoutComponent ||
        layoutComponent.type !== 'image' ||
        currentLayout === requestedLayout ||
        deps.mutateDocument((layoutDraftDocument: any) => {
          const savedFreeLayout = findComponent2(layoutDraftDocument, layoutComponentId)?.component
          if (!savedFreeLayout || savedFreeLayout.type !== 'image') return
          if (
            ((savedFreeLayout.properties = {
              ...(savedFreeLayout.properties || {}),
              fit: 'contain',
            }),
            (savedFreeLayout.style = {
              ...(savedFreeLayout.style || {}),
            }),
            requestedLayout === 'fill')
          ) {
            ;(savedFreeLayout.properties.freeLayout = {
              position: clone2(savedFreeLayout.position || {}),
              scale: clampNumber2(Number(savedFreeLayout.style.scale || 1), 0.01, 5),
            }),
              (savedFreeLayout.properties.layoutMode = 'fill'),
              (savedFreeLayout.position = {
                ...(savedFreeLayout.position || {}),
                x: 0,
                y: 0,
                width: Number(layoutDraftDocument.canvas?.width || 2778),
                height: Number(layoutDraftDocument.canvas?.height || 1940),
                rotation: 0,
              }),
              (savedFreeLayout.style.scale = 1)
            return
          }
          const freeLayout2 = savedFreeLayout.properties.freeLayout
          if (((savedFreeLayout.properties.layoutMode = 'free'), freeLayout2?.position))
            (savedFreeLayout.position = clone2(freeLayout2.position)),
              (savedFreeLayout.style.scale = clampNumber2(Number(freeLayout2.scale || 1), 0.01, 5))
          else {
            const naturalImageWidth = Number(
                savedFreeLayout.properties.naturalWidth || savedFreeLayout.position?.width || 100,
              ),
              naturalImageHeight = Number(
                savedFreeLayout.properties.naturalHeight || savedFreeLayout.position?.height || 100,
              ),
              imageCanvasWidth = Number(layoutDraftDocument.canvas?.width || 2778),
              imageCanvasHeight = Number(layoutDraftDocument.canvas?.height || 1940)
            ;(savedFreeLayout.position = {
              ...(savedFreeLayout.position || {}),
              x: (imageCanvasWidth - naturalImageWidth) / 2,
              y: (imageCanvasHeight - naturalImageHeight) / 2,
              width: naturalImageWidth,
              height: naturalImageHeight,
              rotation: 0,
            }),
              (savedFreeLayout.style.scale = 1)
          }
          delete savedFreeLayout.properties.freeLayout
        })
    }),
    deps.imageInspectorElement.addEventListener('input', (imageInspectorInputEvent: any) => {
      const inspectedImage = deps.removedComponent()
      if (!inspectedImage || inspectedImage.type !== 'image') return
      const editedFieldInput = imageInspectorInputEvent.target
      if (String(editedFieldInput.value).trim() === '') return
      const fieldNumberValue = Number(editedFieldInput.value)
      if (!Number.isFinite(fieldNumberValue)) return
      const canvasPixelWidth = Number(deps.activeProject.document.canvas.width || 2778),
        canvasPixelHeight = Number(deps.activeProject.document.canvas.height || 1940),
        imagePositionWidth = Number(inspectedImage.position?.width || 100),
        imagePositionHeight = Number(inspectedImage.position?.height || 100)
      if (editedFieldInput === deps.imageOpacityInputElement) {
        const clampedOpacity = clampNumber2(fieldNumberValue, 0, 100)
        deps.editorRenderer?.previewComponentProperties(inspectedImage.id, {
          opacity: clampedOpacity / 100,
        })
      } else {
        if (editedFieldInput === deps.imageLeftInputElement) {
          const leftPercent = clampNumber2(fieldNumberValue, 0, 100)
          deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
            x: (canvasPixelWidth * leftPercent) / 100 - imagePositionWidth / 2,
          })
        } else {
          if (editedFieldInput === deps.imageTopInputElement) {
            const topPercent = clampNumber2(fieldNumberValue, 0, 100)
            deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
              y: (canvasPixelHeight * topPercent) / 100 - imagePositionHeight / 2,
            })
          } else {
            if (editedFieldInput === deps.imageScaleInputElement) {
              const scalePercent = clampNumber2(fieldNumberValue, 1, 500)
              deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
                scale: scalePercent / 100,
              })
            } else {
              if (editedFieldInput === deps.imageRotationInputElement) {
                const rotationDeg = clampNumber2(fieldNumberValue, -360, 360)
                deps.editorRenderer?.previewComponentTransform(inspectedImage.id, {
                  rotation: rotationDeg,
                })
              }
            }
          }
        }
      }
    }),
    deps.imageInspectorElement.addEventListener('change', (imageInspectorChangeEvent: any) => {
      const changedInputElement = imageInspectorChangeEvent.target,
        imageComponentId = deps.selectedComponentId
      if (
        !(
          !imageComponentId ||
          ![
            deps.imageLabelElement,
            deps.imageOpacityInputElement,
            deps.imageLeftInputElement,
            deps.imageTopInputElement,
            deps.imageScaleInputElement,
            deps.imageRotationInputElement,
          ].includes(changedInputElement)
        )
      ) {
        if (
          [
            deps.imageOpacityInputElement,
            deps.imageLeftInputElement,
            deps.imageTopInputElement,
            deps.imageScaleInputElement,
            deps.imageRotationInputElement,
          ].includes(changedInputElement) &&
          (String(changedInputElement.value).trim() === '' || !Number.isFinite(Number(changedInputElement.value)))
        ) {
          deps.coverMotorButtonElement()
          return
        }
        deps.mutateDocument((imageChangeDraftDocument: any) => {
          const imageComponentInDraft = findComponent2(imageChangeDraftDocument, imageComponentId)?.component
          if (!imageComponentInDraft || imageComponentInDraft.type !== 'image') return
          ;(imageComponentInDraft.properties = {
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
            (imageComponentInDraft.properties.fit = 'contain')
          const canvasWidthForImage = Number(imageChangeDraftDocument.canvas.width || 2778),
            canvasHeightForImage = Number(imageChangeDraftDocument.canvas.height || 1940),
            imageInputNumber = Number(changedInputElement.value)
          changedInputElement === deps.imageLabelElement
            ? (imageComponentInDraft.properties.label = changedInputElement.value.trim())
            : changedInputElement === deps.imageOpacityInputElement
              ? (imageComponentInDraft.properties.opacity = clampNumber2(imageInputNumber, 0, 100) / 100)
              : changedInputElement === deps.imageLeftInputElement
                ? (imageComponentInDraft.position.x =
                    (canvasWidthForImage * clampNumber2(imageInputNumber, 0, 100)) / 100 -
                    Number(imageComponentInDraft.position.width || 100) / 2)
                : changedInputElement === deps.imageTopInputElement
                  ? (imageComponentInDraft.position.y =
                      (canvasHeightForImage * clampNumber2(imageInputNumber, 0, 100)) / 100 -
                      Number(imageComponentInDraft.position.height || 100) / 2)
                  : changedInputElement === deps.imageScaleInputElement
                    ? (imageComponentInDraft.style.scale = clampNumber2(imageInputNumber, 1, 500) / 100)
                    : changedInputElement === deps.imageRotationInputElement &&
                      deps.setComponentsRotation(
                        imageChangeDraftDocument,
                        imageComponentId,
                        clampNumber2(imageInputNumber, -360, 360),
                      )
        })
      }
    })
}

// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 平面图检视面板的 input 监听（相机/图层字段写回）

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface FloorplanDiagramInspectorInputDeps {
  floorplanAutoDiagramInspectorFormElement: any
  removedComponent: any
  floorplanDiagramInputSet: any
  activeProject: any
  floorplanAutoDiagramLeftInputElement: any
  editorRenderer: any
  floorplanAutoDiagramTopInputElement: any
  floorplanAutoDiagramWidthInputElement: any
  floorplanAutoDiagramHeightInputElement: any
  floorplanAutoDiagramScaleInputElement: any
  floorplanAutoDiagramRotationInputElement: any
  selectedComponentId: any
  floorplanAutoDiagramLabelTextInputElement: any
  floorplanAutoDiagramFolderTextInputElement: any
  coverMotorButtonElement: any
  mutateDocument: any
  setComponentsRotation: any
  floorplanAutoDiagramLayoutElement: any
}

export function attachFloorplanDiagramInspectorInput(deps: FloorplanDiagramInspectorInputDeps) {
  deps.floorplanAutoDiagramInspectorFormElement.addEventListener('input', (floorplanInputEvent: any) => {
    const inspectedDiagram = deps.removedComponent(),
      diagramFieldInput = floorplanInputEvent.target
    if (
      !inspectedDiagram ||
      inspectedDiagram.type !== 'floorplan-auto-diagram' ||
      !deps.floorplanDiagramInputSet.has(diagramFieldInput)
    )
      return
    const diagramNumberValue = Number(diagramFieldInput.value)
    if (!Number.isFinite(diagramNumberValue)) return
    const diagramCanvasWidth = Number(deps.activeProject.document.canvas.width || 2778),
      diagramCanvasHeight = Number(deps.activeProject.document.canvas.height || 1940),
      diagramPositionWidth = Number(inspectedDiagram.position?.width || 100),
      diagramPositionHeight = Number(inspectedDiagram.position?.height || 100)
    diagramFieldInput === deps.floorplanAutoDiagramLeftInputElement
      ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
          x: (diagramCanvasWidth * clampNumber2(diagramNumberValue, 0, 100)) / 100 - diagramPositionWidth / 2,
        })
      : diagramFieldInput === deps.floorplanAutoDiagramTopInputElement
        ? deps.editorRenderer?.previewComponentTransform(inspectedDiagram.id, {
            y: (diagramCanvasHeight * clampNumber2(diagramNumberValue, 0, 100)) / 100 - diagramPositionHeight / 2,
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
                })
  }),
    deps.floorplanAutoDiagramInspectorFormElement.addEventListener('change', (floorplanChangeEvent: any) => {
      const changedDiagramInput = floorplanChangeEvent.target,
        diagramComponentId = deps.selectedComponentId
      if (
        !(
          !diagramComponentId ||
          ![
            deps.floorplanAutoDiagramLabelTextInputElement,
            deps.floorplanAutoDiagramFolderTextInputElement,
            ...deps.floorplanDiagramInputSet,
          ].includes(changedDiagramInput)
        )
      ) {
        if (
          deps.floorplanDiagramInputSet.has(changedDiagramInput) &&
          !Number.isFinite(Number(changedDiagramInput.value))
        ) {
          deps.coverMotorButtonElement()
          return
        }
        deps.mutateDocument((diagramDraftDocument: any) => {
          const diagramComponent = findComponent2(diagramDraftDocument, diagramComponentId)?.component
          if (!(!diagramComponent || diagramComponent.type !== 'floorplan-auto-diagram')) {
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
              diagramComponent.properties.label = changedDiagramInput.value.trim()
            else {
              if (changedDiagramInput === deps.floorplanAutoDiagramFolderTextInputElement)
                diagramComponent.properties.exportFolder = changedDiagramInput.value.trim()
              else {
                const diagramDocumentWidth = Number(diagramDraftDocument.canvas.width || 2778),
                  diagramDocumentHeight = Number(diagramDraftDocument.canvas.height || 1940),
                  diagramFieldValue = Number(changedDiagramInput.value)
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
                          ? (diagramComponent.style.scale = clampNumber2(diagramFieldValue, 1, 500) / 100)
                          : changedDiagramInput === deps.floorplanAutoDiagramRotationInputElement &&
                            deps.setComponentsRotation(
                              diagramDraftDocument,
                              diagramComponentId,
                              clampNumber2(diagramFieldValue, -360, 360),
                            )
              }
            }
          }
        })
      }
    }),
    deps.floorplanAutoDiagramLayoutElement.addEventListener('click', (floorplanLayoutClickEvent: any) => {
      const floorplanLayoutOptionElement = floorplanLayoutClickEvent.target.closest('[data-floorplan-layout]'),
        floorplanComponentId = deps.selectedComponentId
      !floorplanLayoutOptionElement ||
        !floorplanComponentId ||
        deps.mutateDocument((floorplanLayoutDraftDocument: any) => {
          const floorplanComponent = findComponent2(floorplanLayoutDraftDocument, floorplanComponentId)?.component
          floorplanComponent?.type === 'floorplan-auto-diagram' &&
            (floorplanComponent.properties = {
              ...(floorplanComponent.properties || {}),
              layoutMode: floorplanLayoutOptionElement.dataset.floorplanLayout === 'fill' ? 'fill' : 'free',
            })
        })
    })
}

// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 折线图检视面板的 input 监听（写回折线图的系列/坐标轴字段）

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface LineChartInspectorInputDeps {
  lineChartInspectorElement: any
  removedComponent: any
  lineChartColorPropertiesByElement: any
  lineChartPropertyConfigsByElement: any
  editorRenderer: any
  lineChartThresholdInputs: any
  lineChartTransformInputSet: any
  activeProject: any
  lineChartLeftInputElement: any
  lineChartTopInputElement: any
  lineChartWidthInputElement: any
  lineChartHeightInputElement: any
  lineChartScaleInputElement: any
  lineChartRotationInputElement: any
  selectedComponentId: any
  coverMotorButtonElement: any
  mutateDocument: any
  lineChartThresholdModeSelectElement: any
  setComponentsRotation: any
  lineChartValueVisibleElement: any
}

export function attachLineChartInspectorInput(deps: LineChartInspectorInputDeps) {
  deps.lineChartInspectorElement.addEventListener('input', (lineChartInputEvent: any) => {
    const lineChartInputComponent = deps.removedComponent()
    if (!lineChartInputComponent || lineChartInputComponent.type !== 'line-chart') return
    const lineChartInputElement = lineChartInputEvent.target,
      lineChartInputColorProperty = deps.lineChartColorPropertiesByElement.get(lineChartInputElement),
      lineChartInputPropertyConfig = deps.lineChartPropertyConfigsByElement.get(lineChartInputElement)
    if (lineChartInputColorProperty) {
      deps.editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
        [lineChartInputColorProperty]: lineChartInputElement.value,
      })
      return
    }
    if (lineChartInputPropertyConfig) {
      if (String(lineChartInputElement.value).trim() === '' || !Number.isFinite(Number(lineChartInputElement.value)))
        return
      const lineChartInputPropertyValue = clampNumber2(
        Number(lineChartInputElement.value),
        lineChartInputPropertyConfig.minimum,
        lineChartInputPropertyConfig.maximum,
      )
      ;['updateInterval', 'hours'].includes(lineChartInputPropertyConfig.property) ||
        deps.editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
          [lineChartInputPropertyConfig.property]: lineChartInputPropertyValue / lineChartInputPropertyConfig.divisor,
        })
      return
    }
    if (
      deps.lineChartThresholdInputs.findIndex(
        (lineChartThresholdProbeItem: any) =>
          lineChartThresholdProbeItem.value === lineChartInputElement ||
          lineChartThresholdProbeItem.color === lineChartInputElement,
      ) >= 0
    ) {
      const lineChartThresholdValues = deps.lineChartThresholdInputs.map((lineChartThresholdSourceItem: any) => ({
        value: Number(lineChartThresholdSourceItem.value.value),
        color: lineChartThresholdSourceItem.color.value,
      }))
      lineChartThresholdValues.every((lineChartThresholdValueItem: any) =>
        Number.isFinite(lineChartThresholdValueItem.value),
      ) &&
        deps.editorRenderer?.previewComponentProperties(lineChartInputComponent.id, {
          thresholdMode: 'manual',
          thresholds: lineChartThresholdValues,
        })
      return
    }
    if (
      !deps.lineChartTransformInputSet.has(lineChartInputElement) ||
      String(lineChartInputElement.value).trim() === '' ||
      !Number.isFinite(Number(lineChartInputElement.value))
    )
      return
    const lineChartTransformInputNumber = Number(lineChartInputElement.value),
      lineChartTransformCanvasWidth = Number(deps.activeProject.document.canvas.width || 2778),
      lineChartTransformCanvasHeight = Number(deps.activeProject.document.canvas.height || 1940),
      lineChartTransformComponentWidth = Number(lineChartInputComponent.position?.width || 100),
      lineChartTransformComponentHeight = Number(lineChartInputComponent.position?.height || 100),
      lineChartTransformCenterX =
        Number(lineChartInputComponent.position?.x || 0) + lineChartTransformComponentWidth / 2,
      lineChartTransformCenterY =
        Number(lineChartInputComponent.position?.y || 0) + lineChartTransformComponentHeight / 2
    if (lineChartInputElement === deps.lineChartLeftInputElement)
      deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
        x:
          (lineChartTransformCanvasWidth * clampNumber2(lineChartTransformInputNumber, 0, 100)) / 100 -
          lineChartTransformComponentWidth / 2,
      })
    else {
      if (lineChartInputElement === deps.lineChartTopInputElement)
        deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
          y:
            (lineChartTransformCanvasHeight * clampNumber2(lineChartTransformInputNumber, 0, 100)) / 100 -
            lineChartTransformComponentHeight / 2,
        })
      else {
        if (lineChartInputElement === deps.lineChartWidthInputElement) {
          const lineChartTransformWidthPx =
            (lineChartTransformCanvasWidth * clampNumber2(lineChartTransformInputNumber, 0.1, 100)) / 100
          deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
            x: lineChartTransformCenterX - lineChartTransformWidthPx / 2,
            width: lineChartTransformWidthPx,
          })
        } else {
          if (lineChartInputElement === deps.lineChartHeightInputElement) {
            const lineChartTransformHeightPx =
              (lineChartTransformCanvasHeight * clampNumber2(lineChartTransformInputNumber, 0.1, 100)) / 100
            deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
              y: lineChartTransformCenterY - lineChartTransformHeightPx / 2,
              height: lineChartTransformHeightPx,
            })
          } else
            lineChartInputElement === deps.lineChartScaleInputElement
              ? deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
                  scale: clampNumber2(lineChartTransformInputNumber, 1, 500) / 100,
                })
              : lineChartInputElement === deps.lineChartRotationInputElement &&
                deps.editorRenderer?.previewComponentTransform(lineChartInputComponent.id, {
                  rotation: clampNumber2(lineChartTransformInputNumber, -360, 360),
                })
        }
      }
    }
  }),
    deps.lineChartInspectorElement.addEventListener('change', (lineChartChangeEvent: any) => {
      const lineChartChangeInputElement = lineChartChangeEvent.target,
        lineChartChangeComponentId = deps.selectedComponentId
      if (!lineChartChangeComponentId) return
      const lineChartChangeColorProperty = deps.lineChartColorPropertiesByElement.get(lineChartChangeInputElement),
        lineChartChangePropertyConfig = deps.lineChartPropertyConfigsByElement.get(lineChartChangeInputElement),
        lineChartChangeThresholdIndex = deps.lineChartThresholdInputs.findIndex(
          (lineChartThresholdProbeEntry: any) =>
            lineChartThresholdProbeEntry.value === lineChartChangeInputElement ||
            lineChartThresholdProbeEntry.color === lineChartChangeInputElement,
        )
      if (
        !(
          !lineChartChangeColorProperty &&
          !lineChartChangePropertyConfig &&
          lineChartChangeThresholdIndex < 0 &&
          !deps.lineChartTransformInputSet.has(lineChartChangeInputElement)
        )
      ) {
        if (
          (lineChartChangePropertyConfig ||
            deps.lineChartTransformInputSet.has(lineChartChangeInputElement) ||
            (lineChartChangeThresholdIndex >= 0 && lineChartChangeInputElement.type === 'number')) &&
          (String(lineChartChangeInputElement.value).trim() === '' ||
            !Number.isFinite(Number(lineChartChangeInputElement.value)))
        ) {
          deps.coverMotorButtonElement()
          return
        }
        deps.mutateDocument((lineChartChangeDraftDocument: any) => {
          const lineChartChangeComponent = findComponent2(
            lineChartChangeDraftDocument,
            lineChartChangeComponentId,
          )?.component
          if (!lineChartChangeComponent || lineChartChangeComponent.type !== 'line-chart') return
          ;(lineChartChangeComponent.properties = {
            ...(lineChartChangeComponent.properties || {}),
          }),
            (lineChartChangeComponent.position = {
              ...(lineChartChangeComponent.position || {}),
            }),
            (lineChartChangeComponent.style = {
              ...(lineChartChangeComponent.style || {}),
            })
          const lineChartChangeCanvasWidth = Number(lineChartChangeDraftDocument.canvas.width || 2778),
            lineChartChangeCanvasHeight = Number(lineChartChangeDraftDocument.canvas.height || 1940),
            lineChartChangeComponentWidth = Number(lineChartChangeComponent.position.width || 100),
            lineChartChangeComponentHeight = Number(lineChartChangeComponent.position.height || 100),
            lineChartChangeCenterX =
              Number(lineChartChangeComponent.position.x || 0) + lineChartChangeComponentWidth / 2,
            lineChartChangeCenterY =
              Number(lineChartChangeComponent.position.y || 0) + lineChartChangeComponentHeight / 2,
            lineChartChangeInputNumber = Number(lineChartChangeInputElement.value)
          lineChartChangeColorProperty
            ? ((lineChartChangeComponent.properties[lineChartChangeColorProperty] = lineChartChangeInputElement.value),
              lineChartChangeInputElement === deps.lineChartThresholdModeSelectElement &&
                lineChartChangeInputElement.value === 'manual' &&
                !(
                  Array.isArray(lineChartChangeComponent.properties.thresholds) &&
                  lineChartChangeComponent.properties.thresholds.some((lineChartThresholdSourceEntry: any) =>
                    Number.isFinite(Number(lineChartThresholdSourceEntry?.value)),
                  )
                ) &&
                (lineChartChangeComponent.properties.thresholds = deps.lineChartThresholdInputs.map(
                  (lineChartThresholdSourceRecord: any) => ({
                    value: Number(lineChartThresholdSourceRecord.value.value),
                    color: lineChartThresholdSourceRecord.color.value,
                  }),
                )))
            : lineChartChangePropertyConfig
              ? (lineChartChangeComponent.properties[lineChartChangePropertyConfig.property] =
                  clampNumber2(
                    lineChartChangeInputNumber,
                    lineChartChangePropertyConfig.minimum,
                    lineChartChangePropertyConfig.maximum,
                  ) / lineChartChangePropertyConfig.divisor)
              : lineChartChangeThresholdIndex >= 0
                ? ((lineChartChangeComponent.properties.thresholdMode = 'manual'),
                  (lineChartChangeComponent.properties.thresholds = deps.lineChartThresholdInputs.map(
                    (onLineChartValueVisibleClick: any) => ({
                      value: Number(onLineChartValueVisibleClick.value.value),
                      color: onLineChartValueVisibleClick.color.value,
                    }),
                  )))
                : lineChartChangeInputElement === deps.lineChartLeftInputElement
                  ? (lineChartChangeComponent.position.x =
                      (lineChartChangeCanvasWidth * clampNumber2(lineChartChangeInputNumber, 0, 100)) / 100 -
                      lineChartChangeComponentWidth / 2)
                  : lineChartChangeInputElement === deps.lineChartTopInputElement
                    ? (lineChartChangeComponent.position.y =
                        (lineChartChangeCanvasHeight * clampNumber2(lineChartChangeInputNumber, 0, 100)) / 100 -
                        lineChartChangeComponentHeight / 2)
                    : lineChartChangeInputElement === deps.lineChartWidthInputElement
                      ? ((lineChartChangeComponent.position.width =
                          (lineChartChangeCanvasWidth * clampNumber2(lineChartChangeInputNumber, 0.1, 100)) / 100),
                        (lineChartChangeComponent.position.x =
                          lineChartChangeCenterX - lineChartChangeComponent.position.width / 2))
                      : lineChartChangeInputElement === deps.lineChartHeightInputElement
                        ? ((lineChartChangeComponent.position.height =
                            (lineChartChangeCanvasHeight * clampNumber2(lineChartChangeInputNumber, 0.1, 100)) / 100),
                          (lineChartChangeComponent.position.y =
                            lineChartChangeCenterY - lineChartChangeComponent.position.height / 2))
                        : lineChartChangeInputElement === deps.lineChartScaleInputElement
                          ? (lineChartChangeComponent.style.scale =
                              clampNumber2(lineChartChangeInputNumber, 1, 500) / 100)
                          : lineChartChangeInputElement === deps.lineChartRotationInputElement &&
                            deps.setComponentsRotation(
                              lineChartChangeDraftDocument,
                              lineChartChangeComponentId,
                              clampNumber2(lineChartChangeInputNumber, -360, 360),
                            )
        })
      }
    }),
    deps.lineChartValueVisibleElement.addEventListener('click', (lineChartValueVisibleEvent: any) => {
      const lineChartValueVisibleButtonElement = lineChartValueVisibleEvent.target.closest(
          '[data-line-chart-value-visible]',
        ),
        lineChartValueVisibleComponentId = deps.selectedComponentId
      !lineChartValueVisibleButtonElement ||
        !lineChartValueVisibleComponentId ||
        deps.mutateDocument((lineChartValueVisibleDraftDocument: any) => {
          const lineChartValueVisibleComponent = findComponent2(
            lineChartValueVisibleDraftDocument,
            lineChartValueVisibleComponentId,
          )?.component
          !lineChartValueVisibleComponent ||
            lineChartValueVisibleComponent.type !== 'line-chart' ||
            (lineChartValueVisibleComponent.properties = {
              ...(lineChartValueVisibleComponent.properties || {}),
              valueVisible: lineChartValueVisibleButtonElement.dataset.lineChartValueVisible === 'on',
            })
        })
    })
}

// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// 导航检视面板的表单 input 监听（写回当前编辑中的导航形状/样式字段）

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface NavigationInspectorInputDeps {
  navigationInspectorFormElement: any
  removedComponent: any
  navigationLabelTextInputElement: any
  navigationColorPropertiesByElement: any
  airConditionerInspectorSubmitEventById: any
  editorRenderer: any
  navigationPropertyConfigsByElement: any
  syncNavigationPreviewFromElement: any
  navigationTransformInputSet: any
  activeProject: any
  navigationLeftElement: any
  navigationTopElement: any
  navigationWidthElement: any
  navigationHeightElement: any
  navigationScaleElement: any
  navigationRotationElement: any
  selectedComponentId: any
  navigationToggleStateByElement: any
  navigationPropertyNameFromElement: any
  navigationLabelElement: any
  coverMotorButtonElement: any
  mutateDocument: any
  entryStateRecord: any
  setComponentsRotation: any
  onImageAssetUploadButtonClick: any
}

export function attachNavigationInspectorInput(deps: NavigationInspectorInputDeps) {
  deps.navigationInspectorFormElement.addEventListener('input', (navigationInputEvent: any) => {
    const navigationInputComponent = deps.removedComponent()
    if (!navigationInputComponent || !deps.navigationLabelTextInputElement(navigationInputComponent)) return
    const navigationInputElement = navigationInputEvent.target,
      navigationInputColorProperty = deps.navigationColorPropertiesByElement.get(navigationInputElement)
    if (navigationInputColorProperty) {
      deps.airConditionerInspectorSubmitEventById.has(navigationInputElement) ||
        deps.editorRenderer?.previewComponentProperties(navigationInputComponent.id, {
          [navigationInputColorProperty]: navigationInputElement.value,
        })
      return
    }
    const navigationInputPropertyConfig = deps.navigationPropertyConfigsByElement.get(navigationInputElement)
    if (navigationInputPropertyConfig) {
      if (String(navigationInputElement.value).trim() === '' || !Number.isFinite(Number(navigationInputElement.value)))
        return
      const navigationInputPropertyValue = clampNumber2(
        Number(navigationInputElement.value),
        navigationInputPropertyConfig.minimum,
        navigationInputPropertyConfig.maximum,
      )
      deps.syncNavigationPreviewFromElement(navigationInputElement),
        deps.editorRenderer?.previewComponentProperties(navigationInputComponent.id, {
          [navigationInputPropertyConfig.property]:
            navigationInputPropertyValue / navigationInputPropertyConfig.divisor,
        })
      return
    }
    if (
      !deps.navigationTransformInputSet.has(navigationInputElement) ||
      String(navigationInputElement.value).trim() === '' ||
      !Number.isFinite(Number(navigationInputElement.value))
    )
      return
    const navigationTransformInputNumber = Number(navigationInputElement.value),
      navigationTransformCanvasWidth = Number(deps.activeProject.document.canvas.width || 2778),
      navigationTransformCanvasHeight = Number(deps.activeProject.document.canvas.height || 1940),
      navigationTransformComponentWidth = Number(navigationInputComponent.position?.width || 100),
      navigationTransformComponentHeight = Number(navigationInputComponent.position?.height || 100)
    if (navigationInputElement === deps.navigationLeftElement) {
      const navigationLeftPercent = clampNumber2(navigationTransformInputNumber, 0, 100)
      deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
        x: (navigationTransformCanvasWidth * navigationLeftPercent) / 100 - navigationTransformComponentWidth / 2,
      })
    } else {
      if (navigationInputElement === deps.navigationTopElement) {
        const navigationTopPercent = clampNumber2(navigationTransformInputNumber, 0, 100)
        deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
          y: (navigationTransformCanvasHeight * navigationTopPercent) / 100 - navigationTransformComponentHeight / 2,
        })
      } else {
        if (navigationInputElement === deps.navigationWidthElement) {
          const navigationWidthPercent = clampNumber2(navigationTransformInputNumber, 0.1, 100),
            navigationPreviewWidthPx = (navigationTransformCanvasWidth * navigationWidthPercent) / 100,
            navigationCenterX =
              Number(navigationInputComponent.position?.x || 0) + navigationTransformComponentWidth / 2
          deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
            x: navigationCenterX - navigationPreviewWidthPx / 2,
            width: navigationPreviewWidthPx,
          })
        } else {
          if (navigationInputElement === deps.navigationHeightElement) {
            const navigationHeightPercent = clampNumber2(navigationTransformInputNumber, 0.1, 100),
              navigationPreviewHeightPx = (navigationTransformCanvasHeight * navigationHeightPercent) / 100,
              navigationCenterY =
                Number(navigationInputComponent.position?.y || 0) + navigationTransformComponentHeight / 2
            deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
              y: navigationCenterY - navigationPreviewHeightPx / 2,
              height: navigationPreviewHeightPx,
            })
          } else {
            if (navigationInputElement === deps.navigationScaleElement) {
              const navigationScalePercent = clampNumber2(navigationTransformInputNumber, 1, 500)
              deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
                scale: navigationScalePercent / 100,
              })
            } else {
              if (navigationInputElement === deps.navigationRotationElement) {
                const navigationRotationDegrees = clampNumber2(navigationTransformInputNumber, -360, 360)
                deps.editorRenderer?.previewComponentTransform(navigationInputComponent.id, {
                  rotation: navigationRotationDegrees,
                })
              }
            }
          }
        }
      }
    }
  }),
    deps.navigationInspectorFormElement.addEventListener('focusin', (onNavigationInspectorFormChange: any) => {
      deps.syncNavigationPreviewFromElement(onNavigationInspectorFormChange.target)
    }),
    deps.navigationInspectorFormElement.addEventListener('change', (navigationChangeEvent: any) => {
      const navigationChangeInputElement = navigationChangeEvent.target,
        navigationChangeComponentId = deps.selectedComponentId
      if (!navigationChangeComponentId) return
      const navigationChangePropertyConfig = deps.navigationColorPropertiesByElement.get(navigationChangeInputElement),
        navigationChangeToggleState = deps.navigationPropertyConfigsByElement.get(navigationChangeInputElement),
        navigationChangePropertyName = deps.navigationToggleStateByElement.get(navigationChangeInputElement),
        eI2 = deps.navigationPropertyNameFromElement(navigationChangeInputElement)
      if (
        !(
          navigationChangeInputElement !== deps.navigationLabelElement &&
          !navigationChangePropertyConfig &&
          !navigationChangeToggleState &&
          !deps.navigationTransformInputSet.has(navigationChangeInputElement)
        )
      ) {
        if (
          (navigationChangeToggleState || deps.navigationTransformInputSet.has(navigationChangeInputElement)) &&
          (String(navigationChangeInputElement.value).trim() === '' ||
            !Number.isFinite(Number(navigationChangeInputElement.value)))
        ) {
          deps.coverMotorButtonElement()
          return
        }
        navigationChangePropertyName && deps.syncNavigationPreviewFromElement(navigationChangeInputElement),
          deps.mutateDocument((navigationChangeDraftDocument: any) => {
            const navigationPreviousActionValue = findComponent2(
              navigationChangeDraftDocument,
              navigationChangeComponentId,
            )?.component
            if (!navigationPreviousActionValue || !deps.navigationLabelTextInputElement(navigationPreviousActionValue))
              return
            ;(navigationPreviousActionValue.properties = {
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
              })
            const $e6 = eI2 ? deps.entryStateRecord(navigationPreviousActionValue, eI2) : undefined,
              navigationChangeCanvasWidth = Number(navigationChangeDraftDocument.canvas.width || 2778),
              navigationChangeCanvasHeight = Number(navigationChangeDraftDocument.canvas.height || 1940),
              navigationChangeInputNumber = Number(navigationChangeInputElement.value)
            if (navigationChangeInputElement === deps.navigationLabelElement)
              navigationPreviousActionValue.properties.label = navigationChangeInputElement.value.trim()
            else {
              if (navigationChangePropertyConfig)
                navigationPreviousActionValue.properties[navigationChangePropertyConfig] =
                  navigationChangeInputElement.value
              else {
                if (navigationChangeToggleState)
                  navigationPreviousActionValue.properties[navigationChangeToggleState.property] =
                    clampNumber2(
                      navigationChangeInputNumber,
                      navigationChangeToggleState.minimum,
                      navigationChangeToggleState.maximum,
                    ) / navigationChangeToggleState.divisor
                else {
                  if (navigationChangeInputElement === deps.navigationLeftElement)
                    navigationPreviousActionValue.position.x =
                      (navigationChangeCanvasWidth * clampNumber2(navigationChangeInputNumber, 0, 100)) / 100 -
                      Number(navigationPreviousActionValue.position.width || 100) / 2
                  else {
                    if (navigationChangeInputElement === deps.navigationTopElement)
                      navigationPreviousActionValue.position.y =
                        (navigationChangeCanvasHeight * clampNumber2(navigationChangeInputNumber, 0, 100)) / 100 -
                        Number(navigationPreviousActionValue.position.height || 100) / 2
                    else {
                      if (navigationChangeInputElement === deps.navigationWidthElement) {
                        const navigationChangeWidthPx =
                            (navigationChangeCanvasWidth * clampNumber2(navigationChangeInputNumber, 0.1, 100)) / 100,
                          navigationChangeCenterX =
                            Number(navigationPreviousActionValue.position.x || 0) +
                            Number(navigationPreviousActionValue.position.width || 100) / 2
                        ;(navigationPreviousActionValue.position.x =
                          navigationChangeCenterX - navigationChangeWidthPx / 2),
                          (navigationPreviousActionValue.position.width = navigationChangeWidthPx)
                      } else {
                        if (navigationChangeInputElement === deps.navigationHeightElement) {
                          const navigationChangeHeightPx =
                              (navigationChangeCanvasHeight * clampNumber2(navigationChangeInputNumber, 0.1, 100)) /
                              100,
                            navigationChangeCenterY =
                              Number(navigationPreviousActionValue.position.y || 0) +
                              Number(navigationPreviousActionValue.position.height || 100) / 2
                          ;(navigationPreviousActionValue.position.y =
                            navigationChangeCenterY - navigationChangeHeightPx / 2),
                            (navigationPreviousActionValue.position.height = navigationChangeHeightPx)
                        } else
                          navigationChangeInputElement === deps.navigationScaleElement
                            ? (navigationPreviousActionValue.style.scale =
                                clampNumber2(navigationChangeInputNumber, 1, 500) / 100)
                            : navigationChangeInputElement === deps.navigationRotationElement &&
                              deps.setComponentsRotation(
                                navigationChangeDraftDocument,
                                navigationChangeComponentId,
                                clampNumber2(navigationChangeInputNumber, -360, 360),
                              )
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
              )
          })
      }
    })
}

// 从 studio/app/editor/home.ts 迁出（P4 studio 拆分，语句级切片）。
// pageshow 回退恢复：从 bfcache 回来时重挂平面图预览帧

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface PageshowDiagramPreviewRestoreDeps {
  cancelRemovesComponent: any
  floorplanAutoDiagramCameraViewElement: any
  selectedComponentId: any
  mutateDocument: any
  findDiagramPreviewFrame: any
  floorplanAutoDiagramFloorSelectElement: any
  removedComponent: any
  lightInputElement: any
  floorplanAutoDiagramCameraModeElement: any
  floorplanAutoDiagramFocalLengthInputElement: any
  coverMotorButtonElement: any
  floorplanAutoDiagramRotateTopButtonElement: any
}

export function attachPageshowDiagramPreviewRestore(deps: PageshowDiagramPreviewRestoreDeps) {
  window.addEventListener('pageshow', (restoredDiagramPreview) => {
    if (restoredDiagramPreview.persisted) {
      for (const onFloorplanAutoDiagramCameraViewClick of document.querySelectorAll(
        '.hb-floorplan-auto-diagram-preview',
      ))
        deps.cancelRemovesComponent(onFloorplanAutoDiagramCameraViewClick)
    }
  }),
    deps.floorplanAutoDiagramCameraViewElement.addEventListener('click', (cameraViewClickEvent: any) => {
      const cameraViewOptionElement = cameraViewClickEvent.target.closest('[data-floorplan-camera-view]'),
        cameraViewComponentId = deps.selectedComponentId
      if (!cameraViewOptionElement || !cameraViewComponentId) return
      const requestedCameraView = cameraViewOptionElement.dataset.floorplanCameraView === 'top' ? 'top' : 'free'
      deps.mutateDocument((cameraViewDraftDocument: any) => {
        const cameraViewComponent = findComponent2(cameraViewDraftDocument, cameraViewComponentId)?.component
        cameraViewComponent?.type === 'floorplan-auto-diagram' &&
          (cameraViewComponent.properties = {
            ...(cameraViewComponent.properties || {}),
            cameraView: requestedCameraView,
          })
      }),
        deps.findDiagramPreviewFrame(cameraViewComponentId, 'set-view', requestedCameraView)
    }),
    deps.floorplanAutoDiagramFloorSelectElement.addEventListener('change', () => {
      const floorSelectComponentId = deps.selectedComponentId,
        selectedFloorValue = String(deps.floorplanAutoDiagramFloorSelectElement.value || ''),
        floorSelectComponent = deps.removedComponent()
      !floorSelectComponentId ||
        !selectedFloorValue ||
        floorSelectComponent?.type !== 'floorplan-auto-diagram' ||
        (deps.mutateDocument((floorSelectDraftDocument: any) => {
          const floorSelectComponentInDraft = findComponent2(
            floorSelectDraftDocument,
            floorSelectComponentId,
          )?.component
          floorSelectComponentInDraft?.type === 'floorplan-auto-diagram' &&
            (floorSelectComponentInDraft.properties = {
              ...(floorSelectComponentInDraft.properties || {}),
              floorSelection: selectedFloorValue,
            })
        }),
        deps.lightInputElement(floorSelectComponentId, selectedFloorValue),
        deps.findDiagramPreviewFrame(floorSelectComponentId, 'restore', {
          view: floorSelectComponent.properties?.cameraView || 'free',
          mode: floorSelectComponent.properties?.cameraMode || 'orthographic',
          topRotation: Number(floorSelectComponent.properties?.cameraTopRotation || 0),
          focalLength: Number(floorSelectComponent.properties?.cameraFocalLength || 50),
        }))
    }),
    deps.floorplanAutoDiagramCameraModeElement.addEventListener('click', (cameraModeClickEvent: any) => {
      const cameraModeOptionElement = cameraModeClickEvent.target.closest('[data-floorplan-camera-mode]'),
        cameraModeComponentId = deps.selectedComponentId
      if (!cameraModeOptionElement || !cameraModeComponentId) return
      const requestedCameraMode =
        cameraModeOptionElement.dataset.floorplanCameraMode === 'perspective' ? 'perspective' : 'orthographic'
      deps.mutateDocument((cameraModeDraftDocument: any) => {
        const cameraModeComponent = findComponent2(cameraModeDraftDocument, cameraModeComponentId)?.component
        cameraModeComponent?.type === 'floorplan-auto-diagram' &&
          (cameraModeComponent.properties = {
            ...(cameraModeComponent.properties || {}),
            cameraMode: requestedCameraMode,
          })
      }),
        deps.findDiagramPreviewFrame(cameraModeComponentId, 'set-mode', requestedCameraMode)
    }),
    deps.floorplanAutoDiagramFocalLengthInputElement.addEventListener('change', () => {
      const focalLengthComponentId = deps.selectedComponentId
      if (!focalLengthComponentId || String(deps.floorplanAutoDiagramFocalLengthInputElement.value).trim() === '')
        return deps.coverMotorButtonElement()
      const clampedFocalLength = clampNumber2(Number(deps.floorplanAutoDiagramFocalLengthInputElement.value), 18, 120)
      deps.mutateDocument((focalLengthDraftDocument: any) => {
        const focalLengthComponent = findComponent2(focalLengthDraftDocument, focalLengthComponentId)?.component
        focalLengthComponent?.type === 'floorplan-auto-diagram' &&
          (focalLengthComponent.properties = {
            ...(focalLengthComponent.properties || {}),
            cameraFocalLength: clampedFocalLength,
          })
      }),
        deps.findDiagramPreviewFrame(focalLengthComponentId, 'set-focal-length', clampedFocalLength)
    }),
    deps.floorplanAutoDiagramRotateTopButtonElement.addEventListener('click', () => {
      const rotateTopComponentId = deps.selectedComponentId
      rotateTopComponentId &&
        (deps.mutateDocument((rotateTopDraftDocument: any) => {
          const rotateTopComponent = findComponent2(rotateTopDraftDocument, rotateTopComponentId)?.component
          rotateTopComponent?.type === 'floorplan-auto-diagram' &&
            (rotateTopComponent.properties = {
              ...(rotateTopComponent.properties || {}),
              cameraView: 'top',
              cameraTopRotation: (Number(rotateTopComponent.properties?.cameraTopRotation || 0) + 90) % 360,
            })
        }),
        deps.findDiagramPreviewFrame(rotateTopComponentId, 'rotate-top'))
    })
}

/** 依赖袋（宿主 `bootEditor` 作用域）：宿主按 getter 传入，模块**惰性读取** ——
 * 与留在宿主里的闭包同语义。搬走的语句只读不写，所以无需 state 袋 / setter。
 *
 * ⚠ 这里是**事件注册语句**：它在 boot 时只跑一次，回调要等用户操作。若按值注入，
 * 像 `editorRenderer`（boot 后才赋值）/ `activeProject` 这类可变状态会被冻结在注册那一刻，
 * 而声明在注册语句下方的名字甚至会在 boot 当场触发 TDZ。故宿主一律传 getter。
 */
interface SyncProjectTemplateOptionsDeps {
  projectTemplateOptionsElement: any
  cameraCommandState: any
  resizeWarningResolveState: any
  projectCanvasFieldsElement: any
  projectDialogMode: any
  projectFormElement: any
  projectCanvasWidthElement: any
  projectCanvasHeightElement: any
  isAspectLockedState: any
  isAspectLockedValue: any
  projectCanvasHintElement: any
  lightStatisticsEntityListClickEvent: any
  imageEntityDraftDocument: any
}

export function syncProjectTemplateOptions(deps: SyncProjectTemplateOptionsDeps) {
  if (
    (deps.projectTemplateOptionsElement.replaceChildren(
      ...deps.cameraCommandState.map((cameraCommandValue: any) => {
        const diagramPreviewFrame = document.createElement('div')
        ;(diagramPreviewFrame.className =
          'project-template-option' + (cameraCommandValue.id === deps.resizeWarningResolveState ? ' active' : '')),
          (diagramPreviewFrame.dataset.projectTemplateId = cameraCommandValue.id),
          (diagramPreviewFrame.dataset.previewUrls = JSON.stringify(cameraCommandValue.previewUrls)),
          (diagramPreviewFrame.dataset.previewLabels = JSON.stringify(cameraCommandValue.previewLabels)),
          (diagramPreviewFrame.dataset.previewIndex = '0'),
          diagramPreviewFrame.setAttribute('role', 'radio'),
          diagramPreviewFrame.setAttribute(
            'aria-checked',
            String(cameraCommandValue.id === deps.resizeWarningResolveState),
          ),
          (diagramPreviewFrame.tabIndex = 0)
        const floorDiagramFrame = document.createElement('div')
        if (
          ((floorDiagramFrame.className =
            'project-template-carousel' + (cameraCommandValue.previewUrls.length ? '' : ' blank')),
          cameraCommandValue.previewUrls.length)
        ) {
          const overlayElement = document.createElement('button')
          ;(overlayElement.type = 'button'),
            (overlayElement.className = 'project-template-preview-open'),
            (overlayElement.dataset.projectPreviewAction = 'open'),
            (overlayElement.title = '点击放大预览')
          const licenseWarningElement = document.createElement('img')
          ;(licenseWarningElement.src = cameraCommandValue.previewUrls[0]),
            (licenseWarningElement.alt = cameraCommandValue.previewLabels[0] || cameraCommandValue.name + '预览 1'),
            (licenseWarningElement.loading = 'eager'),
            overlayElement.append(licenseWarningElement)
          const licenseError = document.createElement('button')
          ;(licenseError.type = 'button'),
            (licenseError.className = 'project-template-carousel-arrow previous'),
            (licenseError.dataset.projectPreviewAction = 'previous'),
            licenseError.setAttribute('aria-label', '上一张预览'),
            (licenseError.textContent = '‹')
          const hideReactivateElement = document.createElement('button')
          ;(hideReactivateElement.type = 'button'),
            (hideReactivateElement.className = 'project-template-carousel-arrow next'),
            (hideReactivateElement.dataset.projectPreviewAction = 'next'),
            hideReactivateElement.setAttribute('aria-label', '下一张预览'),
            (hideReactivateElement.textContent = '›')
          const recoveryHintElement = domElement(document, 'div', 'project-template-carousel-meta')
          const featureSignatureElement = document.createElement('strong')
          featureSignatureElement.textContent = cameraCommandValue.previewLabels[0] || 'HomeOS预览'
          const focusedComponentRecordElement = document.createElement('span')
          ;(focusedComponentRecordElement.textContent = '1 / ' + cameraCommandValue.previewUrls.length),
            recoveryHintElement.append(featureSignatureElement, focusedComponentRecordElement),
            floorDiagramFrame.append(overlayElement),
            cameraCommandValue.previewUrls.length > 1 && floorDiagramFrame.append(licenseError, hideReactivateElement),
            floorDiagramFrame.append(recoveryHintElement)
        } else
          floorDiagramFrame.replaceChildren(
            ...Array.from(
              {
                length: 4,
              },
              () => document.createElement('i'),
            ),
          )
        const editStateElement = domElement(document, 'strong', null, cameraCommandValue.name)
        const hiddenContentElement = document.createElement('span')
        return (
          (hiddenContentElement.textContent = cameraCommandValue.description),
          diagramPreviewFrame.append(floorDiagramFrame, editStateElement, hiddenContentElement),
          diagramPreviewFrame
        )
      }),
    ),
    (deps.projectCanvasFieldsElement.hidden = false),
    deps.projectDialogMode === 'create')
  ) {
    const effectPreviewComponent = deps.cameraCommandState.find(
      (previewToggleElement: any) => previewToggleElement.id === deps.resizeWarningResolveState,
    )
    deps.projectFormElement.elements.name.value = effectPreviewComponent?.id
      ? effectPreviewComponent.name
      : '我的仪表盘'
    const isPreviewActive = !!effectPreviewComponent?.id
    ;(deps.projectCanvasWidthElement.readOnly = isPreviewActive),
      (deps.projectCanvasHeightElement.readOnly = isPreviewActive),
      (deps.projectCanvasWidthElement.value = String(
        isPreviewActive ? effectPreviewComponent.canvasWidth : deps.isAspectLockedState,
      )),
      (deps.projectCanvasHeightElement.value = String(
        isPreviewActive ? effectPreviewComponent.canvasHeight : deps.isAspectLockedValue,
      )),
      deps.projectCanvasFieldsElement.classList.toggle('fixed', isPreviewActive),
      deps.projectCanvasFieldsElement.classList.remove('name-only'),
      (deps.projectCanvasHintElement.textContent = isPreviewActive
        ? 'HomeOS使用固定画布分辨率，创建时会完整保留页面布局与比例。'
        : '编辑器和仪表盘将共用该分辨率与比例，显示时只做等比缩放。'),
      deps.lightStatisticsEntityListClickEvent(),
      deps.imageEntityDraftDocument(isPreviewActive)
  }
}
