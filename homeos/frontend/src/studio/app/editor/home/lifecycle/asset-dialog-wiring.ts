/* 资源/项目/页面/页脚弹窗的按钮与表单装配。
 *
 * 从 `home/lifecycle/boot.ts` 整块搬出：只读 DOM 句柄与实现函数，
 * 写的是 `editorCtx` 与草稿文档，不回写闭包变量。
 */
export function bindAssetDialogWiring(deps: Record<string, any>): void {
  const {
    addComponentButtonElement,
    applyAssetNaturalSize,
    applyCollectionLayerOrder2,
    clone2,
    closeOtherPickerMenus,
    componentTemplateCloseElement,
    componentTemplateDialogElement,
    componentTemplateListElement,
    coverMotorButtonElement,
    createComponentFromTemplate2,
    discardRecoverySnapshot,
    documentSource,
    editorCtx,
    entityLoadError,
    errorDialogCloseButtonElement,
    errorDialogCloseElement,
    errorDialogConfirmElement,
    errorPhase,
    findAssetById,
    findComponent2,
    handleOperationError,
    hideAssetLargePreview,
    historyEntry,
    historyState,
    ibeAssetButtonElement,
    ibeAssetFolderElement,
    ibeAssetMenuElement,
    ibeAssetOptionsElement,
    ibeAssetSearchElement,
    imageAssetButtonElement,
    imageAssetFolderSelectElement,
    imageAssetMenuElement,
    imageAssetOptionsElement,
    imageAssetSearchInputElement,
    leftFolderName,
    loadNavigationIconOptions,
    measureAssetImageSize,
    mutateDocument,
    newId2,
    nextTemplateInstanceName2,
    pageSelectElement,
    positionEffectAssetMenu,
    positionImageAssetMenu,
    projectSelectElement,
    recoveryDialogElement,
    recoveryDiscardElement,
    recoveryDownloadElement,
    recoveryRestoreElement,
    setRecoverySaveAttempts,
    redoElement,
    refreshComponentDialogScale,
    reloadAssetCatalog,
    renderComponentLists,
    renderComponentTemplates,
    renderEditorWorkspace,
    renderEffectAssetOptions,
    renderImageAssetOptions,
    scheduleAssetPreview,
    selectComponent,
    setComponentScope,
    setEditorMode,
    settleAutoDiagramDialog,
    showDashboardPreviewButtonElement,
    showEditorPreviewButtonElement,
    showPageComponentsElement,
    showPageEditorElement,
    showPopupEditorElement,
    showSharedComponentsElement,
    syncAssetFolderOptions,
    syncDefaultPageAction,
    syncHistoryButtons,
    syncSharedComponentReferenceOrder2,
    undoElement,
    value,
    writeError,
  } = deps
  /* 图片 / 导图文件夹删除已迁 confirmAction（requestDeleteUserAsset / requestDeleteAssetFolder） */
  imageAssetButtonElement.addEventListener('click', async () => {
    const hidden13 = imageAssetMenuElement.hidden
    if (
      (closeOtherPickerMenus(hidden13 ? 'asset' : null),
      (imageAssetMenuElement.hidden = !hidden13),
      imageAssetButtonElement.setAttribute('aria-expanded', String(hidden13)),
      hidden13)
    ) {
      try {
        await reloadAssetCatalog({
          refreshInspector: false,
        }),
          leftFolderName('image')
      } catch (existingPopupModule: any) {
        handleOperationError(existingPopupModule)
      }
      renderImageAssetOptions(imageAssetSearchInputElement.value),
        positionImageAssetMenu(),
        window.requestAnimationFrame(() => {
          positionImageAssetMenu(),
            imageAssetSearchInputElement.focus({
              preventScroll: true,
            })
        })
    }
  }),
    imageAssetFolderSelectElement.addEventListener('change', () => {
      ;(editorCtx.imageAssetFolderState = imageAssetFolderSelectElement.value),
        (imageAssetSearchInputElement.value = ''),
        syncAssetFolderOptions('image'),
        renderImageAssetOptions()
    }),
    imageAssetSearchInputElement.addEventListener('input', () =>
      renderImageAssetOptions(imageAssetSearchInputElement.value),
    ),
    imageAssetOptionsElement.addEventListener('pointerover', (popupModuleDraftDocument: any) => {
      const popupModuleDraftPopupElement = popupModuleDraftDocument.target.closest('[data-asset-id]')
      if (
        !popupModuleDraftPopupElement ||
        popupModuleDraftPopupElement.contains(popupModuleDraftDocument.relatedTarget)
      )
        return
      const sn7 = findAssetById(popupModuleDraftPopupElement.dataset.assetId)
      scheduleAssetPreview(sn7, popupModuleDraftPopupElement)
    }),
    imageAssetOptionsElement.addEventListener('pointerleave', hideAssetLargePreview),
    imageAssetOptionsElement.addEventListener('scroll', hideAssetLargePreview),
    imageAssetOptionsElement.addEventListener('click', async (popupModulePopupMatch: any) => {
      const popupModuleExistingElement = popupModulePopupMatch.target.closest('[data-asset-id]')
      if (!popupModuleExistingElement || !editorCtx.selectedComponentId) return
      const popupModuleMatchState = editorCtx.selectedComponentId,
        assetId = popupModuleExistingElement.dataset.assetId
      if ((hideAssetLargePreview(), closeOtherPickerMenus(), !assetId)) {
        mutateDocument((popupModuleMatch: any) => {
          const removedDeviceType = findComponent2(popupModuleMatch, popupModuleMatchState)?.component
          !removedDeviceType ||
            removedDeviceType.type !== 'image' ||
            ((removedDeviceType.properties = {
              ...(removedDeviceType.properties || {}),
              fit: 'contain',
            }),
            delete removedDeviceType.properties.assetId,
            delete removedDeviceType.properties.naturalWidth,
            delete removedDeviceType.properties.naturalHeight)
        })
        return
      }
      const sn8 = findAssetById(assetId)
      if (sn8)
        try {
          const em2 = await measureAssetImageSize(sn8)
          mutateDocument((remainingPopupPropertiesState: any) => {
            const remainingPopupProperties = findComponent2(
              remainingPopupPropertiesState,
              popupModuleMatchState,
            )?.component
            !remainingPopupProperties ||
              remainingPopupProperties.type !== 'image' ||
              applyAssetNaturalSize(remainingPopupProperties, assetId, em2)
          })
        } catch (caughtErrorFlag: any) {
          handleOperationError(caughtErrorFlag)
        }
    }),
    ibeAssetButtonElement.addEventListener('click', async () => {
      const hidden14 = ibeAssetMenuElement.hidden
      if (
        (closeOtherPickerMenus(hidden14 ? 'ibe-asset' : null),
        (ibeAssetMenuElement.hidden = !hidden14),
        ibeAssetButtonElement.setAttribute('aria-expanded', String(hidden14)),
        !!hidden14)
      ) {
        try {
          await reloadAssetCatalog({
            refreshInspector: false,
          }),
            leftFolderName('ibe')
        } catch (caughtErrorSlot: any) {
          handleOperationError(caughtErrorSlot)
        }
        renderEffectAssetOptions(ibeAssetSearchElement.value),
          positionEffectAssetMenu(),
          window.requestAnimationFrame(() => {
            positionEffectAssetMenu(),
              ibeAssetSearchElement.focus({
                preventScroll: true,
              })
          })
      }
    }),
    ibeAssetFolderElement.addEventListener('change', () => {
      ;(editorCtx.effectAssetFolderState = ibeAssetFolderElement.value),
        (ibeAssetSearchElement.value = ''),
        syncAssetFolderOptions('ibe'),
        renderEffectAssetOptions()
    }),
    ibeAssetSearchElement.addEventListener('input', () => renderEffectAssetOptions(ibeAssetSearchElement.value)),
    ibeAssetOptionsElement.addEventListener('pointerover', (bindDocumentPointerSectionState: any) => {
      const bindDocumentPointerSectionElement = bindDocumentPointerSectionState.target.closest('[data-asset-id]')
      !bindDocumentPointerSectionElement ||
        bindDocumentPointerSectionElement.contains(bindDocumentPointerSectionState.relatedTarget) ||
        scheduleAssetPreview(
          findAssetById(bindDocumentPointerSectionElement.dataset.assetId),
          bindDocumentPointerSectionElement,
          ibeAssetMenuElement,
        )
    }),
    ibeAssetOptionsElement.addEventListener('pointerleave', hideAssetLargePreview),
    ibeAssetOptionsElement.addEventListener('scroll', hideAssetLargePreview),
    ibeAssetOptionsElement.addEventListener('click', async (bindDocumentPointerSection: any) => {
      const popupMenuRectElementElement = bindDocumentPointerSection.target.closest('[data-asset-id]'),
        entryStateKey = editorCtx.selectedComponentId
      if (!popupMenuRectElementElement || !entryStateKey) return
      const assetId2 = popupMenuRectElementElement.dataset.assetId
      hideAssetLargePreview(), closeOtherPickerMenus()
      const sn9 = assetId2 ? findAssetById(assetId2) : null
      let entryStatePath: any = null
      if (sn9)
        try {
          entryStatePath = await measureAssetImageSize(sn9)
        } catch (entryStateText: any) {
          handleOperationError(entryStateText)
          return
        }
      mutateDocument((entryStateCount: any) => {
        const onDocumentPointerdownState = findComponent2(entryStateCount, entryStateKey)?.component
        !onDocumentPointerdownState ||
          onDocumentPointerdownState.type !== 'icon-button-effect' ||
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
              delete onDocumentPointerdownState.properties.effectNaturalHeight))
      })
    }),
    undoElement.addEventListener('click', () => entityLoadError('undo')),
    redoElement.addEventListener('click', () => entityLoadError('redo')),
    recoveryRestoreElement.addEventListener('click', () => {
      // 冲突态不允许直接恢复：服务器已有别处更新，直接盖回去会丢别人的编辑。
      if (editorCtx.recoveryConflict) return
      if (!editorCtx.recoverySnapshot || !editorCtx.activeProject) {
        recoveryDialogElement.close()
        return
      }
      const Ne2 = editorCtx.recoverySnapshot
      // 0.8.4：恢复时把快照里记录的保存尝试接回来，后续保存继续累积指纹。
      setRecoverySaveAttempts(Array.isArray(Ne2.saveAttempts) ? clone2(Ne2.saveAttempts) : [])
      ;(editorCtx.recoverySnapshot = null),
        (editorCtx.recoveryConflict = false),
        (editorCtx.activeProject = {
          ...editorCtx.activeProject,
          document: clone2(Ne2.document),
        }),
        (editorCtx.selectedComponentId = findComponent2(editorCtx.activeProject.document, Ne2.selectedComponentId)
          ? Ne2.selectedComponentId
          : null)
      const onDocumentPointerdownValue = Array.isArray(Ne2.selectedComponentIds)
        ? Ne2.selectedComponentIds.filter((filteredItemsKey: any) =>
            findComponent2(editorCtx.activeProject.document, filteredItemsKey),
          )
        : []
      ;(editorCtx.selectedComponentIdsSet = new Set(
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
        syncHistoryButtons()
    }),
    recoveryDiscardElement.addEventListener('click', () => {
      discardRecoverySnapshot(editorCtx.activeProject?.projectId),
        (editorCtx.recoverySnapshot = null),
        (editorCtx.recoveryConflict = false),
        setRecoverySaveAttempts([]),
        recoveryDialogElement.close(),
        writeError(),
        syncHistoryButtons()
    }),
    recoveryDownloadElement.addEventListener('click', () => {
      // 冲突时唯一的「保底」出口：把整份未保存副本下载成 JSON，让用户自己核对。
      const downloadedRecovery = editorCtx.recoverySnapshot
      if (!downloadedRecovery || downloadedRecovery.projectId !== editorCtx.activeProject?.projectId) return
      const downloadUrl = URL.createObjectURL(
          new Blob([JSON.stringify({ format: 'ha-bridge-unsaved-recovery-v1', ...downloadedRecovery }, null, 2)], {
            type: 'application/json',
          }),
        ),
        downloadLink = document.createElement('a')
      ;(downloadLink.href = downloadUrl),
        (downloadLink.download = 'HA-Bridge-未保存副本.json'),
        document.body.append(downloadLink),
        downloadLink.click(),
        downloadLink.remove(),
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 0)
    }),
    recoveryDialogElement.addEventListener('cancel', (onDocumentPointerdownConfig: any) =>
      onDocumentPointerdownConfig.preventDefault(),
    ),
    errorDialogCloseElement.addEventListener('click', () => errorDialogCloseButtonElement.close()),
    errorDialogConfirmElement.addEventListener('click', () => errorDialogCloseButtonElement.close()),
    errorDialogCloseButtonElement.addEventListener('click', (onDocumentPointerdownRef: any) => {
      onDocumentPointerdownRef.target === errorDialogCloseButtonElement && errorDialogCloseButtonElement.close()
    }),
    showSharedComponentsElement.addEventListener('click', () => setComponentScope('shared')),
    showPageComponentsElement.addEventListener('click', () => setComponentScope('page')),
    addComponentButtonElement.addEventListener('click', () => {
      addComponentButtonElement.disabled ||
        (renderComponentTemplates(), componentTemplateDialogElement.showModal(), refreshComponentDialogScale())
    }),
    componentTemplateCloseElement.addEventListener('click', () => componentTemplateDialogElement.close()),
    componentTemplateDialogElement.addEventListener('click', (onDocumentPointerdown: any) => {
      onDocumentPointerdown.target === componentTemplateDialogElement && componentTemplateDialogElement.close()
    }),
    componentTemplateListElement.addEventListener('click', (documentPointerDownEvent: any) => {
      const deleteAssetFolderClosestElement = documentPointerDownEvent.target.closest('[data-template-id]'),
        imageAssetFolderMenuElement = pageSelectElement.value
      if (!deleteAssetFolderClosestElement || deleteAssetFolderClosestElement.disabled || !imageAssetFolderMenuElement)
        return
      const Ie7 = editorCtx.componentScopeState,
        jc5 = editorCtx.componentScope,
        effectAssetFolderMenuElement = editorCtx.activeGroupId
          ? findComponent2(editorCtx.activeProject?.document, editorCtx.activeGroupId)
          : null,
        component7 =
          effectAssetFolderMenuElement?.component?.type === 'group' ? effectAssetFolderMenuElement.component : null,
        scope3 = component7 ? effectAssetFolderMenuElement!.scope : jc5,
        scaleInputElements = newId2('component')
      componentTemplateDialogElement.close(),
        (editorCtx.selectedComponentId = scaleInputElements),
        (editorCtx.selectedComponentIdsSet = new Set([scaleInputElements])),
        (editorCtx.selectionAnchorComponentId = scaleInputElements)
      const scaleInputElementsState = mutateDocument((onPopupActionsMenuClickState: any) => {
        const scaleInputCaptureEventState = onPopupActionsMenuClickState.pages.find(
          (scaleInputCaptureEvent: any) => scaleInputCaptureEvent.path === imageAssetFolderMenuElement,
        )
        if (!scaleInputCaptureEventState) throw new Error('当前页面不存在。')
        const popupActionNameState = component7 ? findComponent2(onPopupActionsMenuClickState, component7.id) : null,
          component8 = popupActionNameState?.component?.type === 'group' ? popupActionNameState.component : null,
          sharedComponents3 =
            jc5 === 'shared' ? onPopupActionsMenuClickState.sharedComponents : scaleInputCaptureEventState.components,
          children2 = component8 ? component8.children || (component8.children = []) : sharedComponents3,
          popupActionTargetIdConfig =
            deleteAssetFolderClosestElement.dataset.templateId === 'flow-line'
              ? '流水线条'
              : deleteAssetFolderClosestElement.dataset.templateId === 'scene-mode'
                ? '情景模式'
                : deleteAssetFolderClosestElement.dataset.templateId === 'navigation-button'
                  ? '导航按钮'
                  : deleteAssetFolderClosestElement.dataset.templateId === 'interaction3d'
                    ? '3D 交互'
                    : deleteAssetFolderClosestElement.dataset.templateId === 'floorplan-auto-diagram'
                      ? '户型图自动导图'
                      : deleteAssetFolderClosestElement.dataset.templateId === 'icon-button-effect'
                        ? '图标按钮（效果）'
                        : deleteAssetFolderClosestElement.dataset.templateId === 'title-button'
                          ? '标题按钮'
                          : deleteAssetFolderClosestElement.dataset.templateId === 'light-statistics'
                            ? '数量统计'
                            : deleteAssetFolderClosestElement.dataset.templateId === 'icon-button'
                              ? '图标按钮'
                              : deleteAssetFolderClosestElement.dataset.templateId === 'device-button'
                                ? '设备按钮'
                                : deleteAssetFolderClosestElement.dataset.templateId === 'presence-sensor'
                                  ? '传感器'
                                  : deleteAssetFolderClosestElement.dataset.templateId === 'air-conditioner'
                                    ? '空调 / 浴霸'
                                    : deleteAssetFolderClosestElement.dataset.templateId === 'vacuum-map'
                                      ? '扫地机器人实时地图'
                                      : deleteAssetFolderClosestElement.dataset.templateId === 'camera'
                                        ? '摄像头实时预览'
                                        : deleteAssetFolderClosestElement.dataset.templateId === 'time'
                                          ? '时间'
                                          : deleteAssetFolderClosestElement.dataset.templateId === 'date'
                                            ? '日期'
                                            : deleteAssetFolderClosestElement.dataset.templateId === 'weather'
                                              ? '天气'
                                              : deleteAssetFolderClosestElement.dataset.templateId === 'percentage-bar'
                                                ? '百分比柱状图'
                                                : deleteAssetFolderClosestElement.dataset.templateId === 'line-chart'
                                                  ? '折线图'
                                                  : deleteAssetFolderClosestElement.dataset.templateId === 'panel-frame'
                                                    ? '底图框'
                                                    : deleteAssetFolderClosestElement.dataset.templateId ===
                                                        'event-log-wall'
                                                      ? '即时消息墙'
                                                      : '图片',
          scaleInputCaptureEventValue = nextTemplateInstanceName2(children2, popupActionTargetIdConfig),
          scaleInputValueState = createComponentFromTemplate2(deleteAssetFolderClosestElement.dataset.templateId, {
            id: scaleInputElements,
            instanceName: scaleInputCaptureEventValue,
            canvas: onPopupActionsMenuClickState.canvas,
          })
        if (component8) {
          const measuredBoundsOrigin = Number(component8.position?.width || 100),
            measuredBoundsDraft = Number(component8.position?.height || 100),
            scaleInputValue = Number(scaleInputValueState.position?.width || 100),
            scaledPlacements = Number(scaleInputValueState.position?.height || 100)
          scaleInputValueState.position = {
            ...(scaleInputValueState.position || {}),
            x: (measuredBoundsOrigin - scaleInputValue) / 2,
            y: (measuredBoundsDraft - scaledPlacements) / 2,
          }
        }
        if (
          (children2.unshift(scaleInputValueState),
          applyCollectionLayerOrder2(children2),
          scope3 === 'shared' && !component8)
        ) {
          for (const documentChangeEventState of onPopupActionsMenuClickState.pages)
            documentChangeEventState.sharedComponentIds = [
              scaleInputValueState.id,
              ...(documentChangeEventState.sharedComponentIds || []).filter(
                (documentChangeEvent: any) => documentChangeEvent !== scaleInputValueState.id,
              ),
            ]
          syncSharedComponentReferenceOrder2(onPopupActionsMenuClickState)
        }
      }, imageAssetFolderMenuElement)
      deleteAssetFolderClosestElement.dataset.templateId === 'floorplan-auto-diagram' &&
        scaleInputElementsState.then(() => {
          editorCtx.componentScopeState === Ie7 &&
            findComponent2(editorCtx.activeProject?.document, scaleInputElements) &&
            settleAutoDiagramDialog(scaleInputElements, {
              cancelRemovesComponent: true,
            })
        })
    }),
    showEditorPreviewButtonElement.addEventListener('click', () => setEditorMode('edit')),
    showDashboardPreviewButtonElement.addEventListener('click', () => setEditorMode('dashboard')),
    showPageEditorElement.addEventListener('click', () => setEditorMode('edit')),
    showPopupEditorElement.addEventListener('click', () => setEditorMode('popup')),
    projectSelectElement.addEventListener('change', () => {
      if (
        (errorPhase(),
        editorCtx.hasUnsavedChanges &&
          editorCtx.activeProject &&
          projectSelectElement.value !== editorCtx.activeProject.projectId)
      ) {
        ;(projectSelectElement.value = editorCtx.activeProject.projectId),
          loadNavigationIconOptions(projectSelectElement),
          documentSource()
        return
      }
      projectSelectElement.value && historyEntry(projectSelectElement.value).catch(handleOperationError)
    }),
    pageSelectElement.addEventListener('change', () => {
      value(),
        syncDefaultPageAction(),
        (editorCtx.activeGroupId = null),
        editorCtx.editorMode === 'popup' && setEditorMode('edit'),
        editorCtx.editorRenderer?.navigate(pageSelectElement.value),
        editorCtx.dashboardPreviewRenderer?.navigate(pageSelectElement.value)
      const changedScaledPlacements = findComponent2(editorCtx.activeProject?.document, editorCtx.selectedComponentId)
      changedScaledPlacements?.scope === 'page' &&
        changedScaledPlacements.page?.path !== pageSelectElement.value &&
        selectComponent(null),
        renderComponentLists(),
        coverMotorButtonElement()
    })
}
