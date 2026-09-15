import { openPresenceFocusEditor } from "./presence-focus-editor.js?v=20260916013557";
import { mountInteraction3d } from "./runtime.js";
import {
  validPresenceRoute,
  snapsToPresenceStart,
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed
} from "./presence-motion.js?v=20260916013557";
import { DESIGNS, createWalker, animateWalker, disposeWalker } from "./presence-character.js";
import { randomUuid } from "/static/utils/random-id.js";
import { serializeEditorDraft } from "./editor-save-status.js?v=20260916013557";
export async function openPresenceEditor({
  component: component,
  panelDocument: panelDocument,
  floors: floors = [],
  entities: entities = [],
  pickers: pickers,
  onSave: onSave,
  initialSelectedId: initialSelectedId = "",
  editingFloorId: editingFloorId = "",
  manageBindings: manageBindings = true,
  onClose: onClose
}) {
  const editorDocument = window.document;
  const draftProperties = structuredClone(component.properties || {});
  draftProperties.security = {
    ...draftProperties.security,
    presenceSensors: structuredClone(draftProperties.security?.presenceSensors || [])
  };
  const sensorBindings = draftProperties.security.presenceSensors;
  const sensorNamesByEntityId = new Map(entities.map(entity => [entity.entityId, entity.name]));
  for (const sensor of sensorBindings) {
    sensor.displayPages = "all";
    Object.assign(sensor, {
      character: sensor.character ?? "traveler",
      color: sensor.color ?? "cyan",
      speed: sensor.speed ?? 0.45,
      size: sensor.size ?? 1,
      displayDuration: presenceTriggerIsTimed(sensor)
        ? sensor.displayDuration > 0
          ? sensor.displayDuration
          : 30
        : (sensor.displayDuration ?? 0)
    });
  }
  const createElement = (tagName, initialText, classNames) => {
    const createdElement = editorDocument.createElement(tagName);
    if (initialText) {
      createdElement.textContent = initialText;
    }
    if (classNames) {
      createdElement.className = classNames;
    }
    return createdElement;
  };
  const createSvgElement = (svgTagName, attributes) => {
    const createdSvgElement = editorDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      svgTagName
    );
    for (const [attributeName, attributeValue] of Object.entries(attributes || {})) {
      createdSvgElement.setAttribute(attributeName, attributeValue);
    }
    return createdSvgElement;
  };
  const styleLinkElement = createElement("link");
  styleLinkElement.rel = "stylesheet";
  styleLinkElement.href =
    "/api/v1/modules/interaction3d/presence-editor.css?v=20260916013557";
  const dialogElement = createElement("dialog", "", "i3d-editor i3d-presence-editor");
  dialogElement.setAttribute("aria-label", manageBindings ? "配置安防" : "人物与行走路线");
  const previouslyFocusedElement = editorDocument.activeElement;
  let selectedSensor =
    sensorBindings.find(sensorMatch => sensorMatch.id === initialSelectedId) ||
    sensorBindings.find(floorProbe => floorProbe.floorId === editingFloorId) ||
    sensorBindings[0] ||
    null;
  let isClosed = false;
  let closedRouteSensorIds = new Set(
    sensorBindings
      .filter(
        sensorCandidate =>
          sensorCandidate.routeClosed !== false && validPresenceRoute(sensorCandidate.route)
      )
      .map(routeSensorId => routeSensorId.id)
  );
  const presencePersistState = () =>
    sensorBindings.map(sensorItem => ({
      ...sensorItem,
      routeClosed: closedRouteSensorIds.has(sensorItem.id) && validPresenceRoute(sensorItem.route)
    }));
  let savedPresenceSignature = serializeEditorDraft(presencePersistState());
  let draggedPoint = null;
  let planBox;
  let characterPreview = null;
  let previewSignature = "";
  let animationFrameId = 0;
  let lastFrameTimeMs = 0;
  let walkDistance = 0;
  let elapsedSeconds = 0;
  let editorRuntime = null;
  let isPreviewReady = false;
  let viewMode = "plan";
  let isWalkPreviewRunning = false;
  let isHitRangeVisible = false;
  let topViewTimer = 0;
  let hoverPoint = null;
  let fieldCollectors = [];
  let isDirty = false;
  const flushFieldCollectors = () => {
    for (const fieldCollector of fieldCollectors) {
      fieldCollector();
    }
  };
  const statusElement = createElement("span", "", "presence-status");
  statusElement.setAttribute("role", "status");
  const createButton = (buttonLabel, onButtonClick) => {
    const buttonElement = createElement("button", buttonLabel);
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onButtonClick);
    return buttonElement;
  };
  function closeEditor() {
    if (!isClosed) {
      isClosed = true;
      cancelAnimationFrame(animationFrameId);
      routeResizeObserver.disconnect();
      clearTimeout(topViewTimer);
      editorRuntime?.();
      editorDocument.removeEventListener("visibilitychange", handleVisibilityChange);
      if (characterPreview) {
        disposeWalker(characterPreview.root);
        characterPreview.renderer.dispose();
        characterPreview.renderer.forceContextLoss();
      }
      dialogElement.close();
      dialogElement.remove();
      styleLinkElement.remove();
      editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
      previouslyFocusedElement?.focus?.();
      onClose?.();
    }
  }
  const saveButtonElement = createButton(
    manageBindings ? "保存安防配置" : "应用人物与路线",
    async () => {
      if (!isDirty) {
        return;
      }
      flushFieldCollectors();
      for (const sensorItem of sensorBindings) {
        sensorItem.routeClosed =
          closedRouteSensorIds.has(sensorItem.id) && validPresenceRoute(sensorItem.route);
      }
      isDirty = serializeEditorDraft(presencePersistState()) !== savedPresenceSignature;
      if (!isDirty) {
        saveButtonElement.disabled = true;
        return;
      }
      saveButtonElement.disabled = true;
      try {
        await onSave(structuredClone(draftProperties));
        if (!isClosed) {
          savedPresenceSignature = serializeEditorDraft(presencePersistState());
          isDirty = false;
          saveButtonElement.disabled = true;
          statusElement.textContent = manageBindings
            ? "已应用到编辑器，请在退出后保存仪表盘"
            : "已应用，请返回后点击「保存配置」";
        }
      } catch (saveError) {
        if (!isClosed) {
          statusElement.textContent = saveError.message || "保存失败，请重试。";
          saveButtonElement.disabled = false;
        }
      }
    }
  );
  saveButtonElement.className = "primary";
  saveButtonElement.disabled = true;
  const markPresenceDirty = dirtyMessage => {
    flushFieldCollectors();
    isDirty = serializeEditorDraft(presencePersistState()) !== savedPresenceSignature;
    saveButtonElement.disabled = !isDirty;
    if (isDirty) {
      if (dirtyMessage) {
        statusElement.textContent = dirtyMessage;
      }
      return;
    }
    if (
      dirtyMessage ||
      statusElement.textContent === "配置已修改，请保存安防配置。" ||
      statusElement.textContent === "配置已修改，请应用人物与路线。"
    ) {
      statusElement.textContent = "";
    }
  };
  dialogElement.addEventListener("input", () => {
    markPresenceDirty(
      manageBindings ? "配置已修改，请保存安防配置。" : "配置已修改，请应用人物与路线。"
    );
  });
  const headerElement = createElement("header");
  headerElement.append(
    createElement("strong", manageBindings ? "配置安防" : "人物与行走路线"),
    statusElement,
    saveButtonElement,
    createButton("退出", closeEditor)
  );
  const bodyElement = createElement("div", "", "presence-body");
  const bindingsPanelElement = createElement("aside", "", "presence-bindings");
  const controlsPanelElement = createElement("aside", "", "presence-controls");
  const planPanelElement = createElement("div", "", "presence-plan");
  const planTitleElement = createElement("strong", "行走路线");
  const hintElement = createElement("p", "", "presence-note");
  const viewportElement = createElement("div", "", "presence-viewport");
  const runtimeElement = createElement("div", "", "presence-plan-runtime");
  const routeSvgElement = createSvgElement("svg", {
    role: "img",
    "aria-label": "平面图行走路线",
    tabindex: "0"
  });
  const pointsLayerElement = createSvgElement("g");
  const routeLayerElement = createSvgElement("g");
  routeSvgElement.append(pointsLayerElement, routeLayerElement);
  const routeToolsElement = createElement("div", "", "presence-route-tools");
  routeToolsElement.append(
    createButton("闭合路线", () => {
      if (selectedSensor && validPresenceRoute(selectedSensor.route)) {
        closedRouteSensorIds.add(selectedSensor.id);
        markPresenceDirty();
        statusElement.textContent = "";
        renderRoutePlan();
      } else {
        statusElement.textContent = "至少绘制三个不共线的点，才能闭合路线。";
      }
    }),
    createButton("撤销一点", () => {
      if (selectedSensor) {
        closedRouteSensorIds.delete(selectedSensor.id);
        selectedSensor.route.pop();
        markPresenceDirty();
        renderRoutePlan();
        syncPreview();
      }
    }),
    createButton("清空并重新绘制", () => {
      if (selectedSensor) {
        flushFieldCollectors();
        selectedSensor.route = [];
        selectedSensor.routeClosed = false;
        closedRouteSensorIds.delete(selectedSensor.id);
        hoverPoint = null;
        draggedPoint = null;
        isWalkPreviewRunning = false;
        walkPreviewButton.textContent = "预览行走";
        markPresenceDirty("路径已清空，请重新绘制。");
        renderRoutePlan();
        syncPreview();
      }
    })
  );
  const viewToolsElement = createElement("div", "", "i3d-focus-actions presence-view-tools");
  const viewModeGroupElement = createElement("div", "", "i3d-focus-actions");
  viewModeGroupElement.setAttribute("role", "group");
  viewModeGroupElement.setAttribute("aria-label", "编辑视图");
  const setViewMode = nextViewMode => {
    viewMode = nextViewMode;
    routeSvgElement.toggleAttribute("hidden", nextViewMode !== "plan");
    routeToolsElement.hidden = nextViewMode !== "plan";
    draggedPoint = null;
    hoverPoint = null;
    planViewButton.setAttribute("aria-pressed", String(nextViewMode === "plan"));
    threeDViewButton.setAttribute("aria-pressed", String(nextViewMode === "3d"));
    if (isPreviewReady) {
      if (nextViewMode === "plan") {
        scheduleTopView();
      } else {
        editorRuntime.focusCommand("presence-3d-view").catch(showError);
      }
    }
    renderRoutePlan();
  };
  const planViewButton = createButton("平面", () => setViewMode("plan"));
  const threeDViewButton = createButton("3D", () => setViewMode("3d"));
  planViewButton.setAttribute("aria-pressed", "true");
  threeDViewButton.setAttribute("aria-pressed", "false");
  const walkPreviewButton = createButton("预览行走", () => {
    if (
      !selectedSensor ||
      !closedRouteSensorIds.has(selectedSensor.id) ||
      !validPresenceRoute(selectedSensor.route)
    ) {
      statusElement.textContent = "请先绘制路径并闭合，再预览行走。";
      return;
    }
    isWalkPreviewRunning = !isWalkPreviewRunning;
    walkPreviewButton.textContent = isWalkPreviewRunning ? "停止预览" : "预览行走";
    if (isPreviewReady) {
      editorRuntime
        .focusCommand("presence-preview-walk", "", isWalkPreviewRunning)
        .catch(showError);
    }
  });
  viewModeGroupElement.append(planViewButton, threeDViewButton);
  viewToolsElement.append(viewModeGroupElement, walkPreviewButton);
  viewportElement.append(runtimeElement, routeSvgElement);
  planPanelElement.append(
    planTitleElement,
    hintElement,
    viewToolsElement,
    viewportElement,
    routeToolsElement
  );
  bodyElement.append(bindingsPanelElement, planPanelElement, controlsPanelElement);
  dialogElement.append(headerElement, bodyElement);
  await new Promise((resolveStyleLoad, rejectStyleLoad) => {
    styleLinkElement.addEventListener("load", resolveStyleLoad, {
      once: true
    });
    styleLinkElement.addEventListener(
      "error",
      () => rejectStyleLoad(new Error("安防样式加载失败，请重试。")),
      {
        once: true
      }
    );
    editorDocument.head.append(styleLinkElement);
  }).catch(styleLoadError => {
    styleLinkElement.remove();
    throw styleLoadError;
  });
  editorDocument.body.append(dialogElement);
  dialogElement.dataset.i3dPreviewScope = "presence";
  function showError(loadError) {
    if (!isClosed) {
      statusElement.textContent = loadError.message || String(loadError);
    }
  }
  function currentFloor() {
    if (selectedSensor) {
      return floors.find(floorMatch => floorMatch.id === selectedSensor.floorId);
    } else {
      return (
        floors.find(
          fallbackFloorMatch =>
            fallbackFloorMatch.id === (editingFloorId || draftProperties.floorSelection)
        ) || floors[0]
      );
    }
  }
  function scheduleTopView() {
    clearTimeout(topViewTimer);
    if (!!isPreviewReady && !!currentFloor() && viewMode === "plan" && !!planBox) {
      topViewTimer = setTimeout(() => {
        const scheduledFloor = currentFloor();
        if (!isClosed && isPreviewReady && viewMode === "plan" && scheduledFloor) {
          editorRuntime
            .focusCommand("presence-top-view", "", {
              floorId: scheduledFloor.id,
              box: planBox
            })
            .catch(showError);
        }
      }, 30);
    }
  }
  function syncPreview() {
    const previewFloorId = currentFloor()?.id;
    if (!previewFloorId) {
      return;
    }
    const previewProperties = {
      ...structuredClone(draftProperties),
      floorSelection: previewFloorId,
      camera:
        draftProperties.floorCameras?.[previewFloorId] ||
        (draftProperties.floorSelection === previewFloorId ? draftProperties.camera : null),
      security: {
        presenceSensors: selectedSensor
          ? [
              {
                ...structuredClone(selectedSensor),
                routeClosed: closedRouteSensorIds.has(selectedSensor.id)
              }
            ]
          : []
      },
      pageDimStrength: {
        overview: 0,
        security: 0
      },
      pageSaturation: {
        overview: 100,
        security: 100
      },
      autoRotate: {
        enabled: false
      }
    };
    if (editorRuntime) {
      editorRuntime.update(previewProperties);
      return;
    }
    editorRuntime = mountInteraction3d(runtimeElement, {
      component: {
        ...component,
        properties: previewProperties
      },
      context: {
        document: panelDocument,
        editable: true
      },
      editing: true,
      editingModule: "security",
      onPresented: () => {
        if (!isClosed) {
          isPreviewReady = true;
          scheduleTopView();
          if (isWalkPreviewRunning) {
            editorRuntime.focusCommand("presence-preview-walk", "", true).catch(showError);
          }
          editorRuntime
            .focusCommand("presence-show-hit-range", "", isHitRangeVisible)
            .catch(showError);
        }
      },
      onLoadError: showError
    });
    editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
  }
  function fitPlanBox() {
    const activeFloor = currentFloor();
    const planPoints = [
      ...(activeFloor?.plan?.walls || []).flatMap(planWall => [planWall.start, planWall.end]),
      ...(selectedSensor?.route || [])
    ];
    const xCoordinates = planPoints.map(planPointX => planPointX.x);
    const yCoordinates = planPoints.map(planPointY => planPointY.y);
    const pixelsPerMeter = activeFloor?.plan?.pixelsPerMeter || 100;
    const minX = planPoints.length ? Math.min(...xCoordinates) : 0;
    const minY = planPoints.length ? Math.min(...yCoordinates) : 0;
    const boxWidth = Math.max(
      pixelsPerMeter,
      planPoints.length ? Math.max(...xCoordinates) - minX : pixelsPerMeter * 10
    );
    const boxHeight = Math.max(
      pixelsPerMeter,
      planPoints.length ? Math.max(...yCoordinates) - minY : pixelsPerMeter * 8
    );
    const pixelMargin = Math.max(boxWidth, boxHeight) * 0.1;
    planBox = {
      x: minX - pixelMargin,
      y: minY - pixelMargin,
      w: boxWidth + pixelMargin * 2,
      h: boxHeight + pixelMargin * 2
    };
    renderRoutePlan();
  }
  function renderRoutePlan(scheduleTopViewAfterRender = true) {
    if (!planBox) {
      return;
    }
    const focusButtonElement = controlsPanelElement.querySelector("[data-presence-focus]");
    if (focusButtonElement) {
      focusButtonElement.disabled =
        !selectedSensor ||
        !closedRouteSensorIds.has(selectedSensor.id) ||
        !validPresenceRoute(selectedSensor.route);
    }
    routeSvgElement.setAttribute(
      "viewBox",
      planBox.x + " " + planBox.y + " " + planBox.w + " " + planBox.h
    );
    pointsLayerElement.replaceChildren();
    routeLayerElement.replaceChildren();
    const renderedFloor = currentFloor();
    walkPreviewButton.disabled =
      !selectedSensor ||
      !closedRouteSensorIds.has(selectedSensor.id) ||
      !validPresenceRoute(selectedSensor.route);
    for (const routeToolButton of routeToolsElement.querySelectorAll("button")) {
      routeToolButton.disabled = !selectedSensor || viewMode !== "plan";
    }
    hintElement.textContent = selectedSensor
      ? renderedFloor
        ? viewMode === "3d"
          ? "拖动旋转、滚轮缩放；调整人物大小，再预览行走效果。"
          : closedRouteSensorIds.has(selectedSensor.id)
            ? "路线已闭合 · 可拖动圆点调整路径；切换 3D 查看人物大小。"
            : "请绘制行走路径：依次点击至少三个点，靠近起点可吸附闭合。"
        : "请选择有效楼层。"
      : "添加人在传感器后，在顶视图中绘制行走路径。";
    planTitleElement.textContent = renderedFloor
      ? (renderedFloor.name || "楼层") + " · 行走路线"
      : "行走路线";
    if (scheduleTopViewAfterRender !== false) {
      scheduleTopView();
    }
    if (!selectedSensor) {
      return;
    }
    const routeColor = selectedSensor.color === "orange" ? "#eaa044" : "#52b8b1";
    routeLayerElement.append(
      createSvgElement(closedRouteSensorIds.has(selectedSensor.id) ? "polygon" : "polyline", {
        points: selectedSensor.route.map(routePoint => routePoint.x + "," + routePoint.y).join(" "),
        fill: closedRouteSensorIds.has(selectedSensor.id) ? routeColor + "14" : "none",
        stroke: routeColor,
        "stroke-width": 3,
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
        "stroke-linejoin": "round"
      })
    );
    const svgUnitsPerPixel = 1 / Math.max(0.0001, Math.abs(routeSvgElement.getScreenCTM()?.a || 1));
    selectedSensor.route.forEach((point, pointIndex) => {
      routeLayerElement.append(
        createSvgElement("circle", {
          cx: point.x,
          cy: point.y,
          r: (pointIndex === 0 ? 8 : 6) * svgUnitsPerPixel,
          fill: pointIndex === 0 ? routeColor : "#f7fafc",
          stroke: routeColor,
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
          "data-point": pointIndex
        })
      );
      const pointLabelElement = createSvgElement("text", {
        x: point.x + svgUnitsPerPixel * 11,
        y: point.y - svgUnitsPerPixel * 9,
        fill: "#64748b",
        "font-size": svgUnitsPerPixel * 11,
        "pointer-events": "none"
      });
      pointLabelElement.textContent = String(pointIndex + 1);
      routeLayerElement.append(pointLabelElement);
    });
    if (!closedRouteSensorIds.has(selectedSensor.id) && hoverPoint && selectedSensor.route.length) {
      const snapTarget = snapsToPresenceStart(
        selectedSensor.route,
        hoverPoint,
        1 / svgUnitsPerPixel
      );
      const closingPoint = snapTarget ? selectedSensor.route[0] : hoverPoint;
      const lastRoutePoint = selectedSensor.route.at(-1);
      routeLayerElement.append(
        createSvgElement("line", {
          x1: lastRoutePoint.x,
          y1: lastRoutePoint.y,
          x2: closingPoint.x,
          y2: closingPoint.y,
          stroke: routeColor,
          "stroke-width": 2,
          "stroke-dasharray": "5 4",
          "vector-effect": "non-scaling-stroke",
          "pointer-events": "none"
        })
      );
      if (snapTarget) {
        routeLayerElement.append(
          createSvgElement("circle", {
            cx: closingPoint.x,
            cy: closingPoint.y,
            r: svgUnitsPerPixel * 16,
            fill: routeColor + "33",
            stroke: routeColor,
            "stroke-width": 2,
            "vector-effect": "non-scaling-stroke",
            "pointer-events": "none"
          })
        );
        hintElement.textContent = "已吸附起点 · 点击即可闭合路线。";
      }
    }
  }
  function appendField(fieldLabel, fieldControl) {
    const fieldElement = createElement("label", "", "presence-field");
    fieldElement.append(createElement("span", fieldLabel), fieldControl);
    controlsPanelElement.append(fieldElement);
    return fieldControl;
  }
  function addNumberField(
    numberLabel,
    propertyKey,
    minValue,
    maxValue,
    stepSize,
    displayScale = 1
  ) {
    const numberInputElement = createElement("input");
    Object.assign(numberInputElement, {
      type: "number",
      min: minValue,
      max: maxValue,
      step: stepSize,
      value: selectedSensor[propertyKey] * displayScale
    });
    numberInputElement.setAttribute("aria-label", numberLabel);
    const sensorRef = selectedSensor;
    const commitNumberField = () => {
      const typedNumber = Number(numberInputElement.value);
      if (numberInputElement.value.trim() && Number.isFinite(typedNumber)) {
        sensorRef[propertyKey] = Math.max(minValue, Math.min(maxValue, typedNumber)) / displayScale;
      }
      numberInputElement.value = sensorRef[propertyKey] * displayScale;
    };
    fieldCollectors.push(commitNumberField);
    numberInputElement.addEventListener("change", () => {
      commitNumberField();
      syncPreview();
    });
    appendField(numberLabel, numberInputElement).parentElement.classList.add(
      "presence-number-field"
    );
  }
  function renderControls() {
    flushFieldCollectors();
    fieldCollectors = [];
    draggedPoint = null;
    hoverPoint = null;
    bindingsPanelElement.replaceChildren();
    controlsPanelElement.replaceChildren();
    bindingsPanelElement.append(
      createElement("strong", "人在传感器"),
      createElement("p", "每个传感器独立设置路线和人物。", "presence-note")
    );
    const addSensorButton = createButton("＋ 添加人在传感器", () => {
      selectedSensor = {
        id: randomUuid(),
        label: "",
        entityId: "",
        floorId:
          floors.find(
            defaultFloorProbe => defaultFloorProbe.id === component.properties?.floorSelection
          )?.id ||
          floors[0]?.id ||
          "",
        route: [],
        speed: 0.45,
        size: 1,
        displayDuration: 0,
        clickToFocus: false,
        hitPadding: 8,
        character: "traveler",
        color: "cyan"
      };
      sensorBindings.push(selectedSensor);
      isWalkPreviewRunning = false;
      walkPreviewButton.textContent = "预览行走";
      setViewMode("plan");
      markPresenceDirty("选择人在传感器后，请在顶视图中绘制行走路径。");
      renderControls();
    });
    addSensorButton.disabled = sensorBindings.length >= 128 || !floors.length;
    if (manageBindings) {
      bindingsPanelElement.append(addSensorButton);
    }
    for (const listedSensor of sensorBindings) {
      const sensorButtonElement = createButton(
        listedSensor.label ||
          sensorNamesByEntityId.get(listedSensor.entityId) ||
          listedSensor.entityId ||
          "未选择传感器",
        () => {
          selectedSensor = listedSensor;
          renderControls();
        }
      );
      sensorButtonElement.setAttribute("aria-pressed", String(listedSensor === selectedSensor));
      bindingsPanelElement.append(sensorButtonElement);
    }
    if (!selectedSensor) {
      controlsPanelElement.append(createElement("p", "有人时走动，无人时隐藏。", "presence-note"));
      fitPlanBox();
      syncPreview();
      return;
    }
    const activeSensor = selectedSensor;
    const sensorPickerButton = createButton(
      sensorNamesByEntityId.get(activeSensor.entityId) || activeSensor.entityId || "选择人在传感器",
      async () => {
        try {
          await pickers.entity({
            trigger: sensorPickerButton,
            current: activeSensor.entityId,
            deviceKind: "presence",
            onSelect: (entityId, pickedEntity) => {
              flushFieldCollectors();
              fieldCollectors = [];
              activeSensor.entityId = entityId;
              if (entityId.startsWith("event.") && !(activeSensor.displayDuration > 0)) {
                activeSensor.displayDuration = 30;
              }
              if (pickedEntity?.name) {
                sensorNamesByEntityId.set(entityId, pickedEntity.name);
              }
              markPresenceDirty();
              if (!activeSensor.route.length) {
                statusElement.textContent = "已选择传感器，请在顶视图中绘制行走路径。";
              }
              renderControls();
            }
          });
        } catch (pickerError) {
          statusElement.textContent = pickerError.message;
        }
      }
    );
    sensorPickerButton.setAttribute("aria-label", "选择人在传感器");
    if (manageBindings) {
      appendField("人在传感器", sensorPickerButton);
    } else {
      controlsPanelElement.append(
        createElement(
          "p",
          "检测设备：" +
            (activeSensor.deviceName ||
              sensorNamesByEntityId.get(activeSensor.entityId) ||
              activeSensor.entityId ||
              "未绑定") +
            "（在安防设置中修改）",
          "presence-note"
        )
      );
    }
    const labelInputElement = createElement("input");
    labelInputElement.value = activeSensor.label;
    labelInputElement.maxLength = 128;
    labelInputElement.placeholder = "可选，自定义名称";
    labelInputElement.setAttribute("aria-label", "显示名称");
    const commitLabelInput = () => {
      activeSensor.label = labelInputElement.value.slice(0, 128);
    };
    fieldCollectors.push(commitLabelInput);
    labelInputElement.addEventListener("input", commitLabelInput);
    labelInputElement.addEventListener("change", () => {
      commitLabelInput();
      const listedSensorButton =
        bindingsPanelElement.querySelectorAll("button")[
          sensorBindings.indexOf(activeSensor) + (manageBindings ? 1 : 0)
        ];
      if (listedSensorButton) {
        listedSensorButton.textContent =
          activeSensor.label ||
          sensorNamesByEntityId.get(activeSensor.entityId) ||
          activeSensor.entityId ||
          "未选择传感器";
      }
    });
    appendField("显示名称", labelInputElement);
    const floorSelectElement = createElement("select");
    floorSelectElement.setAttribute("aria-label", "路线楼层");
    if (!floors.some(floorCandidate => floorCandidate.id === activeSensor.floorId)) {
      const missingFloorOption = createElement("option", "原楼层已不存在，请重新选择");
      missingFloorOption.value = "";
      floorSelectElement.append(missingFloorOption);
    }
    for (const floorRecord of floors) {
      const floorOptionElement = createElement("option", floorRecord.name || floorRecord.id);
      floorOptionElement.value = floorRecord.id;
      floorSelectElement.append(floorOptionElement);
    }
    floorSelectElement.value = activeSensor.floorId;
    floorSelectElement.addEventListener("change", () => {
      activeSensor.floorId = floorSelectElement.value;
      delete activeSensor.modelId;
      activeSensor.route = [];
      closedRouteSensorIds.delete(activeSensor.id);
      markPresenceDirty();
      renderControls();
    });
    appendField("路线楼层", floorSelectElement);
    floorSelectElement.disabled = !manageBindings;
    activeSensor.displayPages = "all";
    controlsPanelElement.append(createElement("p", "显示页面：ALL（全部页面）", "presence-note"));
    controlsPanelElement.append(createElement("strong", "人物方案"));
    const designButtonsElement = createElement("div", "", "presence-designs");
    for (const [designKey, design] of Object.entries(DESIGNS)) {
      const designButtonElement = createButton(design.name, () => {
        activeSensor.character = designKey;
        markPresenceDirty();
        renderControls();
      });
      designButtonElement.setAttribute(
        "aria-pressed",
        String(activeSensor.character === designKey)
      );
      designButtonsElement.append(designButtonElement);
    }
    controlsPanelElement.append(designButtonsElement);
    const characterPreviewElement = createElement("div", "", "presence-character-preview");
    characterPreviewElement.setAttribute("aria-label", "人物行走预览");
    controlsPanelElement.append(characterPreviewElement);
    if (characterPreview) {
      characterPreviewElement.append(characterPreview.renderer.domElement);
    }
    controlsPanelElement.append(
      createElement("p", DESIGNS[activeSensor.character]?.description || "", "presence-note")
    );
    const colorButtonsElement = createElement("div", "", "presence-colors");
    for (const [colorKey, colorLabel] of [
      ["cyan", "统一青色"],
      ["orange", "统一橙色"]
    ]) {
      const colorButtonElement = createButton(colorLabel, () => {
        activeSensor.color = colorKey;
        markPresenceDirty();
        renderControls();
      });
      colorButtonElement.dataset.color = colorKey;
      colorButtonElement.setAttribute("aria-pressed", String(activeSensor.color === colorKey));
      colorButtonsElement.append(colorButtonElement);
    }
    controlsPanelElement.append(colorButtonsElement);
    if (manageBindings) {
      const triggerModeSelectElement = createElement("select");
      triggerModeSelectElement.setAttribute("aria-label", "触发方式");
      for (const [modeValue, modeLabel] of PRESENCE_TRIGGER_MODES) {
        const modeOptionElement = createElement("option", modeLabel);
        modeOptionElement.value = modeValue;
        triggerModeSelectElement.append(modeOptionElement);
      }
      triggerModeSelectElement.value = activeSensor.triggerMode || "auto";
      triggerModeSelectElement.addEventListener("change", () => {
        flushFieldCollectors();
        fieldCollectors = [];
        activeSensor.triggerMode = triggerModeSelectElement.value;
        if (triggerModeSelectElement.value === "equals") {
          activeSensor.triggerValue ||= "on";
        }
        if (triggerModeSelectElement.value === "threshold") {
          activeSensor.triggerThreshold ??= 0;
        }
        if (presenceTriggerIsTimed(activeSensor) && !(activeSensor.displayDuration > 0)) {
          activeSensor.displayDuration = 30;
        }
        renderControls();
      });
      appendField("触发方式", triggerModeSelectElement);
      if (activeSensor.triggerMode === "threshold") {
        activeSensor.triggerThreshold ??= 0;
        addNumberField("数值大于", "triggerThreshold", -1000000, 1000000, 0.1);
      }
      if (activeSensor.triggerMode === "equals") {
        const triggerValueInputElement = createElement("input");
        triggerValueInputElement.value = activeSensor.triggerValue ?? "on";
        triggerValueInputElement.maxLength = 128;
        triggerValueInputElement.setAttribute("aria-label", "触发值");
        const commitTriggerValue = () => {
          if (triggerValueInputElement.value.trim()) {
            activeSensor.triggerValue = triggerValueInputElement.value.trim().slice(0, 128);
          }
        };
        fieldCollectors.push(commitTriggerValue);
        triggerValueInputElement.addEventListener("input", commitTriggerValue);
        appendField("触发值", triggerValueInputElement);
      }
    }
    const isTimedTrigger = presenceTriggerIsTimed(activeSensor);
    addNumberField("每次触发显示时长（秒）", "displayDuration", isTimedTrigger ? 1 : 0, 3600, 1);
    controlsPanelElement.append(
      createElement(
        "p",
        isTimedTrigger
          ? "每次满足触发条件后显示，再次触发重新计时；到时隐藏。"
          : "0：随有人状态显示；其他值：到时隐藏，无人立即隐藏，下次触发重新计时。",
        "presence-note"
      )
    );
    addNumberField("行走速度（米/秒）", "speed", 0.1, 2, 0.05);
    addNumberField("人物大小（%）", "size", 25, 300, 5, 100);
    controlsPanelElement.append(
      createElement(
        "p",
        (isTimedTrigger
          ? "事件触发后沿路线走动；计时结束或离线时隐藏。"
          : "有人时沿路线循环走动；无人或离线时隐藏。") + "路线是展示动画，不代表实际人员位置。",
        "presence-note"
      )
    );
    const clickToFocusInputElement = createElement("input");
    clickToFocusInputElement.type = "checkbox";
    clickToFocusInputElement.checked = activeSensor.clickToFocus === true;
    clickToFocusInputElement.setAttribute("aria-label", "点击模型聚焦");
    clickToFocusInputElement.addEventListener("change", () => {
      activeSensor.clickToFocus = clickToFocusInputElement.checked;
      renderControls();
    });
    const clickToFocusFieldElement = appendField("点击模型聚焦", clickToFocusInputElement);
    clickToFocusFieldElement.parentElement.className = "i3d-setting-toggle";
    if (activeSensor.clickToFocus) {
      activeSensor.hitPadding ??= 8;
      addNumberField("触控范围扩展（px）", "hitPadding", 0, 80, 1);
      const hitRangeInputElement = createElement("input");
      hitRangeInputElement.type = "checkbox";
      hitRangeInputElement.checked = isHitRangeVisible;
      hitRangeInputElement.setAttribute("aria-label", "显示触控范围");
      hitRangeInputElement.addEventListener("change", () => {
        isHitRangeVisible = hitRangeInputElement.checked;
        if (isPreviewReady) {
          editorRuntime
            .focusCommand("presence-show-hit-range", "", isHitRangeVisible)
            .catch(showError);
        }
      });
      appendField("显示触控范围", hitRangeInputElement).parentElement.className =
        "i3d-setting-toggle";
      controlsPanelElement.append(
        createElement(
          "p",
          "在模型周围扩展点击范围，不改变人物大小。0 表示只点击模型本身。",
          "presence-note"
        )
      );
      const focusCameraButton = createButton(
        activeSensor.focusCamera ? "调整聚焦视角" : "设置聚焦视角",
        () =>
          openPresenceFocusEditor({
            component: component,
            properties: draftProperties,
            item: activeSensor,
            panelDocument: panelDocument,
            onSave: focusCamera => {
              activeSensor.focusCamera = focusCamera;
              markPresenceDirty();
              renderControls();
            }
          })
      );
      focusCameraButton.dataset.presenceFocus = "true";
      focusCameraButton.disabled =
        !closedRouteSensorIds.has(activeSensor.id) || !validPresenceRoute(activeSensor.route);
      controlsPanelElement.append(focusCameraButton);
      if (activeSensor.focusCamera) {
        controlsPanelElement.append(
          createButton("恢复自动聚焦", () => {
            delete activeSensor.focusCamera;
            markPresenceDirty();
            renderControls();
          })
        );
      }
    }
    if (manageBindings) {
      controlsPanelElement.append(
        createButton("删除此传感器", () => {
          sensorBindings.splice(sensorBindings.indexOf(activeSensor), 1);
          closedRouteSensorIds.delete(activeSensor.id);
          selectedSensor = sensorBindings[0] || null;
          markPresenceDirty();
          renderControls();
        })
      );
    }
    fitPlanBox();
    syncPreview();
  }
  const toSvgPoint = pointerEvent => {
    const localPoint = routeSvgElement.createSVGPoint();
    localPoint.x = pointerEvent.clientX;
    localPoint.y = pointerEvent.clientY;
    return localPoint.matrixTransform(routeSvgElement.getScreenCTM().inverse());
  };
  routeSvgElement.addEventListener("pointerdown", pointerDownEvent => {
    if (
      viewMode !== "plan" ||
      pointerDownEvent.button !== 0 ||
      !selectedSensor ||
      !floors.some(originatingFloorProbe => originatingFloorProbe.id === selectedSensor.floorId)
    ) {
      return;
    }
    const pointIndexAttribute = pointerDownEvent.target.getAttribute("data-point");
    pointerDownEvent.preventDefault();
    routeSvgElement.setPointerCapture(pointerDownEvent.pointerId);
    if (
      !closedRouteSensorIds.has(selectedSensor.id) &&
      snapsToPresenceStart(
        selectedSensor.route,
        toSvgPoint(pointerDownEvent),
        routeSvgElement.getScreenCTM()?.a || 1
      )
    ) {
      closedRouteSensorIds.add(selectedSensor.id);
      hoverPoint = null;
      markPresenceDirty("路径已吸附闭合，可以切换 3D 预览大小和行走效果。");
      renderRoutePlan();
      syncPreview();
      return;
    }
    if (pointIndexAttribute !== null) {
      if (
        Number(pointIndexAttribute) === 0 &&
        !closedRouteSensorIds.has(selectedSensor.id) &&
        validPresenceRoute(selectedSensor.route)
      ) {
        closedRouteSensorIds.add(selectedSensor.id);
        markPresenceDirty();
        renderRoutePlan();
        return;
      }
      draggedPoint = {
        index: Number(pointIndexAttribute)
      };
    } else if (!closedRouteSensorIds.has(selectedSensor.id) && selectedSensor.route.length < 128) {
      const addedRoutePoint = toSvgPoint(pointerDownEvent);
      selectedSensor.route.push({
        x: addedRoutePoint.x,
        y: addedRoutePoint.y
      });
      markPresenceDirty();
      renderRoutePlan();
    }
  });
  routeSvgElement.addEventListener("pointermove", pointerMoveEvent => {
    if (viewMode !== "plan") {
      return;
    }
    const pointerSvgPoint = toSvgPoint(pointerMoveEvent);
    if (!draggedPoint) {
      if (selectedSensor && !closedRouteSensorIds.has(selectedSensor.id)) {
        hoverPoint = pointerSvgPoint;
        renderRoutePlan(false);
      }
      return;
    }
    selectedSensor.route[draggedPoint.index] = {
      x: pointerSvgPoint.x,
      y: pointerSvgPoint.y
    };
    renderRoutePlan(false);
  });
  routeSvgElement.addEventListener("pointerleave", () => {
    hoverPoint = null;
    if (!draggedPoint) {
      renderRoutePlan(false);
    }
  });
  const handlePointerEnd = () => {
    if (draggedPoint) {
      markPresenceDirty();
    }
    draggedPoint = null;
    syncPreview();
  };
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    routeSvgElement.addEventListener(eventName, handlePointerEnd);
  }
  const routeResizeObserver = new ResizeObserver(renderRoutePlan);
  routeResizeObserver.observe(routeSvgElement);
  dialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    closeEditor();
  });
  function animateCharacterPreview(timestamp) {
    if (!isClosed && !editorDocument.hidden) {
      if (characterPreview && selectedSensor) {
        const previewKey = selectedSensor.character + ":" + selectedSensor.color;
        if (previewSignature !== previewKey) {
          disposeWalker(characterPreview.root);
          characterPreview.root = createWalker(
            characterPreview.THREE,
            selectedSensor.color === "orange" ? 15376452 : 5421233,
            selectedSensor.character
          );
          characterPreview.scene.add(characterPreview.root);
          previewSignature = previewKey;
        }
        const frameDeltaSeconds = lastFrameTimeMs
          ? Math.min(0.1, (timestamp - lastFrameTimeMs) / 1000)
          : 0;
        lastFrameTimeMs = timestamp;
        elapsedSeconds += frameDeltaSeconds;
        walkDistance += frameDeltaSeconds * selectedSensor.speed * 12;
        animateWalker(characterPreview.root, walkDistance, 1, elapsedSeconds);
        characterPreview.renderer.render(characterPreview.scene, characterPreview.camera);
      }
      animationFrameId = requestAnimationFrame(animateCharacterPreview);
    }
  }
  function handleVisibilityChange() {
    cancelAnimationFrame(animationFrameId);
    lastFrameTimeMs = 0;
    if (!editorDocument.hidden && !isClosed) {
      animationFrameId = requestAnimationFrame(animateCharacterPreview);
    }
  }
  editorDocument.addEventListener("visibilitychange", handleVisibilityChange);
  dialogElement.showModal();
  renderControls();
  try {
    const threeModule = await import("/static/vendor/three/0.182.0/three.module.min.js");
    if (isClosed) {
      return;
    }
    const previewRenderer = new threeModule.WebGLRenderer({
      alpha: true,
      antialias: true
    });
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    previewRenderer.setSize(240, 160);
    const previewScene = new threeModule.Scene();
    const previewCamera = new threeModule.PerspectiveCamera(32, 1.5, 0.1, 20);
    previewCamera.position.set(2, 1.7, 3);
    previewCamera.lookAt(0, 0.7, 0);
    previewScene.add(new threeModule.HemisphereLight(16777215, 7831948, 2.5));
    const keyLight = new threeModule.DirectionalLight(16772824, 3);
    keyLight.position.set(3, 5, 3);
    previewScene.add(keyLight);
    const previewWalker = createWalker(threeModule);
    previewScene.add(previewWalker);
    characterPreview = {
      THREE: threeModule,
      renderer: previewRenderer,
      scene: previewScene,
      camera: previewCamera,
      root: previewWalker
    };
    controlsPanelElement
      .querySelector(".presence-character-preview")
      ?.append(previewRenderer.domElement);
    handleVisibilityChange();
  } catch {}
  return {
    close: closeEditor
  };
}
