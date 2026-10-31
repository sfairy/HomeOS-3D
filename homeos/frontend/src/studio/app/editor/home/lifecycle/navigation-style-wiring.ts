/* 导航/页框/相机/标题按钮/灯光统计的「套用样式」入口与共享引用表。
 *
 * 从 `home/lifecycle/boot.ts` 整块搬出：只读 DOM 句柄与实现函数，
 * 事件处理里写的是 `editorCtx` / 文档对象，不回写闭包变量。
 */
export function bindNavigationStyleWiring(deps: Record<string, any>): void {
  const {
    actionNeedsCurrentEntity2, addLightStatisticsEntity, airConditionerApplyStyleElement,
    airConditionerBaselineByComponentId, applyCameraDimensionChange, applyEffectAssetDimensionChange,
    applyFlowLineStyle2, applyLineChartDimensionChange, applyPercentageBarChange2, cameraApplyStyleElement,
    closeOtherPickerMenus, closePickerMenu, copyTextToClipboard, coverMotorButtonElement, devicesByDeviceId,
    editorCtx, effectIconName, entitiesByEntityId, entryStateRecord, findComponent2, findElement,
    handleOperationError, ibeApplyStyleElement, ibeIconButtonElement, ibeIconCopyElement, ibeIconMenuElement,
    ibeIconOptionsElement, ibeIconSearchElement, iconButtonApplyStyleElement, iconButtonBaselineByComponentId,
    iconButtonEffectBaselineByComponentId, iconButtonIconButtonElement, iconButtonIconCopyElement,
    iconButtonIconMenuElement, iconButtonIconOptionsElement, iconButtonIconSearchElement,
    iconTooltipElementBuffer, iconTooltipElementCount, iconTooltipElementFlag, iconTooltipElementStep,
    iconTooltipElementStore, imageAssetClickEvent, imageAssetMeasureError, imageEntityButtonElement,
    imageEntityMenuElement, imageEntityOptionsElement, imageEntitySearchElement, layoutTitleButtonIconMenu,
    lightStatisticsEntityButtonElement, lightStatisticsEntityConfirmElement, lightStatisticsEntityListElement,
    lightStatisticsEntityMenuElement, lightStatisticsEntityOptionsElement, lightStatisticsEntityPendingElement,
    lightStatisticsEntitySearchElement, lightStatisticsIconButtonElement, lightStatisticsIconCopyElement,
    lightStatisticsIconMenuElement, lightStatisticsIconOptionsElement, lightStatisticsIconSearchElement,
    lineChartApplyStyleButtonElement, manualRelatedEntityConfig2, mutateDocument, navigationApplyStyleElement,
    navigationButtonSavedSettingsByComponentId, navigationIconButtonElement, navigationIconCopyElement,
    navigationIconMenuElement, navigationIconOptionsElement, navigationIconSearchElement,
    navigationLabelTextInputElement, navigationStyleApplyCancelElement, navigationStyleApplyCloseElement,
    navigationStyleApplyConfirmElement, navigationStyleApplyDialogElement, navigationStyleApplyMessageElement,
    navigationStyleApplyPropertiesElement, navigationStyleApplyTargetsElement, normalizeSensorKind,
    onComponentTemplateDialogClick, onErrorDialogCloseButtonClick, onIconButtonEffectAssetFolderSelectChange,
    onImageAssetUploadButtonClick, onShowSharedComponentsButtonClick, openAirConditionerStyleApplyDialog,
    openCameraStyleApplyDialog, openIconButtonEffectStyleApplyDialog, openIconButtonStyleApplyDialog,
    openNavigationStyleApplyDialog, openTitleButtonStyleApplyDialog, panelFrameApplyStyleButtonElement,
    panelFrameBaselineByComponentId, percentageBarDefaults2, positionIbeIconMenu, positionIconButtonIconMenu,
    positionLightStatisticsEntityMenu, positionLightStatisticsIconMenu, positionNavigationIconMenu,
    recoveredComponentId, refreshImageAssetPickerPreview, relatedPopupContext2, removeLightStatisticsEntityAt,
    removedComponent, renderLightStatisticsEntityOptions, renderRelatedPopupEntityOptions,
    resetStyleApplyBaselines, setPickerButtonLabel, showLightStatisticsMessage, titleButtonApplyStyleElement,
    titleButtonIconButtonElement, titleButtonIconCopyElement, titleButtonIconMenuElement,
    titleButtonIconOptionsElement, titleButtonIconSearchElement
  } = deps;
(navigationApplyStyleElement.addEventListener("click", openNavigationStyleApplyDialog),
  panelFrameApplyStyleButtonElement.addEventListener("click", imageAssetClickEvent),
  cameraApplyStyleElement.addEventListener("click", openCameraStyleApplyDialog),
  titleButtonApplyStyleElement.addEventListener("click", openTitleButtonStyleApplyDialog),
  lineChartApplyStyleButtonElement.addEventListener("click", imageAssetMeasureError),
  ibeApplyStyleElement.addEventListener("click", openIconButtonEffectStyleApplyDialog),
  iconButtonApplyStyleElement.addEventListener("click", openIconButtonStyleApplyDialog),
  airConditionerApplyStyleElement.addEventListener("click", openAirConditionerStyleApplyDialog),
  navigationStyleApplyCloseElement.addEventListener("click", () =>
    navigationStyleApplyDialogElement.close(),
  ),
  navigationStyleApplyCancelElement.addEventListener("click", () =>
    navigationStyleApplyDialogElement.close(),
  ),
  navigationStyleApplyDialogElement.addEventListener("click", (onImageAssetButtonClickState: any) => {
    onImageAssetButtonClickState.target === navigationStyleApplyDialogElement &&
      navigationStyleApplyDialogElement.close();
  }),
  navigationStyleApplyDialogElement.addEventListener("close", () => {
    // 结束会话：清 5 张 baseline，避免下次打开沿用旧控件快照。
    resetStyleApplyBaselines(
      {
        editorCtx,
        airConditionerBaselineByComponentId,
        iconButtonBaselineByComponentId,
        iconButtonEffectBaselineByComponentId,
        navigationButtonSavedSettingsByComponentId,
        panelFrameBaselineByComponentId,
      },
      navigationStyleApplyDialogElement,
    );
  }),
  navigationStyleApplyConfirmElement.addEventListener("click", () => {
    // 会话守卫：异步写入回来时若已经切项目，就不能再对旧控件打脉冲/改选中态。
    const styleApplySessionProjectId = editorCtx.activeProject?.projectId,
      templateItemElementState = editorCtx.appliedStyleRecord?.sourceId,
      isImageAssetMenuHiddenState = editorCtx.appliedStyleRecord?.type,
      mappedItemsMode = [
        ...navigationStyleApplyPropertiesElement.querySelectorAll(
          "[data-navigation-style-property]:checked",
        ),
      ].map(
        (imageAssetCatalogErrorElement) =>
          imageAssetCatalogErrorElement.dataset.navigationStyleProperty,
      ),
      mappedItemsLevel = [
        ...navigationStyleApplyTargetsElement.querySelectorAll(
          "[data-navigation-target-id]:checked",
        ),
      ].map(
        (onImageAssetFolderSelectChangeElement) =>
          onImageAssetFolderSelectChangeElement.dataset.navigationTargetId,
      );
    if (!templateItemElementState || !mappedItemsMode.length || !mappedItemsLevel.length) {
      const templatePagePathState =
        isImageAssetMenuHiddenState === "percentage-bar"
          ? "百分比柱状图"
          : isImageAssetMenuHiddenState === "flow-line"
            ? "流水线条"
            : isImageAssetMenuHiddenState === "panel-frame"
              ? "底图框"
              : isImageAssetMenuHiddenState === "camera"
                ? "摄像头实时预览"
                : isImageAssetMenuHiddenState === "title-button"
                  ? "标题按钮"
                  : isImageAssetMenuHiddenState === "air-conditioner"
                    ? "空调"
                    : isImageAssetMenuHiddenState === "line-chart"
                      ? "折线图"
                      : isImageAssetMenuHiddenState === "icon-button-effect"
                        ? "图标按钮（效果）"
                        : isImageAssetMenuHiddenState === "icon-button"
                          ? "图标按钮"
                          : isImageAssetMenuHiddenState === "device-button"
                            ? "设备按钮"
                            : isImageAssetMenuHiddenState === "presence-sensor"
                              ? "传感器"
                              : isImageAssetMenuHiddenState === "scene-mode"
                                ? "情景模式"
                                : "导航按钮";
      ((navigationStyleApplyMessageElement.textContent =
        "请至少选择一项修改和一个目标" + templatePagePathState + "。"),
        (navigationStyleApplyMessageElement.hidden = false));
      return;
    }
    (navigationStyleApplyDialogElement.close(),
      mutateDocument((onImageAssetSearchInputInputState: any) => {
        const templatePagePath = findComponent2(
          onImageAssetSearchInputInputState,
          templateItemElementState,
        )?.component;
        if (!(!templatePagePath || templatePagePath.type !== isImageAssetMenuHiddenState))
          for (const onImageAssetOptionsPointeroverState of mappedItemsLevel) {
            const currentComponentScope = findComponent2(
              onImageAssetSearchInputInputState,
              onImageAssetOptionsPointeroverState,
            )?.component;
            if (
              !(
                !currentComponentScope || currentComponentScope.type !== isImageAssetMenuHiddenState
              ) &&
              !(
                isImageAssetMenuHiddenState === "presence-sensor" &&
                normalizeSensorKind(currentComponentScope) !== normalizeSensorKind(templatePagePath)
              )
            ) {
              for (const imageAssetPointerOverEventState of mappedItemsMode)
                isImageAssetMenuHiddenState === "flow-line"
                  ? applyFlowLineStyle2(templatePagePath, currentComponentScope, [
                      imageAssetPointerOverEventState,
                    ])
                  : isImageAssetMenuHiddenState === "panel-frame"
                    ? applyEffectAssetDimensionChange(
                        templatePagePath,
                        currentComponentScope,
                        imageAssetPointerOverEventState,
                      )
                    : isImageAssetMenuHiddenState === "camera"
                      ? applyCameraDimensionChange(
                          templatePagePath,
                          currentComponentScope,
                          imageAssetPointerOverEventState,
                        )
                      : isImageAssetMenuHiddenState === "title-button"
                        ? onErrorDialogCloseButtonClick(
                            templatePagePath,
                            currentComponentScope,
                            imageAssetPointerOverEventState,
                          )
                        : isImageAssetMenuHiddenState === "line-chart"
                          ? applyLineChartDimensionChange(
                              templatePagePath,
                              currentComponentScope,
                              imageAssetPointerOverEventState,
                            )
                          : isImageAssetMenuHiddenState === "percentage-bar"
                            ? applyPercentageBarChange2(
                                currentComponentScope,
                                {
                                  property: imageAssetPointerOverEventState,
                                  value:
                                    templatePagePath.properties?.[
                                      imageAssetPointerOverEventState
                                    ] ?? (percentageBarDefaults2 as any)[imageAssetPointerOverEventState],
                                },
                                onImageAssetSearchInputInputState.canvas,
                              )
                            : isImageAssetMenuHiddenState === "icon-button-effect"
                              ? recoveredComponentId(
                                  templatePagePath,
                                  currentComponentScope,
                                  imageAssetPointerOverEventState,
                                )
                              : isImageAssetMenuHiddenState === "air-conditioner"
                                ? onComponentTemplateDialogClick(
                                    templatePagePath,
                                    currentComponentScope,
                                    imageAssetPointerOverEventState,
                                  )
                                : ["icon-button", "device-button", "presence-sensor"].includes(
                                      isImageAssetMenuHiddenState,
                                    )
                                  ? onShowSharedComponentsButtonClick(
                                      templatePagePath,
                                      currentComponentScope,
                                      imageAssetPointerOverEventState,
                                    )
                                  : onIconButtonEffectAssetFolderSelectChange(
                                      templatePagePath,
                                      currentComponentScope,
                                      imageAssetPointerOverEventState,
                                    );
            }
          }
      }).then(() => {
        if (editorCtx.activeProject?.projectId !== styleApplySessionProjectId) return;
        if (isImageAssetMenuHiddenState === "flow-line") {
          const flowLineApplyStyleElement = findElement("#flow-line-apply-style"),
            stylePulseByButton = (editorCtx.styleApplyPulseByButton ??= new Map()),
            previousFlowPulse = flowLineApplyStyleElement
              ? stylePulseByButton.get(flowLineApplyStyleElement)
              : undefined;
          (previousFlowPulse && window.clearTimeout(previousFlowPulse),
            flowLineApplyStyleElement?.classList.add("applied"),
            flowLineApplyStyleElement &&
              stylePulseByButton.set(
                flowLineApplyStyleElement,
                window.setTimeout(() => {
                  (stylePulseByButton.delete(flowLineApplyStyleElement),
                    flowLineApplyStyleElement.classList.remove("applied"),
                    editorCtx.selectedComponentId === templateItemElementState &&
                      coverMotorButtonElement());
                }, 1800),
              ));
          return;
        }
        if (isImageAssetMenuHiddenState === "percentage-bar") {
          coverMotorButtonElement();
          return;
        }
        const $c2 =
          isImageAssetMenuHiddenState === "panel-frame"
            ? panelFrameApplyStyleButtonElement
            : isImageAssetMenuHiddenState === "camera"
              ? cameraApplyStyleElement
              : isImageAssetMenuHiddenState === "title-button"
                ? titleButtonApplyStyleElement
                : isImageAssetMenuHiddenState === "air-conditioner"
                  ? airConditionerApplyStyleElement
                  : isImageAssetMenuHiddenState === "line-chart"
                    ? lineChartApplyStyleButtonElement
                    : isImageAssetMenuHiddenState === "icon-button-effect"
                      ? ibeApplyStyleElement
                      : ["icon-button", "device-button", "presence-sensor"].includes(
                            isImageAssetMenuHiddenState,
                          )
                        ? iconButtonApplyStyleElement
                        : navigationApplyStyleElement;
        {
          const stylePulseByButton = (editorCtx.styleApplyPulseByButton ??= new Map()),
            previousPulse = stylePulseByButton.get($c2);
          (previousPulse && window.clearTimeout(previousPulse), $c2.classList.add("applied"));
          stylePulseByButton.set(
            $c2,
            window.setTimeout(() => {
              (stylePulseByButton.delete($c2),
                $c2.classList.remove("applied"),
                editorCtx.selectedComponentId === templateItemElementState && coverMotorButtonElement());
            }, 1800),
          );
        }
      }));
  }),
  navigationIconButtonElement.addEventListener("click", () => {
    const hidden5 = navigationIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden5 ? "navigation-icon" : null),
      (navigationIconMenuElement.hidden = !hidden5),
      navigationIconButtonElement.setAttribute("aria-expanded", String(hidden5)),
      hidden5 &&
        iconTooltipElementCount(navigationIconSearchElement.value)
          .then(() => {
            (positionNavigationIconMenu(),
              navigationIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError));
  }),
  navigationIconCopyElement.addEventListener("click", async () => {
    const activeGroupEntry = removedComponent()?.properties?.icon || "";
    if (activeGroupEntry)
      try {
        (await copyTextToClipboard(activeGroupEntry),
          window.clearTimeout(editorCtx.navigationIconCopiedTimeoutId),
          navigationIconCopyElement.classList.add("copied"),
          (editorCtx.navigationIconCopiedTimeoutId = window.setTimeout(
            () => navigationIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorRecord: any) {
        handleOperationError(caughtErrorRecord);
      }
  }),
  navigationIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.navigationIconSearchDebounceTimeoutId),
      (editorCtx.navigationIconSearchDebounceTimeoutId = window.setTimeout(() => {
        iconTooltipElementCount(navigationIconSearchElement.value).catch(handleOperationError);
      }, 160)));
  }),
  navigationIconOptionsElement.addEventListener("click", (onImageAssetOptionsClickState: any) => {
    const activeGroupChildComponentElement =
        onImageAssetOptionsClickState.target.closest("[data-icon-name]"),
      activeGroupChildComponent = editorCtx.selectedComponentId;
    if (!activeGroupChildComponentElement || !activeGroupChildComponent) return;
    const iconName = activeGroupChildComponentElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((imageAssetClickEventState: any) => {
        const templateTargetScope = findComponent2(
          imageAssetClickEventState,
          activeGroupChildComponent,
        )?.component;
        if (!templateTargetScope || !navigationLabelTextInputElement(templateTargetScope)) return;
        const $e9 = entryStateRecord(templateTargetScope, "icon"),
          newComponentId = entryStateRecord(templateTargetScope, "iconVisible");
        ((templateTargetScope.properties = {
          ...(templateTargetScope.properties || {}),
          icon: iconName,
          iconVisible: !!iconName,
        }),
          onImageAssetUploadButtonClick(
            activeGroupChildComponent,
            "icon",
            $e9,
            entryStateRecord(templateTargetScope, "icon"),
          ),
          onImageAssetUploadButtonClick(
            activeGroupChildComponent,
            "iconVisible",
            newComponentId,
            entryStateRecord(templateTargetScope, "iconVisible"),
          ));
      }));
  }),
  ibeIconButtonElement.addEventListener("click", () => {
    const hidden6 = ibeIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden6 ? "ibe-icon" : null),
      (ibeIconMenuElement.hidden = !hidden6),
      ibeIconButtonElement.setAttribute("aria-expanded", String(hidden6)),
      hidden6 &&
        iconTooltipElementFlag(ibeIconSearchElement.value)
          .then(() => {
            (positionIbeIconMenu(),
              ibeIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError));
  }),
  ibeIconCopyElement.addEventListener("click", async () => {
    const createdInstanceTotal = removedComponent()?.properties?.icon || "";
    if (createdInstanceTotal)
      try {
        (await copyTextToClipboard(createdInstanceTotal),
          window.clearTimeout(editorCtx.effectIconCopiedTimeoutId),
          ibeIconCopyElement.classList.add("copied"),
          (editorCtx.effectIconCopiedTimeoutId = window.setTimeout(
            () => ibeIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (createComponentPromise: any) {
        handleOperationError(createComponentPromise);
      }
  }),
  ibeIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.effectIconSearchDebounceTimeoutId),
      (editorCtx.effectIconSearchDebounceTimeoutId = window.setTimeout(
        () => iconTooltipElementFlag(ibeIconSearchElement.value).catch(handleOperationError),
        160,
      )));
  }),
  ibeIconOptionsElement.addEventListener("click", (createComponentPromiseState: any) => {
    const createComponentPromiseElement =
        createComponentPromiseState.target.closest("[data-icon-name]"),
      imageAssetIdState = editorCtx.selectedComponentId;
    if (!createComponentPromiseElement || !imageAssetIdState) return;
    const iconName2 = createComponentPromiseElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((imageAssetDraftDocumentState: any) => {
        const templateDraftDocumentState = findComponent2(
          imageAssetDraftDocumentState,
          imageAssetIdState,
        )?.component;
        !templateDraftDocumentState ||
          templateDraftDocumentState.type !== "icon-button-effect" ||
          (templateDraftDocumentState.properties = {
            ...(templateDraftDocumentState.properties || {}),
            icon: iconName2,
          });
      }));
  }),
  iconButtonIconButtonElement.addEventListener("click", () => {
    const hidden7 = iconButtonIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden7 ? "icon-button-icon" : null),
      (iconButtonIconMenuElement.hidden = !hidden7),
      iconButtonIconButtonElement.setAttribute("aria-expanded", String(hidden7)),
      hidden7 &&
        iconTooltipElementStep(iconButtonIconSearchElement.value)
          .then(() => {
            (positionIconButtonIconMenu(),
              iconButtonIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError));
  }),
  iconButtonIconCopyElement.addEventListener("click", async () => {
    const createdInstanceFlag = removedComponent()?.properties?.icon || "";
    if (createdInstanceFlag)
      try {
        (await copyTextToClipboard(createdInstanceFlag),
          window.clearTimeout(editorCtx.deviceIconCopiedTimeoutId),
          iconButtonIconCopyElement.classList.add("copied"),
          (editorCtx.deviceIconCopiedTimeoutId = window.setTimeout(
            () => iconButtonIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorName: any) {
        handleOperationError(caughtErrorName);
      }
  }),
  iconButtonIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.deviceIconSearchDebounceTimeoutId),
      (editorCtx.deviceIconSearchDebounceTimeoutId = window.setTimeout(
        () => iconTooltipElementStep(iconButtonIconSearchElement.value).catch(handleOperationError),
        160,
      )));
  }),
  iconButtonIconOptionsElement.addEventListener("click", (templateDraftDocument: any) => {
    const templateTargetPageElement = templateDraftDocument.target.closest("[data-icon-name]"),
      templatePageMatchState = editorCtx.selectedComponentId;
    if (!templateTargetPageElement || !templatePageMatchState) return;
    const iconName3 = templateTargetPageElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((templatePageMatch: any) => {
        const draftGroupEntry = findComponent2(
          templatePageMatch,
          templatePageMatchState,
        )?.component;
        !draftGroupEntry ||
          !["icon-button", "device-button", "presence-sensor"].includes(draftGroupEntry.type) ||
          (draftGroupEntry.properties = {
            ...(draftGroupEntry.properties || {}),
            icon: iconName3,
          });
      }));
  }),
  titleButtonIconButtonElement.addEventListener("click", (draftGroupComponentState: any) => {
    (draftGroupComponentState.preventDefault(), draftGroupComponentState.stopPropagation());
    const hidden8 = titleButtonIconMenuElement.hidden;
    (closeOtherPickerMenus(hidden8 ? "title-button-icon" : null),
      hidden8 &&
        titleButtonIconMenuElement.parentElement !== document.body &&
        document.body.append(titleButtonIconMenuElement),
      (titleButtonIconMenuElement.hidden = !hidden8),
      (titleButtonIconMenuElement.style.position = "fixed"),
      (titleButtonIconMenuElement.style.zIndex = "760"),
      titleButtonIconButtonElement.setAttribute("aria-expanded", String(hidden8)),
      hidden8 &&
        (layoutTitleButtonIconMenu(),
        iconTooltipElementStore(titleButtonIconSearchElement.value)
          .then(() => {
            (layoutTitleButtonIconMenu(),
              titleButtonIconSearchElement.focus({
                preventScroll: true,
              }));
          })
          .catch(handleOperationError)));
  }),
  titleButtonIconCopyElement.addEventListener("click", async () => {
    const draftGroupComponent = removedComponent()?.properties?.icon || "";
    if (draftGroupComponent)
      try {
        (await copyTextToClipboard(draftGroupComponent),
          window.clearTimeout(editorCtx.titleButtonIconCopiedTimeoutId),
          titleButtonIconCopyElement.classList.add("copied"),
          (editorCtx.titleButtonIconCopiedTimeoutId = window.setTimeout(
            () => titleButtonIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorKey: any) {
        handleOperationError(caughtErrorKey);
      }
  }),
  titleButtonIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.titleButtonIconSearchDebounceTimeoutId),
      (editorCtx.titleButtonIconSearchDebounceTimeoutId = window.setTimeout(
        () =>
          iconTooltipElementStore(titleButtonIconSearchElement.value).catch(handleOperationError),
        160,
      )));
  }),
  titleButtonIconOptionsElement.addEventListener("click", (imageAssetSizeDraftDocumentState: any) => {
    const targetComponentCollectionElement =
        imageAssetSizeDraftDocumentState.target.closest("[data-icon-name]"),
      targetComponentCollection = editorCtx.selectedComponentId;
    if (!targetComponentCollectionElement || !targetComponentCollection) return;
    const iconName4 = targetComponentCollectionElement.dataset.iconName;
    (closeOtherPickerMenus(),
      mutateDocument((imageAssetMeasureErrorState: any) => {
        const insertionCollection = findComponent2(
          imageAssetMeasureErrorState,
          targetComponentCollection,
        )?.component;
        !insertionCollection ||
          insertionCollection.type !== "title-button" ||
          (insertionCollection.properties = {
            ...(insertionCollection.properties || {}),
            icon: iconName4,
            iconVisible: !!iconName4,
          });
      }));
  }),
  lightStatisticsIconButtonElement.addEventListener(
    "click",
    (onIconButtonEffectAssetButtonClickState: any) => {
      (onIconButtonEffectAssetButtonClickState.preventDefault(),
        onIconButtonEffectAssetButtonClickState.stopPropagation());
      const hidden9 = lightStatisticsIconMenuElement.hidden;
      (closeOtherPickerMenus(hidden9 ? "light-statistics-icon" : null),
        hidden9 &&
          lightStatisticsIconMenuElement.parentElement !== document.body &&
          document.body.append(lightStatisticsIconMenuElement),
        (lightStatisticsIconMenuElement.hidden = !hidden9),
        (lightStatisticsIconMenuElement.style.position = "fixed"),
        (lightStatisticsIconMenuElement.style.zIndex = "760"),
        lightStatisticsIconButtonElement.setAttribute("aria-expanded", String(hidden9)),
        hidden9 &&
          (positionLightStatisticsIconMenu(),
          iconTooltipElementBuffer(lightStatisticsIconSearchElement.value)
            .then(() => {
              (positionLightStatisticsIconMenu(),
                lightStatisticsIconSearchElement.focus({
                  preventScroll: true,
                }));
            })
            .catch(handleOperationError)));
    },
  ),
  lightStatisticsIconCopyElement.addEventListener("click", async () => {
    const templateLabel = removedComponent()?.properties?.icon || "";
    if (templateLabel)
      try {
        (await copyTextToClipboard(templateLabel),
          window.clearTimeout(editorCtx.lightStatisticsIconCopiedTimeoutId),
          lightStatisticsIconCopyElement.classList.add("copied"),
          (editorCtx.lightStatisticsIconCopiedTimeoutId = window.setTimeout(
            () => lightStatisticsIconCopyElement.classList.remove("copied"),
            1200,
          )));
      } catch (caughtErrorPath: any) {
        handleOperationError(caughtErrorPath);
      }
  }),
  lightStatisticsIconSearchElement.addEventListener("input", () => {
    (window.clearTimeout(editorCtx.lightStatisticsIconSearchDebounceTimeoutId),
      (editorCtx.lightStatisticsIconSearchDebounceTimeoutId = window.setTimeout(
        () =>
          iconTooltipElementBuffer(lightStatisticsIconSearchElement.value).catch(
            handleOperationError,
          ),
        160,
      )));
  }),
  lightStatisticsIconOptionsElement.addEventListener(
    "click",
    (onIconButtonEffectAssetFolderSelectChangeState: any) => {
      const templateInstanceNameElement =
          onIconButtonEffectAssetFolderSelectChangeState.target.closest(
            "[data-light-statistics-icon-name]",
          ),
        templateInstanceName = editorCtx.selectedComponentId;
      if (!templateInstanceNameElement || !templateInstanceName) return;
      const lightStatisticsIconName = templateInstanceNameElement.dataset.lightStatisticsIconName;
      (closeOtherPickerMenus(),
        mutateDocument((onIconButtonEffectAssetSearchInputInputState: any) => {
          const createdComponent = findComponent2(
            onIconButtonEffectAssetSearchInputInputState,
            templateInstanceName,
          )?.component;
          !createdComponent ||
            createdComponent.type !== "light-statistics" ||
            (createdComponent.properties = {
              ...(createdComponent.properties || {}),
              icon: lightStatisticsIconName,
            });
        }));
    },
  ),
  lightStatisticsEntityButtonElement.addEventListener(
    "click",
    (onIconButtonEffectAssetOptionsPointeroverState: any) => {
      (onIconButtonEffectAssetOptionsPointeroverState.preventDefault(),
        onIconButtonEffectAssetOptionsPointeroverState.stopPropagation());
      const hidden10 = lightStatisticsEntityMenuElement.hidden;
      (closeOtherPickerMenus(hidden10 ? "light-statistics-entity" : null),
        hidden10 &&
          lightStatisticsEntityMenuElement.parentElement !== document.body &&
          document.body.append(lightStatisticsEntityMenuElement),
        (lightStatisticsEntityMenuElement.hidden = !hidden10),
        (lightStatisticsEntityMenuElement.style.position = "fixed"),
        (lightStatisticsEntityMenuElement.style.zIndex = "760"),
        lightStatisticsEntityButtonElement.setAttribute("aria-expanded", String(hidden10)),
        hidden10 &&
          (renderLightStatisticsEntityOptions(lightStatisticsEntitySearchElement.value),
          positionLightStatisticsEntityMenu(),
          window.requestAnimationFrame(() => {
            (positionLightStatisticsEntityMenu(),
              lightStatisticsEntitySearchElement.focus({
                preventScroll: true,
              }));
          })));
    },
  ),
  lightStatisticsEntitySearchElement.addEventListener("input", () =>
    renderLightStatisticsEntityOptions(lightStatisticsEntitySearchElement.value),
  ),
  lightStatisticsEntityOptionsElement.addEventListener(
    "click",
    (effectAssetPointerOverEventState: any) => {
      const createdComponentElement = effectAssetPointerOverEventState.target.closest(
        "[data-light-statistics-entity-id]",
      );
      createdComponentElement &&
        (closePickerMenu(lightStatisticsEntityMenuElement, lightStatisticsEntityButtonElement),
        addLightStatisticsEntity(createdComponentElement.dataset.lightStatisticsEntityId));
    },
  ),
  lightStatisticsEntityConfirmElement.addEventListener("click", () => effectIconName()),
  lightStatisticsEntityListElement.addEventListener(
    "click",
    (onIconButtonEffectAssetOptionsClickState: any) => {
      const groupWidthElement = onIconButtonEffectAssetOptionsClickState.target.closest(
          "[data-light-statistics-replace-index]",
        ),
        groupHeightElement = onIconButtonEffectAssetOptionsClickState.target.closest(
          "[data-light-statistics-remove-index]",
        );
      if (groupHeightElement) {
        removeLightStatisticsEntityAt(Number(groupHeightElement.dataset.lightStatisticsRemoveIndex));
        return;
      }
      groupWidthElement &&
        ((editorCtx.statisticsEntityId = ""),
        (editorCtx.statisticsReplaceIndex = Number(groupWidthElement.dataset.lightStatisticsReplaceIndex)),
        (editorCtx.statisticsComponentId = editorCtx.selectedComponentId || ""),
        (lightStatisticsEntityPendingElement.hidden = true),
        showLightStatisticsMessage("请选择新的实体。"),
        setPickerButtonLabel(lightStatisticsEntityButtonElement, "选择替换实体"),
        lightStatisticsEntityButtonElement.click());
    },
  ),
  imageEntityButtonElement.addEventListener("click", () => {
    const hidden11 = imageEntityMenuElement.hidden;
    (closeOtherPickerMenus(hidden11 ? "entity" : null),
      (imageEntityMenuElement.hidden = !hidden11),
      imageEntityButtonElement.setAttribute("aria-expanded", String(hidden11)),
      hidden11 &&
        (renderRelatedPopupEntityOptions(imageEntitySearchElement.value),
        refreshImageAssetPickerPreview(),
        window.requestAnimationFrame(() => {
          (refreshImageAssetPickerPreview(),
            imageEntitySearchElement.focus({
              preventScroll: true,
            }));
        })));
  }),
  imageEntitySearchElement.addEventListener("input", () =>
    renderRelatedPopupEntityOptions(imageEntitySearchElement.value),
  ),
  imageEntityOptionsElement.addEventListener("click", (effectAssetClickEventState: any) => {
    const createdWidthElement = effectAssetClickEventState.target.closest("[data-entity-id]");
    if (!createdWidthElement || !editorCtx.selectedComponentId) return;
    const createdWidth = editorCtx.selectedComponentId,
      entityId = createdWidthElement.dataset.entityId;
    (closeOtherPickerMenus(),
      mutateDocument((createdHeightState: any) => {
        const effectAssetComponentId = findComponent2(createdHeightState, createdWidth)?.component;
        if (!effectAssetComponentId || effectAssetComponentId.type !== "image") return;
        const createdHeight = String(effectAssetComponentId.bindings?.entity?.entityId || "");
        if (
          ((effectAssetComponentId.bindings = {
            ...(effectAssetComponentId.bindings || {}),
          }),
          (effectAssetComponentId.properties = {
            ...(effectAssetComponentId.properties || {}),
            fit: "contain",
          }),
          entityId)
        )
          effectAssetComponentId.bindings.entity = {
            entityId: entityId,
          };
        else {
          delete effectAssetComponentId.bindings.entity;
          for (const sharedReferencePage of ["tap", "doubleTap", "hold"])
            actionNeedsCurrentEntity2(effectAssetComponentId.actions?.[sharedReferencePage]) &&
              delete effectAssetComponentId.actions[sharedReferencePage];
        }
        entityId !== createdHeight &&
          ((
            entityId
              ? relatedPopupContext2(
                  effectAssetComponentId,
                  entitiesByEntityId(),
                  devicesByDeviceId(),
                )
              : null
          )
            ? (effectAssetComponentId.properties.relatedEntities = manualRelatedEntityConfig2([]))
            : delete effectAssetComponentId.properties.relatedEntities);
      }));
  }));
}
