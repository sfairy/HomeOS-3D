import { mapCorners, mapSource } from "./vacuum-map.js?v=20260915211726";
export function planFurniture(plan = {}) {
  const pixelsPerMeter = Number(plan.pixelsPerMeter) > 0 ? Number(plan.pixelsPerMeter) : 1;
  const excludedFurnitureTypes = new Set([
    "downlight",
    "ceilinglight",
    "striplight",
    "camera",
    "presence",
    "flooropening",
    "label"
  ]);
  return (plan.items || [])
    .filter(
      planItem =>
        !excludedFurnitureTypes.has(planItem.type) &&
        [planItem.x, planItem.y, planItem.width, planItem.depth].every(Number.isFinite) &&
        planItem.width > 0 &&
        planItem.depth > 0
    )
    .map(furniture => ({
      ...furniture,
      width: furniture.width * pixelsPerMeter,
      depth: furniture.depth * pixelsPerMeter,
      rotation: Number(furniture.rotation) || 0
    }));
}
export function openVacuumMapEditor({ item: vacuumItem, floor: floor, onSave: saveHandler }) {
  const documentRef = window.document;
  const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  const createHtmlElement = (tagName, textContent) => {
    const createdElement = documentRef.createElement(tagName);
    if (textContent) {
      createdElement.textContent = textContent;
    }
    return createdElement;
  };
  const createSvgElement = (svgTagName, svgAttributes = {}) => {
    const createdSvgElement = documentRef.createElementNS(SVG_NAMESPACE_URI, svgTagName);
    for (const [attributeName, attributeValue] of Object.entries(svgAttributes)) {
      createdSvgElement.setAttribute(attributeName, attributeValue);
    }
    return createdSvgElement;
  };
  const walls = floor?.plan?.walls || [];
  const furnitureItems = planFurniture(floor?.plan);
  const planPoints = [
    ...walls.flatMap(wall => [wall.start, wall.end]),
    ...furnitureItems.flatMap(mapCorners)
  ];
  const boundsMinX = planPoints.length ? Math.min(...planPoints.map(pointForX => pointForX.x)) : 0;
  const boundsMinY = planPoints.length ? Math.min(...planPoints.map(pointForY => pointForY.y)) : 0;
  const boundsWidth = Math.max(
    100,
    planPoints.length
      ? Math.max(...planPoints.map(pointForWidth => pointForWidth.x)) - boundsMinX
      : 1000
  );
  const boundsDepth = Math.max(
    100,
    planPoints.length
      ? Math.max(...planPoints.map(pointForDepth => pointForDepth.y)) - boundsMinY
      : 1000
  );
  const defaultMapConfig = {
    x: boundsMinX + boundsWidth / 2,
    y: boundsMinY + boundsDepth / 2,
    width: boundsWidth,
    depth: boundsDepth,
    rotation: 0,
    opacity: 45,
    visible: true
  };
  const draftState = {
    map: {
      ...defaultMapConfig,
      ...structuredClone(vacuumItem.map || {})
    }
  };
  const dialogElement = createHtmlElement("dialog");
  dialogElement.className = "i3d-vacuum-map-editor";
  dialogElement.setAttribute("aria-label", "底图对齐");
  const headerElement = createHtmlElement("header");
  const titleElement = createHtmlElement("strong", (floor?.name || "当前楼层") + " · 底图对齐");
  const statusElement = createHtmlElement("span");
  statusElement.setAttribute("role", "status");
  let isClosed = false;
  let dragState = null;
  const closeEditor = () => {
    if (!isClosed) {
      isClosed = true;
      resizeObserver.disconnect();
      dialogElement.close();
      dialogElement.remove();
    }
  };
  const createButton = (buttonLabel, onClick) => {
    const buttonElement = createHtmlElement("button", buttonLabel);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onClick);
    return buttonElement;
  };
  const saveButtonElement = createButton("保存", () => {
    saveHandler(structuredClone(draftState));
    statusElement.textContent = "已应用，最后保存扫地机配置";
  });
  saveButtonElement.className = "primary";
  const closeButtonElement = createButton("×", closeEditor);
  closeButtonElement.setAttribute("aria-label", "关闭底图对齐");
  headerElement.append(titleElement, statusElement, saveButtonElement, closeButtonElement);
  const bodyElement = createHtmlElement("div");
  bodyElement.className = "i3d-vacuum-map-body";
  const planElement = createHtmlElement("div");
  planElement.className = "i3d-vacuum-plan";
  const planPadding = Math.max(boundsWidth, boundsDepth) * 0.12;
  const svgElement = createSvgElement("svg", {
    viewBox:
      boundsMinX -
      planPadding +
      " " +
      (boundsMinY - planPadding) +
      " " +
      (boundsWidth + planPadding * 2) +
      " " +
      (boundsDepth + planPadding * 2),
    role: "img",
    "aria-label": "户型平面与扫地机地图"
  });
  let viewBox = {
    x: boundsMinX - planPadding,
    y: boundsMinY - planPadding,
    width: boundsWidth + planPadding * 2,
    height: boundsDepth + planPadding * 2
  };
  const applyViewBox = () => {
    svgElement.setAttribute(
      "viewBox",
      viewBox.x + " " + viewBox.y + " " + viewBox.width + " " + viewBox.height
    );
    renderEditor();
  };
  const scaleMap = scaleFactor => {
    const draftMap = draftState.map;
    const clampedScale = Math.max(
      0.01 / Math.min(draftMap.width, draftMap.depth),
      Math.min(1000000 / Math.max(draftMap.width, draftMap.depth), scaleFactor)
    );
    draftMap.width *= clampedScale;
    draftMap.depth *= clampedScale;
    renderEditor();
  };
  const zoomView = zoomFactor => {
    const nextViewWidth = Math.max(
      boundsWidth * 0.15,
      Math.min(boundsWidth * 10, viewBox.width * zoomFactor)
    );
    const viewScaleRatio = nextViewWidth / viewBox.width;
    viewBox = {
      x: viewBox.x + (viewBox.width - nextViewWidth) / 2,
      y: viewBox.y + (viewBox.height * (1 - viewScaleRatio)) / 2,
      width: nextViewWidth,
      height: viewBox.height * viewScaleRatio
    };
    applyViewBox();
  };
  const mapImageElement = createSvgElement("image", {
    preserveAspectRatio: "none"
  });
  const furnitureLayerElement = createSvgElement("g", {
    "pointer-events": "none",
    "data-layer": "furniture"
  });
  const wallsLayerElement = createSvgElement("g");
  const handlesLayerElement = createSvgElement("g");
  const furnitureLabels = [];
  for (const furnitureEntry of furnitureItems) {
    const furnitureWidth = furnitureEntry.width;
    const furnitureDepth = furnitureEntry.depth;
    const furnitureGroup = createSvgElement("g", {
      transform:
        "translate(" +
        furnitureEntry.x +
        " " +
        furnitureEntry.y +
        ") rotate(" +
        furnitureEntry.rotation +
        ")",
      "data-furniture-id": furnitureEntry.id,
      fill: /^#[0-9a-f]{6}$/i.test(furnitureEntry.color || "") ? furnitureEntry.color : "#91a4b5",
      "fill-opacity": 0.28,
      stroke: "#d0dae3",
      "stroke-width": 1,
      "stroke-opacity": 0.8
    });
    const appendFurnitureShape = (shapeTagName, shapeAttributes) =>
      furnitureGroup.append(
        createSvgElement(shapeTagName, {
          ...shapeAttributes,
          "vector-effect": "non-scaling-stroke"
        })
      );
    const isRoundFurniture = ["plant", "robotvacuum", "roundtable", "stool"].includes(
      furnitureEntry.type
    );
    appendFurnitureShape(
      isRoundFurniture ? "ellipse" : "rect",
      isRoundFurniture
        ? {
            cx: 0,
            cy: 0,
            rx: furnitureWidth / 2,
            ry: furnitureDepth / 2
          }
        : {
            x: -furnitureWidth / 2,
            y: -furnitureDepth / 2,
            width: furnitureWidth,
            height: furnitureDepth,
            rx: Math.min(furnitureWidth, furnitureDepth) * 0.06
          }
    );
    if (furnitureEntry.type === "bed") {
      appendFurnitureShape("rect", {
        x: -furnitureWidth * 0.42,
        y: -furnitureDepth * 0.43,
        width: furnitureWidth * 0.36,
        height: furnitureDepth * 0.2,
        rx: furnitureDepth * 0.03
      });
      appendFurnitureShape("rect", {
        x: furnitureWidth * 0.06,
        y: -furnitureDepth * 0.43,
        width: furnitureWidth * 0.36,
        height: furnitureDepth * 0.2,
        rx: furnitureDepth * 0.03
      });
      appendFurnitureShape("line", {
        x1: -furnitureWidth / 2,
        x2: furnitureWidth / 2,
        y1: -furnitureDepth * 0.12,
        y2: -furnitureDepth * 0.12
      });
    } else if (furnitureEntry.type === "sofa") {
      appendFurnitureShape("rect", {
        x: -furnitureWidth * 0.38,
        y: -furnitureDepth * 0.26,
        width: furnitureWidth * 0.76,
        height: furnitureDepth * 0.65,
        rx: furnitureDepth * 0.04
      });
      appendFurnitureShape("line", {
        x1: 0,
        x2: 0,
        y1: -furnitureDepth * 0.26,
        y2: furnitureDepth * 0.39
      });
    }
    furnitureLayerElement.append(furnitureGroup);
    if (furnitureEntry.name) {
      const furnitureLabelElement = createSvgElement("text", {
        x: furnitureEntry.x,
        y: furnitureEntry.y,
        fill: "#e0e7ed",
        "text-anchor": "middle",
        "dominant-baseline": "central",
        stroke: "#17212d",
        "stroke-width": 2.5,
        "paint-order": "stroke",
        "vector-effect": "non-scaling-stroke"
      });
      furnitureLabelElement.textContent = furnitureEntry.name;
      furnitureLayerElement.append(furnitureLabelElement);
      furnitureLabels.push({
        label: furnitureLabelElement,
        item: furnitureEntry
      });
    }
  }
  for (const wallSegment of walls) {
    wallsLayerElement.append(
      createSvgElement("line", {
        x1: wallSegment.start.x,
        y1: wallSegment.start.y,
        x2: wallSegment.end.x,
        y2: wallSegment.end.y,
        stroke: "#9fa9bc",
        "stroke-width": Math.max(2, wallSegment.thickness || boundsWidth * 0.006),
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none"
      })
    );
  }
  svgElement.append(mapImageElement, furnitureLayerElement, wallsLayerElement, handlesLayerElement);
  planElement.append(svgElement);
  const viewToolsElement = createHtmlElement("div");
  viewToolsElement.className = "i3d-vacuum-view-tools";
  viewToolsElement.append(
    createButton("地图 −", () => scaleMap(1 / 1.1)),
    createButton("地图 +", () => scaleMap(1.1)),
    createButton("视图 −", () => zoomView(1.2)),
    createButton("视图 +", () => zoomView(1 / 1.2)),
    createButton("显示全部", () => {
      const visiblePoints = [...planPoints, ...mapCorners(draftState.map)];
      const viewPadding = Math.max(boundsWidth, boundsDepth) * 0.15;
      const viewMinX = Math.min(...visiblePoints.map(pointForViewMinX => pointForViewMinX.x));
      const viewMinY = Math.min(...visiblePoints.map(pointForViewMinY => pointForViewMinY.y));
      viewBox = {
        x: viewMinX - viewPadding,
        y: viewMinY - viewPadding,
        width:
          Math.max(...visiblePoints.map(pointForViewMaxX => pointForViewMaxX.x)) -
          viewMinX +
          viewPadding * 2,
        height:
          Math.max(...visiblePoints.map(pointForViewMaxY => pointForViewMaxY.y)) -
          viewMinY +
          viewPadding * 2
      };
      applyViewBox();
    })
  );
  planElement.append(viewToolsElement);
  svgElement.addEventListener(
    "wheel",
    wheelEvent => {
      wheelEvent.preventDefault();
      if (wheelEvent.target.closest("[data-drag]")) {
        scaleMap(wheelEvent.deltaY > 0 ? 1 / 1.08 : 1.08);
      } else {
        zoomView(wheelEvent.deltaY > 0 ? 1.12 : 1 / 1.12);
      }
    },
    {
      passive: false
    }
  );
  const sidebarElement = createHtmlElement("aside");
  const hintElement = createHtmlElement(
    "p",
    "拖动地图移动，拖角点缩放，拖圆点旋转；Shift 等比缩放。地图上滚轮或双指缩放地图，空白处滚轮缩放视图。"
  );
  hintElement.className = "i3d-note";
  sidebarElement.append(hintElement);
  const createNumberField = (
    labelText,
    boundObject,
    boundKey,
    minValue,
    maxValue,
    stepValue = 1,
    fieldContainer = sidebarElement
  ) => {
    const fieldLabelElement = createHtmlElement("label");
    const labelTextElement = createHtmlElement("span", labelText);
    const inputElement = createHtmlElement("input");
    Object.assign(inputElement, {
      type: "number",
      min: minValue,
      max: maxValue,
      step: "any",
      value: boundObject[boundKey]
    });
    inputElement.dataset.numberStep = String(stepValue);
    inputElement.setAttribute("aria-label", labelText);
    inputElement.addEventListener("change", () => {
      const inputValue = Number(inputElement.value);
      if (!Number.isFinite(inputValue) || inputElement.value.trim() === "") {
        inputElement.value = boundObject[boundKey];
        return;
      }
      boundObject[boundKey] = Math.max(minValue, Math.min(maxValue, inputValue));
      inputElement.value = boundObject[boundKey];
      renderEditor();
    });
    fieldLabelElement.append(labelTextElement, inputElement);
    fieldContainer.append(fieldLabelElement);
    return inputElement;
  };
  const fieldsByProperty = new Map();
  for (const [fieldLabel, propertyKey, minValueLimit, maxValueLimit] of [
    ["位置 X", "x", -1000000, 1000000],
    ["位置 Y", "y", -1000000, 1000000],
    ["宽度", "width", 0.01, 1000000],
    ["高度", "depth", 0.01, 1000000],
    ["旋转角度", "rotation", -360, 360],
    ["地图显示强度（%）", "opacity", 0, 100]
  ]) {
    fieldsByProperty.set(
      propertyKey,
      createNumberField(
        fieldLabel,
        draftState.map,
        propertyKey,
        minValueLimit,
        maxValueLimit,
        propertyKey === "rotation" ? 0.5 : 1
      )
    );
  }
  const visibilityToggleLabelElement = createHtmlElement("label");
  const visibilityToggleElement = createHtmlElement("input");
  visibilityToggleLabelElement.className = "i3d-setting-toggle";
  visibilityToggleElement.type = "checkbox";
  visibilityToggleElement.checked = draftState.map.visible;
  visibilityToggleElement.setAttribute("aria-label", "显示地图");
  visibilityToggleElement.addEventListener("change", () => {
    draftState.map.visible = visibilityToggleElement.checked;
    renderEditor();
  });
  visibilityToggleLabelElement.append(
    createHtmlElement("span", "显示地图"),
    visibilityToggleElement
  );
  sidebarElement.append(visibilityToggleLabelElement);
  const furnitureToggleLabelElement = createHtmlElement("label");
  const furnitureToggleElement = createHtmlElement("input");
  furnitureToggleLabelElement.className = "i3d-setting-toggle";
  furnitureToggleElement.type = "checkbox";
  furnitureToggleElement.checked = true;
  furnitureToggleElement.setAttribute("aria-label", "显示家具参照");
  furnitureToggleElement.addEventListener("change", () => {
    furnitureLayerElement.style.display = furnitureToggleElement.checked ? "" : "none";
  });
  furnitureToggleLabelElement.append(
    createHtmlElement("span", "显示家具参照"),
    furnitureToggleElement
  );
  sidebarElement.append(furnitureToggleLabelElement);
  sidebarElement.append(
    createButton("重置地图位置", () => {
      Object.assign(draftState.map, defaultMapConfig);
      visibilityToggleElement.checked = true;
      renderEditor();
    })
  );
  const mapNoteElement = createHtmlElement(
    "p",
    draftState.map.entityId ? "" : "尚未选择地图；仍可放置房间快捷按钮。"
  );
  mapNoteElement.className = "i3d-note";
  mapImageElement.addEventListener("error", () => {
    mapNoteElement.textContent = "地图暂时无法载入，请检查地图实体；已保存的位置会保留。";
  });
  if (draftState.map.entityId) {
    mapImageElement.setAttribute("href", mapSource(draftState.map.entityId));
  }
  sidebarElement.append(mapNoteElement);
  let lastLabelScale = null;
  function renderEditor() {
    const currentMap = draftState.map;
    const unitsPerPixel = 1 / Math.max(0.001, svgElement.getScreenCTM()?.a || 1);
    for (const [fieldPropertyKey, fieldInputElement] of fieldsByProperty) {
      if (documentRef.activeElement !== fieldInputElement) {
        fieldInputElement.value = Number(currentMap[fieldPropertyKey].toFixed(2));
      }
    }
    if (unitsPerPixel !== lastLabelScale) {
      lastLabelScale = unitsPerPixel;
      for (const { label: labelElement, item: labelItem } of furnitureLabels) {
        labelElement.setAttribute(
          "font-size",
          Math.min(
            unitsPerPixel * 11,
            (labelItem.width * 0.85) / Math.max(1, [...labelItem.name].length)
          )
        );
        labelElement.style.display =
          Math.min(labelItem.width, labelItem.depth) / unitsPerPixel < 25 ? "none" : "";
      }
    }
    for (const [imageAttributeName, imageAttributeValue] of Object.entries({
      x: currentMap.x - currentMap.width / 2,
      y: currentMap.y - currentMap.depth / 2,
      width: currentMap.width,
      height: currentMap.depth,
      opacity: currentMap.opacity / 100,
      transform: "rotate(" + currentMap.rotation + " " + currentMap.x + " " + currentMap.y + ")"
    })) {
      mapImageElement.setAttribute(imageAttributeName, imageAttributeValue);
    }
    mapImageElement.style.display = currentMap.visible === false ? "none" : "";
    handlesLayerElement.replaceChildren();
    const mapCornerPoints = mapCorners(currentMap);
    handlesLayerElement.append(
      createSvgElement("polygon", {
        points: mapCornerPoints.map(cornerPoint => cornerPoint.x + "," + cornerPoint.y).join(" "),
        fill: "transparent",
        stroke: "#73b3ff",
        "stroke-width": 1.5,
        "vector-effect": "non-scaling-stroke",
        "data-drag": "map"
      })
    );
    mapCornerPoints.forEach((draggedCorner, cornerIndex) =>
      handlesLayerElement.append(
        createSvgElement("circle", {
          cx: draggedCorner.x,
          cy: draggedCorner.y,
          r: unitsPerPixel * 8,
          fill: "#73b3ff",
          "data-drag": "corner:" + cornerIndex
        })
      )
    );
    const rotationRad = (currentMap.rotation * Math.PI) / 180;
    const rotateHandleDistance = currentMap.depth / 2 + Math.max(boundsWidth, boundsDepth) * 0.055;
    handlesLayerElement.append(
      createSvgElement("circle", {
        cx: currentMap.x + Math.sin(rotationRad) * rotateHandleDistance,
        cy: currentMap.y - Math.cos(rotationRad) * rotateHandleDistance,
        r: unitsPerPixel * 10,
        fill: "#b8e77b",
        "data-drag": "rotate"
      })
    );
  }
  const toSvgPoint = pointerEvent => {
    const svgPoint = svgElement.createSVGPoint();
    svgPoint.x = pointerEvent.clientX;
    svgPoint.y = pointerEvent.clientY;
    return svgPoint.matrixTransform(svgElement.getScreenCTM().inverse());
  };
  const pointersById = new Map();
  let pinchState = null;
  svgElement.addEventListener("pointerdown", downEvent => {
    pointersById.set(downEvent.pointerId, {
      x: downEvent.clientX,
      y: downEvent.clientY
    });
    if (pointersById.size === 2) {
      downEvent.preventDefault();
      const [pinchPointerA, pinchPointerB] = [...pointersById.values()];
      pinchState = {
        distance: Math.max(
          1,
          Math.hypot(pinchPointerA.x - pinchPointerB.x, pinchPointerA.y - pinchPointerB.y)
        ),
        width: draftState.map.width,
        depth: draftState.map.depth
      };
      dragState = null;
      svgElement.setPointerCapture(downEvent.pointerId);
      return;
    }
    const dragKind = downEvent.target.closest("[data-drag]")?.getAttribute("data-drag");
    if (downEvent.button === 0) {
      downEvent.preventDefault();
      dragState = {
        kind: dragKind || "pan",
        start: toSvgPoint(downEvent),
        viewBox: {
          ...viewBox
        },
        clientX: downEvent.clientX,
        clientY: downEvent.clientY,
        map: {
          ...draftState.map
        }
      };
      svgElement.setPointerCapture(downEvent.pointerId);
    }
  });
  svgElement.addEventListener("pointermove", moveEvent => {
    if (pointersById.has(moveEvent.pointerId)) {
      pointersById.set(moveEvent.pointerId, {
        x: moveEvent.clientX,
        y: moveEvent.clientY
      });
    }
    if (pinchState && pointersById.size === 2) {
      const [activePointerA, activePointerB] = [...pointersById.values()];
      const pinchScale = Math.max(
        0.01 / Math.min(pinchState.width, pinchState.depth),
        Math.min(
          1000000 / Math.max(pinchState.width, pinchState.depth),
          Math.hypot(activePointerA.x - activePointerB.x, activePointerA.y - activePointerB.y) /
            pinchState.distance
        )
      );
      draftState.map.width = pinchState.width * pinchScale;
      draftState.map.depth = pinchState.depth * pinchScale;
      renderEditor();
      return;
    }
    if (!dragState) {
      return;
    }
    const pointerPoint = toSvgPoint(moveEvent);
    const dragDeltaX = pointerPoint.x - dragState.start.x;
    const dragDeltaY = pointerPoint.y - dragState.start.y;
    const dragMap = draftState.map;
    const dragStartMap = dragState.map;
    if (dragState.kind === "pan") {
      const screenScale = svgElement.getScreenCTM().a;
      viewBox = {
        ...dragState.viewBox,
        x: dragState.viewBox.x - (moveEvent.clientX - dragState.clientX) / screenScale,
        y: dragState.viewBox.y - (moveEvent.clientY - dragState.clientY) / screenScale
      };
      applyViewBox();
      return;
    }
    if (dragState.kind === "map") {
      dragMap.x = dragStartMap.x + dragDeltaX;
      dragMap.y = dragStartMap.y + dragDeltaY;
    } else if (dragState.kind === "rotate") {
      dragMap.rotation =
        (Math.atan2(pointerPoint.x - dragStartMap.x, dragStartMap.y - pointerPoint.y) * 180) /
        Math.PI;
    } else {
      const cornerHandleIndex = Number(dragState.kind.split(":")[1]);
      const cornerSigns = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ][cornerHandleIndex];
      const dragRotationRad = (dragStartMap.rotation * Math.PI) / 180;
      const cosRotation = Math.cos(dragRotationRad);
      const sinRotation = Math.sin(dragRotationRad);
      let nextWidth = Math.max(
        0.01,
        dragStartMap.width + (dragDeltaX * cosRotation + dragDeltaY * sinRotation) * cornerSigns[0]
      );
      let nextDepth = Math.max(
        0.01,
        dragStartMap.depth + (-dragDeltaX * sinRotation + dragDeltaY * cosRotation) * cornerSigns[1]
      );
      if (moveEvent.shiftKey) {
        const uniformScale = Math.max(
          nextWidth / dragStartMap.width,
          nextDepth / dragStartMap.depth
        );
        nextWidth = dragStartMap.width * uniformScale;
        nextDepth = dragStartMap.depth * uniformScale;
      }
      dragMap.width = nextWidth;
      dragMap.depth = nextDepth;
      dragMap.x =
        dragStartMap.x +
        ((nextWidth - dragStartMap.width) * cornerSigns[0] * cosRotation -
          (nextDepth - dragStartMap.depth) * cornerSigns[1] * sinRotation) /
          2;
      dragMap.y =
        dragStartMap.y +
        ((nextWidth - dragStartMap.width) * cornerSigns[0] * sinRotation +
          (nextDepth - dragStartMap.depth) * cornerSigns[1] * cosRotation) /
          2;
    }
    renderEditor();
  });
  for (const releaseEventName of ["pointerup", "pointercancel"]) {
    svgElement.addEventListener(releaseEventName, releaseEvent => {
      pointersById.delete(releaseEvent.pointerId);
      pinchState = null;
      dragState = null;
    });
  }
  const resizeObserver = new ResizeObserver(() => {
    if (!isClosed) {
      renderEditor();
    }
  });
  bodyElement.append(planElement, sidebarElement);
  dialogElement.append(headerElement, bodyElement);
  documentRef.body.append(dialogElement);
  dialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    closeEditor();
  });
  dialogElement.showModal();
  viewToolsElement.lastElementChild.click();
  resizeObserver.observe(svgElement);
  return {
    close: closeEditor
  };
}
