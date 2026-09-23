/*
 * 区块二：选中、多选与变换手势。
 *
 * 从 setSelectedComponent 一路到拖拽/缩放/旋转的 pointer 手势、选中框与变换手柄的绘制、
 * 以及各控件类型自己的选中边界测量，全部收在这里。共同的约定是：
 * 一切以「组件本地坐标」计算，再经组件变换链换算到世界坐标（见 componentTransformChain）。
 *
 * 这些方法只读写 DOM 与自己的手势状态，不发请求、不碰运行期缓存。
 */

import { capturePointer } from "../../../utils/pointer-capture.js?v=2609231402";
import {
  doorWindowPerspectiveCorners,
  doorWindowPerspectiveMatrix,
  renderRegisteredComponent
} from "../registry.js?v=2609231402";
import {
  airflowCanvasOffsetBounds,
  airflowLayerGeometry,
  groupedComponentLocalDelta,
  rotateMultiSelectionTransforms
} from "../../geometry/transform-geometry.js?v=2609231402";
import {
  assignComponentIds,
  componentDialogTitle,
  isModifierKeyPressed
} from "./primitives.js?v=2609231402";

export const selectionTransformMethods = {
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
   *
   * 不存在的组件 ID 会被直接丢掉：调用方常直接传文档里的 ID，而当前页可能不含它。
   */
  setSelectedComponents(componentIds, primaryComponentId = null) {
    this.selectedComponentIds = new Set(
      (componentIds || []).filter(recordComponentId => this.componentRecords.has(recordComponentId))
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
   * 气流层、效果层、门窗外透视的可见范围不等于宿主根节点，选中框挂到对应子层才能对齐。
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
   *
   * 拖动、缩放过程中会以每帧的频率调用，因此这里绝不做深比较或整页重渲染。
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
   * 高频路径；与变换预览不同，属性变化可能要重画控件内容（如亮度、文案），
   * 因此会有条件地重建该组件的可视件。
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
        isIconVisible: iconEntityId => this.iconVisibilityState(iconEntityId),
        navigate: navigatePath => this.navigate(navigatePath),
        cleanup: disposeCallback => this.cleanups.push(disposeCallback)
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
   * 先整体移除再重画而不复用：数量少、重建便宜，复用易残留旧手柄（尤其切换气流/效果层时）。
   */
  syncSelection() {
    this.canvas
      ?.querySelectorAll(".hb-multi-selection-bounds")
      .forEach(boundsElement => boundsElement.remove());
    this.canvas
      ?.querySelectorAll(".hb-component-selection-overlay")
      .forEach(removedOverlayElement => removedOverlayElement.remove());
    this.componentSelectionOverlays.clear();
    for (const airflowLayerElement of this.componentAirflowLayers.values()) {
      airflowLayerElement
        .querySelectorAll(":scope > .hb-selection-bounds")
        .forEach(airflowBoundsElement => airflowBoundsElement.remove());
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
        .forEach(staleHandleElement => staleHandleElement.remove());
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
   * 仅当所有宿主同属一个父元素时才返回：缩放要以共同父级为坐标系，
   * 跨父级没有统一参考系，此时退化为不显示多选框。
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
   * 用 visited 集合防环：损坏文档或拖动中的父子互指会让界面卡死在这一帧。
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
   *
   * 同样带防环：这个函数是坐标换算的基础，任何死循环都会让整个编辑器失去响应。
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
   * 单级缩放夹在 0.01~5（编辑器缩放的上下限）：越界值（如文档被手改）会让包围盒
   * 算成 0 或无穷大，手柄随之消失。
   */
  componentWorldTransform(worldTransformComponentId) {
    return this.componentTransformChain(worldTransformComponentId).reduce(
      (accumulatedTransform, chainEntry) => ({
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
   * 与 componentLocalPointToWorld 必须严格互逆，否则按下点与拖动点算到不同坐标系，
   * 表现为控件跟手偏移。
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
   * light-statistics 的可视范围与 position 声明不一致（图例宽度随内容变），因此改读真实选中框尺寸；
   * 有旋转时用「半宽半高在坐标轴上的投影」求外接矩形，而不是取旋转后的四个角点，这样包围盒不随角度抖动。
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
        // 否则宁可按文档声明的尺寸算，也不要写出一组 NaN 坐标。
        [localOffsetLeftPx, localOffsetTopPx, effectiveWidthPx, effectiveHeightPx] =
          selectionBoundsRect;
      }
    }
    const boundsScale = Math.max(0.01, Math.min(5, Number(boundsComponent.style?.scale || 1)));
    // 旋转围绕组件声明矩形的中心（pivot），而不是可视件的中心：
    // CSS transform-origin 用的是前者，两者不一致时包围盒会整体偏移。
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
    const recordBoundsList = scaleRecords.map(scaleRecord =>
      this.componentVisualBounds(scaleRecord.component, scaleRecord.host)
    );
    return {
      left: Math.min(...recordBoundsList.map(boundsLeft => boundsLeft.left)),
      top: Math.min(...recordBoundsList.map(boundsTop => boundsTop.top)),
      right: Math.max(...recordBoundsList.map(boundsRight => boundsRight.right)),
      bottom: Math.max(...recordBoundsList.map(boundsBottom => boundsBottom.bottom))
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
   * 手柄画在已缩放的坐标系里，不反向补偿就会在画布缩小时小到点不中、放大时变成大方块。
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
    // 不改变外框自己的盒子，所以先量后写与先写后量得到同一个矩形 ——
    // 但先量能避免这次读被上面的写入弄脏而强制一次同步布局。
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
   * 一次性写入整批再统一触发回流；逐个组件读写样式会各自引发强制同步布局，多选时明显卡顿。
   */
  previewComponentsTransform(transformList, leadComponentId = this.selectedComponentId) {
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
   * 只写预览变换，松手后由调用方决定是否提交文档；起始包围盒与指针距离一次性记下，
   * 后续每帧只做比例换算，避免累积误差。
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
    const scalableRecords = recordList.map(scaleEntry => {
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
      ...scalableRecords.map(minScaleEntry => 0.01 / minScaleEntry.scale)
    );
    const maxScaleFactor = Math.min(
      ...scalableRecords.map(maxScaleEntry => 5 / maxScaleEntry.scale)
    );
    let scaleFactor = 1;
    let previewTransforms = [];
    let isFinished = false;
    const activePointerId = scalePointerEvent.pointerId;
    capturePointer(scalePointerEvent.currentTarget, activePointerId);
    /**
     * 多选缩放期间的指针移动处理：按指针到包围盒中心的距离比例缩放整批组件。
     * 只写预览变换与 DOM 样式、不提交文档，并同步更新多选框尺寸；缩放因子夹在上下限之间。
     */
    const onScalePointerMove = scaleMoveEvent => {
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
      previewTransforms = scalableRecords.map(scaleTargetEntry => {
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
    const onScalePointerEnd = (endEvent = null) => {
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
   *
   * 与多选缩放同构，只在交互期间写预览变换。
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
    const rotatableRecords = rotationRecordList.map(rotateEntry => {
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
    let rotatedTransforms = [];
    let isRotateFinished = false;
    const rotatePointerId = rotationPointerEvent.pointerId;
    capturePointer(rotationPointerEvent.currentTarget, rotatePointerId);
    /**
     * 多选旋转期间的指针移动处理：按指针绕包围盒中心的累计转角旋转整批组件。
     *
     * 每次增量转角先归一化到 (-π, π]，避免 atan2 在 ±180° 处跳变时组件瞬间翻转。
     */
    const onRotatePointerMove = rotateMoveEvent => {
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
          entryTransform => entryTransform.componentId === rotatedTransform.componentId
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
    const onRotatePointerEnd = (rotateEndEvent = null) => {
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
   * 拖动期间只走预览变换，松手后由调用方决定是否写入文档；指针捕获元素由调用方指定，
   * 以便拖出宿主边界后仍能持续收到移动事件。
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
    let activeDragRecords = dragRecords;
    let copiedComponentEntries = [];
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
     * 同时处理三件事：修饰键「拖出副本」（位移超 3px 才克隆，避免误触）、Shift 锁定单轴、
     * 按 dragBounds 夹取增量；增量经父级变换换算成局部坐标写入 position，只预览不落库。
     */
    const onDragPointerMove = moveEvent => {
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
     * 位置没变就不提交，避免纯点击留下无意义的改动记录；副本分支以拖动中最后的预览值为准，
     * 取不到时退回起始位置。
     */
    const onDragPointerEnd = (dragEndEvent = null) => {
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
            draggedComponent.id,
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
   *
   * 交互期间只写预览变换，松手后由调用方提交文档。
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
     * 缩放值夹在 0.01~5；每帧都要把同一 transform 同步给选中覆盖层与变换手柄，
     * 否则手柄滞后于组件、产生可见错位。
     */
    const onComponentScalePointerMove = componentScaleMoveEvent => {
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
    const onComponentScalePointerEnd = (componentScaleEndEvent = null) => {
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
     * 旋转角 = 按下时角度 +（当前极角 - 按下时极角），写入 transform 时保留原有缩放分量。
     */
    const onComponentRotatePointerMove = componentRotateMoveEvent => {
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
    const onComponentRotatePointerEnd = (componentRotateEndEvent = null) => {
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
   * 宿主父层不是画布且自身未隐藏时返回 null：这类组件（如组内成员）的选中框由父级统一提供。
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
   * 气流层的可视区域不等于宿主根节点（层内有自己的偏移与裁剪），复用通用选中框会错位。
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
   *
   * 效果层的可见范围由裁剪矩形决定，选中框要贴着实际图形而不是宿主矩形。
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
   * hidden 元素量不到尺寸（offsetWidth 恒为 0），不先显示就拿不到真实尺寸；
   * 恢复放在 finally 里，回调抛错也不会把元素留在可见态。
   */
  withSelectionMeasurementHost(measurementStartElement, measureCallback) {
    const hiddenElements = [];
    let measurementElement = measurementStartElement;
    while (measurementElement && measurementElement !== this.canvas) {
      // 只记录本来隐藏的元素，恢复时按这份清单还原，避免把用户设成显示的元素又藏起来。
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
   * 只看 display / visibility 不够：父级折叠、flex 收缩都可能让尺寸归零，还要查宽高。
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
   * 逐级累加 offsetLeft / offsetTop 而非两个 getBoundingClientRect 相减：后者带上了
   * 祖先 transform 的缩放，而选中框要与组件局部坐标系对齐。累加带防环。
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
   *
   * 用矩阵而不是 skew：四角可独立拖动，只有矩阵能表达任意四边形到矩形的投影。
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
      .forEach(perspectiveHandleElement => {
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
   *
   * 只改该角坐标，其余三角保持不动，松手后由调用方提交文档。
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
     * 换算链：屏幕位移 → 除视图缩放 → 反向旋转分组累计角 → 除世界缩放，得到组件自身
     * 坐标系位移，再按宽高归一化成 0~1 角点；每帧重建角点并刷新透视层与手柄。
     */
    const onPerspectivePointerMove = perspectiveMoveEvent => {
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
     *
     * 角点数组是扁平数字，用 JSON 串比较即可判断是否真的动过（拖回原位就不提交）。
     */
    const onPerspectivePointerEnd = (perspectiveEndEvent = null) => {
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
   * 气流层自带画布级偏移量（不是普通 left/top），因此单独一套手势处理并把偏移夹在允许范围。
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
     * 偏移以组件宽高百分比存储（airflowOffsetX/Y），故位移除以组件尺寸再乘 100，
     * 结果按 airflowOffsetBounds 夹取，防止出风效果被拖出画布。
     */
    const onAirflowPointerMove = airflowMoveEvent => {
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
    const onAirflowPointerEnd = (airflowEndEvent = null) => {
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
     *
     * 缩放值夹在 0.01~5 之间：下限避免除零/退化，上限避免特效铺满整个画布。
     */
    const onAirflowScalePointerMove = airflowScaleMoveEvent => {
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
     * 旋转角 = 起始角 +（当前极角 - 按下时极角）；与多选旋转不同，不累计增量也不做 ±π 归一化。
     */
    const onAirflowRotatePointerMove = airflowRotateMoveEvent => {
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
   * 可视件由内容撑开（按钮组、送风图），尺寸不等于文档声明的 position 宽高，因此每次都要
   * 量实际内容盒；量不到时退回声明尺寸，宁可框略大也不要消失。
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
    const airConditionerRects = [];
    /**
     * 把空调控件的数值属性（尺寸、坐标百分比）夹到合法区间。
     * 非数值一律换成兜底值：旧文档可能写成字符串或空值，直接运算会得到 NaN 让选中框消失。
     */
    const clampAirConditionerValue = (
      airConditionerRawValue,
      airConditionerMinValue,
      airConditionerMaxValue,
      airConditionerFallbackValue
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
      airConditionerRectCenterX,
      airConditionerRectCenterY,
      airConditionerRectWidth,
      airConditionerRectHeight
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
     * 文字以左侧中心为锚点（控件样式约定），宽度先量实际渲染宽度，量不到时按一个字号兜底，
     * 避免出现零宽矩形。
     */
    const pushAirConditionerTextRect = (
      airConditionerTextElement,
      airConditionerLeftPercent,
      airConditionerTopPercent,
      airConditionerFontHeightPx
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
    const deviceButtonRects = [];
    /**
     * 把设备按钮控件的数值属性夹到合法区间（非数值走兜底值）。
     */
    const clampDeviceButtonValue = (
      deviceButtonRawValue,
      deviceButtonMinValue,
      deviceButtonMaxValue,
      deviceButtonFallbackValue
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
     * 先校验四个值都有限且宽高为正，坏数据直接不记录，免得把选中框的并集撑到无穷大。
     */
    const pushDeviceButtonCenteredRect = (
      deviceButtonRectCenterX,
      deviceButtonRectCenterY,
      deviceButtonRectWidth,
      deviceButtonRectHeight
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
      deviceButtonTextElement,
      deviceButtonLeftPercent,
      deviceButtonTopPercent,
      deviceButtonFontHeightPx
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
    const titleButtonRects = [];
    /**
     * 记录一个由左上角与宽高定义的矩形，坏数据（NaN / 非正宽高）直接丢弃。
     */
    const pushTitleButtonRect = (
      titleButtonRectLeft,
      titleButtonRectTop,
      titleButtonRectWidth,
      titleButtonRectHeight
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
      titleButtonRawValue,
      titleButtonMinValue,
      titleButtonMaxValue,
      titleButtonFallbackValue
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
   * 图例宽度随统计项数量变化，声明尺寸只覆盖柱子区域，因此读真实的 .hb-selection-bounds 尺寸。
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
   * 异步：图片按 contain 等比缩放，只有拿到自然尺寸才能算出实际占位，故要等一次 load
   * （或短超时兜底）；按真实占位画框才能与看到的图像边界一致。
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
    // 矩形一次读齐之后再把量好的传进来，只有零散调用点才在这里当场量。
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
   * 单独抽出来是为了只定位不测量：resize 在「读阶段」先量齐所有宿主矩形，
   * 测量与套用分开后，一遍 resize 的布局解析从「每宿主一次」降到一次。
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
