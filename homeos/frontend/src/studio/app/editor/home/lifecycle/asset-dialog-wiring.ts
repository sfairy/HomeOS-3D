/* 资源/项目/页面/页脚弹窗的按钮与表单装配。
 *
 * 从 `home/lifecycle/boot.ts` 整块搬出：只读 DOM 句柄与实现函数，
 * 写的是 `editorCtx` 与草稿文档，不回写闭包变量。
 */
export function bindAssetDialogWiring(deps: Record<string, any>): void {
  const {
    addComponentButtonElement, applyAssetNaturalSize, applyCollectionLayerOrder2, clone2, closeOtherPickerMenus,
    componentTemplateCloseElement, componentTemplateDialogElement, componentTemplateListElement,
    coverMotorButtonElement, createComponentFromTemplate2, deleteAssetCancelButtonElement,
    deleteAssetCloseButtonElement, deleteAssetConfirmButtonElement, deleteAssetDialogElement,
    deleteAssetFolderCancelButtonElement, deleteAssetFolderCloseButtonElement,
    deleteAssetFolderConfirmButtonElement, deleteAssetFolderDialogElement, discardRecoverySnapshot,
    documentSource, editorCtx, entityLoadError, errorDialogCloseButtonElement, errorDialogCloseElement,
    errorDialogConfirmElement, errorPhase, findAssetById, findComponent2, handleOperationError,
    hideAssetLargePreview, historyEntry, historyState, ibeAssetButtonElement, ibeAssetFolderElement,
    ibeAssetMenuElement, ibeAssetOptionsElement, ibeAssetSearchElement, imageAssetButtonElement,
    imageAssetFolderSelectElement, imageAssetMenuElement, imageAssetOptionsElement,
    imageAssetSearchInputElement, leftFolderName, loadNavigationIconOptions, measureAssetImageSize,
    mutateDocument, newId2, nextTemplateInstanceName2, pageSelectElement, positionEffectAssetMenu,
    positionImageAssetMenu, projectSelectElement, projectSummary, recoveryDialogElement, recoveryDiscardElement,
    recoveryRestoreElement, redoElement, refreshAssetPickers, refreshComponentDialogScale, reloadAssetCatalog,
    renderComponentLists, renderComponentTemplates, renderEditorWorkspace, renderEffectAssetOptions,
    renderImageAssetOptions, requestJson, saveDraft, scheduleAssetPreview, selectComponent, setComponentScope,
    setEditorMode, settleAutoDiagramDialog, showDashboardPreviewButtonElement, showEditorPreviewButtonElement,
    showPageComponentsElement, showPageEditorElement, showPopupEditorElement, showSharedComponentsElement,
    soundToggleButtonElement, syncAssetFolderOptions, syncDefaultPageAction, syncHistoryButtons,
    syncSharedComponentReferenceOrder2, undoElement, value, writeError
  } = deps;
(deleteAssetCloseButtonElement.addEventListener("click", () => deleteAssetDialogElement.close()),
  deleteAssetCancelButtonElement.addEventListener("click", () => deleteAssetDialogElement.close()),
  deleteAssetDialogElement.addEventListener("click", (popupModuleDraftEntry: any) => {
    popupModuleDraftEntry.target === deleteAssetDialogElement && deleteAssetDialogElement.close();
  }),
  deleteAssetConfirmButtonElement.addEventListener("click", async () => {
    const replace5 = String(editorCtx.pendingDeleteAssetId || "").replace(/^user:/, "");
    if (/^[0-9a-f]{32}$/.test(replace5)) {
      deleteAssetConfirmButtonElement.disabled = true;
      try {
        (await requestJson("/assets/user/" + replace5, {
          method: "DELETE",
        }),
          (editorCtx.pendingDeleteAssetId = null),
          deleteAssetDialogElement.close(),
          await reloadAssetCatalog());
      } catch (caughtErrorIndex: any) {
        caughtErrorIndex?.code === "ASSET_IN_USE"
          ? handleOperationError(
              new Error("这张图片仍被户型图绘制或仪表盘使用，请先移除引用后再删除。"),
            )
          : handleOperationError(caughtErrorIndex);
      } finally {
        deleteAssetConfirmButtonElement.disabled = false;
      }
    }
  }),
  deleteAssetFolderCloseButtonElement.addEventListener("click", () =>
    deleteAssetFolderDialogElement.close(),
  ),
  deleteAssetFolderCancelButtonElement.addEventListener("click", () =>
    deleteAssetFolderDialogElement.close(),
  ),
  deleteAssetFolderDialogElement.addEventListener("click", (nextPopupModules: any) => {
    nextPopupModules.target === deleteAssetFolderDialogElement &&
      deleteAssetFolderDialogElement.close();
  }),
  deleteAssetFolderDialogElement.addEventListener("close", () => {
    deleteAssetFolderConfirmButtonElement.disabled || (editorCtx.pendingDeleteAssetFolder = null);
  }),
  deleteAssetFolderConfirmButtonElement.addEventListener("click", async () => {
    const Uc2 = editorCtx.pendingDeleteAssetFolder;
    if (Uc2?.folderName) {
      deleteAssetFolderConfirmButtonElement.disabled = true;
      try {
        (await requestJson("/studio3d/exports", {
          method: "DELETE",
          headers: {
            "X-Export-Folder": encodeURIComponent(Uc2.folderName),
          },
        }),
          (editorCtx.pendingDeleteAssetFolder = null),
          deleteAssetFolderDialogElement.close(),
          await reloadAssetCatalog({
            refreshInspector: false,
          }),
          refreshAssetPickers());
      } catch (caughtErrorTotal: any) {
        caughtErrorTotal?.code === "STUDIO3D_EXPORT_IN_USE"
          ? handleOperationError(
              new Error(
                "这个文件夹中的图片仍被仪表盘、弹窗或户型图绘制使用，请先移除引用后再删除。",
              ),
            )
          : handleOperationError(caughtErrorTotal);
      } finally {
        deleteAssetFolderConfirmButtonElement.disabled = false;
      }
    }
  }),
  imageAssetButtonElement.addEventListener("click", async () => {
    const hidden13 = imageAssetMenuElement.hidden;
    if (
      (closeOtherPickerMenus(hidden13 ? "asset" : null),
      (imageAssetMenuElement.hidden = !hidden13),
      imageAssetButtonElement.setAttribute("aria-expanded", String(hidden13)),
      hidden13)
    ) {
      try {
        (await reloadAssetCatalog({
          refreshInspector: false,
        }),
          leftFolderName("image"));
      } catch (existingPopupModule: any) {
        handleOperationError(existingPopupModule);
      }
      (renderImageAssetOptions(imageAssetSearchInputElement.value),
        positionImageAssetMenu(),
        window.requestAnimationFrame(() => {
          (positionImageAssetMenu(),
            imageAssetSearchInputElement.focus({
              preventScroll: true,
            }));
        }));
    }
  }),
  imageAssetFolderSelectElement.addEventListener("change", () => {
    ((editorCtx.imageAssetFolderState = imageAssetFolderSelectElement.value),
      (imageAssetSearchInputElement.value = ""),
      syncAssetFolderOptions("image"),
      renderImageAssetOptions());
  }),
  imageAssetSearchInputElement.addEventListener("input", () =>
    renderImageAssetOptions(imageAssetSearchInputElement.value),
  ),
  imageAssetOptionsElement.addEventListener("pointerover", (popupModuleDraftDocument: any) => {
    const popupModuleDraftPopupElement = popupModuleDraftDocument.target.closest("[data-asset-id]");
    if (
      !popupModuleDraftPopupElement ||
      popupModuleDraftPopupElement.contains(popupModuleDraftDocument.relatedTarget)
    )
      return;
    const sn7 = findAssetById(popupModuleDraftPopupElement.dataset.assetId);
    scheduleAssetPreview(sn7, popupModuleDraftPopupElement);
  }),
  imageAssetOptionsElement.addEventListener("pointerleave", hideAssetLargePreview),
  imageAssetOptionsElement.addEventListener("scroll", hideAssetLargePreview),
  imageAssetOptionsElement.addEventListener("click", async (popupModulePopupMatch: any) => {
    const popupModuleExistingElement = popupModulePopupMatch.target.closest("[data-asset-id]");
    if (!popupModuleExistingElement || !editorCtx.selectedComponentId) return;
    const popupModuleMatchState = editorCtx.selectedComponentId,
      assetId = popupModuleExistingElement.dataset.assetId;
    if ((hideAssetLargePreview(), closeOtherPickerMenus(), !assetId)) {
      mutateDocument((popupModuleMatch: any) => {
        const removedDeviceType = findComponent2(
          popupModuleMatch,
          popupModuleMatchState,
        )?.component;
        !removedDeviceType ||
          removedDeviceType.type !== "image" ||
          ((removedDeviceType.properties = {
            ...(removedDeviceType.properties || {}),
            fit: "contain",
          }),
          delete removedDeviceType.properties.assetId,
          delete removedDeviceType.properties.naturalWidth,
          delete removedDeviceType.properties.naturalHeight);
      });
      return;
    }
    const sn8 = findAssetById(assetId);
    if (sn8)
      try {
        const em2 = await measureAssetImageSize(sn8);
        mutateDocument((remainingPopupPropertiesState: any) => {
          const remainingPopupProperties = findComponent2(
            remainingPopupPropertiesState,
            popupModuleMatchState,
          )?.component;
          !remainingPopupProperties ||
            remainingPopupProperties.type !== "image" ||
            applyAssetNaturalSize(remainingPopupProperties, assetId, em2);
        });
      } catch (caughtErrorFlag: any) {
        handleOperationError(caughtErrorFlag);
      }
  }),
  ibeAssetButtonElement.addEventListener("click", async () => {
    const hidden14 = ibeAssetMenuElement.hidden;
    if (
      (closeOtherPickerMenus(hidden14 ? "ibe-asset" : null),
      (ibeAssetMenuElement.hidden = !hidden14),
      ibeAssetButtonElement.setAttribute("aria-expanded", String(hidden14)),
      !!hidden14)
    ) {
      try {
        (await reloadAssetCatalog({
          refreshInspector: false,
        }),
          leftFolderName("ibe"));
      } catch (caughtErrorSlot: any) {
        handleOperationError(caughtErrorSlot);
      }
      (renderEffectAssetOptions(ibeAssetSearchElement.value),
        positionEffectAssetMenu(),
        window.requestAnimationFrame(() => {
          (positionEffectAssetMenu(),
            ibeAssetSearchElement.focus({
              preventScroll: true,
            }));
        }));
    }
  }),
  ibeAssetFolderElement.addEventListener("change", () => {
    ((editorCtx.effectAssetFolderState = ibeAssetFolderElement.value),
      (ibeAssetSearchElement.value = ""),
      syncAssetFolderOptions("ibe"),
      renderEffectAssetOptions());
  }),
  ibeAssetSearchElement.addEventListener("input", () =>
    renderEffectAssetOptions(ibeAssetSearchElement.value),
  ),
  ibeAssetOptionsElement.addEventListener("pointerover", (bindDocumentPointerSectionState: any) => {
    const bindDocumentPointerSectionElement =
      bindDocumentPointerSectionState.target.closest("[data-asset-id]");
    !bindDocumentPointerSectionElement ||
      bindDocumentPointerSectionElement.contains(bindDocumentPointerSectionState.relatedTarget) ||
      scheduleAssetPreview(
        findAssetById(bindDocumentPointerSectionElement.dataset.assetId),
        bindDocumentPointerSectionElement,
        ibeAssetMenuElement,
      );
  }),
  ibeAssetOptionsElement.addEventListener("pointerleave", hideAssetLargePreview),
  ibeAssetOptionsElement.addEventListener("scroll", hideAssetLargePreview),
  ibeAssetOptionsElement.addEventListener("click", async (bindDocumentPointerSection: any) => {
    const popupMenuRectElementElement =
        bindDocumentPointerSection.target.closest("[data-asset-id]"),
      entryStateKey = editorCtx.selectedComponentId;
    if (!popupMenuRectElementElement || !entryStateKey) return;
    const assetId2 = popupMenuRectElementElement.dataset.assetId;
    (hideAssetLargePreview(), closeOtherPickerMenus());
    const sn9 = assetId2 ? findAssetById(assetId2) : null;
    let entryStatePath: any = null;
    if (sn9)
      try {
        entryStatePath = await measureAssetImageSize(sn9);
      } catch (entryStateText: any) {
        handleOperationError(entryStateText);
        return;
      }
    mutateDocument((entryStateCount: any) => {
      const onDocumentPointerdownState = findComponent2(entryStateCount, entryStateKey)?.component;
      !onDocumentPointerdownState ||
        onDocumentPointerdownState.type !== "icon-button-effect" ||
        ((onDocumentPointerdownState.properties = {
          ...(onDocumentPointerdownState.properties || {}),
        }),
        assetId2 && entryStatePath
          ? ((onDocumentPointerdownState.properties.effectAssetId = assetId2),
            (onDocumentPointerdownState.properties.effectNaturalWidth = entryStatePath.width),
            (onDocumentPointerdownState.properties.effectNaturalHeight = entryStatePath.height),
            delete onDocumentPointerdownState.properties.effectWidth,
            delete onDocumentPointerdownState.properties.effectHeight)
          : (delete onDocumentPointerdownState.properties.effectAssetId,
            delete onDocumentPointerdownState.properties.effectNaturalWidth,
            delete onDocumentPointerdownState.properties.effectNaturalHeight));
    });
  }),
  undoElement.addEventListener("click", () => entityLoadError("undo")),
  redoElement.addEventListener("click", () => entityLoadError("redo")),
  recoveryRestoreElement.addEventListener("click", () => {
    if (!editorCtx.recoverySnapshot || !editorCtx.activeProject) {
      recoveryDialogElement.close();
      return;
    }
    const Ne2 = editorCtx.recoverySnapshot;
    ((editorCtx.recoverySnapshot = null),
      (editorCtx.activeProject = {
        ...editorCtx.activeProject,
        document: clone2(Ne2.document),
      }),
      (editorCtx.selectedComponentId = findComponent2(editorCtx.activeProject.document, Ne2.selectedComponentId)
        ? Ne2.selectedComponentId
        : null));
    const onDocumentPointerdownValue = Array.isArray(Ne2.selectedComponentIds)
      ? Ne2.selectedComponentIds.filter((filteredItemsKey: any) =>
          findComponent2(editorCtx.activeProject.document, filteredItemsKey),
        )
      : [];
    ((editorCtx.selectedComponentIdsSet = new Set(
      onDocumentPointerdownValue.length
        ? onDocumentPointerdownValue
        : editorCtx.selectedComponentId
          ? [editorCtx.selectedComponentId]
          : [],
    )),
      (editorCtx.selectionAnchorComponentId = editorCtx.selectedComponentId),
      (historyState.undo = Array.isArray(Ne2.undo) ? clone2(Ne2.undo) : []),
      (historyState.redo = Array.isArray(Ne2.redo) ? clone2(Ne2.redo) : []),
      recoveryDialogElement.close(),
      renderEditorWorkspace(Ne2.selectedPath || null),
      writeError(),
      syncHistoryButtons());
  }),
  recoveryDiscardElement.addEventListener("click", () => {
    (discardRecoverySnapshot(editorCtx.activeProject?.projectId),
      (editorCtx.recoverySnapshot = null),
      recoveryDialogElement.close(),
      writeError(),
      syncHistoryButtons());
  }),
  recoveryDialogElement.addEventListener("cancel", (onDocumentPointerdownConfig: any) =>
    onDocumentPointerdownConfig.preventDefault(),
  ),
  errorDialogCloseElement.addEventListener("click", () => errorDialogCloseButtonElement.close()),
  errorDialogConfirmElement.addEventListener("click", () => errorDialogCloseButtonElement.close()),
  errorDialogCloseButtonElement.addEventListener("click", (onDocumentPointerdownRef: any) => {
    onDocumentPointerdownRef.target === errorDialogCloseButtonElement &&
      errorDialogCloseButtonElement.close();
  }),
  showSharedComponentsElement.addEventListener("click", () => setComponentScope("shared")),
  showPageComponentsElement.addEventListener("click", () => setComponentScope("page")),
  addComponentButtonElement.addEventListener("click", () => {
    addComponentButtonElement.disabled ||
      (renderComponentTemplates(),
      componentTemplateDialogElement.showModal(),
      refreshComponentDialogScale());
  }),
  componentTemplateCloseElement.addEventListener("click", () =>
    componentTemplateDialogElement.close(),
  ),
  componentTemplateDialogElement.addEventListener("click", (onDocumentPointerdown: any) => {
    onDocumentPointerdown.target === componentTemplateDialogElement &&
      componentTemplateDialogElement.close();
  }),
  componentTemplateListElement.addEventListener("click", (documentPointerDownEvent: any) => {
    const deleteAssetFolderClosestElement =
        documentPointerDownEvent.target.closest("[data-template-id]"),
      imageAssetFolderMenuElement = pageSelectElement.value;
    if (
      !deleteAssetFolderClosestElement ||
      deleteAssetFolderClosestElement.disabled ||
      !imageAssetFolderMenuElement
    )
      return;
    const Ie7 = editorCtx.componentScopeState,
      jc5 = editorCtx.componentScope,
      effectAssetFolderMenuElement = editorCtx.activeGroupId
        ? findComponent2(editorCtx.activeProject?.document, editorCtx.activeGroupId)
        : null,
      component7 =
        effectAssetFolderMenuElement?.component?.type === "group"
          ? effectAssetFolderMenuElement.component
          : null,
      scope3 = component7 ? effectAssetFolderMenuElement!.scope : jc5,
      scaleInputElements = newId2("component");
    (componentTemplateDialogElement.close(),
      (editorCtx.selectedComponentId = scaleInputElements),
      (editorCtx.selectedComponentIdsSet = new Set([scaleInputElements])),
      (editorCtx.selectionAnchorComponentId = scaleInputElements));
    const scaleInputElementsState = mutateDocument((onPopupActionsMenuClickState: any) => {
      const scaleInputCaptureEventState = onPopupActionsMenuClickState.pages.find(
        (scaleInputCaptureEvent: any) => scaleInputCaptureEvent.path === imageAssetFolderMenuElement,
      );
      if (!scaleInputCaptureEventState) throw new Error("当前页面不存在。");
      const popupActionNameState = component7
          ? findComponent2(onPopupActionsMenuClickState, component7.id)
          : null,
        component8 =
          popupActionNameState?.component?.type === "group" ? popupActionNameState.component : null,
        sharedComponents3 =
          jc5 === "shared"
            ? onPopupActionsMenuClickState.sharedComponents
            : scaleInputCaptureEventState.components,
        children2 = component8
          ? component8.children || (component8.children = [])
          : sharedComponents3,
        popupActionTargetIdConfig =
          deleteAssetFolderClosestElement.dataset.templateId === "flow-line"
            ? "流水线条"
            : deleteAssetFolderClosestElement.dataset.templateId === "scene-mode"
              ? "情景模式"
              : deleteAssetFolderClosestElement.dataset.templateId === "navigation-button"
                ? "导航按钮"
                : deleteAssetFolderClosestElement.dataset.templateId === "interaction3d"
                  ? "3D 交互"
                  : deleteAssetFolderClosestElement.dataset.templateId === "floorplan-auto-diagram"
                    ? "户型图自动导图"
                    : deleteAssetFolderClosestElement.dataset.templateId === "icon-button-effect"
                      ? "图标按钮（效果）"
                      : deleteAssetFolderClosestElement.dataset.templateId === "title-button"
                        ? "标题按钮"
                        : deleteAssetFolderClosestElement.dataset.templateId === "light-statistics"
                          ? "数量统计"
                          : deleteAssetFolderClosestElement.dataset.templateId === "icon-button"
                            ? "图标按钮"
                            : deleteAssetFolderClosestElement.dataset.templateId === "device-button"
                              ? "设备按钮"
                              : deleteAssetFolderClosestElement.dataset.templateId ===
                                  "presence-sensor"
                                ? "传感器"
                                : deleteAssetFolderClosestElement.dataset.templateId ===
                                    "air-conditioner"
                                  ? "空调 / 浴霸"
                                  : deleteAssetFolderClosestElement.dataset.templateId ===
                                      "vacuum-map"
                                    ? "扫地机器人实时地图"
                                    : deleteAssetFolderClosestElement.dataset.templateId ===
                                        "camera"
                                      ? "摄像头实时预览"
                                      : deleteAssetFolderClosestElement.dataset.templateId ===
                                          "time"
                                        ? "时间"
                                        : deleteAssetFolderClosestElement.dataset.templateId ===
                                            "date"
                                          ? "日期"
                                          : deleteAssetFolderClosestElement.dataset.templateId ===
                                              "weather"
                                            ? "天气"
                                            : deleteAssetFolderClosestElement.dataset.templateId ===
                                                "percentage-bar"
                                              ? "百分比柱状图"
                                              : deleteAssetFolderClosestElement.dataset
                                                    .templateId === "line-chart"
                                                ? "折线图"
                                                : deleteAssetFolderClosestElement.dataset
                                                      .templateId === "panel-frame"
                                                  ? "底图框"
                                                  : deleteAssetFolderClosestElement.dataset
                                                        .templateId === "event-log-wall"
                                                    ? "即时消息墙"
                                                    : "图片",
        scaleInputCaptureEventValue = nextTemplateInstanceName2(
          children2,
          popupActionTargetIdConfig,
        ),
        scaleInputValueState = createComponentFromTemplate2(
          deleteAssetFolderClosestElement.dataset.templateId,
          {
            id: scaleInputElements,
            instanceName: scaleInputCaptureEventValue,
            canvas: onPopupActionsMenuClickState.canvas,
          },
        );
      if (component8) {
        const measuredBoundsOrigin = Number(component8.position?.width || 100),
          measuredBoundsDraft = Number(component8.position?.height || 100),
          scaleInputValue = Number(scaleInputValueState.position?.width || 100),
          scaledPlacements = Number(scaleInputValueState.position?.height || 100);
        scaleInputValueState.position = {
          ...(scaleInputValueState.position || {}),
          x: (measuredBoundsOrigin - scaleInputValue) / 2,
          y: (measuredBoundsDraft - scaledPlacements) / 2,
        };
      }
      if (
        (children2.unshift(scaleInputValueState),
        applyCollectionLayerOrder2(children2),
        scope3 === "shared" && !component8)
      ) {
        for (const documentChangeEventState of onPopupActionsMenuClickState.pages)
          documentChangeEventState.sharedComponentIds = [
            scaleInputValueState.id,
            ...(documentChangeEventState.sharedComponentIds || []).filter(
              (documentChangeEvent: any) => documentChangeEvent !== scaleInputValueState.id,
            ),
          ];
        syncSharedComponentReferenceOrder2(onPopupActionsMenuClickState);
      }
    }, imageAssetFolderMenuElement);
    deleteAssetFolderClosestElement.dataset.templateId === "floorplan-auto-diagram" &&
      scaleInputElementsState.then(() => {
        editorCtx.componentScopeState === Ie7 &&
          findComponent2(editorCtx.activeProject?.document, scaleInputElements) &&
          settleAutoDiagramDialog(scaleInputElements, {
            cancelRemovesComponent: true,
          });
      });
  }),
  showEditorPreviewButtonElement.addEventListener("click", () => setEditorMode("edit")),
  showDashboardPreviewButtonElement.addEventListener("click", () => setEditorMode("dashboard")),
  soundToggleButtonElement.addEventListener("click", async () => {
    if (!editorCtx.activeProject) return;
    const changeInputValue = clone2(editorCtx.activeProject.document);
    changeInputValue.soundEnabled = editorCtx.activeProject.document.soundEnabled === false;
    try {
      if (!(await projectSummary(changeInputValue))) return;
      await saveDraft();
    } catch (selectedComponentIdSet: any) {
      handleOperationError(selectedComponentIdSet);
    }
  }),
  showPageEditorElement.addEventListener("click", () => setEditorMode("edit")),
  showPopupEditorElement.addEventListener("click", () => setEditorMode("popup")),
  projectSelectElement.addEventListener("change", () => {
    if (
      (errorPhase(),
      editorCtx.hasUnsavedChanges && editorCtx.activeProject && projectSelectElement.value !== editorCtx.activeProject.projectId)
    ) {
      ((projectSelectElement.value = editorCtx.activeProject.projectId),
        loadNavigationIconOptions(projectSelectElement),
        documentSource());
      return;
    }
    projectSelectElement.value &&
      historyEntry(projectSelectElement.value).catch(handleOperationError);
  }),
  pageSelectElement.addEventListener("change", () => {
    (value(),
      syncDefaultPageAction(),
      (editorCtx.activeGroupId = null),
      editorCtx.editorMode === "popup" && setEditorMode("edit"),
      editorCtx.editorRenderer?.navigate(pageSelectElement.value),
      editorCtx.dashboardPreviewRenderer?.navigate(pageSelectElement.value));
    const changedScaledPlacements = findComponent2(editorCtx.activeProject?.document, editorCtx.selectedComponentId);
    (changedScaledPlacements?.scope === "page" &&
      changedScaledPlacements.page?.path !== pageSelectElement.value &&
      selectComponent(null),
      renderComponentLists(),
      coverMotorButtonElement());
  }));
}
