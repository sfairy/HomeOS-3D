/*
 * 区块一：文档生命周期与组件渲染。
 */

// registry.js 是控件注册表的唯一出处，本文件只消费不注册。
import {
  prewarmCameraMedia,
  renderAirConditionerAirflowLayer,
  renderIconButtonEffectLayer,
  renderRegisteredComponent,
  setBuiltinAssetVersions,
  staticAssetImageSource
} from "../registry.js?v=2609271411";
import { resolveStateEntry } from "../../../utils/state-entry.js?v=2609271411";
import {
  applyXiaomiDeviceProfile,
  resolveXiaomiDeviceProfile
} from "../device-profiles.js?v=2609271411";
import { airflowLayerGeometry } from "../../geometry/transform-geometry.js?v=2609271411";
import {
  componentHostZIndex,
  effectCropRectangle,
  effectCroppedLayerGeometry,
  effectFadeDuration,
  effectReferenceImageTransform,
  effectSourceDimensions,
  normalizeIconButtonEffectComponent
} from "../../geometry/effect-geometry.js?v=2609271411";
import { collectComponents, collectEntityIds } from "../runtime-document.js?v=2609271411";
import { isSupportedComponentAction } from "./primitives.js?v=2609271411";

export const documentCoreMethods = {
  /**
   * 装载一份仪表盘文档并渲染出指定页面。
   */
  setDocument(documentData, pagePath = null) {
    this.destroyed = false;
    // 只有编辑态才做宿主复用：3D 舞台要重建 WebGL 上下文，楼层平面图要重跑预览，
    const retainedInteraction3dHosts = this.options.editable
      ? new Map(
          [...this.componentHosts].filter(
            ([hostComponentId, hostComponentElement]) =>
              (this.componentRecords.get(hostComponentId)?.type === "floorplan-auto-diagram" &&
                hostComponentElement.querySelector(".hb-floorplan-auto-diagram-preview")) ||
              (this.document?.projectId === documentData.projectId &&
                this.componentRecords.get(hostComponentId)?.type === "interaction3d" &&
                hostComponentElement.parentElement === this.canvas)
          )
        )
      : null;
    const previousReplacingDocument = this.replacingDocument;
    // 用一个布尔标记整段换文档过程：期间会触发 resize / 状态推送等异步回调，
    this.replacingDocument = true;
    try {
      window.clearTimeout(this.historyRetryTimer);
      this.historyRetryTimer = 0;
      this.historyRetryAttempt = 0;
      window.clearTimeout(this.runtimeHydrationRetryTimer);
      this.runtimeHydrationRetryTimer = null;
      this.runtimeHydrationRetryAttempt = 0;
      this.closeRuntimeDialog();
      if (this.runtimeStaticImageCache.stopped) {
        this.runtimeStaticImageCache.reset();
      }
      if (this.runtimeEffectImageLoader.stopped) {
        this.runtimeEffectImageLoader.reset();
      }
      if (this.runtimeVacuumMapImagePreloader.stopped) {
        this.runtimeVacuumMapImagePreloader.reset();
      }
      this.activePopupId = null;
      this.historySeries.clear();
      this.historyFetches.clear();
      this.historyDocumentGeneration += 1;
      this.historyPopupGeneration += 1;
      this.removedRuntimeEntityIds.clear();
      // 编辑态深拷贝一份：编辑器会就地改这份文档并频繁预览，直接改后端下发的对象
      this.document = this.options.editable ? structuredClone(documentData) : documentData;
      this.vacuumMapEntityIds = new Set(
        collectComponents(
          [
            ...(this.document.sharedComponents || []),
            ...this.document.pages.flatMap(pageEntry => pageEntry.components || [])
          ],
          vacuumMapComponent => vacuumMapComponent.type === "vacuum-map"
        )
          .map(vacuumMapRecord => String(vacuumMapRecord.bindings?.entity?.entityId || ""))
          .filter(entityIdString => entityIdString.startsWith("image."))
      );
      const matchedPage = this.document.pages.find(explicitPage => explicitPage.path === pagePath);
      const defaultPageRecord = this.document.pages.find(
        fallbackPage => fallbackPage.path === this.document.defaultPagePath
      );
      this.page = matchedPage || defaultPageRecord || this.document.pages[0];
      this.render(retainedInteraction3dHosts);
      this.preloadStaticImages();
      if (!this.options.editable) {
        const prewarmEntityIds = collectComponents(
          [
            ...(this.document.sharedComponents || []),
            ...this.document.pages.flatMap(documentPage => documentPage.components || [])
          ],
          cameraComponent =>
            cameraComponent.type === "camera" &&
            cameraComponent.properties?.mediaVisible !== false &&
            cameraComponent.properties?.displayMode !== "snapshot"
        )
          .map(cameraEntityId => String(cameraEntityId.bindings?.entity?.entityId || ""))
          .filter(Boolean);
        prewarmCameraMedia(prewarmEntityIds);
      }
      this.connectRuntime();
      this.refreshHistorySeries();
    } finally {
      this.replacingDocument = previousReplacingDocument;
    }
  },
  /**
   * 用最新的资产版本戳刷新内置素材（图标、图片等）。
   */
  refreshBuiltinAssets(assetVersionEntries = []) {
    const assetVersionResult = setBuiltinAssetVersions(assetVersionEntries);
    if (assetVersionResult && this.document) {
      this.renderComponents(true);
      this.preloadStaticImages();
    }
    return assetVersionResult;
  },
  /**
   * 把文档里用到的静态图片交给图片缓存分层预载。
   */
  preloadStaticImages() {
    if (!this.document || !this.page) {
      return;
    }
    /**
     * 从组件树中挑出「图片组件」并解析成静态资源地址，供后续分层预载。
     */
    const collectAssetImageSources = components =>
      collectComponents(
        components,
        imageComponent => imageComponent.type === "image" && imageComponent.properties?.assetId
      )
        .map(assetComponent => staticAssetImageSource(assetComponent.properties.assetId))
        .filter(Boolean);
    const sharedComponentById = new Map(
      (this.document.sharedComponents || []).map(sharedComponent => [
        sharedComponent.id,
        sharedComponent
      ])
    );
    // 当前页引用的共享组件（按文档索引解引用，缺失的引用直接丢弃）。
    const pageSharedComponents = (this.page.sharedComponentIds || [])
      .map(sharedComponentId => sharedComponentById.get(sharedComponentId))
      .filter(Boolean);
    const currentPageSources = collectAssetImageSources([
      ...(this.page.components || []),
      ...pageSharedComponents
    ]);
    const allDocumentSources = collectAssetImageSources([
      ...(this.document.sharedComponents || []),
      ...this.document.pages.flatMap(runtimePage => runtimePage.components || [])
    ]);
    this.runtimeStaticImageCache.setSources(allDocumentSources, currentPageSources);
  },
  /**
   * 注入实体目录、翻译表与设备目录，随后整体重渲染并重新订阅。
   */
  setEntityCatalog(entityRecords = [], translationTable = {}, deviceRecords = []) {
    this.entityMetadata = new Map(
      (entityRecords || [])
        .map(entityRecord => [String(entityRecord.entityId || ""), entityRecord])
        .filter(([entityIdKey]) => entityIdKey)
    );
    this.deviceMetadata = new Map(
      (deviceRecords || [])
        .map(deviceRecord => [String(deviceRecord.deviceId || ""), deviceRecord])
        .filter(([deviceIdKey]) => deviceIdKey)
    );
    this.entityTranslations =
      translationTable && typeof translationTable == "object" ? translationTable : {};
    this.entityCatalogReady = true;
    this.tryOpenPendingEntityDetails();
    if (this.document) {
      this.detailsStateSync?.refreshEntityCatalog?.();
      this.renderComponents(true);
      this.connectRuntime();
    }
  },
  /**
   * 取实体所属设备的画像（型号、角色、能力等，见 device-profiles.js）。
   */
  deviceProfile(entityIdInput) {
    return resolveXiaomiDeviceProfile(
      entityIdInput,
      this.entityMetadata,
      this.deviceMetadata,
      this.states
    );
  },
  /**
   * 把实体 ID 归一成字符串。
   */
  runtimeEntityId(rawEntityId) {
    return String(rawEntityId || "");
  },
  /**
   * 给组件套上设备画像（小米等集成需要按设备型号补齐属性与绑定）。
   */
  profiledComponent(
    profiledComponentInput,
    profileEntityId = profiledComponentInput?.bindings?.entity?.entityId || ""
  ) {
    return applyXiaomiDeviceProfile(
      profiledComponentInput,
      this.deviceProfile(this.runtimeEntityId(profileEntityId)) ||
        this.deviceProfile(profileEntityId)
    );
  },
  /**
   * 把详情弹窗挂起，等数据就绪后再自动打开。
   */
  deferEntityDetailsUntilReady(deferredComponent, previewOptions, deferReason = "water-heater") {
    window.clearTimeout(this.pendingEntityDetails?.timer);
    window.clearTimeout(this.pendingEntityDetails?.retryTimer);
    const pendingDetails = {
      component: structuredClone(deferredComponent),
      preview: previewOptions,
      reason: deferReason,
      retryTimer: null,
      timer: null
    };
    // 目录类挂起用轮询重试（目录到达时间不可预期），状态类挂起只等状态推送，
    const isCatalogDeferred = deferReason === "catalog" || deferReason === "electric-bed-catalog";
    if (isCatalogDeferred) {
      const retryPendingDetails = () => {
        if (this.pendingEntityDetails !== pendingDetails) {
          return;
        }
        const deferredEntityId = this.runtimeEntityId(
          pendingDetails.component?.bindings?.entity?.entityId
        );
        if (
          !this.entityCatalogReady ||
          (deferReason === "electric-bed-catalog" &&
            this.deviceProfile(deferredEntityId)?.deviceType !== "electric-bed")
        ) {
          // 轮询间隔 260ms：目录通常在渲染后一两百毫秒内到，间隔再大用户能感到卡顿。
          pendingDetails.retryTimer = window.setTimeout(retryPendingDetails, 260);
          return;
        }
        window.clearTimeout(pendingDetails.timer);
        this.pendingEntityDetails = null;
        void this.showEntityDetails(pendingDetails.component, {
          preview: pendingDetails.preview
        });
      };
      pendingDetails.retryTimer = window.setTimeout(retryPendingDetails, 260);
    }
    pendingDetails.timer = window.setTimeout(
      () => {
        if (this.pendingEntityDetails === pendingDetails) {
          this.pendingEntityDetails = null;
          if (
            isCatalogDeferred &&
            this.detailsDialog?.classList.contains("electric-bed-loading-details")
          ) {
            this.detailsDialog.close();
          }
          if (isCatalogDeferred) {
            this.options.onError?.(new Error("设备信息正在加载，请稍后重试。"));
          } else {
            this.options.onError?.(new Error("热水器状态正在加载，请稍后重试。"));
          }
        }
      },
      // 目录可能因网络慢而迟到，给 10s；热水器状态是本机推送，3s 不到就基本没戏，
      isCatalogDeferred ? 10000 : 3000
    );
    this.pendingEntityDetails = pendingDetails;
  },
  /**
   * 尝试打开此前挂起的详情弹窗（数据到达后由状态推送或目录注入触发）。
   */
  tryOpenPendingEntityDetails() {
    const activePendingDetails = this.pendingEntityDetails;
    if (!activePendingDetails) {
      return false;
    }
    const pendingEntityId = this.runtimeEntityId(
      activePendingDetails.component?.bindings?.entity?.entityId
    );
    if (
      !this.entityCatalogReady ||
      (activePendingDetails.reason === "water-heater" &&
        !this.waterHeaterDetailsReady(pendingEntityId)) ||
      (activePendingDetails.reason === "electric-bed-catalog" &&
        this.deviceProfile(pendingEntityId)?.deviceType !== "electric-bed")
    ) {
      return false;
    } else {
      window.clearTimeout(activePendingDetails.timer);
      this.pendingEntityDetails = null;
      void this.showEntityDetails(activePendingDetails.component, {
        preview: activePendingDetails.preview
      });
      return true;
    }
  },
  /**
   * 判断热水器详情所需的状态数据是否已就绪。
   */
  waterHeaterDetailsReady(waterHeaterEntityId) {
    if (!this.entityCatalogReady) {
      return false;
    }
    const waterHeaterState = this.states.get(waterHeaterEntityId);
    const waterHeaterAttributes =
      resolveStateEntry(waterHeaterState)?.attributes || {};
    const currentTemperature = Number(waterHeaterAttributes.temperature);
    const minTemperature = Number(waterHeaterAttributes.min_temp);
    const maxTemperature = Number(waterHeaterAttributes.max_temp);
    return (
      Number.isFinite(currentTemperature) &&
      Number.isFinite(minTemperature) &&
      Number.isFinite(maxTemperature) &&
      maxTemperature > minTemperature
    );
  },
  /**
   * 建立（或复用）画布与视口，并渲染当前页的全部组件。
   */
  render(retainedHostMap = null) {
    const canReuseHosts =
      !!retainedHostMap?.size &&
      !!this.canvas?.isConnected &&
      !!this.viewport?.isConnected &&
      !![...retainedHostMap.values()].some(
        candidateRetainedHost => candidateRetainedHost.parentElement === this.canvas
      );
    if (!canReuseHosts) {
      this.cleanupComponents();
      this.container.replaceChildren();
    }
    this.container.dataset.uiTheme = this.document?.theme?.name || "";
    for (const staleThemeVariable of this.themeVariableNames) {
      this.container.style.removeProperty(staleThemeVariable);
    }
    this.themeVariableNames.clear();
    for (const [themeVariableKey, themeVariableValue] of Object.entries(
      this.document?.theme?.variables || {}
    )) {
      const cssVariableName = String(themeVariableKey).startsWith("--")
        ? String(themeVariableKey)
        : "--" + themeVariableKey;
      if (/^--[a-zA-Z0-9_-]+$/.test(cssVariableName)) {
        this.container.style.setProperty(cssVariableName, String(themeVariableValue));
        this.themeVariableNames.add(cssVariableName);
      }
    }
    if (!canReuseHosts) {
      const viewportElement = document.createElement("div");
      viewportElement.className =
        "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select");
      const canvasElement = document.createElement("div");
      canvasElement.className = "hb-renderer-canvas";
      viewportElement.append(canvasElement);
      this.container.append(viewportElement);
      this.viewport = viewportElement;
      this.canvas = canvasElement;
    }
    this.viewport.className =
      "hb-renderer-viewport" + (this.options.editable ? "" : " hb-runtime-no-select");
    this.canvas.style.width = this.document.canvas.width + "px";
    this.canvas.style.height = this.document.canvas.height + "px";
    this.canvas.style.background =
      this.document.canvas.background?.type === "color"
        ? this.document.canvas.background.color || "#0b1116"
        : "";
    this.renderComponents(canReuseHosts, retainedHostMap);
    this.resize();
  },
  /**
   * 渲染当前页的全部组件（含本页引用的共享组件）。
   */
  renderComponents(retainHosts = false, carriedOverHosts = null) {
    if (!this.canvas || !this.page) {
      return;
    }
    const sharedComponentsById = new Map(
      (this.document.sharedComponents || []).map(sharedComponentEntry => [
        sharedComponentEntry.id,
        sharedComponentEntry
      ])
    );
    // 本页引用的共享组件实体列表，解引用方式与 preloadStaticImages 一致。
    const pageSharedComponentRecords = (this.page.sharedComponentIds || [])
      .map(pageSharedComponentId => sharedComponentsById.get(pageSharedComponentId))
      .filter(Boolean);
    const pageComponentIds = new Set(
      collectComponents(
        [...(this.page.components || []), ...pageSharedComponentRecords],
        () => true
      ).map(pageComponent => pageComponent.id)
    );
    this.states.set("virtual.icon_visibility.current", {
      entityId: "virtual.icon_visibility.current",
      state: this.iconVisibilityState() ? "on" : "off",
      attributes: {}
    });
    const hostByComponentId = new Map([
      ...(retainHosts
        ? [...this.componentHosts].filter(([retainedHostComponentId]) =>
            ["camera", "vacuum-map", "floorplan-auto-diagram"].includes(
              this.componentRecords.get(retainedHostComponentId)?.type
            )
          )
        : []),
      ...(carriedOverHosts && typeof carriedOverHosts[Symbol.iterator] == "function"
        ? carriedOverHosts
        : [])
    ]);
    const pageComponentRecordsById = new Map(
      collectComponents(
        [...(this.page.components || []), ...pageSharedComponentRecords],
        () => true
      ).map(pageComponentRecord => [pageComponentRecord.id, pageComponentRecord])
    );
    const pageInteraction3dRecords = [...pageComponentRecordsById.values()].filter(
      interaction3dRecord => interaction3dRecord.type === "interaction3d"
    );
    const canRetainInteraction3d =
      !this.options?.editable && !this.replacingDocument && Array.isArray(this.document.pages);
    const documentInteraction3dByComponentId = canRetainInteraction3d
      ? new Map(
          collectComponents(
            [
              ...(this.document.sharedComponents || []),
              ...this.document.pages.flatMap(
                scannedDocumentPage => scannedDocumentPage.components || []
              )
            ],
            documentComponent => documentComponent.type === "interaction3d"
          ).map(documentComponentRecord => [documentComponentRecord.id, documentComponentRecord])
        )
      : new Map();
    /**
     * 判断缓存的 3D 舞台宿主能否继续复用。
     */
    const interaction3dMatchesRetained = (retainedComponentRecord, candidateComponentRecord) =>
      candidateComponentRecord?.type === "interaction3d" &&
      retainedComponentRecord.properties?.sceneId ===
        candidateComponentRecord.properties?.sceneId &&
      retainedComponentRecord.properties?.lightingMode ===
        candidateComponentRecord.properties?.lightingMode;
    let retainedInteraction3dEntry = this.retainedInteraction3d;
    if (
      retainedInteraction3dEntry &&
      (!canRetainInteraction3d ||
        retainedInteraction3dEntry.host.parentElement !== this.canvas ||
        !interaction3dMatchesRetained(
          retainedInteraction3dEntry.component,
          documentInteraction3dByComponentId.get(retainedInteraction3dEntry.component.id)
        ) ||
        pageInteraction3dRecords.some(
          pageInteraction3dEntry =>
            pageInteraction3dEntry.id !== retainedInteraction3dEntry.component.id
        ))
    ) {
      this.releaseRetainedInteraction3d();
      retainedInteraction3dEntry = null;
    }
    if (canRetainInteraction3d && !retainedInteraction3dEntry && !pageInteraction3dRecords.length) {
      for (const [hostEntryComponentId, hostEntryElement] of this.componentHosts) {
        const hostEntryRecord = this.componentRecords.get(hostEntryComponentId);
        if (
          hostEntryRecord?.type === "interaction3d" &&
          hostEntryElement.parentElement === this.canvas &&
          !!interaction3dMatchesRetained(
            hostEntryRecord,
            documentInteraction3dByComponentId.get(hostEntryComponentId)
          )
        ) {
          retainedInteraction3dEntry = {
            component: structuredClone(hostEntryRecord),
            host: hostEntryElement,
            timer: null
          };
          this.retainedInteraction3d = retainedInteraction3dEntry;
          hostEntryElement.hidden = true;
          hostEntryElement
            .querySelector(".hb-interaction3d-host")
            ?.setInteraction3dPageVisible?.(false);
          retainedInteraction3dEntry.timer = setTimeout(() => {
            if (this.retainedInteraction3d === retainedInteraction3dEntry) {
              this.releaseRetainedInteraction3d();
            }
          }, 120000);
          break;
        }
      }
    }
    if (retainedInteraction3dEntry) {
      hostByComponentId.set(
        retainedInteraction3dEntry.component.id,
        retainedInteraction3dEntry.host
      );
    }
    for (const [indexedComponentId, indexedHostElement] of this.componentHosts) {
      if (
        (retainHosts || canRetainInteraction3d) &&
        this.componentRecords.get(indexedComponentId)?.type === "interaction3d" &&
        indexedHostElement.parentElement === this.canvas &&
        pageComponentIds.has(indexedComponentId)
      ) {
        hostByComponentId.set(indexedComponentId, indexedHostElement);
      }
    }
    const retainedInteraction3dIds = new Set();
    for (const [hostMapComponentId] of hostByComponentId) {
      if (retainedInteraction3dEntry?.component.id === hostMapComponentId) {
        retainedInteraction3dIds.add(hostMapComponentId);
        continue;
      }
      if (this.componentRecords.get(hostMapComponentId)?.type === "interaction3d") {
        if (pageComponentRecordsById.get(hostMapComponentId)?.type === "interaction3d") {
          retainedInteraction3dIds.add(hostMapComponentId);
        } else {
          hostByComponentId.delete(hostMapComponentId);
        }
      }
    }
    const effectLayerByComponentId = new Map(
      [...this.canvas.querySelectorAll(".hb-icon-button-effect-layer[data-effect-for]")].map(
        effectLayerElement => [effectLayerElement.dataset.effectFor, effectLayerElement]
      )
    );
    this.cleanupComponents(retainHosts, retainedInteraction3dIds);
    const activeHostElements = new Set(
      [...hostByComponentId.values()].filter(
        candidateHostElement =>
          candidateHostElement.parentElement === this.canvas &&
          (pageComponentIds.has(candidateHostElement.dataset.componentId) ||
            candidateHostElement === retainedInteraction3dEntry?.host) &&
          (candidateHostElement.querySelector(".hb-floorplan-auto-diagram-preview") ||
            retainedInteraction3dIds.has(candidateHostElement.dataset.componentId))
      )
    );
    if (activeHostElements.size) {
      for (const canvasChildElement of [...this.canvas.children]) {
        if (!activeHostElements.has(canvasChildElement)) {
          canvasChildElement.remove();
        }
      }
    } else {
      this.canvas.replaceChildren();
    }
    this.componentHosts.clear();
    this.componentRecords.clear();
    this.componentAirflowLayers.clear();
    this.componentEffectLayers.clear();
    this.componentSelectionOverlays.clear();
    this.runtimeEntityComponentIndex.clear();
    this.componentParentIds.clear();
    for (const pageComponentData of this.page.components || []) {
      this.renderComponent(
        pageComponentData,
        this.canvas,
        0,
        hostByComponentId,
        effectLayerByComponentId
      );
    }
    for (const sharedComponentData of pageSharedComponentRecords) {
      this.renderComponent(
        sharedComponentData,
        this.canvas,
        100000,
        hostByComponentId,
        effectLayerByComponentId
      );
    }
    if (
      retainedInteraction3dEntry &&
      pageComponentRecordsById.has(retainedInteraction3dEntry.component.id)
    ) {
      clearTimeout(retainedInteraction3dEntry.timer);
      this.retainedInteraction3d = null;
      retainedInteraction3dEntry.host
        .querySelector(".hb-interaction3d-host")
        ?.setInteraction3dPageVisible?.(true);
    }
    this.syncActiveGroup();
    this.syncSelection();
    this.runtimeEffectImageLoader.pruneDisconnected();
  },
  /**
   * 渲染单个组件：创建或复用宿主元素，再交给注册表里对应的渲染函数画内容。
   */
  renderComponent(
    renderedComponent,
    hostContainerElement = this.canvas,
    baseZIndex = 0,
    retainedHosts = null,
    existingEffectLayerMap = null
  ) {
    // 先把图标按钮（效果）组件的属性归一化：老版本文档缺的默认值在此补齐，
    const normalizedComponent = normalizeIconButtonEffectComponent(renderedComponent);
    const renderPowerComponent = this.runtimePowerComponent(normalizedComponent);
    // 允许复用的类型白名单，与 refreshEditorComponent 里的判断保持一致。
    const retainedHostElement = [
      "camera",
      "vacuum-map",
      "floorplan-auto-diagram",
      "interaction3d",
      "group"
    ].includes(renderedComponent.type)
      ? retainedHosts?.get(renderedComponent.id)
      : null;
    if (retainedHostElement) {
      const retainedPosition = renderedComponent.position || {};
      const isRetainedFillLayout =
        hostContainerElement === this.canvas &&
        ["floorplan-auto-diagram", "interaction3d"].includes(renderedComponent.type) &&
        renderedComponent.properties?.layoutMode === "fill";
      const renderPosition = isRetainedFillLayout
        ? {
            ...retainedPosition,
            x: 0,
            y: 0,
            width: Number(this.document.canvas?.width || 2778),
            height: Number(this.document.canvas?.height || 1940),
            rotation: 0
          }
        : retainedPosition;
      const renderComponentScale = Math.max(
        0.01,
        Math.min(5, Number(renderedComponent.style?.scale || 1))
      );
      const zIndex = baseZIndex + Number(renderPosition.zIndex || 1);
      Object.assign(retainedHostElement.style, {
        left: (renderPosition.x || 0) + "px",
        top: (renderPosition.y || 0) + "px",
        width: (renderPosition.width || 100) + "px",
        height: (renderPosition.height || 100) + "px",
        zIndex: String(zIndex),
        transform:
          "rotate(" +
          (renderPosition.rotation || 0) +
          "deg) scale(" +
          (isRetainedFillLayout ? 1 : renderComponentScale) +
          ")"
      });
      retainedHostElement.style.setProperty("--hb-component-z", String(zIndex));
      // 隐藏用 hidden 而不是 display: none：hidden 不改变布局树外的层叠位置，
      retainedHostElement.hidden = renderedComponent.style?.visible === false;
      retainedHostElement.classList.toggle("layout-fill", isRetainedFillLayout);
      if (renderedComponent.type === "interaction3d") {
        retainedHostElement
          .querySelector(".hb-interaction3d-host")
          ?.updateInteraction3d?.(renderedComponent, this.document);
      }
      if (renderedComponent.type === "floorplan-auto-diagram") {
        const isDiagramViewMode = renderedComponent.properties?.interactionMode === "view";
        const retainedDiagramPreviewElement = retainedHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview"
        );
        const retainedDiagramHintElement = retainedHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview-hint"
        );
        retainedDiagramPreviewElement?.classList.toggle("is-view-mode", isDiagramViewMode);
        retainedDiagramPreviewElement?.classList.toggle("is-position-mode", !isDiagramViewMode);
        if (retainedDiagramHintElement) {
          retainedDiagramHintElement.textContent = isDiagramViewMode
            ? "拖动旋转 · 右键平移 · 滚轮缩放"
            : "拖动控件调整位置，右下角调整大小";
        }
      }
      this.componentHosts.set(renderedComponent.id, retainedHostElement);
      this.componentRecords.set(renderedComponent.id, renderedComponent);
      const datasetComponentId = hostContainerElement?.dataset?.componentId;
      if (datasetComponentId) {
        this.componentParentIds.set(renderedComponent.id, datasetComponentId);
      }
      this.indexRuntimeComponent(renderedComponent);
      if (retainedHostElement.parentElement !== hostContainerElement) {
        hostContainerElement.append(retainedHostElement);
      }
      return;
    }
    const componentElement = document.createElement("div");
    componentElement.className =
      "hb-component hb-component-" + renderedComponent.type.replace(/[^a-z0-9_-]/gi, "-");
    componentElement.dataset.componentId = renderedComponent.id;
    const sourcePosition = renderedComponent.position || {};
    const isFillComponentLayout =
      hostContainerElement === this.canvas &&
      ["image", "floorplan-auto-diagram", "interaction3d"].includes(renderedComponent.type) &&
      renderedComponent.properties?.layoutMode === "fill";
    const resolvedRenderPosition = isFillComponentLayout
      ? {
          ...sourcePosition,
          x: 0,
          y: 0,
          width: Number(this.document.canvas?.width || 2778),
          height: Number(this.document.canvas?.height || 1940),
          rotation: 0
        }
      : sourcePosition;
    const renderScale = Math.max(0.01, Math.min(5, Number(renderedComponent.style?.scale || 1)));
    const stackZIndex = baseZIndex + Number(resolvedRenderPosition.zIndex || 1);
    const componentZIndex = componentHostZIndex(
      renderedComponent,
      stackZIndex,
      hostContainerElement === this.canvas
    );
    Object.assign(componentElement.style, {
      left: (resolvedRenderPosition.x || 0) + "px",
      top: (resolvedRenderPosition.y || 0) + "px",
      width: (resolvedRenderPosition.width || 100) + "px",
      height: (resolvedRenderPosition.height || 100) + "px",
      zIndex: String(componentZIndex),
      transform:
        "rotate(" +
        (resolvedRenderPosition.rotation || 0) +
        "deg) scale(" +
        (isFillComponentLayout ? 1 : renderScale) +
        ")"
    });
    componentElement.style.setProperty("--hb-component-z", String(componentZIndex));
    componentElement.hidden = renderedComponent.style?.visible === false;
    if (
      renderedComponent.type === "icon-button-effect" &&
      renderedComponent.properties?.buttonVisible === false &&
      renderedComponent.properties?.hiddenContentClickable !== true &&
      !this.options.editable
    ) {
      componentElement.style.pointerEvents = "none";
    }
    componentElement.classList.toggle("layout-fill", isFillComponentLayout);
    this.componentHosts.set(renderedComponent.id, componentElement);
    this.componentRecords.set(renderedComponent.id, renderedComponent);
    const containerComponentId = hostContainerElement?.dataset?.componentId;
    if (containerComponentId) {
      this.componentParentIds.set(renderedComponent.id, containerComponentId);
    }
    this.indexRuntimeComponent(renderedComponent);
    const renderContext = {
      document: this.document,
      page: this.page,
      states: this.states,
      history: this.historySeries,
      entityMetadata: this.entityMetadata,
      deviceMetadata: this.deviceMetadata,
      entityTranslations: this.entityTranslations,
      renderNamespace: this.renderNamespace,
      editable: !!this.options.editable,
      liveMedia: this.options.liveMedia !== false,
      previewState: this.componentPreviewStates.get(renderedComponent.id) || "auto",
      isIconVisible: componentIconEntityId => this.iconVisibilityState(componentIconEntityId),
      navigate: componentPagePath => this.navigate(componentPagePath),
      callEntityService: (...forwardedServiceArgs) =>
        this.callEntityService(...forwardedServiceArgs),
      openCameraPreview: (previewComponent, cameraPreviewContext, previewElement) =>
        this.runDeviceControlMethod(["camera"], "openInteraction3dCameraPreview", [
          previewComponent, cameraPreviewContext, previewElement
        ]),
      openVacuumDetails: (vacuumDetailsComponent, vacuumDetailsContext, vacuumDetailsTarget) =>
        this.runDeviceControlMethod(["vacuum"], "openInteraction3dVacuumDetails", [
          vacuumDetailsComponent, vacuumDetailsContext, vacuumDetailsTarget
        ]),
      runVacuumRoom: requestedVacuumRoom =>
        this.dispatchAction(
          {
            id: renderedComponent.id + ":room:" + requestedVacuumRoom.id,
            type: "device-button",
            properties: {
              label: requestedVacuumRoom.label
            },
            bindings: {
              entity: {
                entityId: requestedVacuumRoom.entityId
              }
            }
          },
          {
            type: "toggle",
            data: {}
          }
        ),
      onError: previewReportedError => this.options.onError?.(previewReportedError),
      registerRuntimeStateHandler: (runtimeHandlerEntityId, runtimeStateHandler) =>
        this.registerRuntimeStateHandler(
          runtimeHandlerEntityId,
          runtimeStateHandler,
          renderedComponent.id
        ),
      invalidate: () => this.renderComponents(true),
      cleanup: runtimeCleanupCallback => {
        if (["camera", "vacuum-map"].includes(renderedComponent.type)) {
          if (!this.cameraCleanups.has(renderedComponent.id)) {
            this.cameraCleanups.set(renderedComponent.id, []);
          }
          this.cameraCleanups.get(renderedComponent.id).push(runtimeCleanupCallback);
        } else {
          this.registerComponentCleanup(renderedComponent.id, runtimeCleanupCallback);
        }
      }
    };
    if (renderedComponent.type === "icon-button-effect") {
      const renderedEffectLayer = renderIconButtonEffectLayer(renderPowerComponent, renderContext);
      if (renderedEffectLayer) {
        const retainedEffectLayer = existingEffectLayerMap?.get(renderedComponent.id) || null;
        const activeEffectLayer = retainedEffectLayer || renderedEffectLayer;
        const renderedImageElement = renderedEffectLayer.querySelector("img");
        const activeImageElement = activeEffectLayer.querySelector("img");
        const layerIsActive = renderedEffectLayer.classList.contains("active");
        if (retainedEffectLayer && activeImageElement && renderedImageElement) {
          activeEffectLayer.classList.toggle(
            "awaiting-light-visual",
            renderedEffectLayer.classList.contains("awaiting-light-visual")
          );
          const sourceAttribute = renderedImageElement.dataset.effectSource || "";
          if (sourceAttribute) {
            activeImageElement.dataset.effectSource = sourceAttribute;
          } else {
            delete activeImageElement.dataset.effectSource;
            const imageSrc = renderedImageElement.getAttribute("src");
            if (imageSrc) {
              activeImageElement.src = imageSrc;
            }
          }
          activeImageElement.alt = renderedImageElement.alt;
          activeImageElement.draggable = false;
          activeImageElement.decoding = "async";
          activeImageElement.style.objectFit = renderedImageElement.style.objectFit;
          activeImageElement.style.mixBlendMode = renderedImageElement.style.mixBlendMode;
          for (const effectDatasetKey of [
            "effectOriginalWidth",
            "effectOriginalHeight",
            "effectCropX",
            "effectCropY",
            "effectCropWidth",
            "effectCropHeight"
          ]) {
            if (renderedImageElement.dataset[effectDatasetKey] !== undefined) {
              activeImageElement.dataset[effectDatasetKey] =
                renderedImageElement.dataset[effectDatasetKey];
            } else {
              delete activeImageElement.dataset[effectDatasetKey];
            }
          }
        }
        const componentEffectProperties = renderPowerComponent.properties || {};
        const canvasWidthPx = Number(this.document.canvas?.width || 2778);
        const canvasHeightPx = Number(this.document.canvas?.height || 1940);
        const isFillEffect = componentEffectProperties.effectLayoutMode === "fill";
        const isNested = hostContainerElement !== this.canvas;
        activeEffectLayer.dataset.effectFor = renderedComponent.id;
        activeEffectLayer.hidden = renderedComponent.style?.visible === false;
        /**
         * 计算并写入图标按钮效果层的位置与尺寸。
         */
        const applyEffectLayerLayout = () => {
          const sourceDimensions = effectSourceDimensions(
            componentEffectProperties,
            activeImageElement,
            canvasWidthPx,
            canvasHeightPx
          );
          const cropRectangle = effectCropRectangle(activeImageElement, sourceDimensions);
          const referenceTransform =
            !isFillEffect && !sourceDimensions.pendingNaturalSize
              ? effectReferenceImageTransform(
                  this.page,
                  renderedComponent,
                  sourceDimensions.width,
                  sourceDimensions.height,
                  canvasWidthPx,
                  canvasHeightPx
                )
              : null;
          const effectScale = Math.max(
            0.01,
            Math.min(5, Number(componentEffectProperties.effectScale || 1))
          );
          const computedScale = isFillEffect
            ? Math.min(
                canvasWidthPx / sourceDimensions.width,
                canvasHeightPx / sourceDimensions.height
              )
            : (referenceTransform?.scale || 1) * effectScale;
          const effectRotationDeg = isFillEffect
            ? 0
            : Number(componentEffectProperties.effectRotation || 0);
          const effectLeftRatio = Number(componentEffectProperties.effectLeft ?? 50) / 100;
          const effectTopRatio = Number(componentEffectProperties.effectTop ?? 50) / 100;
          const layerCenterX = isFillEffect ? canvasWidthPx / 2 : canvasWidthPx * effectLeftRatio;
          const layerCenterY = isFillEffect ? canvasHeightPx / 2 : canvasHeightPx * effectTopRatio;
          const croppedGeometry = effectCroppedLayerGeometry({
            centerX: layerCenterX,
            centerY: layerCenterY,
            originalWidth: sourceDimensions.width,
            originalHeight: sourceDimensions.height,
            cropX: cropRectangle.x,
            cropY: cropRectangle.y,
            cropWidth: cropRectangle.width,
            cropHeight: cropRectangle.height,
            scale: computedScale,
            rotation: effectRotationDeg
          });
          let layerGeometry = croppedGeometry;
          if (isNested) {
            const layerCenterWorldX = croppedGeometry.left + croppedGeometry.width / 2;
            const layerCenterWorldY = croppedGeometry.top + croppedGeometry.height / 2;
            const nestedParentComponentId = hostContainerElement?.dataset?.componentId;
            const localCenterPoint = nestedParentComponentId
              ? this.worldPointToComponentLocal(
                  nestedParentComponentId,
                  layerCenterWorldX,
                  layerCenterWorldY
                )
              : {
                  x: layerCenterWorldX,
                  y: layerCenterWorldY
                };
            const parentWorldTransform = nestedParentComponentId
              ? this.componentWorldTransform(nestedParentComponentId)
              : {
                  scale: 1,
                  rotation: 0
                };
            layerGeometry = {
              ...croppedGeometry,
              left: localCenterPoint.x - croppedGeometry.width / 2,
              top: localCenterPoint.y - croppedGeometry.height / 2,
              scale: croppedGeometry.scale / Math.max(0.0001, parentWorldTransform.scale),
              rotation: croppedGeometry.rotation - parentWorldTransform.rotation
            };
          }
          Object.assign(activeEffectLayer.style, {
            left: layerGeometry.left + "px",
            top: layerGeometry.top + "px",
            width: croppedGeometry.width + "px",
            height: croppedGeometry.height + "px",
            visibility: sourceDimensions.pendingNaturalSize ? "hidden" : "",
            zIndex: String(isNested ? stackZIndex - 0.1 : stackZIndex),
            transform:
              "rotate(" + layerGeometry.rotation + "deg) scale(" + layerGeometry.scale + ")"
          });
          return sourceDimensions;
        };
        if (applyEffectLayerLayout().pendingNaturalSize && activeImageElement) {
          activeImageElement.addEventListener(
            "load",
            () => {
              if (activeEffectLayer.isConnected) {
                applyEffectLayerLayout();
              }
            },
            {
              once: true
            }
          );
        }
        (isNested
          ? hostContainerElement
          : isFillEffect
            ? this.canvas
            : hostContainerElement
        ).append(activeEffectLayer);
        this.componentEffectLayers.set(renderedComponent.id, activeEffectLayer);
        const activeSourceAttribute = activeImageElement?.dataset.effectSource || "";
        if (activeSourceAttribute) {
          this.runtimeEffectImageLoader.enqueue(activeImageElement, activeSourceAttribute, {
            active: layerIsActive
          });
        }
        if (retainedEffectLayer) {
          const imageFilter = renderedImageElement?.style.filter || "none";
          const imageOpacityValue = renderedEffectLayer.style.getPropertyValue(
            "--hb-effect-image-opacity"
          );
          const fadeDurationValue = renderedEffectLayer.style.getPropertyValue(
            "--hb-effect-fade-duration"
          );
          const visualTransitionValue = renderedEffectLayer.style.getPropertyValue(
            "--hb-effect-visual-transition-duration"
          );
          const layerOpacity = renderedEffectLayer.style.opacity;
          const layerTransition = renderedEffectLayer.style.transition;
          activeImageElement?.offsetWidth;
          if (activeImageElement) {
            activeImageElement.style.filter = imageFilter;
          }
          activeEffectLayer.style.opacity = layerOpacity;
          activeEffectLayer.style.transition = layerTransition;
          activeEffectLayer.style.setProperty("--hb-effect-image-opacity", imageOpacityValue);
          activeEffectLayer.style.setProperty("--hb-effect-fade-duration", fadeDurationValue);
          activeEffectLayer.style.setProperty(
            "--hb-effect-visual-transition-duration",
            visualTransitionValue
          );
          this.setEffectLayerActive(
            activeEffectLayer,
            layerIsActive,
            effectFadeDuration(renderedComponent)
          );
        }
      }
    }
    if (renderedComponent.type === "air-conditioner") {
      const renderedAirflowLayer = renderAirConditionerAirflowLayer(
        renderPowerComponent,
        renderContext
      );
      if (renderedAirflowLayer) {
        renderedAirflowLayer.dataset.airflowFor = renderedComponent.id;
        renderedAirflowLayer.hidden = renderedComponent.style?.visible === false;
        const isNestedAirflow = hostContainerElement !== this.canvas;
        const renderedAirflowGeometry = airflowLayerGeometry(renderedComponent, {
          grouped: isNestedAirflow
        });
        Object.assign(renderedAirflowLayer.style, {
          left: renderedAirflowGeometry.left + "px",
          top: renderedAirflowGeometry.top + "px",
          width: renderedAirflowGeometry.width + "px",
          height: renderedAirflowGeometry.height + "px",
          zIndex: String(stackZIndex),
          transform:
            "rotate(" +
            renderedAirflowGeometry.rotation +
            "deg) scale(" +
            renderedAirflowGeometry.scale +
            ")"
        });
        (isNestedAirflow ? componentElement : hostContainerElement).append(renderedAirflowLayer);
        this.componentAirflowLayers.set(renderedComponent.id, renderedAirflowLayer);
      }
    }
    const contentElement =
      renderedComponent.type === "group"
        ? (() => {
            const groupContainerElement = document.createElement("div");
            groupContainerElement.className = "hb-group-container";
            return groupContainerElement;
          })()
        : renderRegisteredComponent(renderPowerComponent, renderContext);
    const contentComponentScale = Number(this.document.canvas.componentScale || 1);
    if (contentComponentScale !== 1) {
      contentElement.style.width = 100 / contentComponentScale + "%";
      contentElement.style.height = 100 / contentComponentScale + "%";
      contentElement.style.transform = "scale(" + contentComponentScale + ")";
      contentElement.style.transformOrigin = "top left";
    }
    componentElement.append(contentElement);
    if (renderedComponent.type === "line-chart") {
      let lineChartElement = contentElement;
      const refreshLineChart = () => {
        if (!lineChartElement?.isConnected) {
          return;
        }
        const nextLineChartElement = renderRegisteredComponent(renderPowerComponent, renderContext);
        if (contentComponentScale !== 1) {
          nextLineChartElement.style.width = 100 / contentComponentScale + "%";
          nextLineChartElement.style.height = 100 / contentComponentScale + "%";
          nextLineChartElement.style.transform = "scale(" + contentComponentScale + ")";
          nextLineChartElement.style.transformOrigin = "top left";
        }
        lineChartElement.cleanupLineChartHover?.();
        lineChartElement.replaceWith(nextLineChartElement);
        lineChartElement = nextLineChartElement;
      };
      this.registerRuntimeStateHandler(
        renderedComponent.bindings?.entity?.entityId,
        lineChartEntityState => {
          lineChartElement.syncLineChartState?.(lineChartEntityState);
          if (lineChartElement.classList.contains("history-loading")) {
            refreshLineChart();
          }
        },
        renderedComponent.id
      );
      this.registerHistoryChartRefresher(refreshLineChart, renderedComponent.id);
    }
    if (this.options.editable) {
      componentElement.classList.add("editable");
      componentElement.addEventListener("pointerdown", movePointerEvent =>
        this.startComponentMove(movePointerEvent, renderedComponent, componentElement)
      );
    } else {
      const hasTapAction = Object.prototype.hasOwnProperty.call(
        renderedComponent.actions || {},
        "tap"
      );
      const actionableComponent =
        renderedComponent.type === "camera" &&
        renderedComponent.bindings?.entity?.entityId &&
        !hasTapAction
          ? {
              ...renderedComponent,
              actions: {
                tap: {
                  type: "more-info",
                  data: {
                    popupSource: "current"
                  }
                },
                ...(renderedComponent.actions || {})
              }
            }
          : renderedComponent;
      if (renderedComponent.type === "light-statistics") {
        componentElement.classList.add("hb-runtime-fitted-hit-area");
      }
      if (
        Object.values(actionableComponent.actions || {}).some(componentActionConfig =>
          isSupportedComponentAction(actionableComponent, componentActionConfig)
        )
      ) {
        componentElement.classList.add("interactive");
        let actionTargetElement = componentElement;
        if (
          ["title-button", "device-button", "light-statistics"].includes(renderedComponent.type)
        ) {
          actionTargetElement = document.createElement("span");
          actionTargetElement.className = "hb-runtime-action-hitbox";
          actionTargetElement.setAttribute("aria-hidden", "true");
          componentElement.classList.add("hb-runtime-fitted-hit-area");
          componentElement.append(actionTargetElement);
        }
        this.bindRuntimeActions(actionTargetElement, actionableComponent);
      }
    }
    hostContainerElement.append(componentElement);
    const mountedHitboxElement = componentElement.querySelector(
      ":scope > .hb-runtime-action-hitbox"
    );
    if (mountedHitboxElement) {
      const hitboxBoundsVisible =
        renderedComponent.type === "title-button"
          ? this.updateTitleButtonSelectionBounds(
              componentElement,
              renderedComponent,
              mountedHitboxElement
            )
          : renderedComponent.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                componentElement,
                renderedComponent,
                mountedHitboxElement
              )
            : this.updateDeviceButtonSelectionBounds(
                componentElement,
                renderedComponent,
                mountedHitboxElement
              );
      mountedHitboxElement.hidden = !hitboxBoundsVisible;
    }
    for (const childComponentData of renderedComponent.children || []) {
      this.renderComponent(
        childComponentData,
        componentElement,
        0,
        retainedHosts,
        existingEffectLayerMap
      );
    }
  },
  /**
   * 重绘单个组件（状态推送与编辑器属性回写都走这里）。
   */
  refreshRuntimeComponent(runtimeComponentId) {
    const refreshedComponent = this.componentRecords.get(runtimeComponentId);
    const runtimeHostElement = this.componentHosts.get(runtimeComponentId);
    // isConnected 这一条不能省：记录存在不等于还在页面上。
    if (!refreshedComponent || !runtimeHostElement || !runtimeHostElement.isConnected) {
      return;
    }
    if (refreshedComponent.type === "interaction3d") {
      runtimeHostElement
        .querySelector(".hb-interaction3d-host")
        ?.updateInteraction3d?.(refreshedComponent, this.document);
      return;
    }
    this.cleanupRenderedComponent(runtimeComponentId);
    const runtimeRenderContext = {
      document: this.document,
      page: this.page,
      states: this.states,
      history: this.historySeries,
      entityMetadata: this.entityMetadata,
      deviceMetadata: this.deviceMetadata,
      entityTranslations: this.entityTranslations,
      renderNamespace: this.renderNamespace,
      editable: !!this.options.editable,
      liveMedia: this.options.liveMedia !== false,
      previewState: this.componentPreviewStates.get(runtimeComponentId) || "auto",
      isIconVisible: visibilityCheckEntityId => this.iconVisibilityState(visibilityCheckEntityId),
      navigate: requestedPagePath => this.navigate(requestedPagePath),
      callEntityService: (...serviceArgs) => this.callEntityService(...serviceArgs),
      openCameraPreview: (previewSourceComponent, cameraPreviewOptions, previewTargetElement) =>
        this.runDeviceControlMethod(["camera"], "openInteraction3dCameraPreview", [
          previewSourceComponent, cameraPreviewOptions, previewTargetElement
        ]),
      openVacuumDetails: (vacuumComponent, vacuumDetailsOptions, vacuumTargetElement) =>
        this.runDeviceControlMethod(["vacuum"], "openInteraction3dVacuumDetails", [
          vacuumComponent, vacuumDetailsOptions, vacuumTargetElement
        ]),
      runVacuumRoom: vacuumRoom =>
        this.dispatchAction(
          {
            id: refreshedComponent.id + ":room:" + vacuumRoom.id,
            type: "device-button",
            properties: {
              label: vacuumRoom.label
            },
            bindings: {
              entity: {
                entityId: vacuumRoom.entityId
              }
            }
          },
          {
            type: "toggle",
            data: {}
          }
        ),
      onError: reportedError => this.options.onError?.(reportedError),
      registerRuntimeStateHandler: (stateHandlerEntityId, stateChangeHandler) =>
        this.registerRuntimeStateHandler(
          stateHandlerEntityId,
          stateChangeHandler,
          runtimeComponentId
        ),
      invalidate: () => this.refreshRuntimeComponent(runtimeComponentId),
      cleanup: registeredCleanupCallback =>
        this.registerComponentCleanup(runtimeComponentId, registeredCleanupCallback)
    };
    const refreshedContentElement = renderRegisteredComponent(
      this.runtimePowerComponent(refreshedComponent),
      runtimeRenderContext
    );
    const hostComponentScale = Number(this.document.canvas.componentScale || 1);
    if (hostComponentScale !== 1) {
      refreshedContentElement.style.width = 100 / hostComponentScale + "%";
      refreshedContentElement.style.height = 100 / hostComponentScale + "%";
      refreshedContentElement.style.transform = "scale(" + hostComponentScale + ")";
      refreshedContentElement.style.transformOrigin = "top left";
    }
    const previousContentElement = this.runtimeComponentContent(runtimeHostElement);
    if (previousContentElement) {
      previousContentElement.replaceWith(refreshedContentElement);
    } else {
      runtimeHostElement.prepend(refreshedContentElement);
    }
    if (
      refreshedComponent.type === "title-button" ||
      refreshedComponent.type === "light-statistics"
    ) {
      const hitboxElement = runtimeHostElement.querySelector(":scope > .hb-runtime-action-hitbox");
      if (hitboxElement) {
        const selectionBoundsVisible =
          refreshedComponent.type === "light-statistics"
            ? this.updateLightStatisticsSelectionBounds(
                runtimeHostElement,
                refreshedComponent,
                hitboxElement
              )
            : this.updateTitleButtonSelectionBounds(
                runtimeHostElement,
                refreshedComponent,
                hitboxElement
              );
        hitboxElement.hidden = !selectionBoundsVisible;
      }
    }
    if (refreshedComponent.type === "light-statistics") {
      const statisticsBoundsElement =
        this.componentSelectionOverlays
          .get(runtimeComponentId)
          ?.querySelector(":scope > .hb-selection-bounds") ||
        runtimeHostElement.querySelector(":scope > .hb-selection-bounds");
      if (statisticsBoundsElement) {
        if (
          !this.updateLightStatisticsSelectionBounds(
            runtimeHostElement,
            refreshedComponent,
            statisticsBoundsElement
          )
        ) {
          Object.assign(statisticsBoundsElement.style, {
            left: "0",
            top: "0",
            width: "100%",
            height: "100%"
          });
        }
        this.updateTransformHandleScale(
          runtimeHostElement,
          refreshedComponent,
          statisticsBoundsElement
        );
      }
      this.refreshMultiSelectionBounds();
    }
  },
  /**
   * 在编辑态下就地刷新单个组件（改属性后不整页重绘）。
   */
  refreshEditorComponent(editorComponentId) {
    if (!this.options.editable) {
      return false;
    }
    const editorComponent = this.componentRecords.get(editorComponentId);
    const editorHostElement = this.componentHosts.get(editorComponentId);
    if (!editorComponent || !editorHostElement?.isConnected) {
      return false;
    }
    const editorHostParent = editorHostElement.parentElement;
    if (!editorHostParent) {
      return false;
    }
    const hostZIndex =
      editorHostParent === this.canvas &&
      (this.page.sharedComponentIds || []).includes(editorComponent.id)
        ? 100000
        : 0;
    if (editorComponent.type === "interaction3d" || editorComponent.type === "group") {
      this.renderComponent(
        editorComponent,
        editorHostParent,
        hostZIndex,
        new Map([[editorComponent.id, editorHostElement]])
      );
      this.syncSelection();
      return true;
    }
    if (editorComponent.type === "floorplan-auto-diagram") {
      const shouldShowDiagramPreview =
        editorComponent.properties?.previewReady === true &&
        (editorComponent.properties?.generated !== true ||
          editorComponent.properties?.previewing === true);
      const diagramPreviewElement = editorHostElement.querySelector(
        ".hb-floorplan-auto-diagram-preview"
      );
      if (!!diagramPreviewElement === shouldShowDiagramPreview) {
        const editorPosition = editorComponent.position || {};
        const isFillLayout =
          editorHostParent === this.canvas && editorComponent.properties?.layoutMode === "fill";
        const layoutPosition = isFillLayout
          ? {
              ...editorPosition,
              x: 0,
              y: 0,
              width: Number(this.document.canvas?.width || 2778),
              height: Number(this.document.canvas?.height || 1940),
              rotation: 0
            }
          : editorPosition;
        const editorScale = Math.max(0.01, Math.min(5, Number(editorComponent.style?.scale || 1)));
        const diagramZIndex = hostZIndex + Number(layoutPosition.zIndex || 1);
        const resolvedZIndex = componentHostZIndex(
          editorComponent,
          diagramZIndex,
          editorHostParent === this.canvas
        );
        Object.assign(editorHostElement.style, {
          left: (layoutPosition.x || 0) + "px",
          top: (layoutPosition.y || 0) + "px",
          width: (layoutPosition.width || 100) + "px",
          height: (layoutPosition.height || 100) + "px",
          zIndex: String(resolvedZIndex),
          transform:
            "rotate(" +
            (layoutPosition.rotation || 0) +
            "deg) scale(" +
            (isFillLayout ? 1 : editorScale) +
            ")"
        });
        // 除了 zIndex 还写一份 CSS 变量：部分子层（气流层、效果层）需要按父级层叠值
        editorHostElement.style.setProperty("--hb-component-z", String(resolvedZIndex));
        editorHostElement.classList.toggle("layout-fill", isFillLayout);
        const diagramHintElement = editorHostElement.querySelector(
          ".hb-floorplan-auto-diagram-preview-hint"
        );
        const isViewMode = editorComponent.properties?.interactionMode === "view";
        diagramPreviewElement?.classList.toggle("is-view-mode", isViewMode);
        diagramPreviewElement?.classList.toggle("is-position-mode", !isViewMode);
        if (diagramHintElement) {
          diagramHintElement.textContent = isViewMode
            ? "拖动旋转 · 右键平移 · 滚轮缩放"
            : "拖动控件调整位置，右下角调整大小";
        }
        this.syncSelection();
        this.updateTransformHandleScale(editorHostElement, editorComponent);
        return true;
      }
    }
    const hostNextSibling = editorHostElement.nextSibling;
    // 重建前先跑清理回调：媒体流、订阅、定时器都挂在组件上，
    this.cleanupRenderedComponent(editorComponentId);
    for (const removedCameraCleanup of this.cameraCleanups.get(editorComponentId)?.splice(0) ||
      []) {
      removedCameraCleanup();
    }
    this.cameraCleanups.delete(editorComponentId);
    this.componentEffectLayers.get(editorComponentId)?.remove();
    this.componentEffectLayers.delete(editorComponentId);
    this.componentAirflowLayers.get(editorComponentId)?.remove();
    this.componentAirflowLayers.delete(editorComponentId);
    editorHostElement.remove();
    this.renderComponent(editorComponent, editorHostParent, hostZIndex);
    // 重建后插回原位置：DOM 顺序决定同 zIndex 下的绘制顺序，
    const refreshedHostElement = this.componentHosts.get(editorComponentId);
    if (refreshedHostElement && hostNextSibling?.parentElement === editorHostParent) {
      editorHostParent.insertBefore(refreshedHostElement, hostNextSibling);
    }
    this.syncSelection();
    return true;
  },
  /**
   * 按实体 ID 批量刷新受影响的组件（状态推送的入口）。
   */
  refreshRuntimeComponents(entityIds) {
    const affectedComponentIds = new Set();
    for (const changedEntityId of entityIds || []) {
      for (const matchedComponentId of this.runtimeEntityComponentIndex.get(
        String(changedEntityId || "")
      ) || []) {
        affectedComponentIds.add(matchedComponentId);
      }
    }
    if (!affectedComponentIds.size) {
      return;
    }
    // 这份类型名单必须与 updateOptimisticToggleVisuals 内部支持的类型保持一致，
    const optimisticToggleTypes = new Set([
      "icon-button-effect",
      "icon-button",
      "device-button",
      "navigation-button",
      "air-conditioner"
    ]);
    const optimisticComponentIds = new Set(
      [...affectedComponentIds].filter(affectedComponentId =>
        optimisticToggleTypes.has(this.componentRecords.get(affectedComponentId)?.type)
      )
    );
    if (optimisticComponentIds.size) {
      this.updateOptimisticToggleVisuals("", optimisticComponentIds);
    }
    for (const refreshedAffectedComponentId of affectedComponentIds) {
      const affectedComponentRecord = this.componentRecords.get(refreshedAffectedComponentId);
      if (
        !!affectedComponentRecord &&
        !optimisticToggleTypes.has(affectedComponentRecord.type) &&
        !["line-chart", "camera", "vacuum-map"].includes(affectedComponentRecord.type)
      ) {
        this.refreshRuntimeComponent(refreshedAffectedComponentId);
      }
    }
  },
  /**
   * 把编辑器提交的组件更新并入文档并局部刷新（不整页重绘）。
   */
  applyEditorComponentUpdates(updatedDocument, currentPagePath, componentUpdates = []) {
    if (!this.options.editable || !this.document || !Array.isArray(componentUpdates)) {
      return false;
    }
    const validUpdates = componentUpdates
      .map(componentUpdate => ({
        componentId: String(componentUpdate?.componentId || ""),
        component: componentUpdate?.component
      }))
      .filter(validUpdate => validUpdate.componentId && validUpdate.component);
    if (
      validUpdates.length !== componentUpdates.length ||
      validUpdates.some(({ componentId: updatedComponentId, component: updatedComponent }) => {
        const existingComponentRecord = this.componentRecords.get(updatedComponentId);
        return (
          !existingComponentRecord ||
          !this.componentHosts.get(updatedComponentId)?.isConnected ||
          existingComponentRecord.type !== updatedComponent.type
        );
      })
    ) {
      return false;
    }
    const previousEntityIds = new Set();
    for (const { componentId: updateComponentId } of validUpdates) {
      const updateComponentRecord = this.componentRecords.get(updateComponentId);
      for (const updateEntityId of this.runtimeEntityIdsForComponent(updateComponentRecord)) {
        previousEntityIds.add(updateEntityId);
      }
    }
    this.document = updatedDocument;
    this.page =
      this.document.pages?.find(matchingPage => matchingPage.path === currentPagePath) ||
      this.document.pages?.find(
        defaultPage => defaultPage.path === this.document.defaultPagePath
      ) ||
      this.document.pages?.[0] ||
      null;
    for (const { componentId: patchComponentId, component: patchComponentData } of validUpdates) {
      const patchComponentRecord = this.componentRecords.get(patchComponentId);
      this.unindexRuntimeComponent(patchComponentId);
      const { children: updatedChildren, ...updatedComponentBody } = patchComponentData;
      for (const existingPropertyKey of Object.keys(patchComponentRecord)) {
        delete patchComponentRecord[existingPropertyKey];
      }
      // 先删旧键再整体赋值，而不是简单合并：属性被用户删掉时，合并会把旧值留下，
      Object.assign(patchComponentRecord, structuredClone(updatedComponentBody));
      if (updatedChildren) {
        patchComponentRecord.children = updatedChildren.map(childComponentRecord =>
          this.componentRecords.get(childComponentRecord.id)
        );
      }
      this.indexRuntimeComponent(patchComponentRecord);
    }
    const refreshComponentIds = new Set(
      validUpdates.map(({ componentId: refreshUpdateComponentId }) => refreshUpdateComponentId)
    );
    for (const { componentId: refreshTargetComponentId } of validUpdates) {
      const refreshTargetComponentRecord = this.componentRecords.get(refreshTargetComponentId);
      if (refreshTargetComponentRecord.type === "group") {
        for (const nestedComponent of collectComponents(
          refreshTargetComponentRecord.children || [],
          nestedComponentEntry =>
            ["icon-button-effect", "interaction3d", "floorplan-auto-diagram"].includes(
              nestedComponentEntry.type
            )
        )) {
          refreshComponentIds.add(nestedComponent.id);
        }
      }
    }
    for (const refreshComponentId of refreshComponentIds) {
      this.refreshEditorComponent(refreshComponentId);
    }
    this.syncSelection();
    const nextEntityIds = new Set();
    for (const { componentId: pendingUpdateComponentId } of validUpdates) {
      for (const pendingUpdateEntityId of this.runtimeEntityIdsForComponent(
        this.componentRecords.get(pendingUpdateComponentId)
      )) {
        nextEntityIds.add(pendingUpdateEntityId);
      }
    }
    if (
      previousEntityIds.size !== nextEntityIds.size ||
      [...previousEntityIds].some(previousEntityId => !nextEntityIds.has(previousEntityId))
    ) {
      this.connectRuntime();
    }
    return true;
  },
  /**
   * 拆掉组件的运行期资源（订阅、定时器、媒体流等）。
   */
  cleanupComponents(removeAllCleanups = false, keptComponentIds = new Set()) {
    if (
      this.retainedInteraction3d &&
      !keptComponentIds.has(this.retainedInteraction3d.component.id)
    ) {
      this.releaseRetainedInteraction3d();
    }
    for (const cleanupCallback of this.cleanups.splice(0)) {
      cleanupCallback();
    }
    for (const cleanupComponentId of [...this.componentCleanups.keys()]) {
      if (!keptComponentIds.has(cleanupComponentId)) {
        this.cleanupRenderedComponent(cleanupComponentId);
      }
    }
    if (!removeAllCleanups) {
      for (const cameraCleanupCallbacks of this.cameraCleanups.values()) {
        for (const cameraCleanupCallback of cameraCleanupCallbacks.splice(0)) {
          cameraCleanupCallback();
        }
      }
      this.cameraCleanups.clear();
    }
  },
  /**
   * 为组件登记一个清理回调，组件被移除或重渲染时执行。
   */
  registerComponentCleanup(registeredComponentId, registeredCleanup) {
    if (!!registeredComponentId && typeof registeredCleanup == "function") {
      if (!this.componentCleanups.has(registeredComponentId)) {
        this.componentCleanups.set(registeredComponentId, []);
      }
      this.componentCleanups.get(registeredComponentId).push(registeredCleanup);
    }
  },
  /**
   * 执行并清空某个组件的全部清理回调。
   */
  cleanupRenderedComponent(renderedComponentId) {
    const componentCleanupCallbacks = this.componentCleanups.get(renderedComponentId) || [];
    this.componentCleanups.delete(renderedComponentId);
    for (const componentCleanupCallback of componentCleanupCallbacks.splice(0)) {
      componentCleanupCallback();
    }
  },
  /**
   * 释放被保留复用的 3D 舞台宿主（连同其延时器与内部资源）。
   */
  releaseRetainedInteraction3d() {
    const retainedInteraction3d = this.retainedInteraction3d;
    if (retainedInteraction3d) {
      this.retainedInteraction3d = null;
      clearTimeout(retainedInteraction3d.timer);
      this.cleanupRenderedComponent(retainedInteraction3d.component.id);
      retainedInteraction3d.host.remove();
    }
  },
  /**
   * 收集单个组件（不含子组件）绑定到的全部实体 ID。
   */
  runtimeEntityIdsForComponent(indexedRuntimeComponent) {
    const runtimeEntityIdSet = collectEntityIds([
      {
        ...indexedRuntimeComponent,
        children: []
      }
    ]);
    const componentBindingEntityId = indexedRuntimeComponent?.bindings?.entity?.entityId || "";
    if (componentBindingEntityId) {
      runtimeEntityIdSet.add(componentBindingEntityId);
      const componentPowerEntityId = this.powerEntityId(
        indexedRuntimeComponent,
        componentBindingEntityId
      );
      if (componentPowerEntityId) {
        runtimeEntityIdSet.add(componentPowerEntityId);
      }
      const componentDeviceProfile = this.deviceProfile(componentBindingEntityId);
      for (const roleEntityId of Object.values(componentDeviceProfile?.roles || {})) {
        if (roleEntityId) {
          runtimeEntityIdSet.add(roleEntityId);
        }
      }
    }
    return [...runtimeEntityIdSet]
      .map(entityIdValue => String(entityIdValue || ""))
      .filter(Boolean);
  },
  /**
   * 把组件登记进「实体 ID → 组件 ID 集合」索引，供状态推送时反查。
   */
  indexRuntimeComponent(indexedComponent) {
    for (const indexedRuntimeEntityId of this.runtimeEntityIdsForComponent(indexedComponent)) {
      if (!this.runtimeEntityComponentIndex.has(indexedRuntimeEntityId)) {
        this.runtimeEntityComponentIndex.set(indexedRuntimeEntityId, new Set());
      }
      this.runtimeEntityComponentIndex.get(indexedRuntimeEntityId).add(indexedComponent.id);
    }
  },
  /**
   * 把组件从实体索引中摘除，并顺手清掉空集合。
   */
  unindexRuntimeComponent(unindexedComponentId) {
    for (const [indexedEntityId, indexedComponentIds] of this.runtimeEntityComponentIndex) {
      indexedComponentIds.delete(unindexedComponentId);
      if (!indexedComponentIds.size) {
        this.runtimeEntityComponentIndex.delete(indexedEntityId);
      }
    }
  },
  /**
   * 从宿主元素里挑出「控件内容」子节点（排除包裹层、命中区、选中框等装饰节点）。
   */
  runtimeComponentContent(componentHostElement) {
    return (
      [...(componentHostElement?.children || [])].find(
        componentChildElement =>
          !componentChildElement.classList.contains("hb-component") &&
          !componentChildElement.classList.contains("hb-runtime-action-hitbox") &&
          !componentChildElement.classList.contains("hb-selection-bounds") &&
          !componentChildElement.classList.contains("hb-transform-handle")
      ) || null
    );
  },
  /**
   * 按容器尺寸重算画布缩放，并同步弹窗缩放与选中手柄。
   */
  resize() {
    if (!this.viewport || !this.document) {
      return;
    }
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    if (!containerWidth || !containerHeight) {
      return;
    }
    const widthRatio = containerWidth / this.document.canvas.width;
    const heightRatio = containerHeight / this.document.canvas.height;
    const scaleMode = this.options.scaleMode || this.document.canvas.scaleMode || "contain";
    const containScale =
      scaleMode === "cover" ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
    const appliedScaleXValue = scaleMode === "stretch" ? widthRatio : containScale;
    const appliedScaleYValue = scaleMode === "stretch" ? heightRatio : containScale;
    this.appliedScaleX = appliedScaleXValue;
    this.appliedScaleY = appliedScaleYValue;
    this.canvas.style.transform = "scale(" + appliedScaleXValue + ", " + appliedScaleYValue + ")";
    this.viewport.style.width = this.document.canvas.width * appliedScaleXValue + "px";
    this.viewport.style.height = this.document.canvas.height * appliedScaleYValue + "px";
    this.container.dataset.viewportAspect = (containerWidth / containerHeight).toFixed(3);
    this.container.dataset.renderScale = Math.min(appliedScaleXValue, appliedScaleYValue).toFixed(
      4
    );
    // 先读后写：先把全部手柄外框矩形一次读齐（整个 resize 只解析一次布局）再逐个套用；
    const transformHandleTargets = [];
    for (const [hostRecordId, componentHost] of this.componentHosts) {
      const componentRecord = this.componentRecords.get(hostRecordId);
      const boundsElement = this.transformHandleBoundsElement(componentHost, componentRecord);
      if (boundsElement) {
        transformHandleTargets.push({ componentHost, componentRecord, boundsElement });
      }
    }
    const multiSelectionBoundsElement = this.canvas.querySelector(
      ":scope > .hb-multi-selection-bounds"
    );
    for (const transformHandleTarget of transformHandleTargets) {
      transformHandleTarget.measuredBoundsRect =
        transformHandleTarget.boundsElement.getBoundingClientRect();
    }
    const measuredMultiSelectionRect = multiSelectionBoundsElement
      ? multiSelectionBoundsElement.getBoundingClientRect()
      : null;
    for (const transformHandleTarget of transformHandleTargets) {
      this.updateTransformHandleScale(
        transformHandleTarget.componentHost,
        transformHandleTarget.componentRecord,
        null,
        transformHandleTarget.measuredBoundsRect
      );
    }
    this.updateMultiSelectionHandleScale(multiSelectionBoundsElement, measuredMultiSelectionRect);
    // 收尾这条自己会读弹窗层的矩形（一遍 resize 里就这一次），读在它的写之前。
    this.updateRuntimeDialogScale();
  },
  /**
   * 把 resize 合并到下一帧：同一帧里的多次触发只跑一遍。
   */
  scheduleResize() {
    if (this.resizeFrameId) {
      return;
    }
    this.resizeFrameId = window.requestAnimationFrame(() => {
      this.resizeFrameId = 0;
      this.resize();
    });
  },
  /**
   * 销毁渲染器：断开订阅、移除监听、释放全部运行期资源。
   */
  destroy() {
    this.destroyed = true;
    this.activePopupId = null;
    this.historyDocumentGeneration += 1;
    this.historyPopupGeneration += 1;
    this.disconnectRuntime();
    window.clearTimeout(this.reconnectTimer);
    window.clearTimeout(this.runtimeRenderTimer);
    window.clearTimeout(this.historyRetryTimer);
    window.clearTimeout(this.runtimeHydrationRetryTimer);
    window.clearTimeout(this.pendingEntityDetails?.timer);
    window.clearInterval(this.historyPollTimer);
    this.runtimeStaticImageCache.stop();
    this.runtimeEffectImageLoader.stop();
    this.runtimeVacuumMapImagePreloader.stop();
    this.reconnectTimer = null;
    this.historyRetryTimer = 0;
    this.runtimeHydrationRetryTimer = null;
    this.runtimeHydrationRetryAttempt = 0;
    this.cleanupComponents();
    this.closeRuntimeDialog();
    this.pendingEntityDetails = null;
    this.runtimeDialogScaleContext = null;
    this.resizeObserver.disconnect();
    if (this.resizeFrameId) {
      window.cancelAnimationFrame(this.resizeFrameId);
      this.resizeFrameId = 0;
    }
    window.visualViewport?.removeEventListener("resize", this.boundResize);
    window.removeEventListener("orientationchange", this.boundResize);
    window.removeEventListener("online", this.boundReconnect);
    document.removeEventListener("visibilitychange", this.boundVisibilityChange);
    this.container.removeEventListener("click", this.boundRuntimeButtonSound, true);
    this.container.replaceChildren();
  }
};
