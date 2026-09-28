/*
 * 区块二：选中、多选与变换手势。
 */

import { capturePointer } from "../../../utils/pointer-capture.js";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
  renderRegisteredComponent
} from "../registry.js";
import {
  airflowCanvasOffsetBounds,
  airflowLayerGeometry,
  groupedComponentLocalDelta,
  rotateMultiSelectionTransforms
} from "../../geometry/transform-geometry.js";
import {
  assignComponentIds,
  componentDialogTitle,
  isModifierKeyPressed
} from "./primitives.js";

export const selectionTransformMethods: Record<string, (...args: any[]) => any> & ThisType<any> = {
  /**
   * 单选某个组件（转发到 setSelectedComponents）。
   */
  setSelectedComponent(selectionComponentId) {
    this.setSelectedComponents(
      selectionComponentId ? [selectionComponentId] : [],
      selectionComponentId
    );
  },
  /**
   * 设置多选集合，并确定唯一「主选」组件。
   */
  setSelectedComponents(componentIds, primaryComponentId = null) {
    this.selectedComponentIds = new Set(
      (componentIds || []).filter((recordComponentId: any) => this.componentRecords.has(recordComponentId))
    );
    this.selectedComponentId = this.selectedComponentIds.has(primaryComponentId)
      ? primaryComponentId
      : this.selectedComponentIds.values().next().value || null;
    this.syncSelection();
  },
  /**
   * 设置当前正在编辑的组（非 group 类型一律视为未选中组）。
   */
  setActiveGroup(groupId = null) {
    this.activeGroupId =
      groupId && this.componentRecords.get(groupId)?.type === "group" ? groupId : null;
    this.syncActiveGroup();
  },
  /**
   * 把当前组状态同步到 DOM（画布标记 + 每个宿主的组高亮）。
   */
  syncActiveGroup() {
    if (this.canvas) {
      this.canvas.classList.toggle("hb-editing-group", !!this.activeGroupId);
      for (const [hostedComponentId, hostComponentHost] of this.componentHosts) {
        hostComponentHost.classList.toggle(
          "hb-active-edit-group",
          hostedComponentId === this.activeGroupId &&
            hostComponentHost.parentElement === this.canvas
        );
      }
    }
  },
  /**
   * 指定某个组件的选中框要挂在哪一层上。
   */
  setComponentSelectionLayer(layerComponentId, layerKind = "button") {
    if (layerComponentId) {
      if (layerKind === "airflow") {
        this.componentSelectionLayers.set(layerComponentId, "airflow");
      } else if (layerKind === "effect") {
        this.componentSelectionLayers.set(layerComponentId, "effect");
      } else if (layerKind === "perspective") {
        this.componentSelectionLayers.set(layerComponentId, "perspective");
      } else {
        this.componentSelectionLayers.delete(layerComponentId);
      }
      this.syncSelection();
    }
  },
  /**
   * 强制组件进入预览态（on / off），"auto" 表示恢复按真实状态渲染。
   */
  setComponentPreviewState(previewComponentId, previewState = "auto") {
    if (previewState === "on" || previewState === "off") {
      this.componentPreviewStates.set(previewComponentId, previewState);
    } else {
      this.componentPreviewStates.delete(previewComponentId);
    }
    this.previewComponentProperties(previewComponentId);
  },
  /**
   * 预览组件的几何变换（位置 / 旋转 / 缩放），只改内存记录与 DOM，不写文档。
   */
  previewComponentTransform(transformComponentId, transformPatch = {}) {
    const transformRecord = this.componentRecords.get(transformComponentId);
    const transformHostElement = this.componentHosts.get(transformComponentId);
    if (!!transformRecord && !!transformHostElement) {
      transformRecord.position = {
        ...(transformRecord.position || {})
      };
      transformRecord.style = {
        ...(transformRecord.style || {})
      };
      if (Number.isFinite(transformPatch.x)) {
        transformRecord.position.x = transformPatch.x;
        transformHostElement.style.left = transformPatch.x + "px";
      }
      if (Number.isFinite(transformPatch.y)) {
        transformRecord.position.y = transformPatch.y;
        transformHostElement.style.top = transformPatch.y + "px";
      }
      if (Number.isFinite(transformPatch.width)) {
        transformRecord.position.width = transformPatch.width;
        transformHostElement.style.width = transformPatch.width + "px";
      }
      if (Number.isFinite(transformPatch.height)) {
        transformRecord.position.height = transformPatch.height;
        transformHostElement.style.height = transformPatch.height + "px";
      }
      if (Number.isFinite(transformPatch.rotation)) {
        transformRecord.position.rotation = transformPatch.rotation;
      }
      if (Number.isFinite(transformPatch.scale)) {
        transformRecord.style.scale = transformPatch.scale;
      }
      if (Number.isFinite(transformPatch.rotation) || Number.isFinite(transformPatch.scale)) {
        transformHostElement.style.transform =
          "rotate(" +
          Number(transformRecord.position.rotation || 0) +
          "deg) scale(" +
          Number(transformRecord.style.scale || 1) +
          ")";
      }
      this.syncComponentSelectionOverlay(transformComponentId);
      this.updateTransformHandleScale(transformHostElement, transformRecord);
    }
  },
  /**
   * 预览组件属性补丁：合并进组件记录后按控件类型走最小重绘。
   */
  previewComponentProperties(propertyComponentId, propertyPatch = {}) {
    const propertyRecord = this.componentRecords.get(propertyComponentId);
    const propertyHostElement = this.componentHosts.get(propertyComponentId);
    if (!propertyRecord || !propertyHostElement) {
      return;
    }
    propertyRecord.properties = {
      ...(propertyRecord.properties || {}),
      ...propertyPatch
    };
    if (
      propertyRecord.type === "camera" &&
      Object.hasOwn(propertyPatch, "label") &&
      this.detailsDialog?.dataset?.componentId === propertyComponentId
    ) {
      const previewHeadingElement = this.detailsDialog.querySelector(
        ".hb-camera-preview-heading strong"
      );
      if (previewHeadingElement) {
        previewHeadingElement.textContent = componentDialogTitle(propertyRecord, "摄像头实时预览");
      }
    }
    if (Number.isFinite(propertyPatch.opacity)) {
      const imageComponentElement = propertyHostElement.querySelector(".hb-image-component");
      if (imageComponentElement) {
        imageComponentElement.style.opacity = String(
          Math.max(0, Math.min(1, propertyPatch.opacity))
        );
      }
      const vacuumMapComponentElement = propertyHostElement.querySelector(
        ".hb-vacuum-map-component"
      );
      if (vacuumMapComponentElement) {
        vacuumMapComponentElement.style.opacity = String(
          Math.max(0, Math.min(1, propertyPatch.opacity))
        );
      }
    }
    if (propertyRecord.type === "light-statistics") {
      this.refreshRuntimeComponent(propertyComponentId);
      return;
    }
    const refreshableComponentTypes = [
      "time",
      "date",
      "weather",
      "panel-frame",
      "icon-button-effect",
      "title-button",
      "icon-button",
      "device-button",
      "presence-sensor",
      "air-conditioner",
      "camera",
      "vacuum-map",
      "floorplan-auto-diagram",
      "line-chart"
    ];
    if (this.options.editable && refreshableComponentTypes.includes(propertyRecord.type)) {
      this.refreshEditorComponent(propertyComponentId);
      return;
    }
    if (
      [
        "time",
        "date",
        "weather",
        "line-chart",
        "panel-frame",
        "icon-button-effect",
        "title-button",
        "icon-button",
        "device-button",
        "presence-sensor",
        "air-conditioner",
        "camera",
        "vacuum-map"
      ].includes(propertyRecord.type)
    ) {
      this.renderComponents();
      return;
    }
    if (propertyRecord.type === "navigation-button") {
      const existingContentElement = [...propertyHostElement.children].find(
        childElement => !childElement.classList.contains("hb-selection-bounds")
      );
      const componentRenderContext = {
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
        previewState: this.componentPreviewStates.get(propertyComponentId) || "auto",
        isIconVisible: (iconEntityId: any) => this.iconVisibilityState(iconEntityId),
        navigate: (navigatePath: any) => this.navigate(navigatePath),
        cleanup: (disposeCallback: any) => this.cleanups.push(disposeCallback)
      };
      const renderedContentElement = renderRegisteredComponent(
        this.profiledComponent(propertyRecord),
        componentRenderContext
      );
      const componentScale = Number(this.document.canvas.componentScale || 1);
      if (componentScale !== 1) {
        renderedContentElement.style.width = 100 / componentScale + "%";
        renderedContentElement.style.height = 100 / componentScale + "%";
        renderedContentElement.style.transform = "scale(" + componentScale + ")";
        renderedContentElement.style.transformOrigin = "top left";
      }
      if (existingContentElement) {
        existingContentElement.replaceWith(renderedContentElement);
      } else {
        propertyHostElement.prepend(renderedContentElement);
      }
    }
  },
  /**
   * 按当前选中集合重建选中框与变换手柄。
   */
  syncSelection() {
    this.canvas
      ?.querySelectorAll(".hb-multi-selection-bounds")
      .forEach((boundsElement: any) => boundsElement.remove());
    this.canvas
      ?.querySelectorAll(".hb-component-selection-overlay")
      .forEach((removedOverlayElement: any) => removedOverlayElement.remove());
    this.componentSelectionOverlays.clear();
    for (const airflowLayerElement of this.componentAirflowLayers.values()) {
      airflowLayerElement
        .querySelectorAll(":scope > .hb-selection-bounds")
        .forEach((airflowBoundsElement: any) => airflowBoundsElement.remove());
    }
    for (const [hostedSelectionComponentId, selectionHostElement] of this.componentHosts) {
      const isSelected =
        this.options.editable && this.selectedComponentIds.has(hostedSelectionComponentId);
      const selectionRecord = this.componentRecords.get(hostedSelectionComponentId);
      const isPendingDiagram =
        selectionRecord?.type === "floorplan-auto-diagram" &&
        selectionRecord.properties?.generated !== true;
      selectionHostElement.hidden = isPendingDiagram
        ? !isSelected
        : selectionRecord?.style?.visible === false;
      selectionHostElement.classList.toggle("selected", isSelected);
      selectionHostElement.classList.toggle(
        "selection-primary",
        isSelected && hostedSelectionComponentId === this.selectedComponentId
      );
      selectionHostElement.classList.toggle(
        "hb-light-statistics-selection-host",
        isSelected &&
          this.selectedComponentIds.size === 1 &&
          selectionRecord?.type === "light-statistics"
      );
      selectionHostElement
        .querySelectorAll(":scope > .hb-selection-bounds, :scope > .hb-transform-handle")
        .forEach((staleHandleElement: any) => staleHandleElement.remove());
      if (!isSelected) {
        continue;
      }
      const showAirflowHandles =
        this.selectedComponentIds.size === 1 &&
        hostedSelectionComponentId === this.selectedComponentId &&
        selectionRecord?.type === "air-conditioner" &&
        this.componentSelectionLayers.get(hostedSelectionComponentId) === "airflow";
      const showEffectHandles =
        this.selectedComponentIds.size === 1 &&
        hostedSelectionComponentId === this.selectedComponentId &&
        selectionRecord?.type === "icon-button-effect" &&
        this.componentSelectionLayers.get(hostedSelectionComponentId) === "effect";
      const showPerspectiveHandles =
        this.selectedComponentIds.size === 1 &&
        hostedSelectionComponentId === this.selectedComponentId &&
        selectionRecord?.type === "presence-sensor" &&
        selectionRecord?.properties?.sensorKind === "door-window" &&
        this.componentSelectionLayers.get(hostedSelectionComponentId) === "perspective";
      if (showAirflowHandles) {
        this.appendAirflowTransformHandles(
          this.componentAirflowLayers.get(hostedSelectionComponentId),
          selectionRecord
        );
      } else if (
        showEffectHandles &&
        this.componentEffectLayers.get(hostedSelectionComponentId) &&
        !this.componentEffectLayers.get(hostedSelectionComponentId).hidden
      ) {
        this.appendEffectSelectionBounds(
          this.componentEffectLayers.get(hostedSelectionComponentId),
          selectionRecord
        );
      } else if (showPerspectiveHandles) {
        const perspectiveOverlayElement =
          this.createComponentSelectionOverlay(selectionHostElement, selectionRecord) ||
          selectionHostElement;
        this.appendDoorWindowPerspectiveHandles(
          selectionHostElement,
          selectionRecord,
          perspectiveOverlayElement
        );
      } else {
        const isSingleSelection = this.selectedComponentIds.size === 1;
        const primaryOverlayElement = isSingleSelection
          ? this.createComponentSelectionOverlay(selectionHostElement, selectionRecord)
          : selectionHostElement;
        this.appendTransformHandles(
          selectionHostElement,
          selectionRecord,
          isSingleSelection,
          primaryOverlayElement || selectionHostElement
        );
      }
    }
    if (this.selectedComponentIds.size > 1) {
      this.appendMultiSelectionBounds();
    }
  },
  /**
   * 收集当前选中组件的记录与宿主元素，供批量缩放 / 旋转使用。
   */
  selectedScaleRecords() {
    const selectedRecords = [...this.selectedComponentIds].map(selectedComponentId => ({
      component: this.componentRecords.get(selectedComponentId),
      host: this.componentHosts.get(selectedComponentId)
    }));
    const selectionParentElement = selectedRecords[0]?.host?.parentElement || null;
    if (
      selectedRecords.length < 2 ||
      selectedRecords.some(
        selectedRecord =>
          !selectedRecord.component ||
          !selectedRecord.host ||
          selectedRecord.host.parentElement !== selectionParentElement ||
          selectedRecord.component.properties?.layoutMode === "fill"
      )
    ) {
      return [];
    } else {
      return selectedRecords;
    }
  },
  /**
   * 沿父级链累加旋转与缩放，得出该组件父级坐标系相对画布的总变换。
   */
  componentParentTransform(chainComponentId) {
    let parentComponentId = this.componentParentIds?.get(chainComponentId) || null;
    let accumulatedRotation = 0;
    let accumulatedScale = 1;
    const visitedParentIds = new Set();
    while (parentComponentId && !visitedParentIds.has(parentComponentId)) {
      visitedParentIds.add(parentComponentId);
      const parentRecord = this.componentRecords.get(parentComponentId);
      if (!parentRecord) {
        break;
      }
      accumulatedRotation += Number(parentRecord.position?.rotation || 0);
      accumulatedScale *= Math.max(0.01, Math.min(5, Number(parentRecord.style?.scale || 1)));
      parentComponentId = this.componentParentIds?.get(parentComponentId) || null;
    }
    return {
      rotation: accumulatedRotation,
      scale: accumulatedScale
    };
  },
  /**
   * 从该组件向上收集变换链（自身 → 各级父级）。
   */
  componentTransformChain(transformChainComponentId) {
    const transformChain = [];
    let currentComponentId = transformChainComponentId;
    const visitedChainIds = new Set();
    while (currentComponentId && !visitedChainIds.has(currentComponentId)) {
      visitedChainIds.add(currentComponentId);
      const chainRecord = this.componentRecords.get(currentComponentId);
      if (!chainRecord) {
        break;
      }
      transformChain.push(chainRecord);
      currentComponentId = this.componentParentIds?.get(currentComponentId) || null;
    }
    return transformChain;
  },
  /**
   * 把变换链上的旋转相加、缩放相乘，得到组件的世界变换。
   */
  componentWorldTransform(worldTransformComponentId) {
    return this.componentTransformChain(worldTransformComponentId).reduce(
      (accumulatedTransform: any, chainEntry: any) => ({
        rotation: accumulatedTransform.rotation + Number(chainEntry.position?.rotation || 0),
        scale:
          accumulatedTransform.scale *
          Math.max(0.01, Math.min(5, Number(chainEntry.style?.scale || 1)))
      }),
      {
        rotation: 0,
        scale: 1
      }
    );
  },
  /**
   * 画布坐标 → 组件局部坐标：逆序走变换链做逆向变换。
   */
  worldPointToComponentLocal(localPointComponentId, worldX, worldY) {
    let localPoint = {
      x: Number(worldX || 0),
      y: Number(worldY || 0)
    };
    const reversedChain = this.componentTransformChain(localPointComponentId).reverse();
    for (const chainComponent of reversedChain) {
      const componentPosition = chainComponent.position || {};
      const componentWidthPx = Number(componentPosition.width || 100);
      const componentHeightPx = Number(componentPosition.height || 100);
      const componentScaleValue = Math.max(
        0.01,
        Math.min(5, Number(chainComponent.style?.scale || 1))
      );
      // 组件声明的旋转角转弧度：文档里存的是角度，逆变换要按弧度算三角函数。
      const rotationRad = (Number(componentPosition.rotation || 0) * Math.PI) / 180;
      const rotationCosine = Math.cos(rotationRad);
      const rotationSine = Math.sin(rotationRad);
      const positionCenterX = Number(componentPosition.x || 0) + componentWidthPx / 2;
      const positionCenterY = Number(componentPosition.y || 0) + componentHeightPx / 2;
      // 相对组件中心的水平偏移：先除以缩放还原，再由下面的逆旋转还原到局部坐标系。
      const localOffsetX = (localPoint.x - positionCenterX) / componentScaleValue;
      // 相对组件中心的垂直偏移，还原方式与 localOffsetX 同批完成。
      const localOffsetY = (localPoint.y - positionCenterY) / componentScaleValue;
      localPoint = {
        x: componentWidthPx / 2 + localOffsetX * rotationCosine + localOffsetY * rotationSine,
        y: componentHeightPx / 2 - localOffsetX * rotationSine + localOffsetY * rotationCosine
      };
    }
    return localPoint;
  },
  /**
   * 组件局部坐标 → 画布坐标（顺序走变换链做正向变换）。
   */
  componentLocalPointToWorld(worldPointComponentId, localX, localY) {
    let worldPoint = {
      x: Number(localX || 0),
      y: Number(localY || 0)
    };
    for (const transformChainRecord of this.componentTransformChain(worldPointComponentId)) {
      const recordPosition = transformChainRecord.position || {};
      const recordWidthPx = Number(recordPosition.width || 100);
      const recordHeightPx = Number(recordPosition.height || 100);
      const recordScale = Math.max(
        0.01,
        Math.min(5, Number(transformChainRecord.style?.scale || 1))
      );
      // 同上，正变换用的旋转弧度。
      const recordRotationRad = (Number(recordPosition.rotation || 0) * Math.PI) / 180;
      // 先乘缩放把局部偏移放大，再叠加旋转。
      const scaledOffsetX = (worldPoint.x - recordWidthPx / 2) * recordScale;
      // 垂直分量，与 scaledOffsetX 一起代入下面的旋转矩阵。
      const scaledOffsetY = (worldPoint.y - recordHeightPx / 2) * recordScale;
      worldPoint = {
        x:
          Number(recordPosition.x || 0) +
          recordWidthPx / 2 +
          scaledOffsetX * Math.cos(recordRotationRad) -
          scaledOffsetY * Math.sin(recordRotationRad),
        y:
          Number(recordPosition.y || 0) +
          recordHeightPx / 2 +
          scaledOffsetX * Math.sin(recordRotationRad) +
          scaledOffsetY * Math.cos(recordRotationRad)
      };
    }
    return worldPoint;
  },
  /**
   * 计算组件在画布上的轴对齐包围盒（已计入缩放与旋转）。
   */
  componentVisualBounds(boundsComponent, boundsHostElement = null) {
    const boundsPosition = boundsComponent.position || {};
    const boundsWidthPx = Math.max(0.01, Number(boundsPosition.width || 100));
    const boundsHeightPx = Math.max(0.01, Number(boundsPosition.height || 100));
    let effectiveWidthPx = boundsWidthPx;
    let effectiveHeightPx = boundsHeightPx;
    let localOffsetLeftPx = 0;
    let localOffsetTopPx = 0;
    if (boundsComponent.type === "light-statistics" && boundsHostElement) {
      const selectionBoundsElement = boundsHostElement.querySelector(
        ":scope > .hb-selection-bounds"
      );
      const selectionBoundsRect = selectionBoundsElement
        ? [
            Number.parseFloat(selectionBoundsElement.style.left),
            Number.parseFloat(selectionBoundsElement.style.top),
            Number.parseFloat(selectionBoundsElement.style.width),
            Number.parseFloat(selectionBoundsElement.style.height)
          ]
        : [];
      if (
        selectionBoundsRect.every(Number.isFinite) &&
        selectionBoundsRect[2] > 0 &&
        selectionBoundsRect[3] > 0
      ) {
        // 十进制解析失败会得到 NaN，四个值必须同时有效才采用，
        [localOffsetLeftPx, localOffsetTopPx, effectiveWidthPx, effectiveHeightPx] =
          selectionBoundsRect;
      }
    }
    const boundsScale = Math.max(0.01, Math.min(5, Number(boundsComponent.style?.scale || 1)));
    // 旋转围绕组件声明矩形的中心（pivot），而不是可视件的中心：
    const boundsRotationRad = (Number(boundsPosition.rotation || 0) * Math.PI) / 180;
    const scaledWidthPx = effectiveWidthPx * boundsScale;
    const scaledHeightPx = effectiveHeightPx * boundsScale;
    const halfExtentX =
      (Math.abs(Math.cos(boundsRotationRad)) * scaledWidthPx +
        Math.abs(Math.sin(boundsRotationRad)) * scaledHeightPx) /
      2;
    const halfExtentY =
      (Math.abs(Math.sin(boundsRotationRad)) * scaledWidthPx +
        Math.abs(Math.cos(boundsRotationRad)) * scaledHeightPx) /
      2;
    const pivotCenterX = Number(boundsPosition.x || 0) + boundsWidthPx / 2;
    const pivotCenterY = Number(boundsPosition.y || 0) + boundsHeightPx / 2;
    const boundsCenterX = Number(boundsPosition.x || 0) + localOffsetLeftPx + effectiveWidthPx / 2;
    const boundsCenterY = Number(boundsPosition.y || 0) + localOffsetTopPx + effectiveHeightPx / 2;
    // 可视件中心相对旋转轴心（声明矩形中心）的偏移；缩放后仍绕轴心旋转。
    const centerDeltaX = (boundsCenterX - pivotCenterX) * boundsScale;
    // 垂直分量，与 centerDeltaX 一起代入旋转矩阵。
    const centerDeltaY = (boundsCenterY - pivotCenterY) * boundsScale;
    const rotatedCenterX =
      pivotCenterX +
      centerDeltaX * Math.cos(boundsRotationRad) -
      centerDeltaY * Math.sin(boundsRotationRad);
    const rotatedCenterY =
      pivotCenterY +
      centerDeltaX * Math.sin(boundsRotationRad) +
      centerDeltaY * Math.cos(boundsRotationRad);
    return {
      left: rotatedCenterX - halfExtentX,
      top: rotatedCenterY - halfExtentY,
      right: rotatedCenterX + halfExtentX,
      bottom: rotatedCenterY + halfExtentY
    };
  },
  /**
   * 求多个组件包围盒的并集（多选框的最小外接矩形）。
   */
  scaleRecordsBounds(scaleRecords) {
    const recordBoundsList = scaleRecords.map((scaleRecord: any) =>
      this.componentVisualBounds(scaleRecord.component, scaleRecord.host)
    );
    return {
      left: Math.min(...recordBoundsList.map((boundsLeft: any) => boundsLeft.left)),
      top: Math.min(...recordBoundsList.map((boundsTop: any) => boundsTop.top)),
      right: Math.max(...recordBoundsList.map((boundsRight: any) => boundsRight.right)),
      bottom: Math.max(...recordBoundsList.map((boundsBottom: any) => boundsBottom.bottom))
    };
  },
  /**
   * 刷新多选框的位置与手柄缩放（选中不足两个组件时移除多选框）。
   */
  refreshMultiSelectionBounds() {
    const multiSelectionBoundsElement = this.canvas?.querySelector(".hb-multi-selection-bounds");
    if (
      !multiSelectionBoundsElement ||
      !this.selectedComponentIds ||
      this.selectedComponentIds.size < 2
    ) {
      return;
    }
    const multiSelectionRecords = this.selectedScaleRecords();
    if (!multiSelectionRecords.length) {
      multiSelectionBoundsElement.remove();
      return;
    }
    const multiSelectionRect = this.scaleRecordsBounds(multiSelectionRecords);
    Object.assign(multiSelectionBoundsElement.style, {
      left: multiSelectionRect.left + "px",
      top: multiSelectionRect.top + "px",
      width: Math.max(1, multiSelectionRect.right - multiSelectionRect.left) + "px",
      height: Math.max(1, multiSelectionRect.bottom - multiSelectionRect.top) + "px"
    });
    this.updateMultiSelectionHandleScale(multiSelectionBoundsElement);
  },
  /**
   * 按画布缩放与世界缩放反向放大多选手柄。
   */
  updateMultiSelectionHandleScale(multiBoundsElement, measuredBoundsRect = null) {
    if (!multiBoundsElement) {
      return;
    }
    const canvasScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1);
    const ownerComponentId = multiBoundsElement.parentElement?.dataset?.componentId || null;
    const ownerWorldScale = ownerComponentId
      ? this.componentWorldTransform(ownerComponentId).scale
      : 1;
    const uiScaleFactor = 1 / Math.max(0.001, canvasScale * ownerWorldScale);
    // 读在写之前：--hb-ui-scale / --hb-handle-outset 只作用于外框的子手柄，
    const boundsClientRect = measuredBoundsRect || multiBoundsElement.getBoundingClientRect();
    multiBoundsElement.style.setProperty("--hb-ui-scale", String(uiScaleFactor));
    multiBoundsElement.style.setProperty("--hb-handle-outset", uiScaleFactor * 30 + "px");
    multiBoundsElement.classList.toggle(
      "handles-outside",
      boundsClientRect.width < 132 || boundsClientRect.height < 112
    );
  },
  /**
   * 创建多选框元素并插入画布（含八个缩放手柄与一个旋转手柄）。
   */
  appendMultiSelectionBounds() {
    const multiSelectionRecordList = this.selectedScaleRecords();
    if (!multiSelectionRecordList.length) {
      return;
    }
    const combinedBoundsRect = this.scaleRecordsBounds(multiSelectionRecordList);
    const multiSelectionElement = document.createElement("div");
    multiSelectionElement.className = "hb-selection-bounds hb-multi-selection-bounds";
    Object.assign(multiSelectionElement.style, {
      left: combinedBoundsRect.left + "px",
      top: combinedBoundsRect.top + "px",
      width: Math.max(1, combinedBoundsRect.right - combinedBoundsRect.left) + "px",
      height: Math.max(1, combinedBoundsRect.bottom - combinedBoundsRect.top) + "px"
    });
    for (const cornerPosition of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const cornerMarkerElement = document.createElement("i");
      cornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerPosition;
      cornerMarkerElement.setAttribute("aria-hidden", "true");
      multiSelectionElement.append(cornerMarkerElement);
    }
    const resizeHandleElement = document.createElement("button");
    resizeHandleElement.type = "button";
    resizeHandleElement.className = "hb-transform-handle hb-resize-handle";
    resizeHandleElement.title = "拖动整体缩放";
    resizeHandleElement.addEventListener("pointerdown", resizePointerEvent =>
      this.startComponentsScale(
        resizePointerEvent,
        multiSelectionRecordList,
        combinedBoundsRect,
        multiSelectionElement
      )
    );
    const rotateHandleElement = document.createElement("button");
    rotateHandleElement.type = "button";
    rotateHandleElement.className = "hb-transform-handle hb-rotate-handle";
    rotateHandleElement.title = "拖动整体旋转";
    rotateHandleElement.addEventListener("pointerdown", rotateHandlePointerEvent =>
      this.startComponentsRotate(
        rotateHandlePointerEvent,
        multiSelectionRecordList,
        combinedBoundsRect,
        multiSelectionElement
      )
    );
    multiSelectionElement.append(resizeHandleElement, rotateHandleElement);
    (multiSelectionRecordList[0]?.host?.parentElement || this.canvas).append(multiSelectionElement);
    this.updateMultiSelectionHandleScale(multiSelectionElement);
  },
  /**
   * 批量预览一组组件的变换（多选拖动 / 缩放 / 旋转的高频路径）。
   */
  previewComponentsTransform(this: any, transformList, leadComponentId = this.selectedComponentId) {
    for (const componentTransformItem of transformList || []) {
      const transformComponentRecord = this.componentRecords.get(
        componentTransformItem.componentId
      );
      const transformComponentHost = this.componentHosts.get(componentTransformItem.componentId);
      if (!!transformComponentRecord && !!transformComponentHost) {
        transformComponentRecord.position = {
          ...(transformComponentRecord.position || {}),
          ...(Number.isFinite(componentTransformItem.x)
            ? {
                x: componentTransformItem.x
              }
            : {}),
          ...(Number.isFinite(componentTransformItem.y)
            ? {
                y: componentTransformItem.y
              }
            : {})
        };
        if (Number.isFinite(componentTransformItem.scale)) {
          transformComponentRecord.style = {
            ...(transformComponentRecord.style || {}),
            scale: componentTransformItem.scale
          };
        }
        if (Number.isFinite(componentTransformItem.rotation)) {
          transformComponentRecord.position.rotation = componentTransformItem.rotation;
        }
        if (Number.isFinite(componentTransformItem.x)) {
          transformComponentHost.style.left = componentTransformItem.x + "px";
        }
        if (Number.isFinite(componentTransformItem.y)) {
          transformComponentHost.style.top = componentTransformItem.y + "px";
        }
        if (
          Number.isFinite(componentTransformItem.scale) ||
          Number.isFinite(componentTransformItem.rotation)
        ) {
          transformComponentHost.style.transform =
            "rotate(" +
            Number(transformComponentRecord.position?.rotation || 0) +
            "deg) scale(" +
            Number(transformComponentRecord.style?.scale || 1) +
            ")";
        }
      }
    }
    this.syncSelection();
    this.options.onComponentsTransformPreview?.(transformList, leadComponentId);
  },
  /**
   * 开始多选缩放：按指针相对包围盒中心距离的变化换算缩放比例。
   */
  startComponentsScale(scalePointerEvent, recordList, boundsRect, activeBoundsElement) {
    scalePointerEvent.preventDefault();
    scalePointerEvent.stopPropagation();
    const multiBoundsClientRect = activeBoundsElement.getBoundingClientRect();
    const boundingCenterX = multiBoundsClientRect.left + multiBoundsClientRect.width / 2;
    const boundingCenterY = multiBoundsClientRect.top + multiBoundsClientRect.height / 2;
    const initialPointerDistance = Math.max(
      1,
      Math.hypot(
        scalePointerEvent.clientX - boundingCenterX,
        scalePointerEvent.clientY - boundingCenterY
      )
    );
    // 多选缩放的不动点：起始包围盒中心，所有选中的组件按它等比外扩或内缩。
    const selectionCenterX = (boundsRect.left + boundsRect.right) / 2;
    // 不动点的垂直分量，与 selectionCenterX 配对使用。
    const selectionCenterY = (boundsRect.top + boundsRect.bottom) / 2;
    const scalableRecords = recordList.map((scaleEntry: any) => {
      const entryPosition = scaleEntry.component.position || {};
      const entryWidthPx = Number(entryPosition.width || 100);
      const entryHeightPx = Number(entryPosition.height || 100);
      return {
        ...scaleEntry,
        width: entryWidthPx,
        height: entryHeightPx,
        centerX: Number(entryPosition.x || 0) + entryWidthPx / 2,
        centerY: Number(entryPosition.y || 0) + entryHeightPx / 2,
        scale: Math.max(0.01, Math.min(5, Number(scaleEntry.component.style?.scale || 1)))
      };
    });
    const minScaleFactor = Math.max(
      ...scalableRecords.map((minScaleEntry: any) => 0.01 / minScaleEntry.scale)
    );
    const maxScaleFactor = Math.min(
      ...scalableRecords.map((maxScaleEntry: any) => 5 / maxScaleEntry.scale)
    );
    let scaleFactor = 1;
    let previewTransforms: any[] = [];
    let isFinished = false;
    const activePointerId = scalePointerEvent.pointerId;
    capturePointer(scalePointerEvent.currentTarget, activePointerId);
    /**
     * 多选缩放期间的指针移动处理：按指针到包围盒中心的距离比例缩放整批组件。
     */
    const onScalePointerMove = (scaleMoveEvent: any) => {
      if (scaleMoveEvent.pointerId !== activePointerId) {
        return;
      }
      const currentDistance = Math.hypot(
        scaleMoveEvent.clientX - boundingCenterX,
        scaleMoveEvent.clientY - boundingCenterY
      );
      scaleFactor = Math.max(
        minScaleFactor,
        Math.min(maxScaleFactor, currentDistance / initialPointerDistance)
      );
      previewTransforms = scalableRecords.map((scaleTargetEntry: any) => {
        const scaledCenterX =
          selectionCenterX + (scaleTargetEntry.centerX - selectionCenterX) * scaleFactor;
        const scaledCenterY =
          selectionCenterY + (scaleTargetEntry.centerY - selectionCenterY) * scaleFactor;
        const nextEntryScale = scaleTargetEntry.scale * scaleFactor;
        const nextLeftPx = scaledCenterX - scaleTargetEntry.width / 2;
        const nextTopPx = scaledCenterY - scaleTargetEntry.height / 2;
        scaleTargetEntry.component.position = {
          ...(scaleTargetEntry.component.position || {}),
          x: nextLeftPx,
          y: nextTopPx
        };
        scaleTargetEntry.component.style = {
          ...(scaleTargetEntry.component.style || {}),
          scale: nextEntryScale
        };
        scaleTargetEntry.host.style.left = nextLeftPx + "px";
        scaleTargetEntry.host.style.top = nextTopPx + "px";
        scaleTargetEntry.host.style.transform =
          "rotate(" +
          Number(scaleTargetEntry.component.position?.rotation || 0) +
          "deg) scale(" +
          nextEntryScale +
          ")";
        return {
          componentId: scaleTargetEntry.component.id,
          x: nextLeftPx,
          y: nextTopPx,
          scale: nextEntryScale
        };
      });
      Object.assign(activeBoundsElement.style, {
        left: selectionCenterX + (boundsRect.left - selectionCenterX) * scaleFactor + "px",
        top: selectionCenterY + (boundsRect.top - selectionCenterY) * scaleFactor + "px",
        width: Math.max(1, (boundsRect.right - boundsRect.left) * scaleFactor) + "px",
        height: Math.max(1, (boundsRect.bottom - boundsRect.top) * scaleFactor) + "px"
      });
      this.updateMultiSelectionHandleScale(activeBoundsElement);
      this.options.onComponentsTransformPreview?.(previewTransforms, this.selectedComponentId);
    };
    /**
     * 结束多选缩放：解绑全局监听，有实际缩放才把最终变换提交给编辑器。
     */
    const onScalePointerEnd = (endEvent: any = null) => {
      if (!isFinished && (endEvent?.pointerId == null || endEvent.pointerId === activePointerId)) {
        isFinished = true;
        window.removeEventListener("pointermove", onScalePointerMove, true);
        window.removeEventListener("pointerup", onScalePointerEnd, true);
        window.removeEventListener("pointercancel", onScalePointerEnd, true);
        window.removeEventListener("blur", onScalePointerEnd);
        if (scaleFactor !== 1 && previewTransforms.length) {
          this.options.onComponentsTransform?.(previewTransforms, this.selectedComponentId);
        }
      }
    };
    window.addEventListener("pointermove", onScalePointerMove, true);
    window.addEventListener("pointerup", onScalePointerEnd, true);
    window.addEventListener("pointercancel", onScalePointerEnd, true);
    window.addEventListener("blur", onScalePointerEnd);
  },
  /**
   * 开始多选旋转：按指针相对包围盒中心的角度变化旋转整批组件。
   */
  startComponentsRotate(
    rotationPointerEvent,
    rotationRecordList,
    rotateBoundsRect,
    rotateBoundsElement
  ) {
    rotationPointerEvent.preventDefault();
    rotationPointerEvent.stopPropagation();
    const rotateBoundsClientRect = rotateBoundsElement.getBoundingClientRect();
    const rotateCenterX = rotateBoundsClientRect.left + rotateBoundsClientRect.width / 2;
    const rotateCenterY = rotateBoundsClientRect.top + rotateBoundsClientRect.height / 2;
    // 旋转轴心取起始包围盒中心（画布坐标），与多选缩放的不动点保持同一套约定。
    const rotatePivotX = (rotateBoundsRect.left + rotateBoundsRect.right) / 2;
    // 轴心的垂直分量。
    const rotatePivotY = (rotateBoundsRect.top + rotateBoundsRect.bottom) / 2;
    const rotatableRecords = rotationRecordList.map((rotateEntry: any) => {
      const rotateEntryPosition = rotateEntry.component.position || {};
      const rotateEntryWidthPx = Number(rotateEntryPosition.width || 100);
      const rotateEntryHeightPx = Number(rotateEntryPosition.height || 100);
      return {
        ...rotateEntry,
        componentId: rotateEntry.component.id,
        width: rotateEntryWidthPx,
        height: rotateEntryHeightPx,
        centerX: Number(rotateEntryPosition.x || 0) + rotateEntryWidthPx / 2,
        centerY: Number(rotateEntryPosition.y || 0) + rotateEntryHeightPx / 2,
        rotation: Number(rotateEntryPosition.rotation || 0)
      };
    });
    let lastPointerAngle = Math.atan2(
      rotationPointerEvent.clientY - rotateCenterY,
      rotationPointerEvent.clientX - rotateCenterX
    );
    let accumulatedRotationDeg = 0;
    let rotatedTransforms: any[] = [];
    let isRotateFinished = false;
    const rotatePointerId = rotationPointerEvent.pointerId;
    capturePointer(rotationPointerEvent.currentTarget, rotatePointerId);
    /**
     * 多选旋转期间的指针移动处理：按指针绕包围盒中心的累计转角旋转整批组件。
     */
    const onRotatePointerMove = (rotateMoveEvent: any) => {
      if (rotateMoveEvent.pointerId !== rotatePointerId) {
        return;
      }
      const currentPointerAngle = Math.atan2(
        rotateMoveEvent.clientY - rotateCenterY,
        rotateMoveEvent.clientX - rotateCenterX
      );
      let angleDelta = currentPointerAngle - lastPointerAngle;
      if (angleDelta > Math.PI) {
        angleDelta -= Math.PI * 2;
      } else if (angleDelta < -Math.PI) {
        angleDelta += Math.PI * 2;
      }
      accumulatedRotationDeg += (angleDelta * 180) / Math.PI;
      lastPointerAngle = currentPointerAngle;
      rotatedTransforms = rotateMultiSelectionTransforms(
        rotatableRecords,
        rotatePivotX,
        rotatePivotY,
        accumulatedRotationDeg
      );
      for (const rotatedTransform of rotatedTransforms) {
        const matchedRotateEntry = rotatableRecords.find(
          (entryTransform: any) => entryTransform.componentId === rotatedTransform.componentId
        );
        if (matchedRotateEntry) {
          matchedRotateEntry.component.position = {
            ...(matchedRotateEntry.component.position || {}),
            x: rotatedTransform.x,
            y: rotatedTransform.y,
            rotation: rotatedTransform.rotation
          };
          matchedRotateEntry.host.style.left = rotatedTransform.x + "px";
          matchedRotateEntry.host.style.top = rotatedTransform.y + "px";
          matchedRotateEntry.host.style.transform =
            "rotate(" +
            rotatedTransform.rotation +
            "deg) scale(" +
            Number(matchedRotateEntry.component.style?.scale || 1) +
            ")";
        }
      }
      rotateBoundsElement.style.transform = "rotate(" + accumulatedRotationDeg + "deg)";
      rotateBoundsElement.style.transformOrigin = "center center";
      this.options.onComponentsTransformPreview?.(rotatedTransforms, this.selectedComponentId);
    };
    /**
     * 结束多选旋转：解绑全局监听，转过角度不为零才提交。
     */
    const onRotatePointerEnd = (rotateEndEvent: any = null) => {
      if (
        !isRotateFinished &&
        (rotateEndEvent?.pointerId == null || rotateEndEvent.pointerId === rotatePointerId)
      ) {
        isRotateFinished = true;
        window.removeEventListener("pointermove", onRotatePointerMove, true);
        window.removeEventListener("pointerup", onRotatePointerEnd, true);
        window.removeEventListener("pointercancel", onRotatePointerEnd, true);
        window.removeEventListener("blur", onRotatePointerEnd);
        if (accumulatedRotationDeg !== 0 && rotatedTransforms.length) {
          this.options.onComponentsTransform?.(rotatedTransforms, this.selectedComponentId);
        }
      }
    };
    window.addEventListener("pointermove", onRotatePointerMove, true);
    window.addEventListener("pointerup", onRotatePointerEnd, true);
    window.addEventListener("pointercancel", onRotatePointerEnd, true);
    window.addEventListener("blur", onRotatePointerEnd);
  },
  /**
   * 开始拖动组件（编辑器的核心交互）。
   */
  startComponentMove(
    dragPointerEvent,
    draggedComponent,
    dragHostElement,
    captureElement = dragHostElement
  ) {
    if (
      !this.options.editable ||
      !this.selectedComponentIds.has(draggedComponent.id) ||
      draggedComponent.properties?.layoutMode === "fill" ||
      dragPointerEvent.button !== 0 ||
      dragPointerEvent.target.closest(".hb-transform-handle")
    ) {
      return;
    }
    dragPointerEvent.preventDefault();
    dragPointerEvent.stopPropagation();
    const pointerStartX = dragPointerEvent.clientX;
    const pointerStartY = dragPointerEvent.clientY;
    const dragRecords = [...this.selectedComponentIds]
      .map(selectedRecordComponentId => ({
        component: this.componentRecords.get(selectedRecordComponentId),
        host: this.componentHosts.get(selectedRecordComponentId)
      }))
      .filter(dragRecord => dragRecord.component && dragRecord.host)
      .map(dragRecordEntry => ({
        ...dragRecordEntry,
        initialX: Number(dragRecordEntry.component.position?.x || 0),
        initialY: Number(dragRecordEntry.component.position?.y || 0),
        width: Number(dragRecordEntry.component.position?.width || 100),
        height: Number(dragRecordEntry.component.position?.height || 100),
        parentId: this.componentParentIds.get(dragRecordEntry.component.id) || null,
        parentTransform: this.componentParentTransform(dragRecordEntry.component.id),
        worldCenter: this.componentLocalPointToWorld(
          dragRecordEntry.component.id,
          Number(dragRecordEntry.component.position?.width || 100) / 2,
          Number(dragRecordEntry.component.position?.height || 100) / 2
        )
      }));
    if (
      !dragRecords.some(
        draggedRecordCheck => draggedRecordCheck.component.id === draggedComponent.id
      ) ||
      dragRecords.some(
        filledRecordCheck => filledRecordCheck.component.properties?.layoutMode === "fill"
      )
    ) {
      return;
    }
    let isCopyDrag = isModifierKeyPressed(dragPointerEvent);
    let isAirflowDrag =
      !isCopyDrag &&
      dragRecords.length === 1 &&
      draggedComponent.type === "air-conditioner" &&
      this.componentSelectionLayers.get(draggedComponent.id) !== "airflow";
    const initialAirflowOffsetX = Number(draggedComponent.properties?.airflowOffsetX ?? -75);
    const initialAirflowOffsetY = Number(draggedComponent.properties?.airflowOffsetY ?? 34);
    let nextAirflowOffsetX = initialAirflowOffsetX;
    let nextAirflowOffsetY = initialAirflowOffsetY;
    const dragCanvasWidthPx = Number(this.document?.canvas?.width || 2778);
    const dragCanvasHeightPx = Number(this.document?.canvas?.height || 1940);
    const dragBounds = dragRecords.reduce(
      (accumulatedBounds, boundsRecordEntry) => ({
        minX: Math.max(accumulatedBounds.minX, Math.min(0, -boundsRecordEntry.worldCenter.x)),
        maxX: Math.min(
          accumulatedBounds.maxX,
          Math.max(0, dragCanvasWidthPx - boundsRecordEntry.worldCenter.x)
        ),
        minY: Math.max(accumulatedBounds.minY, Math.min(0, -boundsRecordEntry.worldCenter.y)),
        maxY: Math.min(
          accumulatedBounds.maxY,
          Math.max(0, dragCanvasHeightPx - boundsRecordEntry.worldCenter.y)
        )
      }),
      {
        minX: -Infinity,
        maxX: Infinity,
        minY: -Infinity,
        maxY: Infinity
      }
    );
    const startComponentX = Number(draggedComponent.position?.x || 0);
    const startComponentY = Number(draggedComponent.position?.y || 0);
    let nextComponentX = startComponentX;
    let nextComponentY = startComponentY;
    let activeDragRecords: any[] = dragRecords;
    let copiedComponentEntries: any[] = [];
    let currentOffsets = dragRecords.map(initialOffsetRecord => ({
      componentId: initialOffsetRecord.component.id,
      x: initialOffsetRecord.initialX,
      y: initialOffsetRecord.initialY
    }));
    let draggedCopyId = draggedComponent.id;
    let didCreateCopies = false;
    let axisLockAxis = "";
    let isDragFinished = false;
    const dragPointerId = dragPointerEvent.pointerId;
    capturePointer(captureElement, dragPointerId);
    dragRecords.forEach(movingRecord => movingRecord.host.classList.add("moving"));
    /**
     * 组件拖动期间的指针移动处理：把屏幕位移换算成画布坐标并更新整批被拖组件。
     */
    const onDragPointerMove = (moveEvent: any) => {
      if (moveEvent.pointerId !== dragPointerId) {
        return;
      }
      // 拖拽途中元素可能被重新渲染而使捕获退化成「没有」：每次 move 补一次。
      if (!captureElement.hasPointerCapture?.(dragPointerId)) {
        capturePointer(captureElement, dragPointerId);
      }
      if (!isCopyDrag && isModifierKeyPressed(moveEvent)) {
        isCopyDrag = true;
        isAirflowDrag = false;
      }
      let deltaClientX = moveEvent.clientX - pointerStartX;
      let deltaClientY = moveEvent.clientY - pointerStartY;
      if (isCopyDrag && !didCreateCopies) {
        if (Math.hypot(deltaClientX, deltaClientY) < 3) {
          return;
        }
        copiedComponentEntries = dragRecords.map(copiedSourceRecord => {
          const copiedComponent = assignComponentIds(structuredClone(copiedSourceRecord.component));
          copiedComponent.position = {
            ...(copiedComponent.position || {}),
            zIndex: Number(copiedComponent.position?.zIndex || 1) + 1
          };
          this.renderComponent(copiedComponent, copiedSourceRecord.host.parentElement);
          return {
            sourceComponentId: copiedSourceRecord.component.id,
            copiedComponent: copiedComponent
          };
        });
        activeDragRecords = copiedComponentEntries.map((copyEntry, copyIndex) => ({
          component: copyEntry.copiedComponent,
          host: this.componentHosts.get(copyEntry.copiedComponent.id),
          initialX: dragRecords[copyIndex].initialX,
          initialY: dragRecords[copyIndex].initialY,
          width: dragRecords[copyIndex].width,
          height: dragRecords[copyIndex].height,
          parentId: dragRecords[copyIndex].parentId,
          parentTransform: dragRecords[copyIndex].parentTransform
        }));
        draggedCopyId =
          copiedComponentEntries.find(
            matchedCopyEntry => matchedCopyEntry.sourceComponentId === draggedComponent.id
          )?.copiedComponent.id || copiedComponentEntries[0]?.copiedComponent.id;
        didCreateCopies = true;
        dragRecords.forEach(stoppedMovingRecord =>
          stoppedMovingRecord.host.classList.remove("moving")
        );
        activeDragRecords.forEach(copyDragRecord => copyDragRecord.host?.classList.add("moving"));
        this.selectedComponentId = draggedCopyId;
        this.selectedComponentIds = new Set(
          activeDragRecords.map(copyDragRecordEntry => copyDragRecordEntry.component.id)
        );
      }
      if (moveEvent.shiftKey) {
        if (!axisLockAxis && Math.hypot(deltaClientX, deltaClientY) >= 1) {
          axisLockAxis =
            Math.abs(deltaClientX) >= Math.abs(deltaClientY) ? "horizontal" : "vertical";
        }
        if (axisLockAxis === "horizontal") {
          deltaClientY = 0;
        }
        if (axisLockAxis === "vertical") {
          deltaClientX = 0;
        }
      } else {
        axisLockAxis = "";
      }
      const clampedDeltaX = Math.max(
        dragBounds.minX,
        Math.min(dragBounds.maxX, deltaClientX / (this.appliedScaleX || 1))
      );
      const clampedDeltaY = Math.max(
        dragBounds.minY,
        Math.min(dragBounds.maxY, deltaClientY / (this.appliedScaleY || 1))
      );
      const leadDragRecord =
        dragRecords.find(leadRecordMatch => leadRecordMatch.component.id === draggedComponent.id) ||
        dragRecords[0];
      const leadLocalDelta = groupedComponentLocalDelta(
        clampedDeltaX,
        clampedDeltaY,
        leadDragRecord.parentTransform
      );
      nextComponentX = startComponentX + leadLocalDelta.x;
      nextComponentY = startComponentY + leadLocalDelta.y;
      if (isAirflowDrag) {
        nextAirflowOffsetX =
          initialAirflowOffsetX -
          (leadLocalDelta.x / Math.max(1, Number(draggedComponent.position?.width || 100))) * 100;
        nextAirflowOffsetY =
          initialAirflowOffsetY -
          (leadLocalDelta.y / Math.max(1, Number(draggedComponent.position?.height || 100))) * 100;
        draggedComponent.properties = {
          ...(draggedComponent.properties || {}),
          airflowOffsetX: nextAirflowOffsetX,
          airflowOffsetY: nextAirflowOffsetY
        };
        this.options.onComponentPropertiesPreview?.(draggedComponent.id, {
          airflowOffsetX: nextAirflowOffsetX,
          airflowOffsetY: nextAirflowOffsetY
        });
      }
      const offsetUpdates = activeDragRecords.map(draggingCopyRecord => {
        const localDelta = groupedComponentLocalDelta(
          clampedDeltaX,
          clampedDeltaY,
          draggingCopyRecord.parentTransform
        );
        return {
          componentId: draggingCopyRecord.component.id,
          x: draggingCopyRecord.initialX + localDelta.x,
          y: draggingCopyRecord.initialY + localDelta.y
        };
      });
      currentOffsets = offsetUpdates;
      for (const offsetUpdate of offsetUpdates) {
        const offsetHostElement = this.componentHosts.get(offsetUpdate.componentId);
        if (offsetHostElement) {
          offsetHostElement.style.left = offsetUpdate.x + "px";
          offsetHostElement.style.top = offsetUpdate.y + "px";
        }
        const offsetOverlayElement = this.componentSelectionOverlays.get(offsetUpdate.componentId);
        if (offsetOverlayElement) {
          offsetOverlayElement.style.left = offsetUpdate.x + "px";
          offsetOverlayElement.style.top = offsetUpdate.y + "px";
        }
      }
      if (!didCreateCopies) {
        if (offsetUpdates.length > 1) {
          this.options.onComponentsTransformPreview?.(offsetUpdates, draggedComponent.id);
        } else {
          this.options.onComponentTransformPreview?.(draggedComponent.id, {
            x: nextComponentX,
            y: nextComponentY
          });
        }
      }
    };
    /**
     * 结束拖动：解绑全局监听，并按手势类型分别提交（新建副本 / 多选位移 / 单选位移）。
     */
    const onDragPointerEnd = (dragEndEvent: any = null) => {
      if (
        !isDragFinished &&
        (dragEndEvent?.pointerId == null || dragEndEvent.pointerId === dragPointerId) &&
        ((isDragFinished = true),
        activeDragRecords.forEach(settledCopyRecord =>
          settledCopyRecord.host?.classList.remove("moving")
        ),
        dragRecords.forEach(settledDragRecord => settledDragRecord.host.classList.remove("moving")),
        window.removeEventListener("pointermove", onDragPointerMove, true),
        window.removeEventListener("pointerup", onDragPointerEnd, true),
        window.removeEventListener("pointercancel", onDragPointerEnd, true),
        window.removeEventListener("blur", onDragPointerEnd),
        nextComponentX !== startComponentX || nextComponentY !== startComponentY)
      ) {
        if (didCreateCopies) {
          activeDragRecords.forEach(committedCopyRecord => {
            const matchingOffset = currentOffsets.find(
              offsetUpdateEntry =>
                offsetUpdateEntry.componentId === committedCopyRecord.component.id
            );
            committedCopyRecord.component.position = {
              ...(committedCopyRecord.component.position || {}),
              x: matchingOffset?.x ?? committedCopyRecord.initialX,
              y: matchingOffset?.y ?? committedCopyRecord.initialY
            };
          });
          this.options.onComponentsDuplicate?.(
            copiedComponentEntries,
            draggedCopyId
          );
        } else if (dragRecords.length > 1) {
          const finalUpdates = currentOffsets.map(finalUpdateEntry => {
            const matchingDragRecord = dragRecords.find(
              finalRecordMatch => finalRecordMatch.component.id === finalUpdateEntry.componentId
            );
            if (matchingDragRecord) {
              matchingDragRecord.component.position = {
                ...(matchingDragRecord.component.position || {}),
                x: finalUpdateEntry.x,
                y: finalUpdateEntry.y
              };
            }
            return finalUpdateEntry;
          });
          this.options.onComponentsTransform?.(finalUpdates, draggedComponent.id);
        } else {
          draggedComponent.position = {
            ...(draggedComponent.position || {}),
            x: nextComponentX,
            y: nextComponentY
          };
          this.options.onComponentTransform?.(draggedComponent.id, {
            x: nextComponentX,
            y: nextComponentY,
            ...(isAirflowDrag
              ? {
                  airflowOffsetX: nextAirflowOffsetX,
                  airflowOffsetY: nextAirflowOffsetY
                }
              : {})
          });
        }
      }
    };
    window.addEventListener("pointermove", onDragPointerMove, true);
    window.addEventListener("pointerup", onDragPointerEnd, true);
    window.addEventListener("pointercancel", onDragPointerEnd, true);
    window.addEventListener("blur", onDragPointerEnd);
  },
  /**
   * 开始单组件缩放。
   */
  startComponentScale(
    componentScalePointerEvent,
    scaleTargetRecord,
    scaleTargetHostElement,
    scaleTargetOverlayElement
  ) {
    componentScalePointerEvent.preventDefault();
    componentScalePointerEvent.stopPropagation();
    const scaleOriginRect =
      scaleTargetOverlayElement?.getBoundingClientRect() ||
      scaleTargetHostElement.getBoundingClientRect();
    const scaleOriginCenterX = scaleOriginRect.left + scaleOriginRect.width / 2;
    const scaleOriginCenterY = scaleOriginRect.top + scaleOriginRect.height / 2;
    const componentScaleStartDistancePx = Math.max(
      1,
      Math.hypot(
        componentScalePointerEvent.clientX - scaleOriginCenterX,
        componentScalePointerEvent.clientY - scaleOriginCenterY
      )
    );
    const componentInitialScale = Math.max(
      0.01,
      Math.min(5, Number(scaleTargetRecord.style?.scale || 1))
    );
    let componentNextScale = componentInitialScale;
    let isComponentScaleFinished = false;
    const componentScalePointerId = componentScalePointerEvent.pointerId;
    capturePointer(componentScalePointerEvent.currentTarget, componentScalePointerId);
    /**
     * 单组件缩放期间的指针移动处理：按指针到组件中心的距离比例更新缩放值。
     */
    const onComponentScalePointerMove = (componentScaleMoveEvent: any) => {
      if (componentScaleMoveEvent.pointerId !== componentScalePointerId) {
        return;
      }
      const componentScaleMoveDistancePx = Math.hypot(
        componentScaleMoveEvent.clientX - scaleOriginCenterX,
        componentScaleMoveEvent.clientY - scaleOriginCenterY
      );
      componentNextScale = Math.max(
        0.01,
        Math.min(
          5,
          (componentInitialScale * componentScaleMoveDistancePx) / componentScaleStartDistancePx
        )
      );
      scaleTargetRecord.style = {
        ...(scaleTargetRecord.style || {}),
        scale: componentNextScale
      };
      scaleTargetHostElement.style.transform =
        "rotate(" +
        Number(scaleTargetRecord.position?.rotation || 0) +
        "deg) scale(" +
        componentNextScale +
        ")";
      const scaleOverlayLookupElement = this.componentSelectionOverlays.get(scaleTargetRecord.id);
      if (scaleOverlayLookupElement) {
        scaleOverlayLookupElement.style.transform = scaleTargetHostElement.style.transform;
      }
      this.updateTransformHandleScale(
        scaleTargetHostElement,
        scaleTargetRecord,
        scaleTargetOverlayElement
      );
      this.options.onComponentTransformPreview?.(scaleTargetRecord.id, {
        scale: componentNextScale
      });
    };
    /**
     * 结束单组件缩放：解绑全局监听，缩放值有变化才提交。
     */
    const onComponentScalePointerEnd = (componentScaleEndEvent: any = null) => {
      if (
        !isComponentScaleFinished &&
        (componentScaleEndEvent?.pointerId == null ||
          componentScaleEndEvent.pointerId === componentScalePointerId)
      ) {
        isComponentScaleFinished = true;
        window.removeEventListener("pointermove", onComponentScalePointerMove, true);
        window.removeEventListener("pointerup", onComponentScalePointerEnd, true);
        window.removeEventListener("pointercancel", onComponentScalePointerEnd, true);
        window.removeEventListener("blur", onComponentScalePointerEnd);
        scaleTargetRecord.style = {
          ...(scaleTargetRecord.style || {}),
          scale: componentNextScale
        };
        if (componentNextScale !== componentInitialScale) {
          this.options.onComponentTransform?.(scaleTargetRecord.id, {
            scale: componentNextScale
          });
        }
      }
    };
    window.addEventListener("pointermove", onComponentScalePointerMove, true);
    window.addEventListener("pointerup", onComponentScalePointerEnd, true);
    window.addEventListener("pointercancel", onComponentScalePointerEnd, true);
    window.addEventListener("blur", onComponentScalePointerEnd);
  },
  /**
   * 开始单组件旋转（以组件中心为轴心，按指针角度变化换算旋转角）。
   */
  startComponentRotate(
    componentRotatePointerEvent,
    rotateTargetRecord,
    rotateTargetHostElement,
    rotateTargetOverlayElement
  ) {
    componentRotatePointerEvent.preventDefault();
    componentRotatePointerEvent.stopPropagation();
    const rotateOriginRect =
      rotateTargetOverlayElement?.getBoundingClientRect() ||
      rotateTargetHostElement.getBoundingClientRect();
    const rotateOriginCenterX = rotateOriginRect.left + rotateOriginRect.width / 2;
    const rotateOriginCenterY = rotateOriginRect.top + rotateOriginRect.height / 2;
    const componentRotateStartAngleRad = Math.atan2(
      componentRotatePointerEvent.clientY - rotateOriginCenterY,
      componentRotatePointerEvent.clientX - rotateOriginCenterX
    );
    const componentInitialRotationDeg = Number(rotateTargetRecord.position?.rotation || 0);
    let componentNextRotationDeg = componentInitialRotationDeg;
    let isComponentRotateFinished = false;
    const componentRotatePointerId = componentRotatePointerEvent.pointerId;
    capturePointer(componentRotatePointerEvent.currentTarget, componentRotatePointerId);
    /**
     * 单组件旋转期间的指针移动处理：按指针绕组件中心的极角差更新旋转角。
     */
    const onComponentRotatePointerMove = (componentRotateMoveEvent: any) => {
      if (componentRotateMoveEvent.pointerId !== componentRotatePointerId) {
        return;
      }
      const componentPointerAngleRad = Math.atan2(
        componentRotateMoveEvent.clientY - rotateOriginCenterY,
        componentRotateMoveEvent.clientX - rotateOriginCenterX
      );
      componentNextRotationDeg =
        componentInitialRotationDeg +
        ((componentPointerAngleRad - componentRotateStartAngleRad) * 180) / Math.PI;
      rotateTargetHostElement.style.transform =
        "rotate(" +
        componentNextRotationDeg +
        "deg) scale(" +
        Number(rotateTargetRecord.style?.scale || 1) +
        ")";
      const rotateOverlayLookupElement = this.componentSelectionOverlays.get(rotateTargetRecord.id);
      if (rotateOverlayLookupElement) {
        rotateOverlayLookupElement.style.transform = rotateTargetHostElement.style.transform;
      }
      this.options.onComponentTransformPreview?.(rotateTargetRecord.id, {
        rotation: componentNextRotationDeg
      });
    };
    /**
     * 结束单组件旋转：解绑全局监听，角度有变化才提交。
     */
    const onComponentRotatePointerEnd = (componentRotateEndEvent: any = null) => {
      if (
        !isComponentRotateFinished &&
        (componentRotateEndEvent?.pointerId == null ||
          componentRotateEndEvent.pointerId === componentRotatePointerId)
      ) {
        isComponentRotateFinished = true;
        window.removeEventListener("pointermove", onComponentRotatePointerMove, true);
        window.removeEventListener("pointerup", onComponentRotatePointerEnd, true);
        window.removeEventListener("pointercancel", onComponentRotatePointerEnd, true);
        window.removeEventListener("blur", onComponentRotatePointerEnd);
        rotateTargetRecord.position = {
          ...(rotateTargetRecord.position || {}),
          rotation: componentNextRotationDeg
        };
        if (componentNextRotationDeg !== componentInitialRotationDeg) {
          this.options.onComponentTransform?.(rotateTargetRecord.id, {
            rotation: componentNextRotationDeg
          });
        }
      }
    };
    window.addEventListener("pointermove", onComponentRotatePointerMove, true);
    window.addEventListener("pointerup", onComponentRotatePointerEnd, true);
    window.addEventListener("pointercancel", onComponentRotatePointerEnd, true);
    window.addEventListener("blur", onComponentRotatePointerEnd);
  },
  /**
   * 为组件创建选中框（已存在则复用）。
   */
  createComponentSelectionOverlay(overlayComponentHost, overlayComponentRecord) {
    if (
      !overlayComponentHost ||
      !overlayComponentRecord ||
      !overlayComponentHost.parentElement ||
      (overlayComponentHost.parentElement !== this.canvas && !overlayComponentHost.hidden)
    ) {
      return null;
    }
    const hostParentElement = overlayComponentHost.parentElement;
    const overlayElement = document.createElement("div");
    overlayElement.className = "hb-component-selection-overlay";
    if (overlayComponentRecord.type === "light-statistics") {
      overlayElement.classList.add("hb-light-statistics-selection-overlay");
    }
    if (
      overlayComponentRecord.type === "floorplan-auto-diagram" &&
      overlayComponentRecord.properties?.interactionMode === "view"
    ) {
      overlayElement.classList.add("hb-floorplan-auto-diagram-view-overlay");
    }
    overlayElement.dataset.selectionFor = overlayComponentRecord.id;
    Object.assign(overlayElement.style, {
      left: overlayComponentHost.style.left,
      top: overlayComponentHost.style.top,
      width: overlayComponentHost.style.width,
      height: overlayComponentHost.style.height,
      transform: overlayComponentHost.style.transform
    });
    if (overlayComponentRecord.type !== "light-statistics") {
      overlayElement.addEventListener("pointerdown", pointerEvent =>
        this.startComponentMove(
          pointerEvent,
          overlayComponentRecord,
          overlayComponentHost,
          overlayElement
        )
      );
    }
    hostParentElement.append(overlayElement);
    this.componentSelectionOverlays.set(overlayComponentRecord.id, overlayElement);
    return overlayElement;
  },
  /**
   * 为气流层创建独立的选中框。
   */
  createAirflowSelectionOverlay(airflowOverlayLayerElement, airflowComponentRecord) {
    if (
      !airflowOverlayLayerElement ||
      !airflowComponentRecord ||
      !airflowOverlayLayerElement.parentElement
    ) {
      return null;
    }
    const airflowOverlayElement = document.createElement("div");
    airflowOverlayElement.className = "hb-component-selection-overlay hb-airflow-selection-overlay";
    airflowOverlayElement.dataset.selectionFor = airflowComponentRecord.id;
    Object.assign(airflowOverlayElement.style, {
      left: airflowOverlayLayerElement.style.left,
      top: airflowOverlayLayerElement.style.top,
      width: airflowOverlayLayerElement.style.width,
      height: airflowOverlayLayerElement.style.height,
      transform: airflowOverlayLayerElement.style.transform
    });
    airflowOverlayLayerElement.parentElement.append(airflowOverlayElement);
    this.componentSelectionOverlays.set(airflowComponentRecord.id, airflowOverlayElement);
    return airflowOverlayElement;
  },
  /**
   * 同步气流层的几何尺寸（位置、宽高、缩放），使层与组件声明保持一致。
   */
  syncAirflowLayerGeometry(
    syncedAirflowLayerElement,
    syncedComponentRecord,
    syncedOverlayElement = null
  ) {
    if (!syncedAirflowLayerElement || !syncedComponentRecord) {
      return;
    }
    const syncedAirflowGeometry = airflowLayerGeometry(syncedComponentRecord, {
      grouped: syncedAirflowLayerElement.parentElement !== this.canvas
    });
    const airflowStyle = {
      left: syncedAirflowGeometry.left + "px",
      top: syncedAirflowGeometry.top + "px",
      width: syncedAirflowGeometry.width + "px",
      height: syncedAirflowGeometry.height + "px",
      transform:
        "rotate(" +
        syncedAirflowGeometry.rotation +
        "deg) scale(" +
        syncedAirflowGeometry.scale +
        ")"
    };
    Object.assign(syncedAirflowLayerElement.style, airflowStyle);
    if (syncedOverlayElement) {
      Object.assign(syncedOverlayElement.style, airflowStyle);
    }
  },
  /**
   * 给图标按钮（效果）层追加选中框。
   */
  appendEffectSelectionBounds(effectComponentLayerElement, effectBoundsComponentRecord) {
    if (
      !effectComponentLayerElement ||
      !effectBoundsComponentRecord ||
      !effectComponentLayerElement.parentElement
    ) {
      return;
    }
    const effectOverlayElement = document.createElement("div");
    effectOverlayElement.className = "hb-component-selection-overlay hb-effect-selection-overlay";
    effectOverlayElement.dataset.selectionFor = effectBoundsComponentRecord.id;
    Object.assign(effectOverlayElement.style, {
      left: effectComponentLayerElement.style.left,
      top: effectComponentLayerElement.style.top,
      width: effectComponentLayerElement.style.width,
      height: effectComponentLayerElement.style.height,
      transform: effectComponentLayerElement.style.transform,
      pointerEvents: "none"
    });
    const effectBoundsElement = document.createElement("div");
    effectBoundsElement.className = "hb-selection-bounds hb-effect-selection-bounds";
    for (const cornerName of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const effectCornerMarkerElement = document.createElement("i");
      effectCornerMarkerElement.className = "hb-corner-marker hb-corner-" + cornerName;
      effectCornerMarkerElement.setAttribute("aria-hidden", "true");
      effectBoundsElement.append(effectCornerMarkerElement);
    }
    effectOverlayElement.append(effectBoundsElement);
    effectComponentLayerElement.parentElement.append(effectOverlayElement);
    this.componentSelectionOverlays.set(effectBoundsComponentRecord.id, effectOverlayElement);
    this.updateTransformHandleScale(
      effectComponentLayerElement,
      effectBoundsComponentRecord,
      effectBoundsElement
    );
  },
  /**
   * 重新计算某个组件的选中框位置（拖动 / 缩放中每帧调用）。
   */
  syncComponentSelectionOverlay(overlayComponentId) {
    const selectionOverlay = this.componentSelectionOverlays.get(overlayComponentId);
    const hostElementForSelection = this.componentHosts.get(overlayComponentId);
    if (
      !!selectionOverlay &&
      !!hostElementForSelection &&
      !selectionOverlay.classList.contains("hb-airflow-selection-overlay") &&
      !selectionOverlay.classList.contains("hb-effect-selection-overlay")
    ) {
      Object.assign(selectionOverlay.style, {
        left: hostElementForSelection.style.left,
        top: hostElementForSelection.style.top,
        width: hostElementForSelection.style.width,
        height: hostElementForSelection.style.height,
        transform: hostElementForSelection.style.transform
      });
    }
  },
  /**
   * 给选中框追加缩放与旋转手柄。
   */
  appendTransformHandles(
    boundsComponentHost,
    boundsComponentRecord,
    allowResize = true,
    boundsContainerElement = boundsComponentHost
  ) {
    if (!boundsComponentHost || !boundsComponentRecord) {
      return;
    }
    const selectionBoundsContainer = document.createElement("div");
    selectionBoundsContainer.className = "hb-selection-bounds";
    for (const handleCornerPosition of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const handleCornerMarkerElement = document.createElement("i");
      handleCornerMarkerElement.className = "hb-corner-marker hb-corner-" + handleCornerPosition;
      handleCornerMarkerElement.setAttribute("aria-hidden", "true");
      selectionBoundsContainer.append(handleCornerMarkerElement);
    }
    if (allowResize && boundsComponentRecord.properties?.layoutMode !== "fill") {
      const selectionResizeHandle = document.createElement("button");
      selectionResizeHandle.type = "button";
      selectionResizeHandle.className = "hb-transform-handle hb-resize-handle";
      selectionResizeHandle.title = "拖动缩放";
      selectionResizeHandle.addEventListener("pointerdown", handleResizePointerEvent =>
        this.startComponentScale(
          handleResizePointerEvent,
          boundsComponentRecord,
          boundsComponentHost,
          selectionBoundsContainer
        )
      );
      const selectionRotateHandle = document.createElement("button");
      selectionRotateHandle.type = "button";
      selectionRotateHandle.className = "hb-transform-handle hb-rotate-handle";
      selectionRotateHandle.title = "拖动旋转";
      selectionRotateHandle.addEventListener("pointerdown", rotatePointerEvent =>
        this.startComponentRotate(
          rotatePointerEvent,
          boundsComponentRecord,
          boundsComponentHost,
          selectionBoundsContainer
        )
      );
      selectionBoundsContainer.append(selectionResizeHandle, selectionRotateHandle);
    }
    boundsContainerElement.append(selectionBoundsContainer);
    if (
      boundsComponentRecord.type === "light-statistics" &&
      boundsContainerElement.classList?.contains("hb-light-statistics-selection-overlay")
    ) {
      selectionBoundsContainer.addEventListener("pointerdown", statisticsMovePointerEvent =>
        this.startComponentMove(
          statisticsMovePointerEvent,
          boundsComponentRecord,
          boundsComponentHost,
          selectionBoundsContainer
        )
      );
    }
    this.updateImageSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateTextSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateTitleButtonSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateDeviceButtonSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    const statisticsBoundsVisible = this.updateLightStatisticsSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    if (boundsComponentRecord.type === "light-statistics" && !statisticsBoundsVisible) {
      Object.assign(selectionBoundsContainer.style, {
        left: "0",
        top: "0",
        width: "100%",
        height: "100%"
      });
    }
    this.updateAirConditionerButtonSelectionBounds(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
    this.updateTransformHandleScale(
      boundsComponentHost,
      boundsComponentRecord,
      selectionBoundsContainer
    );
  },
  /**
   * 临时取消祖先链上的 hidden，执行测量回调后再恢复。
   */
  withSelectionMeasurementHost(measurementStartElement, measureCallback) {
    const hiddenElements = [];
    let measurementElement = measurementStartElement;
    while (measurementElement && measurementElement !== this.canvas) {
      if (measurementElement.hidden) {
        hiddenElements.push(measurementElement);
        measurementElement.hidden = false;
      }
      measurementElement = measurementElement.parentElement;
    }
    try {
      return measureCallback();
    } finally {
      for (const hiddenElement of hiddenElements) {
        hiddenElement.hidden = true;
      }
    }
  },
  /**
   * 判断元素是否可见且有实际尺寸（决定选中框要不要画）。
   */
  selectionElementIsVisible(measuredElement) {
    if (!measuredElement || measuredElement.hidden) {
      return false;
    }
    const computedStyle = window.getComputedStyle?.(measuredElement);
    if (computedStyle?.display === "none" || computedStyle?.visibility === "hidden") {
      return false;
    } else {
      return (
        Number(
          measuredElement.offsetWidth || measuredElement.getBoundingClientRect?.().width || 0
        ) > 0 &&
        Number(
          measuredElement.offsetHeight || measuredElement.getBoundingClientRect?.().height || 0
        ) > 0
      );
    }
  },
  /**
   * 计算元素相对指定祖先的偏移盒（left / top / 宽 / 高）。
   */
  selectionElementBox(boxElement, boxAncestorElement) {
    let offsetLeftPx = 0;
    let offsetTopPx = 0;
    let offsetParent = boxElement;
    // 防环：offsetParent 链在浮动 / 定位元素下可能绕回自身，不防会死循环。
    const visitedElements = new Set();
    while (
      offsetParent &&
      offsetParent !== boxAncestorElement &&
      !visitedElements.has(offsetParent)
    ) {
      visitedElements.add(offsetParent);
      offsetLeftPx += Number(offsetParent.offsetLeft || 0);
      offsetTopPx += Number(offsetParent.offsetTop || 0);
      offsetParent = offsetParent.offsetParent || offsetParent.parentElement;
    }
    const elementRect = boxElement.getBoundingClientRect?.();
    const elementWidthPx = Number(boxElement.offsetWidth || elementRect?.width || 0);
    const elementHeightPx = Number(boxElement.offsetHeight || elementRect?.height || 0);
    return {
      left: offsetLeftPx,
      top: offsetTopPx,
      width: elementWidthPx,
      height: elementHeightPx
    };
  },
  /**
   * 把门窗的四个角点写成一个 CSS 透视矩阵，作用到门 / 窗可视件上。
   */
  applyDoorWindowPerspective(
    perspectiveFrontElement,
    perspectiveComponentRecord,
    perspectiveCorners
  ) {
    const doorWindowVisualElement =
      perspectiveFrontElement?.querySelector(".hb-door-window-visual");
    if (!doorWindowVisualElement || !perspectiveComponentRecord) {
      return;
    }
    const canvasComponentScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const scaledVisualWidthPx = Math.max(
      1,
      Number(perspectiveComponentRecord.position?.width || 100) / canvasComponentScale
    );
    const scaledVisualHeightPx = Math.max(
      1,
      Number(perspectiveComponentRecord.position?.height || 100) / canvasComponentScale
    );
    doorWindowVisualElement.style.transform = doorWindowPerspectiveMatrix(
      scaledVisualWidthPx,
      scaledVisualHeightPx,
      perspectiveCorners
    );
  },
  /**
   * 刷新门窗透视的四角手柄位置与引导线。
   */
  updateDoorWindowPerspectiveHandles(handleHostElement, handleComponent) {
    if (!handleHostElement) {
      return;
    }
    const perspectiveCornerList = doorWindowPerspectiveCorners(handleComponent);
    handleHostElement
      .querySelector(".hb-door-window-perspective-guide polygon")
      ?.setAttribute(
        "points",
        [0, 1, 2, 3]
          .map(
            guideCornerIndex =>
              perspectiveCornerList[guideCornerIndex * 2] +
              "," +
              perspectiveCornerList[guideCornerIndex * 2 + 1]
          )
          .join(" ")
      );
    handleHostElement
      .querySelectorAll(".hb-door-window-perspective-handle")
      .forEach((perspectiveHandleElement: any) => {
        const handleCornerIndex = Number(
          perspectiveHandleElement.dataset.perspectiveCornerIndex || 0
        );
        perspectiveHandleElement.style.left =
          perspectiveCornerList[handleCornerIndex * 2] * 100 + "%";
        perspectiveHandleElement.style.top =
          perspectiveCornerList[handleCornerIndex * 2 + 1] * 100 + "%";
      });
  },
  /**
   * 创建门窗透视的四角拖拽手柄。
   */
  appendDoorWindowPerspectiveHandles(
    curtainHostElement,
    curtainComponentRecord,
    curtainOverlayElement = curtainHostElement
  ) {
    if (
      !curtainHostElement ||
      !curtainComponentRecord ||
      curtainComponentRecord.properties?.sensorKind !== "door-window"
    ) {
      return;
    }
    const curtainCorners = doorWindowPerspectiveCorners(
      curtainComponentRecord.properties?.perspectiveCorners
    );
    const perspectiveBoundsElement = document.createElement("div");
    perspectiveBoundsElement.className = "hb-selection-bounds hb-door-window-perspective-bounds";
    const svgGuideElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgGuideElement.classList.add("hb-door-window-perspective-guide");
    svgGuideElement.setAttribute("viewBox", "0 0 1 1");
    svgGuideElement.setAttribute("preserveAspectRatio", "none");
    svgGuideElement.append(document.createElementNS("http://www.w3.org/2000/svg", "polygon"));
    perspectiveBoundsElement.append(svgGuideElement);
    const cornerLabels = ["左上角", "右上角", "右下角", "左下角"];
    for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
      const perspectiveHandleButton = document.createElement("button");
      perspectiveHandleButton.type = "button";
      perspectiveHandleButton.className = "hb-door-window-perspective-handle";
      perspectiveHandleButton.dataset.perspectiveCornerIndex = String(cornerIndex);
      perspectiveHandleButton.title = "拖动" + cornerLabels[cornerIndex] + "调整透视";
      perspectiveHandleButton.setAttribute("aria-label", perspectiveHandleButton.title);
      perspectiveHandleButton.addEventListener("pointerdown", perspectivePointerEvent =>
        this.startDoorWindowPerspective(
          perspectivePointerEvent,
          curtainComponentRecord,
          curtainHostElement,
          perspectiveBoundsElement,
          cornerIndex
        )
      );
      perspectiveBoundsElement.append(perspectiveHandleButton);
    }
    curtainOverlayElement.append(perspectiveBoundsElement);
    this.updateDoorWindowPerspectiveHandles(perspectiveBoundsElement, curtainCorners);
    this.updateTransformHandleScale(
      curtainHostElement,
      curtainComponentRecord,
      perspectiveBoundsElement
    );
  },
  /**
   * 开始拖动门窗透视的某一个角。
   */
  startDoorWindowPerspective(
    startPerspectivePointerEvent,
    startPerspectiveComponent,
    perspectiveFrontLayerElement,
    perspectiveBoundsLayerElement,
    draggedCornerIndex
  ) {
    if (startPerspectivePointerEvent.button !== 0) {
      return;
    }
    startPerspectivePointerEvent.preventDefault();
    startPerspectivePointerEvent.stopPropagation();
    const perspectivePointerId = startPerspectivePointerEvent.pointerId;
    const perspectiveStartX = startPerspectivePointerEvent.clientX;
    const perspectiveStartY = startPerspectivePointerEvent.clientY;
    const initialPerspectiveCorners = doorWindowPerspectiveCorners(
      startPerspectiveComponent.properties?.perspectiveCorners
    );
    const initialCornerX = initialPerspectiveCorners[draggedCornerIndex * 2];
    const initialCornerY = initialPerspectiveCorners[draggedCornerIndex * 2 + 1];
    const perspectiveWidthPx = Math.max(
      1,
      Number(startPerspectiveComponent.position?.width || 100)
    );
    const perspectiveHeightPx = Math.max(
      1,
      Number(startPerspectiveComponent.position?.height || 100)
    );
    const perspectiveWorldTransform = this.componentWorldTransform(startPerspectiveComponent.id);
    const perspectiveWorldScale = perspectiveWorldTransform.scale;
    // 组件所在分组的累计旋转角转弧度：拖动增量是屏幕坐标，要转回组件自身坐标系。
    const perspectiveRotationRad = (perspectiveWorldTransform.rotation * Math.PI) / 180;
    const perspectiveRotationCosine = Math.cos(perspectiveRotationRad);
    const perspectiveRotationSine = Math.sin(perspectiveRotationRad);
    let nextPerspectiveCorners = initialPerspectiveCorners;
    let isPerspectiveFinished = false;
    /**
     * 透视角点拖动期间的指针移动处理：把指针位移换算成被拖角点的归一化坐标。
     */
    const onPerspectivePointerMove = (perspectiveMoveEvent: any) => {
      if (perspectiveMoveEvent.pointerId !== perspectivePointerId) {
        return;
      }
      const scaledMoveDeltaX =
        (perspectiveMoveEvent.clientX - perspectiveStartX) /
        Math.max(0.001, this.appliedScaleX || 1);
      const scaledMoveDeltaY =
        (perspectiveMoveEvent.clientY - perspectiveStartY) /
        Math.max(0.001, this.appliedScaleY || 1);
      const unrotatedDeltaX =
        (perspectiveRotationCosine * scaledMoveDeltaX +
          perspectiveRotationSine * scaledMoveDeltaY) /
        perspectiveWorldScale;
      const unrotatedDeltaY =
        (-perspectiveRotationSine * scaledMoveDeltaX +
          perspectiveRotationCosine * scaledMoveDeltaY) /
        perspectiveWorldScale;
      const cornersBuffer = initialPerspectiveCorners.slice();
      cornersBuffer[draggedCornerIndex * 2] = initialCornerX + unrotatedDeltaX / perspectiveWidthPx;
      cornersBuffer[draggedCornerIndex * 2 + 1] =
        initialCornerY + unrotatedDeltaY / perspectiveHeightPx;
      nextPerspectiveCorners = doorWindowPerspectiveCorners(cornersBuffer);
      startPerspectiveComponent.properties = {
        ...(startPerspectiveComponent.properties || {}),
        perspectiveCorners: nextPerspectiveCorners
      };
      this.applyDoorWindowPerspective(
        perspectiveFrontLayerElement,
        startPerspectiveComponent,
        nextPerspectiveCorners
      );
      this.updateDoorWindowPerspectiveHandles(
        perspectiveBoundsLayerElement,
        nextPerspectiveCorners
      );
      this.options.onComponentPropertiesPreview?.(startPerspectiveComponent.id, {
        perspectiveCorners: nextPerspectiveCorners
      });
    };
    /**
     * 结束透视角点拖动：解绑全局监听，角点有变化才提交。
     */
    const onPerspectivePointerEnd = (perspectiveEndEvent: any = null) => {
      if (
        !isPerspectiveFinished &&
        (perspectiveEndEvent?.pointerId == null ||
          perspectiveEndEvent.pointerId === perspectivePointerId)
      ) {
        isPerspectiveFinished = true;
        window.removeEventListener("pointermove", onPerspectivePointerMove, true);
        window.removeEventListener("pointerup", onPerspectivePointerEnd, true);
        window.removeEventListener("pointercancel", onPerspectivePointerEnd, true);
        window.removeEventListener("blur", onPerspectivePointerEnd);
        if (JSON.stringify(nextPerspectiveCorners) !== JSON.stringify(initialPerspectiveCorners)) {
          this.options.onComponentProperties?.(startPerspectiveComponent.id, {
            perspectiveCorners: nextPerspectiveCorners
          });
        }
      }
    };
    window.addEventListener("pointermove", onPerspectivePointerMove, true);
    window.addEventListener("pointerup", onPerspectivePointerEnd, true);
    window.addEventListener("pointercancel", onPerspectivePointerEnd, true);
    window.addEventListener("blur", onPerspectivePointerEnd);
  },
  /**
   * 为气流层补上选中框与变换手柄。
   */
  appendAirflowTransformHandles(handleAirflowLayer, handleAirflowComponent) {
    if (!handleAirflowLayer || !handleAirflowComponent) {
      return;
    }
    const createdAirflowOverlay = this.createAirflowSelectionOverlay(
      handleAirflowLayer,
      handleAirflowComponent
    );
    if (!createdAirflowOverlay) {
      return;
    }
    const handleAirflowBounds = document.createElement("div");
    handleAirflowBounds.className = "hb-selection-bounds hb-airflow-selection-bounds";
    for (const airflowCornerPosition of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
      const airflowCornerMarkerElement = document.createElement("i");
      airflowCornerMarkerElement.className = "hb-corner-marker hb-corner-" + airflowCornerPosition;
      airflowCornerMarkerElement.setAttribute("aria-hidden", "true");
      handleAirflowBounds.append(airflowCornerMarkerElement);
    }
    const airflowResizeHandleElement = document.createElement("button");
    airflowResizeHandleElement.type = "button";
    airflowResizeHandleElement.className = "hb-transform-handle hb-resize-handle";
    airflowResizeHandleElement.title = "拖动缩放出风效果";
    airflowResizeHandleElement.addEventListener("pointerdown", airflowResizeHandlePointerEvent =>
      this.startAirflowScale(
        airflowResizeHandlePointerEvent,
        handleAirflowComponent,
        handleAirflowLayer,
        handleAirflowBounds,
        createdAirflowOverlay
      )
    );
    const airflowRotateHandleElement = document.createElement("button");
    airflowRotateHandleElement.type = "button";
    airflowRotateHandleElement.className = "hb-transform-handle hb-rotate-handle";
    airflowRotateHandleElement.title = "拖动旋转出风效果";
    airflowRotateHandleElement.addEventListener("pointerdown", airflowRotateHandlePointerEvent =>
      this.startAirflowRotate(
        airflowRotateHandlePointerEvent,
        handleAirflowComponent,
        handleAirflowLayer,
        handleAirflowBounds,
        createdAirflowOverlay
      )
    );
    handleAirflowBounds.append(airflowResizeHandleElement, airflowRotateHandleElement);
    handleAirflowBounds.addEventListener("pointerdown", airflowMovePointerEvent =>
      this.startAirflowMove(
        airflowMovePointerEvent,
        handleAirflowComponent,
        handleAirflowLayer,
        handleAirflowBounds,
        createdAirflowOverlay
      )
    );
    createdAirflowOverlay.append(handleAirflowBounds);
    this.updateAirflowHandleScale(handleAirflowComponent, handleAirflowBounds);
  },
  /**
   * 开始拖动气流层。
   */
  startAirflowMove(
    moveStartPointerEvent,
    movedComponentRecord,
    airflowMoveLayerElement,
    airflowMoveBoundsElement,
    airflowMoveOverlayElement
  ) {
    if (
      moveStartPointerEvent.button !== 0 ||
      moveStartPointerEvent.target.closest(".hb-transform-handle")
    ) {
      return;
    }
    moveStartPointerEvent.preventDefault();
    moveStartPointerEvent.stopPropagation();
    const airflowStartPointerX = moveStartPointerEvent.clientX;
    const airflowStartPointerY = moveStartPointerEvent.clientY;
    const airflowComponentWidthPx = Math.max(
      1,
      Number(movedComponentRecord.position?.width || 100)
    );
    const airflowComponentHeightPx = Math.max(
      1,
      Number(movedComponentRecord.position?.height || 100)
    );
    const airflowInitialOffsetX = Number(movedComponentRecord.properties?.airflowOffsetX ?? -75);
    const airflowInitialOffsetY = Number(movedComponentRecord.properties?.airflowOffsetY ?? 34);
    const airflowOffsetBounds = airflowCanvasOffsetBounds(
      movedComponentRecord,
      this.document?.canvas
    );
    let airflowNextOffsetX = airflowInitialOffsetX;
    let airflowNextOffsetY = airflowInitialOffsetY;
    let airflowAxisLock = "";
    let isAirflowDragFinished = false;
    const airflowPointerId = moveStartPointerEvent.pointerId;
    capturePointer(airflowMoveBoundsElement, airflowPointerId);
    /**
     * 气流层拖动期间的指针移动处理：把位移换算成出风偏移的百分比。
     */
    const onAirflowPointerMove = (airflowMoveEvent: any) => {
      if (airflowMoveEvent.pointerId !== airflowPointerId) {
        return;
      }
      // 同上：元素被重新渲染后补一次捕获。
      if (!airflowMoveBoundsElement.hasPointerCapture?.(airflowPointerId)) {
        capturePointer(airflowMoveBoundsElement, airflowPointerId);
      }
      let airflowDeltaClientX = airflowMoveEvent.clientX - airflowStartPointerX;
      let airflowDeltaClientY = airflowMoveEvent.clientY - airflowStartPointerY;
      if (airflowMoveEvent.shiftKey) {
        if (!airflowAxisLock && Math.hypot(airflowDeltaClientX, airflowDeltaClientY) >= 1) {
          airflowAxisLock =
            Math.abs(airflowDeltaClientX) >= Math.abs(airflowDeltaClientY)
              ? "horizontal"
              : "vertical";
        }
        if (airflowAxisLock === "horizontal") {
          airflowDeltaClientY = 0;
        }
        if (airflowAxisLock === "vertical") {
          airflowDeltaClientX = 0;
        }
      } else {
        airflowAxisLock = "";
      }
      const airflowScaledDeltaX = airflowDeltaClientX / Math.max(0.001, this.appliedScaleX || 1);
      const airflowScaledDeltaY = airflowDeltaClientY / Math.max(0.001, this.appliedScaleY || 1);
      const airflowLocalDelta = groupedComponentLocalDelta(
        airflowScaledDeltaX,
        airflowScaledDeltaY,
        this.componentParentTransform(movedComponentRecord.id)
      );
      airflowNextOffsetX = Math.max(
        airflowOffsetBounds.minX,
        Math.min(
          airflowOffsetBounds.maxX,
          airflowInitialOffsetX + (airflowLocalDelta.x / airflowComponentWidthPx) * 100
        )
      );
      airflowNextOffsetY = Math.max(
        airflowOffsetBounds.minY,
        Math.min(
          airflowOffsetBounds.maxY,
          airflowInitialOffsetY + (airflowLocalDelta.y / airflowComponentHeightPx) * 100
        )
      );
      movedComponentRecord.properties = {
        ...(movedComponentRecord.properties || {}),
        airflowOffsetX: airflowNextOffsetX,
        airflowOffsetY: airflowNextOffsetY
      };
      this.syncAirflowLayerGeometry(
        airflowMoveLayerElement,
        movedComponentRecord,
        airflowMoveOverlayElement
      );
      this.options.onComponentPropertiesPreview?.(movedComponentRecord.id, {
        airflowOffsetX: airflowNextOffsetX,
        airflowOffsetY: airflowNextOffsetY
      });
    };
    /**
     * 结束气流层拖动：解绑全局监听，偏移量有变化才提交。
     */
    const onAirflowPointerEnd = (airflowEndEvent: any = null) => {
      if (
        !isAirflowDragFinished &&
        (airflowEndEvent?.pointerId == null || airflowEndEvent.pointerId === airflowPointerId)
      ) {
        isAirflowDragFinished = true;
        window.removeEventListener("pointermove", onAirflowPointerMove, true);
        window.removeEventListener("pointerup", onAirflowPointerEnd, true);
        window.removeEventListener("pointercancel", onAirflowPointerEnd, true);
        window.removeEventListener("blur", onAirflowPointerEnd);
        if (
          airflowNextOffsetX !== airflowInitialOffsetX ||
          airflowNextOffsetY !== airflowInitialOffsetY
        ) {
          this.options.onComponentProperties?.(movedComponentRecord.id, {
            airflowOffsetX: airflowNextOffsetX,
            airflowOffsetY: airflowNextOffsetY
          });
        }
      }
    };
    window.addEventListener("pointermove", onAirflowPointerMove, true);
    window.addEventListener("pointerup", onAirflowPointerEnd, true);
    window.addEventListener("pointercancel", onAirflowPointerEnd, true);
    window.addEventListener("blur", onAirflowPointerEnd);
  },
  /**
   * 按画布缩放反向补偿气流层手柄的大小，保证屏幕上尺寸恒定、易点中。
   */
  updateAirflowHandleScale(airflowHandleComponent, airflowHandleBoundsElement) {
    if (!airflowHandleComponent || !airflowHandleBoundsElement) {
      return;
    }
    const airflowUiScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1);
    const airflowHandleScale = Math.max(
      0.01,
      Math.min(5, Number(airflowHandleComponent.properties?.airflowScale || 1))
    );
    const airflowParentWorldScale = this.componentParentTransform(airflowHandleComponent.id).scale;
    const airflowHandleScaleFactor =
      1 / Math.max(0.001, airflowUiScale * airflowHandleScale * airflowParentWorldScale);
    airflowHandleBoundsElement.style.setProperty("--hb-ui-scale", String(airflowHandleScaleFactor));
    airflowHandleBoundsElement.style.setProperty(
      "--hb-handle-outset",
      airflowHandleScaleFactor * 30 + "px"
    );
    const airflowBoundsClientRect = airflowHandleBoundsElement.getBoundingClientRect();
    airflowHandleBoundsElement.classList.toggle(
      "handles-outside",
      airflowBoundsClientRect.width < 132 || airflowBoundsClientRect.height < 112
    );
  },
  /**
   * 开始缩放气流层。
   */
  startAirflowScale(
    airflowScalePointerEvent,
    airflowScaleComponentRecord,
    airflowScaleLayerElement,
    airflowScaleBoundsElement,
    airflowScaleOverlayElement
  ) {
    airflowScalePointerEvent.preventDefault();
    airflowScalePointerEvent.stopPropagation();
    const airflowScaleBoundsRect = airflowScaleBoundsElement.getBoundingClientRect();
    const airflowScaleCenterX = airflowScaleBoundsRect.left + airflowScaleBoundsRect.width / 2;
    const airflowScaleCenterY = airflowScaleBoundsRect.top + airflowScaleBoundsRect.height / 2;
    const airflowScaleStartDistancePx = Math.max(
      1,
      Math.hypot(
        airflowScalePointerEvent.clientX - airflowScaleCenterX,
        airflowScalePointerEvent.clientY - airflowScaleCenterY
      )
    );
    const airflowInitialScale = Math.max(
      0.01,
      Math.min(5, Number(airflowScaleComponentRecord.properties?.airflowScale || 1))
    );
    let airflowNextScale = airflowInitialScale;
    let isAirflowScaleFinished = false;
    const airflowScaleCaptureElement = airflowScalePointerEvent.currentTarget;
    capturePointer(airflowScaleCaptureElement, airflowScalePointerEvent.pointerId);
    /**
     * 同步气流层几何与手柄尺寸（缩放过程中每帧调用）。
     */
    const syncAirflowScaleGeometry = () => {
      this.syncAirflowLayerGeometry(
        airflowScaleLayerElement,
        airflowScaleComponentRecord,
        airflowScaleOverlayElement
      );
      this.updateAirflowHandleScale(airflowScaleComponentRecord, airflowScaleBoundsElement);
    };
    /**
     * 气流层缩放期间的指针移动处理：按指针到中心的距离比例缩放气流层。
     */
    const onAirflowScalePointerMove = (airflowScaleMoveEvent: any) => {
      const airflowScaleMoveDistancePx = Math.hypot(
        airflowScaleMoveEvent.clientX - airflowScaleCenterX,
        airflowScaleMoveEvent.clientY - airflowScaleCenterY
      );
      airflowNextScale = Math.max(
        0.01,
        Math.min(
          5,
          (airflowInitialScale * airflowScaleMoveDistancePx) / airflowScaleStartDistancePx
        )
      );
      airflowScaleComponentRecord.properties = {
        ...(airflowScaleComponentRecord.properties || {}),
        airflowScale: airflowNextScale
      };
      syncAirflowScaleGeometry();
      this.options.onComponentPropertiesPreview?.(airflowScaleComponentRecord.id, {
        airflowScale: airflowNextScale
      });
    };
    /**
     * 结束气流层缩放：在指针捕获元素上解绑监听，缩放值有变化才提交。
     */
    const onAirflowScalePointerEnd = () => {
      if (!isAirflowScaleFinished) {
        isAirflowScaleFinished = true;
        airflowScaleCaptureElement.removeEventListener("pointermove", onAirflowScalePointerMove);
        airflowScaleCaptureElement.removeEventListener("pointerup", onAirflowScalePointerEnd);
        airflowScaleCaptureElement.removeEventListener("pointercancel", onAirflowScalePointerEnd);
        airflowScaleCaptureElement.removeEventListener(
          "lostpointercapture",
          onAirflowScalePointerEnd
        );
        if (airflowNextScale !== airflowInitialScale) {
          this.options.onComponentProperties?.(airflowScaleComponentRecord.id, {
            airflowScale: airflowNextScale
          });
        }
      }
    };
    airflowScaleCaptureElement.addEventListener("pointermove", onAirflowScalePointerMove);
    airflowScaleCaptureElement.addEventListener("pointerup", onAirflowScalePointerEnd);
    airflowScaleCaptureElement.addEventListener("pointercancel", onAirflowScalePointerEnd);
    airflowScaleCaptureElement.addEventListener("lostpointercapture", onAirflowScalePointerEnd);
  },
  /**
   * 开始旋转气流层。
   */
  startAirflowRotate(
    airflowRotatePointerEvent,
    airflowRotateComponentRecord,
    airflowRotateLayerElement,
    airflowRotateBoundsElement,
    airflowRotateOverlayElement
  ) {
    airflowRotatePointerEvent.preventDefault();
    airflowRotatePointerEvent.stopPropagation();
    const airflowRotateBoundsRect = airflowRotateBoundsElement.getBoundingClientRect();
    const airflowRotateCenterX = airflowRotateBoundsRect.left + airflowRotateBoundsRect.width / 2;
    const airflowRotateCenterY = airflowRotateBoundsRect.top + airflowRotateBoundsRect.height / 2;
    const airflowRotateStartAngleRad = Math.atan2(
      airflowRotatePointerEvent.clientY - airflowRotateCenterY,
      airflowRotatePointerEvent.clientX - airflowRotateCenterX
    );
    const airflowInitialRotationDeg = Number(
      airflowRotateComponentRecord.properties?.airflowRotation || 0
    );
    let airflowNextRotationDeg = airflowInitialRotationDeg;
    let isAirflowRotateFinished = false;
    const airflowRotateCaptureElement = airflowRotatePointerEvent.currentTarget;
    capturePointer(airflowRotateCaptureElement, airflowRotatePointerEvent.pointerId);
    /**
     * 气流层旋转期间的指针移动处理：按指针绕中心的极角差旋转出风特效。
     */
    const onAirflowRotatePointerMove = (airflowRotateMoveEvent: any) => {
      const airflowPointerAngleRad = Math.atan2(
        airflowRotateMoveEvent.clientY - airflowRotateCenterY,
        airflowRotateMoveEvent.clientX - airflowRotateCenterX
      );
      airflowNextRotationDeg =
        airflowInitialRotationDeg +
        ((airflowPointerAngleRad - airflowRotateStartAngleRad) * 180) / Math.PI;
      airflowRotateComponentRecord.properties = {
        ...(airflowRotateComponentRecord.properties || {}),
        airflowRotation: airflowNextRotationDeg
      };
      this.syncAirflowLayerGeometry(
        airflowRotateLayerElement,
        airflowRotateComponentRecord,
        airflowRotateOverlayElement
      );
      this.options.onComponentPropertiesPreview?.(airflowRotateComponentRecord.id, {
        airflowRotation: airflowNextRotationDeg
      });
    };
    /**
     * 结束气流层旋转：解绑监听，角度有变化才提交。
     */
    const onAirflowRotatePointerEnd = () => {
      if (!isAirflowRotateFinished) {
        isAirflowRotateFinished = true;
        airflowRotateCaptureElement.removeEventListener("pointermove", onAirflowRotatePointerMove);
        airflowRotateCaptureElement.removeEventListener("pointerup", onAirflowRotatePointerEnd);
        airflowRotateCaptureElement.removeEventListener("pointercancel", onAirflowRotatePointerEnd);
        airflowRotateCaptureElement.removeEventListener(
          "lostpointercapture",
          onAirflowRotatePointerEnd
        );
        if (airflowNextRotationDeg !== airflowInitialRotationDeg) {
          this.options.onComponentProperties?.(airflowRotateComponentRecord.id, {
            airflowRotation: airflowNextRotationDeg
          });
        }
      }
    };
    airflowRotateCaptureElement.addEventListener("pointermove", onAirflowRotatePointerMove);
    airflowRotateCaptureElement.addEventListener("pointerup", onAirflowRotatePointerEnd);
    airflowRotateCaptureElement.addEventListener("pointercancel", onAirflowRotatePointerEnd);
    airflowRotateCaptureElement.addEventListener("lostpointercapture", onAirflowRotatePointerEnd);
  },
  /**
   * 计算空调控件选中框的位置与尺寸。
   */
  updateAirConditionerButtonSelectionBounds(
    airConditionerHostElement,
    airConditionerRecord,
    airConditionerBoundsElement
  ) {
    if (
      !airConditionerHostElement ||
      airConditionerRecord?.type !== "air-conditioner" ||
      !airConditionerBoundsElement
    ) {
      return;
    }
    const airConditionerProperties = airConditionerRecord.properties || {};
    const airConditionerWidthPx = Math.max(1, Number(airConditionerRecord.position?.width || 100));
    const airConditionerHeightPx = Math.max(
      1,
      Number(airConditionerRecord.position?.height || 100)
    );
    const airConditionerUiScale = Math.max(
      0.01,
      Number(this.document?.canvas?.componentScale || 1)
    );
    const airConditionerRects: any[] = [];
    /**
     * 把空调控件的数值属性（尺寸、坐标百分比）夹到合法区间。
     */
    const clampAirConditionerValue = (
      airConditionerRawValue: any,
      airConditionerMinValue: any,
      airConditionerMaxValue: any,
      airConditionerFallbackValue: any
    ) => {
      const airConditionerNumericValue = Number(airConditionerRawValue);
      return Math.max(
        airConditionerMinValue,
        Math.min(
          airConditionerMaxValue,
          Number.isFinite(airConditionerNumericValue)
            ? airConditionerNumericValue
            : airConditionerFallbackValue
        )
      );
    };
    /**
     * 记录一个「以中心点定义」的矩形（图标徽标用）。
     */
    const pushAirConditionerCenteredRect = (
      airConditionerRectCenterX: any,
      airConditionerRectCenterY: any,
      airConditionerRectWidth: any,
      airConditionerRectHeight: any
    ) => {
      airConditionerRects.push({
        left: airConditionerRectCenterX - airConditionerRectWidth / 2,
        top: airConditionerRectCenterY - airConditionerRectHeight / 2,
        right: airConditionerRectCenterX + airConditionerRectWidth / 2,
        bottom: airConditionerRectCenterY + airConditionerRectHeight / 2
      });
    };
    /**
     * 记录一段文字占用的矩形。
     */
    const pushAirConditionerTextRect = (
      airConditionerTextElement: any,
      airConditionerLeftPercent: any,
      airConditionerTopPercent: any,
      airConditionerFontHeightPx: any
    ) => {
      const airConditionerTextWidthPx = Math.max(
        airConditionerFontHeightPx,
        Number(airConditionerTextElement?.offsetWidth || 0) * airConditionerUiScale
      );
      const airConditionerTextHeightPx = Math.max(
        airConditionerFontHeightPx,
        Number(airConditionerTextElement?.offsetHeight || 0) * airConditionerUiScale
      );
      const airConditionerTextCenterX =
        (airConditionerWidthPx *
          clampAirConditionerValue(airConditionerLeftPercent, -100, 200, 0)) /
        100;
      const airConditionerTextCenterY =
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerTopPercent, -100, 200, 50)) /
        100;
      airConditionerRects.push({
        left: airConditionerTextCenterX,
        top: airConditionerTextCenterY - airConditionerTextHeightPx / 2,
        right: airConditionerTextCenterX + airConditionerTextWidthPx,
        bottom: airConditionerTextCenterY + airConditionerTextHeightPx / 2
      });
    };
    const airConditionerBadgeSizePx =
      (airConditionerHeightPx *
        clampAirConditionerValue(airConditionerProperties.badgeSize, 1, 100, 28)) /
      100;
    if (airConditionerProperties.iconVisible !== false) {
      pushAirConditionerCenteredRect(
        (airConditionerWidthPx *
          clampAirConditionerValue(airConditionerProperties.iconLeft, -100, 200, 20)) /
          100,
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerProperties.iconTop, -100, 200, 50)) /
          100,
        airConditionerBadgeSizePx,
        airConditionerBadgeSizePx
      );
    }
    if (airConditionerProperties.mainTextVisible !== false) {
      pushAirConditionerTextRect(
        airConditionerHostElement.querySelector(
          ":scope > .hb-air-conditioner .hb-air-conditioner-text strong"
        ),
        airConditionerProperties.mainTextLeft,
        airConditionerProperties.mainTextTop,
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerProperties.mainSize, 6, 120, 21)) /
          100
      );
    }
    if (airConditionerProperties.secondaryTextVisible !== false) {
      pushAirConditionerTextRect(
        airConditionerHostElement.querySelector(
          ":scope > .hb-air-conditioner .hb-air-conditioner-text small"
        ),
        airConditionerProperties.secondaryTextLeft,
        airConditionerProperties.secondaryTextTop,
        (airConditionerHeightPx *
          clampAirConditionerValue(airConditionerProperties.secondarySize, 5, 80, 12)) /
          100
      );
    }
    if (!airConditionerRects.length) {
      Object.assign(airConditionerBoundsElement.style, {
        left: "0px",
        top: "0px",
        width: airConditionerWidthPx + "px",
        height: airConditionerHeightPx + "px"
      });
      return;
    }
    const airConditionerPaddingPx = 4;
    const airConditionerBoundsLeftPx =
      Math.min(...airConditionerRects.map(airConditionerLeftRect => airConditionerLeftRect.left)) -
      airConditionerPaddingPx;
    const airConditionerBoundsTopPx =
      Math.min(...airConditionerRects.map(airConditionerTopRect => airConditionerTopRect.top)) -
      airConditionerPaddingPx;
    const airConditionerBoundsRightPx =
      Math.max(
        ...airConditionerRects.map(airConditionerRightRect => airConditionerRightRect.right)
      ) + airConditionerPaddingPx;
    const airConditionerBoundsBottomPx =
      Math.max(
        ...airConditionerRects.map(airConditionerBottomRect => airConditionerBottomRect.bottom)
      ) + airConditionerPaddingPx;
    Object.assign(airConditionerBoundsElement.style, {
      left: airConditionerBoundsLeftPx + "px",
      top: airConditionerBoundsTopPx + "px",
      width: Math.max(1, airConditionerBoundsRightPx - airConditionerBoundsLeftPx) + "px",
      height: Math.max(1, airConditionerBoundsBottomPx - airConditionerBoundsTopPx) + "px"
    });
  },
  /**
   * 计算设备按钮控件选中框的位置与尺寸（可视件尺寸由内容决定，需实测）。
   */
  updateDeviceButtonSelectionBounds(
    deviceButtonHostElement,
    deviceButtonRecord,
    deviceButtonBoundsElement
  ) {
    if (
      !deviceButtonHostElement ||
      deviceButtonRecord?.type !== "device-button" ||
      !deviceButtonBoundsElement
    ) {
      return false;
    }
    const deviceButtonProperties = deviceButtonRecord.properties || {};
    const deviceButtonHiddenContentClickable =
      deviceButtonProperties.hiddenContentClickable === true;
    const deviceButtonWidthPx = Math.max(1, Number(deviceButtonRecord.position?.width || 100));
    const deviceButtonHeightPx = Math.max(1, Number(deviceButtonRecord.position?.height || 100));
    const deviceButtonUiScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const deviceButtonRects: any[] = [];
    /**
     * 把设备按钮控件的数值属性夹到合法区间（非数值走兜底值）。
     */
    const clampDeviceButtonValue = (
      deviceButtonRawValue: any,
      deviceButtonMinValue: any,
      deviceButtonMaxValue: any,
      deviceButtonFallbackValue: any
    ) => {
      const deviceButtonNumericValue = Number(deviceButtonRawValue);
      return Math.max(
        deviceButtonMinValue,
        Math.min(
          deviceButtonMaxValue,
          Number.isFinite(deviceButtonNumericValue)
            ? deviceButtonNumericValue
            : deviceButtonFallbackValue
        )
      );
    };
    /**
     * 记录一个「以中心点定义」的矩形（图标徽标用）。
     */
    const pushDeviceButtonCenteredRect = (
      deviceButtonRectCenterX: any,
      deviceButtonRectCenterY: any,
      deviceButtonRectWidth: any,
      deviceButtonRectHeight: any
    ) => {
      if (
        !![
          deviceButtonRectCenterX,
          deviceButtonRectCenterY,
          deviceButtonRectWidth,
          deviceButtonRectHeight
        ].every(Number.isFinite) &&
        !(deviceButtonRectWidth <= 0) &&
        !(deviceButtonRectHeight <= 0)
      ) {
        deviceButtonRects.push({
          left: deviceButtonRectCenterX - deviceButtonRectWidth / 2,
          top: deviceButtonRectCenterY - deviceButtonRectHeight / 2,
          right: deviceButtonRectCenterX + deviceButtonRectWidth / 2,
          bottom: deviceButtonRectCenterY + deviceButtonRectHeight / 2
        });
      }
    };
    /**
     * 记录一段文字占用的矩形（以左侧中心为锚点）。
     */
    const pushDeviceButtonTextRect = (
      deviceButtonTextElement: any,
      deviceButtonLeftPercent: any,
      deviceButtonTopPercent: any,
      deviceButtonFontHeightPx: any
    ) => {
      const deviceButtonTextWidthPx = Math.max(
        deviceButtonFontHeightPx,
        Number(deviceButtonTextElement?.offsetWidth || 0) * deviceButtonUiScale
      );
      const deviceButtonTextHeightPx = Math.max(
        deviceButtonFontHeightPx,
        Number(deviceButtonTextElement?.offsetHeight || 0) * deviceButtonUiScale
      );
      const deviceButtonTextCenterX =
        (deviceButtonWidthPx * clampDeviceButtonValue(deviceButtonLeftPercent, -100, 200, 0)) / 100;
      const deviceButtonTextCenterY =
        (deviceButtonHeightPx * clampDeviceButtonValue(deviceButtonTopPercent, -100, 200, 50)) /
        100;
      deviceButtonRects.push({
        left: deviceButtonTextCenterX,
        top: deviceButtonTextCenterY - deviceButtonTextHeightPx / 2,
        right: deviceButtonTextCenterX + deviceButtonTextWidthPx,
        bottom: deviceButtonTextCenterY + deviceButtonTextHeightPx / 2
      });
    };
    const deviceButtonBadgeSizePx =
      (deviceButtonHeightPx *
        clampDeviceButtonValue(
          deviceButtonProperties.badgeSize ?? deviceButtonProperties.iconSize,
          1,
          100,
          28
        )) /
      100;
    if (deviceButtonProperties.iconVisible !== false || deviceButtonHiddenContentClickable) {
      pushDeviceButtonCenteredRect(
        (deviceButtonWidthPx *
          clampDeviceButtonValue(deviceButtonProperties.iconLeft, -100, 200, 20)) /
          100,
        (deviceButtonHeightPx *
          clampDeviceButtonValue(deviceButtonProperties.iconTop, -100, 200, 50)) /
          100,
        deviceButtonBadgeSizePx,
        deviceButtonBadgeSizePx
      );
    }
    if (deviceButtonProperties.mainTextVisible !== false || deviceButtonHiddenContentClickable) {
      pushDeviceButtonTextRect(
        deviceButtonHostElement.querySelector(
          ":scope > .hb-icon-button .hb-icon-button-text strong"
        ),
        deviceButtonProperties.mainTextLeft,
        deviceButtonProperties.mainTextTop,
        (deviceButtonHeightPx *
          clampDeviceButtonValue(deviceButtonProperties.mainSize, 6, 120, 21)) /
          100
      );
    }
    if (
      deviceButtonProperties.secondaryTextVisible !== false ||
      deviceButtonHiddenContentClickable
    ) {
      pushDeviceButtonTextRect(
        deviceButtonHostElement.querySelector(
          ":scope > .hb-icon-button .hb-icon-button-text small"
        ),
        deviceButtonProperties.secondaryTextLeft,
        deviceButtonProperties.secondaryTextTop,
        (deviceButtonHeightPx *
          clampDeviceButtonValue(deviceButtonProperties.secondarySize, 5, 80, 12)) /
          100
      );
    }
    if (!deviceButtonRects.length) {
      return false;
    }
    const deviceButtonPaddingPx = 4;
    const deviceButtonBoundsLeftPx =
      Math.min(...deviceButtonRects.map(deviceButtonLeftRect => deviceButtonLeftRect.left)) -
      deviceButtonPaddingPx;
    const deviceButtonBoundsTopPx =
      Math.min(...deviceButtonRects.map(deviceButtonTopRect => deviceButtonTopRect.top)) -
      deviceButtonPaddingPx;
    const deviceButtonBoundsRightPx =
      Math.max(...deviceButtonRects.map(deviceButtonRightRect => deviceButtonRightRect.right)) +
      deviceButtonPaddingPx;
    const deviceButtonBoundsBottomPx =
      Math.max(...deviceButtonRects.map(deviceButtonBottomRect => deviceButtonBottomRect.bottom)) +
      deviceButtonPaddingPx;
    Object.assign(deviceButtonBoundsElement.style, {
      left: deviceButtonBoundsLeftPx + "px",
      top: deviceButtonBoundsTopPx + "px",
      width: Math.max(1, deviceButtonBoundsRightPx - deviceButtonBoundsLeftPx) + "px",
      height: Math.max(1, deviceButtonBoundsBottomPx - deviceButtonBoundsTopPx) + "px"
    });
    return true;
  },
  /**
   * 计算标题按钮控件选中框的位置与尺寸（文案换行会改变高度，需实测）。
   */
  updateTitleButtonSelectionBounds(
    titleButtonHostElement,
    titleButtonRecord,
    titleButtonBoundsElement
  ) {
    if (
      !titleButtonHostElement ||
      titleButtonRecord?.type !== "title-button" ||
      !titleButtonBoundsElement
    ) {
      return false;
    }
    const titleButtonProperties = titleButtonRecord.properties || {};
    const titleButtonHiddenContentClickable = titleButtonProperties.hiddenContentClickable === true;
    const titleButtonWidthPx = Math.max(1, Number(titleButtonRecord.position?.width || 100));
    const titleButtonHeightPx = Math.max(1, Number(titleButtonRecord.position?.height || 100));
    const titleButtonUiScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const titleButtonRects: any[] = [];
    /**
     * 记录一个由左上角与宽高定义的矩形，坏数据（NaN / 非正宽高）直接丢弃。
     */
    const pushTitleButtonRect = (
      titleButtonRectLeft: any,
      titleButtonRectTop: any,
      titleButtonRectWidth: any,
      titleButtonRectHeight: any
    ) => {
      if (
        !![
          titleButtonRectLeft,
          titleButtonRectTop,
          titleButtonRectWidth,
          titleButtonRectHeight
        ].every(Number.isFinite) &&
        !(titleButtonRectWidth <= 0) &&
        !(titleButtonRectHeight <= 0)
      ) {
        titleButtonRects.push({
          left: titleButtonRectLeft,
          top: titleButtonRectTop,
          right: titleButtonRectLeft + titleButtonRectWidth,
          bottom: titleButtonRectTop + titleButtonRectHeight
        });
      }
    };
    /**
     * 把标题按钮控件的数值属性夹到合法区间（非数值走兜底值）。
     */
    const clampTitleButtonValue = (
      titleButtonRawValue: any,
      titleButtonMinValue: any,
      titleButtonMaxValue: any,
      titleButtonFallbackValue: any
    ) => {
      const titleButtonNumericValue = Number(titleButtonRawValue);
      return Math.max(
        titleButtonMinValue,
        Math.min(
          titleButtonMaxValue,
          Number.isFinite(titleButtonNumericValue)
            ? titleButtonNumericValue
            : titleButtonFallbackValue
        )
      );
    };
    if (titleButtonProperties.frameVisible !== false || titleButtonHiddenContentClickable) {
      const titleButtonFrameScale =
        clampTitleButtonValue(titleButtonProperties.frameSize, 10, 300, 100) / 100;
      const titleButtonFrameHeightPx = titleButtonHeightPx * 0.45 * titleButtonFrameScale;
      const titleButtonFrameCenterX =
        titleButtonWidthPx / 2 +
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.frameOffsetX, -100, 100, 0)) /
          100;
      const titleButtonFrameCenterY =
        titleButtonHeightPx / 2 +
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.frameOffsetY, -100, 100, 0)) /
          100;
      const titleButtonFrameSpacingPx =
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.frameSpacing, 0, 300, 100)) /
        200;
      const titleButtonFrameBarWidthPx = titleButtonHeightPx * 0.12;
      const titleButtonFrameBorderWidthPx = clampTitleButtonValue(
        titleButtonProperties.frameWidth,
        0,
        12,
        1.5
      );
      pushTitleButtonRect(
        titleButtonFrameCenterX - titleButtonFrameSpacingPx - titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameCenterY - titleButtonFrameHeightPx / 2 - titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameBarWidthPx + titleButtonFrameBorderWidthPx,
        titleButtonFrameHeightPx + titleButtonFrameBorderWidthPx
      );
      pushTitleButtonRect(
        titleButtonFrameCenterX +
          titleButtonFrameSpacingPx -
          titleButtonFrameBarWidthPx -
          titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameCenterY - titleButtonFrameHeightPx / 2 - titleButtonFrameBorderWidthPx / 2,
        titleButtonFrameBarWidthPx + titleButtonFrameBorderWidthPx,
        titleButtonFrameHeightPx + titleButtonFrameBorderWidthPx
      );
    }
    if (titleButtonProperties.mainTextVisible !== false || titleButtonHiddenContentClickable) {
      const titleMainTextElement = titleButtonHostElement.querySelector(
        ":scope > .hb-title-button .hb-title-button-main"
      );
      const titleMainFontSizePx =
        (titleButtonHeightPx * clampTitleButtonValue(titleButtonProperties.mainSize, 8, 200, 34)) /
        100;
      pushTitleButtonRect(
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.mainTextLeft, -100, 200, 5.5)) /
          100,
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.mainTextTop, -100, 200, 45)) /
          100 -
          titleMainFontSizePx / 2,
        Math.max(
          titleMainFontSizePx,
          Number(titleMainTextElement?.offsetWidth || 0) * titleButtonUiScale
        ),
        Math.max(
          titleMainFontSizePx,
          Number(titleMainTextElement?.offsetHeight || 0) * titleButtonUiScale
        )
      );
    }
    if (titleButtonProperties.secondaryTextVisible !== false || titleButtonHiddenContentClickable) {
      const titleSecondaryTextElement = titleButtonHostElement.querySelector(
        ":scope > .hb-title-button .hb-title-button-secondary"
      );
      const titleSecondaryFontSizePx =
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.secondarySize, 6, 100, 12)) /
        100;
      const titleSecondaryBlockHeightPx = Math.max(
        titleSecondaryFontSizePx,
        Number(titleSecondaryTextElement?.offsetHeight || 0) * titleButtonUiScale
      );
      pushTitleButtonRect(
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.secondaryTextLeft, -100, 200, 54)) /
          100,
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.secondaryTextTop, -100, 200, 43)) /
          100 -
          titleSecondaryBlockHeightPx / 2,
        Math.max(
          titleSecondaryFontSizePx,
          Number(titleSecondaryTextElement?.offsetWidth || 0) * titleButtonUiScale
        ),
        titleSecondaryBlockHeightPx
      );
    }
    if (
      (titleButtonProperties.iconVisible !== false || titleButtonHiddenContentClickable) &&
      titleButtonProperties.icon
    ) {
      const titleIconSizePx =
        (titleButtonHeightPx * clampTitleButtonValue(titleButtonProperties.iconSize, 1, 100, 30)) /
        100;
      pushTitleButtonRect(
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.iconLeft, -100, 200, 50)) /
          100 -
          titleIconSizePx / 2,
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.iconTop, -100, 200, 45)) /
          100 -
          titleIconSizePx / 2,
        titleIconSizePx,
        titleIconSizePx
      );
    }
    if (titleButtonProperties.markerVisible !== false || titleButtonHiddenContentClickable) {
      const titleMarkerSizePx =
        (titleButtonHeightPx * clampTitleButtonValue(titleButtonProperties.markerSize, 2, 60, 10)) /
        100;
      const titleMarkerCenterX =
        (titleButtonWidthPx *
          clampTitleButtonValue(titleButtonProperties.markerLeft, -100, 200, 1.8)) /
        100;
      const titleMarkerCenterY =
        (titleButtonHeightPx *
          clampTitleButtonValue(titleButtonProperties.markerTop, -100, 200, 84)) /
        100;
      pushTitleButtonRect(
        titleMarkerCenterX - titleMarkerSizePx * 0.58,
        titleMarkerCenterY,
        titleMarkerSizePx * 1.16,
        titleMarkerSizePx
      );
    }
    if (!titleButtonRects.length) {
      return false;
    }
    const titleButtonPaddingPx = 4;
    const titleButtonBoundsLeftPx =
      Math.min(...titleButtonRects.map(titleButtonLeftRect => titleButtonLeftRect.left)) -
      titleButtonPaddingPx;
    const titleButtonBoundsTopPx =
      Math.min(...titleButtonRects.map(titleButtonTopRect => titleButtonTopRect.top)) -
      titleButtonPaddingPx;
    const titleButtonBoundsRightPx =
      Math.max(...titleButtonRects.map(titleButtonRightRect => titleButtonRightRect.right)) +
      titleButtonPaddingPx;
    const titleButtonBoundsBottomPx =
      Math.max(...titleButtonRects.map(titleButtonBottomRect => titleButtonBottomRect.bottom)) +
      titleButtonPaddingPx;
    Object.assign(titleButtonBoundsElement.style, {
      left: titleButtonBoundsLeftPx + "px",
      top: titleButtonBoundsTopPx + "px",
      width: Math.max(1, titleButtonBoundsRightPx - titleButtonBoundsLeftPx) + "px",
      height: Math.max(1, titleButtonBoundsBottomPx - titleButtonBoundsTopPx) + "px"
    });
    return true;
  },
  /**
   * 计算灯光统计控件选中框的位置与尺寸。
   */
  updateLightStatisticsSelectionBounds(
    statisticsHostElement,
    statisticsRecord,
    statisticsSelectionBoundsElement
  ) {
    if (
      !statisticsHostElement ||
      statisticsRecord?.type !== "light-statistics" ||
      !statisticsSelectionBoundsElement ||
      statisticsHostElement.hidden
    ) {
      return false;
    }
    const statisticsVisualElement = statisticsHostElement.querySelector(
      ":scope > .hb-light-statistics"
    );
    if (!statisticsVisualElement) {
      return false;
    }
    const statisticsVisibleChildren = [...statisticsVisualElement.children].filter(
      statisticsChildElement =>
        statisticsChildElement.hidden ||
        Number(statisticsChildElement.offsetWidth || 0) <= 0 ||
        Number(statisticsChildElement.offsetHeight || 0) <= 0
          ? false
          : window.getComputedStyle?.(statisticsChildElement).display !== "none"
    );
    if (!statisticsVisibleChildren.length) {
      return false;
    }
    const statisticsUiScale = Math.max(0.01, Number(this.document?.canvas?.componentScale || 1));
    const statisticsPaddingPx = 4;
    const statisticsBoundsLeftPx =
      (Math.min(
        ...statisticsVisibleChildren.map(statisticsLeftChild => statisticsLeftChild.offsetLeft)
      ) -
        statisticsPaddingPx) *
      statisticsUiScale;
    const statisticsBoundsTopPx =
      (Math.min(
        ...statisticsVisibleChildren.map(statisticsTopChild => statisticsTopChild.offsetTop)
      ) -
        statisticsPaddingPx) *
      statisticsUiScale;
    const statisticsBoundsRightPx =
      (Math.max(
        ...statisticsVisibleChildren.map(
          statisticsRightChild => statisticsRightChild.offsetLeft + statisticsRightChild.offsetWidth
        )
      ) +
        statisticsPaddingPx) *
      statisticsUiScale;
    const statisticsBoundsBottomPx =
      (Math.max(
        ...statisticsVisibleChildren.map(
          statisticsBottomChild =>
            statisticsBottomChild.offsetTop + statisticsBottomChild.offsetHeight
        )
      ) +
        statisticsPaddingPx) *
      statisticsUiScale;
    Object.assign(statisticsSelectionBoundsElement.style, {
      left: statisticsBoundsLeftPx + "px",
      top: statisticsBoundsTopPx + "px",
      width: Math.max(1, statisticsBoundsRightPx - statisticsBoundsLeftPx) + "px",
      height: Math.max(1, statisticsBoundsBottomPx - statisticsBoundsTopPx) + "px"
    });
    return true;
  },
  /**
   * 计算文本控件选中框的位置与尺寸（按实际行数与字号量测）。
   */
  updateTextSelectionBounds(
    selectionTextHostElement,
    selectionTextRecord,
    selectionTextBoundsElement
  ) {
    if (
      !selectionTextHostElement ||
      !["time", "date", "weather"].includes(selectionTextRecord?.type) ||
      !selectionTextBoundsElement
    ) {
      return false;
    } else {
      return this.withSelectionMeasurementHost(selectionTextHostElement, () => {
        const selectionTextVisualElement = selectionTextHostElement.querySelector(
          ":scope > .hb-time-component, :scope > .hb-date-component, :scope > .hb-weather-component"
        );
        if (!selectionTextVisualElement) {
          return false;
        }
        // 文本控件的可视片段：按控件类型收集文案节点，再滤掉被隐藏的部分。
        const selectionTextParts = (
          selectionTextRecord.type === "time"
            ? [
                ...selectionTextVisualElement.querySelectorAll(
                  ":scope > .hb-time-value, :scope > .hb-time-period"
                )
              ]
            : selectionTextRecord.type === "date"
              ? [
                  ...selectionTextVisualElement.querySelectorAll(
                    ":scope > .hb-date-primary, :scope > .hb-date-lunar"
                  )
                ]
              : [
                  ...selectionTextVisualElement.querySelectorAll(
                    ":scope > .hb-weather-icon, :scope > .hb-weather-content > strong, :scope > .hb-weather-content > small"
                  )
                ]
        ).filter(selectionTextPart => this.selectionElementIsVisible(selectionTextPart));
        const selectionTextUiScale = Math.max(
          0.01,
          Number(this.document?.canvas?.componentScale || 1)
        );
        const selectionTextWidthPx = Math.max(
          1,
          Number(selectionTextRecord.position?.width || 100)
        );
        const selectionTextHeightPx = Math.max(
          1,
          Number(selectionTextRecord.position?.height || 100)
        );
        if (!selectionTextParts.length) {
          const selectionTextFallbackBoxPx = Math.min(
            32,
            Math.max(20, Math.min(selectionTextWidthPx, selectionTextHeightPx) * 0.2)
          );
          Object.assign(selectionTextBoundsElement.style, {
            left: (selectionTextWidthPx - selectionTextFallbackBoxPx) / 2 + "px",
            top: (selectionTextHeightPx - selectionTextFallbackBoxPx) / 2 + "px",
            width: selectionTextFallbackBoxPx + "px",
            height: selectionTextFallbackBoxPx + "px"
          });
          return false;
        }
        const selectionTextBoxes = selectionTextParts.map(selectionTextPartEntry =>
          this.selectionElementBox(selectionTextPartEntry, selectionTextHostElement)
        );
        const selectionTextPaddingPx = 3;
        const selectionTextBoundsLeftPx =
          (Math.min(...selectionTextBoxes.map(selectionTextLeftBox => selectionTextLeftBox.left)) -
            selectionTextPaddingPx) *
          selectionTextUiScale;
        const selectionTextBoundsTopPx =
          (Math.min(...selectionTextBoxes.map(selectionTextTopBox => selectionTextTopBox.top)) -
            selectionTextPaddingPx) *
          selectionTextUiScale;
        const selectionTextBoundsRightPx =
          (Math.max(
            ...selectionTextBoxes.map(
              selectionTextRightBox => selectionTextRightBox.left + selectionTextRightBox.width
            )
          ) +
            selectionTextPaddingPx) *
          selectionTextUiScale;
        const selectionTextBoundsBottomPx =
          (Math.max(
            ...selectionTextBoxes.map(
              selectionTextBottomBox => selectionTextBottomBox.top + selectionTextBottomBox.height
            )
          ) +
            selectionTextPaddingPx) *
          selectionTextUiScale;
        Object.assign(selectionTextBoundsElement.style, {
          left: selectionTextBoundsLeftPx + "px",
          top: selectionTextBoundsTopPx + "px",
          width: Math.max(1, selectionTextBoundsRightPx - selectionTextBoundsLeftPx) + "px",
          height: Math.max(1, selectionTextBoundsBottomPx - selectionTextBoundsTopPx) + "px"
        });
        return true;
      });
    }
  },
  /**
   * 计算图片控件选中框的位置与尺寸。
   */
  async updateImageSelectionBounds(imageHostElement, imageRecord, imageBoundsElement) {
    const imageTargetElement = imageHostElement.querySelector(":scope > .hb-image-component");
    if (
      !imageTargetElement ||
      ((!imageTargetElement.complete || !imageTargetElement.naturalWidth) &&
        (await new Promise(imageSettleCallback => {
          imageTargetElement.addEventListener("load", imageSettleCallback, {
            once: true
          });
          imageTargetElement.addEventListener("error", imageSettleCallback, {
            once: true
          });
        })),
      !imageHostElement.isConnected ||
        !imageBoundsElement.isConnected ||
        !imageTargetElement.naturalWidth ||
        !imageTargetElement.naturalHeight)
    ) {
      return;
    }
    const imageWidthPx = Number(imageRecord.position?.width || 100);
    const imageHeightPx = Number(imageRecord.position?.height || 100);
    const imageNaturalAspectRatio =
      imageTargetElement.naturalWidth / imageTargetElement.naturalHeight;
    const imageFrameAspectRatio = imageWidthPx / imageHeightPx;
    const imageRenderWidthPx =
      imageNaturalAspectRatio >= imageFrameAspectRatio
        ? imageWidthPx
        : imageHeightPx * imageNaturalAspectRatio;
    const imageRenderHeightPx =
      imageNaturalAspectRatio >= imageFrameAspectRatio
        ? imageWidthPx / imageNaturalAspectRatio
        : imageHeightPx;
    // 图片按 contain 等比缩放后在框内水平居中，这里算左右各自的留白。
    const imageOffsetLeftPx = (imageWidthPx - imageRenderWidthPx) / 2;
    // 垂直方向的留白；下面按百分比写回，不依赖宿主元素的实际像素宽度。
    const imageOffsetTopPx = (imageHeightPx - imageRenderHeightPx) / 2;
    Object.assign(imageBoundsElement.style, {
      left: (imageOffsetLeftPx / imageWidthPx) * 100 + "%",
      top: (imageOffsetTopPx / imageHeightPx) * 100 + "%",
      width: (imageRenderWidthPx / imageWidthPx) * 100 + "%",
      height: (imageRenderHeightPx / imageHeightPx) * 100 + "%"
    });
  },
  /**
   * 按画布缩放反向补偿变换手柄的大小。
   */
  updateTransformHandleScale(
    transformScaleHostElement,
    transformComponent,
    transformOverlayElement = null,
    measuredBoundsRect = null
  ) {
    const transformBoundsElement = this.transformHandleBoundsElement(
      transformScaleHostElement,
      transformComponent,
      transformOverlayElement
    );
    if (!transformBoundsElement) {
      return;
    }
    const appliedComponentScale = Math.min(this.appliedScaleX || 1, this.appliedScaleY || 1);
    const elementVisualScale = Math.max(
      0.01,
      Math.min(5, Number(transformComponent.style?.scale || 1))
    );
    const parentTransformScale = this.componentParentTransform(transformComponent.id).scale;
    const inverseHandleScale =
      1 / Math.max(0.001, appliedComponentScale * elementVisualScale * parentTransformScale);
    // 读在写之前（理由同 updateMultiSelectionHandleScale）：resize 会把整个页面的
    const transformBoundsRect = measuredBoundsRect || transformBoundsElement.getBoundingClientRect();
    transformBoundsElement.style.setProperty("--hb-ui-scale", String(inverseHandleScale));
    transformBoundsElement.style.setProperty("--hb-handle-outset", inverseHandleScale * 30 + "px");
    transformBoundsElement.classList.toggle(
      "handles-outside",
      transformBoundsRect.width < 132 || transformBoundsRect.height < 112
    );
  },
  /**
   * 找某个组件的手柄外框元素（选区外框）。
   */
  transformHandleBoundsElement(
    transformScaleHostElement,
    transformComponent,
    transformOverlayElement = null
  ) {
    if (!transformScaleHostElement || !transformComponent) {
      return null;
    }
    return (
      transformOverlayElement ||
      this.componentSelectionOverlays
        .get(transformComponent.id)
        ?.querySelector(":scope > .hb-selection-bounds") ||
      transformScaleHostElement.querySelector(":scope > .hb-selection-bounds") ||
      null
    );
  }
};
