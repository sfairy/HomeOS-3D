// @ts-nocheck  (0.6.7 JS→TS 全量迁移：该文件保留原生 JS 写法，类型基线暂不收紧)
import { openPresenceFocusEditor } from "./presence-focus-editor";
import { mountInteraction3d } from "../core/runtime";
import {
  validPresenceRoute,
  snapsToPresenceStart,
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed,
} from "./presence-motion";
import { DESIGNS, createWalker, animateWalker, disposeWalker } from "./presence-character";
import { randomUuid } from "@app/utils/random-id";
export async function openPresenceEditor({
  component: component,
  panelDocument: panelDocument,
  floors = [],
  entities = [],
  pickers: pickers,
  onSave: onSave,
  initialSelectedId = "",
  editingFloorId = "",
  manageBindings = true,
  onClose: onClose,
}) {
  const ownerDocument = window.document,
    draftProperties = structuredClone(component.properties || {});
  draftProperties.security = {
    ...draftProperties.security,
    presenceSensors: structuredClone(draftProperties.security?.presenceSensors || []),
  };
  const presenceSensors = draftProperties.security.presenceSensors,
    entityNameById = new Map(
      entities.map((entityRecord) => [entityRecord.entityId, entityRecord.name]),
    );
  for (const sensorEntry of presenceSensors)
    ((sensorEntry.displayPages = "all"),
      Object.assign(sensorEntry, {
        character: sensorEntry.character ?? "traveler",
        color: sensorEntry.color ?? "cyan",
        speed: sensorEntry.speed ?? 0.45,
        size: sensorEntry.size ?? 1,
        displayDuration: presenceTriggerIsTimed(sensorEntry)
          ? sensorEntry.displayDuration > 0
            ? sensorEntry.displayDuration
            : 30
          : (sensorEntry.displayDuration ?? 0),
      }));
  const createDomElement = (tagName, textValue, classNameValue) => {
      const createdElement = ownerDocument.createElement(tagName);
      return (
        textValue && (createdElement.textContent = textValue),
        classNameValue && (createdElement.className = classNameValue),
        createdElement
      );
    },
    createSvgElement = (svgTagName, svgAttributes) => {
      const svgElement = ownerDocument.createElementNS("http://www.w3.org/2000/svg", svgTagName);
      for (const [attributeName, attributeValue] of Object.entries(svgAttributes || {}))
        svgElement.setAttribute(attributeName, attributeValue);
      return svgElement;
    },
    stylesheetLink = createDomElement("link");
  ((stylesheetLink.rel = "stylesheet"),
    (stylesheetLink.href =
      "/api/v1/modules/interaction3d/presence/presence-editor.css"));
  const dialogElement = createDomElement("dialog", "", "i3d-editor i3d-presence-editor");
  dialogElement.setAttribute("aria-label", manageBindings ? "配置安防" : "人物与行走路线");
  const previouslyFocusedElement = ownerDocument.activeElement;
  let selectedSensor =
      presenceSensors.find((sensorById) => sensorById.id === initialSelectedId) ||
      presenceSensors.find((sensorByFloor) => sensorByFloor.floorId === editingFloorId) ||
      presenceSensors[0] ||
      null,
    isClosed = false,
    closedRouteSensorIds = new Set(
      presenceSensors
        .filter(
          (closedRouteSensor) =>
            closedRouteSensor.routeClosed !== false && validPresenceRoute(closedRouteSensor.route),
        )
        .map((closedRouteSensorId) => closedRouteSensorId.id),
    ),
    dragPoint = null,
    planViewBox,
    characterWalker = null,
    appliedWalkerKey = "",
    animationFrameId = 0,
    lastFrameTimestamp = 0,
    walkerDistance = 0,
    walkerElapsed = 0,
    interaction3dHandle = null,
    isRuntimeReady = false,
    viewMode = "plan",
    isPreviewingWalk = false,
    isHitRangeVisible = false,
    topViewTimerId = 0,
    hoverPoint = null,
    pendingSyncHandlers = [];
  const flushPendingEdits = () => {
      for (const syncHandler of pendingSyncHandlers) syncHandler();
    },
    statusElement = createDomElement("span", "", "presence-status");
  statusElement.setAttribute("role", "status");
  const createActionButton = (buttonLabel, clickHandler) => {
    const actionButton = createDomElement("button", buttonLabel);
    return (
      (actionButton.type = "button"),
      actionButton.addEventListener("click", clickHandler),
      actionButton
    );
  };
  function closeEditor() {
    isClosed ||
      ((isClosed = true),
      cancelAnimationFrame(animationFrameId),
      planResizeObserver.disconnect(),
      clearTimeout(topViewTimerId),
      interaction3dHandle?.(),
      ownerDocument.removeEventListener("visibilitychange", startCharacterAnimation),
      characterWalker &&
        (disposeWalker(characterWalker.root),
        characterWalker.renderer.dispose(),
        characterWalker.renderer.forceContextLoss()),
      dialogElement.close(),
      dialogElement.remove(),
      stylesheetLink.remove(),
      ownerDocument.dispatchEvent(new Event("hb-i3d-preview-scope")),
      previouslyFocusedElement?.focus?.(),
      onClose?.());
  }
  const applyButton = createActionButton(
    manageBindings ? "保存安防配置" : "应用人物与路线",
    async () => {
      flushPendingEdits();
      for (const saveSensorEntry of presenceSensors)
        saveSensorEntry.routeClosed =
          closedRouteSensorIds.has(saveSensorEntry.id) && validPresenceRoute(saveSensorEntry.route);
      applyButton.disabled = true;
      try {
        (await onSave(structuredClone(draftProperties)),
          isClosed || (statusElement.textContent = "已应用到编辑器，请在退出后保存仪表盘"));
      } catch (saveError) {
        isClosed || (statusElement.textContent = saveError.message || "保存失败，请重试。");
      } finally {
        isClosed || (applyButton.disabled = false);
      }
    },
  );
  ((applyButton.className = "primary"),
    dialogElement.addEventListener("input", () => {
      statusElement.textContent = manageBindings
        ? "配置已修改，请保存安防配置。"
        : "配置已修改，请应用人物与路线。";
    }));
  const headerElement = createDomElement("header");
  headerElement.append(
    createDomElement("strong", manageBindings ? "配置安防" : "人物与行走路线"),
    statusElement,
    applyButton,
    createActionButton("退出", closeEditor),
  );
  const bodyElement = createDomElement("div", "", "presence-body"),
    bindingsPanel = createDomElement("aside", "", "presence-bindings"),
    controlsPanel = createDomElement("aside", "", "presence-controls"),
    planPanel = createDomElement("div", "", "presence-plan"),
    routeTitleElement = createDomElement("strong", "行走路线"),
    planNoteElement = createDomElement("p", "", "presence-note"),
    viewportElement = createDomElement("div", "", "presence-viewport"),
    runtimeContainer = createDomElement("div", "", "presence-plan-runtime"),
    planSvgElement = createSvgElement("svg", {
      role: "img",
      "aria-label": "平面图行走路线",
      tabindex: "0",
    }),
    planStaticLayer = createSvgElement("g"),
    planRouteLayer = createSvgElement("g");
  planSvgElement.append(planStaticLayer, planRouteLayer);
  const routeToolbar = createDomElement("div", "", "presence-route-tools");
  routeToolbar.append(
    createActionButton("闭合路线", () => {
      selectedSensor && validPresenceRoute(selectedSensor.route)
        ? (closedRouteSensorIds.add(selectedSensor.id),
          (statusElement.textContent = ""),
          renderPlan())
        : (statusElement.textContent = "至少绘制三个不共线的点，才能闭合路线。");
    }),
    createActionButton("撤销一点", () => {
      selectedSensor &&
        (closedRouteSensorIds.delete(selectedSensor.id),
        selectedSensor.route.pop(),
        renderPlan(),
        syncRuntimePreview());
    }),
    createActionButton("清空并重新绘制", () => {
      selectedSensor &&
        (flushPendingEdits(),
        (selectedSensor.route = []),
        (selectedSensor.routeClosed = false),
        closedRouteSensorIds.delete(selectedSensor.id),
        (hoverPoint = null),
        (dragPoint = null),
        (isPreviewingWalk = false),
        (previewWalkButton.textContent = "预览行走"),
        (statusElement.textContent = "路径已清空，请重新绘制。"),
        renderPlan(),
        syncRuntimePreview());
    }),
  );
  const viewModeToolbar = createDomElement("div", "", "i3d-focus-actions presence-view-tools"),
    setViewMode = (nextViewMode) => {
      ((viewMode = nextViewMode),
        planSvgElement.toggleAttribute("hidden", nextViewMode !== "plan"),
        (routeToolbar.hidden = nextViewMode !== "plan"),
        (dragPoint = null),
        (hoverPoint = null),
        planModeButton.setAttribute("aria-pressed", String(nextViewMode === "plan")),
        threeDModeButton.setAttribute("aria-pressed", String(nextViewMode === "3d")),
        isRuntimeReady &&
          (nextViewMode === "plan"
            ? scheduleTopView()
            : interaction3dHandle.focusCommand("presence-3d-view").catch(showError)),
        renderPlan());
    },
    planModeButton = createActionButton("平面", () => setViewMode("plan")),
    threeDModeButton = createActionButton("3D", () => setViewMode("3d"));
  (planModeButton.setAttribute("aria-pressed", "true"),
    threeDModeButton.setAttribute("aria-pressed", "false"));
  const previewWalkButton = createActionButton("预览行走", () => {
    if (
      !selectedSensor ||
      !closedRouteSensorIds.has(selectedSensor.id) ||
      !validPresenceRoute(selectedSensor.route)
    ) {
      statusElement.textContent = "请先绘制路径并闭合，再预览行走。";
      return;
    }
    ((isPreviewingWalk = !isPreviewingWalk),
      (previewWalkButton.textContent = isPreviewingWalk ? "停止预览" : "预览行走"),
      isRuntimeReady &&
        interaction3dHandle
          .focusCommand("presence-preview-walk", "", isPreviewingWalk)
          .catch(showError));
  });
  (viewModeToolbar.append(planModeButton, threeDModeButton, previewWalkButton),
    viewportElement.append(runtimeContainer, planSvgElement),
    planPanel.append(
      routeTitleElement,
      planNoteElement,
      viewModeToolbar,
      viewportElement,
      routeToolbar,
    ),
    bodyElement.append(bindingsPanel, planPanel, controlsPanel),
    dialogElement.append(headerElement, bodyElement),
    await new Promise((resolveLoad, rejectLoad) => {
      (stylesheetLink.addEventListener("load", resolveLoad, {
        once: true,
      }),
        stylesheetLink.addEventListener(
          "error",
          () => rejectLoad(new Error("安防样式加载失败，请重试。")),
          {
            once: true,
          },
        ),
        ownerDocument.head.append(stylesheetLink));
    }).catch((styleLoadError) => {
      throw (stylesheetLink.remove(), styleLoadError);
    }),
    ownerDocument.body.append(dialogElement),
    (dialogElement.dataset.i3dPreviewScope = "presence"));
  function showError(errorValue) {
    isClosed || (statusElement.textContent = errorValue.message || String(errorValue));
  }
  function currentFloor() {
    return selectedSensor
      ? floors.find((floorById) => floorById.id === selectedSensor.floorId)
      : floors.find(
          (floorByEditingId) =>
            floorByEditingId.id === (editingFloorId || draftProperties.floorSelection),
        ) || floors[0];
  }
  function scheduleTopView() {
    (clearTimeout(topViewTimerId),
      !(!isRuntimeReady || !currentFloor() || viewMode !== "plan" || !planViewBox) &&
        (topViewTimerId = setTimeout(() => {
          const topViewFloor = currentFloor();
          !isClosed &&
            isRuntimeReady &&
            viewMode === "plan" &&
            topViewFloor &&
            interaction3dHandle
              .focusCommand("presence-top-view", "", {
                floorId: topViewFloor.id,
                box: planViewBox,
              })
              .catch(showError);
        }, 30)));
  }
  function syncRuntimePreview() {
    const activeFloorId = currentFloor()?.id;
    if (!activeFloorId) return;
    const runtimeProperties = {
      ...structuredClone(draftProperties),
      floorSelection: activeFloorId,
      camera:
        draftProperties.floorCameras?.[activeFloorId] ||
        (draftProperties.floorSelection === activeFloorId ? draftProperties.camera : null),
      security: {
        presenceSensors: selectedSensor
          ? [
              {
                ...structuredClone(selectedSensor),
                routeClosed: closedRouteSensorIds.has(selectedSensor.id),
              },
            ]
          : [],
      },
      pageDimStrength: {
        overview: 0,
        security: 0,
      },
      pageSaturation: {
        overview: 100,
        security: 100,
      },
      autoRotate: {
        enabled: false,
      },
    };
    if (interaction3dHandle) {
      interaction3dHandle.update(runtimeProperties);
      return;
    }
    ((interaction3dHandle = mountInteraction3d(runtimeContainer, {
      component: {
        ...component,
        properties: runtimeProperties,
      },
      context: {
        document: panelDocument,
        editable: true,
      },
      editing: true,
      editingModule: "security",
      onPresented: () => {
        isClosed ||
          ((isRuntimeReady = true),
          scheduleTopView(),
          isPreviewingWalk &&
            interaction3dHandle.focusCommand("presence-preview-walk", "", true).catch(showError),
          interaction3dHandle
            .focusCommand("presence-show-hit-range", "", isHitRangeVisible)
            .catch(showError));
      },
      onLoadError: showError,
    })),
      ownerDocument.dispatchEvent(new Event("hb-i3d-preview-scope")));
  }
  function fitPlanToContent() {
    const fittingFloor = currentFloor(),
      planPoints = [
        ...(fittingFloor?.plan?.walls || []).flatMap((wallSegment) => [
          wallSegment.start,
          wallSegment.end,
        ]),
        ...(selectedSensor?.route || []),
      ],
      pointXs = planPoints.map((pointForX) => pointForX.x),
      pointYs = planPoints.map((pointForY) => pointForY.y),
      pixelsPerMeter = fittingFloor?.plan?.pixelsPerMeter || 100,
      minContentX = planPoints.length ? Math.min(...pointXs) : 0,
      minContentY = planPoints.length ? Math.min(...pointYs) : 0,
      contentWidth = Math.max(
        pixelsPerMeter,
        planPoints.length ? Math.max(...pointXs) - minContentX : pixelsPerMeter * 10,
      ),
      contentHeight = Math.max(
        pixelsPerMeter,
        planPoints.length ? Math.max(...pointYs) - minContentY : pixelsPerMeter * 8,
      ),
      viewBoxPadding = Math.max(contentWidth, contentHeight) * 0.1;
    ((planViewBox = {
      x: minContentX - viewBoxPadding,
      y: minContentY - viewBoxPadding,
      w: contentWidth + viewBoxPadding * 2,
      h: contentHeight + viewBoxPadding * 2,
    }),
      renderPlan());
  }
  function renderPlan(shouldScheduleTopView = true) {
    if (!planViewBox) return;
    const focusActionButton = controlsPanel.querySelector("[data-presence-focus]");
    (focusActionButton &&
      (focusActionButton.disabled =
        !selectedSensor ||
        !closedRouteSensorIds.has(selectedSensor.id) ||
        !validPresenceRoute(selectedSensor.route)),
      planSvgElement.setAttribute(
        "viewBox",
        planViewBox.x + " " + planViewBox.y + " " + planViewBox.w + " " + planViewBox.h,
      ),
      planStaticLayer.replaceChildren(),
      planRouteLayer.replaceChildren());
    const renderFloor = currentFloor();
    previewWalkButton.disabled =
      !selectedSensor ||
      !closedRouteSensorIds.has(selectedSensor.id) ||
      !validPresenceRoute(selectedSensor.route);
    for (const routeToolButton of routeToolbar.querySelectorAll("button"))
      routeToolButton.disabled = !selectedSensor || viewMode !== "plan";
    if (
      ((planNoteElement.textContent = selectedSensor
        ? renderFloor
          ? viewMode === "3d"
            ? "拖动旋转、滚轮缩放；调整人物大小，再预览行走效果。"
            : closedRouteSensorIds.has(selectedSensor.id)
              ? "路线已闭合 · 可拖动圆点调整路径；切换 3D 查看人物大小。"
              : "请绘制行走路径：依次点击至少三个点，靠近起点可吸附闭合。"
          : "请选择有效楼层。"
        : "添加人在传感器后，在顶视图中绘制行走路径。"),
      (routeTitleElement.textContent = renderFloor
        ? (renderFloor.name || "楼层") + " · 行走路线"
        : "行走路线"),
      shouldScheduleTopView !== false && scheduleTopView(),
      !selectedSensor)
    )
      return;
    const routeColor = selectedSensor.color === "orange" ? "#eaa044" : "#52b8b1";
    planRouteLayer.append(
      createSvgElement(closedRouteSensorIds.has(selectedSensor.id) ? "polygon" : "polyline", {
        points: selectedSensor.route
          .map((routePoint) => routePoint.x + "," + routePoint.y)
          .join(" "),
        fill: closedRouteSensorIds.has(selectedSensor.id) ? routeColor + "14" : "none",
        stroke: routeColor,
        "stroke-width": 3,
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none",
        "stroke-linejoin": "round",
      }),
    );
    const svgUnitScale = 1 / Math.max(0.0001, Math.abs(planSvgElement.getScreenCTM()?.a || 1));
    if (
      (selectedSensor.route.forEach((planPoint, planPointIndex) => {
        planRouteLayer.append(
          createSvgElement("circle", {
            cx: planPoint.x,
            cy: planPoint.y,
            r: (planPointIndex === 0 ? 8 : 6) * svgUnitScale,
            fill: planPointIndex === 0 ? routeColor : "#f7fafc",
            stroke: routeColor,
            "stroke-width": 2,
            "vector-effect": "non-scaling-stroke",
            "data-point": planPointIndex,
          }),
        );
        const pointLabelElement = createSvgElement("text", {
          x: planPoint.x + 11 * svgUnitScale,
          y: planPoint.y - 9 * svgUnitScale,
          fill: "#64748b",
          "font-size": 11 * svgUnitScale,
          "pointer-events": "none",
        });
        ((pointLabelElement.textContent = String(planPointIndex + 1)),
          planRouteLayer.append(pointLabelElement));
      }),
      !closedRouteSensorIds.has(selectedSensor.id) && hoverPoint && selectedSensor.route.length)
    ) {
      const snappedStartPoint = snapsToPresenceStart(
          selectedSensor.route,
          hoverPoint,
          1 / svgUnitScale,
        ),
        snapTargetPoint = snappedStartPoint ? selectedSensor.route[0] : hoverPoint,
        lastRoutePoint = selectedSensor.route.at(-1);
      (planRouteLayer.append(
        createSvgElement("line", {
          x1: lastRoutePoint.x,
          y1: lastRoutePoint.y,
          x2: snapTargetPoint.x,
          y2: snapTargetPoint.y,
          stroke: routeColor,
          "stroke-width": 2,
          "stroke-dasharray": "5 4",
          "vector-effect": "non-scaling-stroke",
          "pointer-events": "none",
        }),
      ),
        snappedStartPoint &&
          (planRouteLayer.append(
            createSvgElement("circle", {
              cx: snapTargetPoint.x,
              cy: snapTargetPoint.y,
              r: 16 * svgUnitScale,
              fill: routeColor + "33",
              stroke: routeColor,
              "stroke-width": 2,
              "vector-effect": "non-scaling-stroke",
              "pointer-events": "none",
            }),
          ),
          (planNoteElement.textContent = "已吸附起点 · 点击即可闭合路线。")));
    }
  }
  function addFieldLabel(fieldLabel, fieldControl) {
    const fieldLabelElement = createDomElement("label", "", "presence-field");
    return (
      fieldLabelElement.append(createDomElement("span", fieldLabel), fieldControl),
      controlsPanel.append(fieldLabelElement),
      fieldControl
    );
  }
  function addNumberField(
    fieldAriaLabel,
    propertyKey,
    minValue,
    maxValue,
    stepValue,
    scaleFactor = 1,
  ) {
    const numberInput = createDomElement("input");
    (Object.assign(numberInput, {
      type: "number",
      min: minValue,
      max: maxValue,
      step: stepValue,
      value: selectedSensor[propertyKey] * scaleFactor,
    }),
      numberInput.setAttribute("aria-label", fieldAriaLabel));
    const targetSensor = selectedSensor,
      commitNumberField = () => {
        const numericValue = Number(numberInput.value);
        (numberInput.value.trim() &&
          Number.isFinite(numericValue) &&
          (targetSensor[propertyKey] =
            Math.max(minValue, Math.min(maxValue, numericValue)) / scaleFactor),
          (numberInput.value = targetSensor[propertyKey] * scaleFactor));
      };
    (pendingSyncHandlers.push(commitNumberField),
      numberInput.addEventListener("change", () => {
        (commitNumberField(), syncRuntimePreview());
      }),
      addFieldLabel(fieldAriaLabel, numberInput).parentElement.classList.add(
        "presence-number-field",
      ));
  }
  function renderSensorPanel() {
    (flushPendingEdits(),
      (pendingSyncHandlers = []),
      (dragPoint = null),
      (hoverPoint = null),
      bindingsPanel.replaceChildren(),
      controlsPanel.replaceChildren(),
      bindingsPanel.append(
        createDomElement("strong", "人在传感器"),
        createDomElement("p", "每个传感器独立设置路线和人物。", "presence-note"),
      ));
    const addSensorButton = createActionButton("＋ 添加人在传感器", () => {
      ((selectedSensor = {
        id: randomUuid(),
        label: "",
        entityId: "",
        floorId:
          floors.find(
            (addSensorFloor) => addSensorFloor.id === component.properties?.floorSelection,
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
        color: "cyan",
      }),
        presenceSensors.push(selectedSensor),
        (isPreviewingWalk = false),
        (previewWalkButton.textContent = "预览行走"),
        setViewMode("plan"),
        (statusElement.textContent = "选择人在传感器后，请在顶视图中绘制行走路径。"),
        renderSensorPanel());
    });
    ((addSensorButton.disabled = !floors.length),
      manageBindings && bindingsPanel.append(addSensorButton));
    for (const listedSensor of presenceSensors) {
      const listedSensorButton = createActionButton(
        listedSensor.label ||
          entityNameById.get(listedSensor.entityId) ||
          listedSensor.entityId ||
          "未选择传感器",
        () => {
          ((selectedSensor = listedSensor), renderSensorPanel());
        },
      );
      (listedSensorButton.setAttribute("aria-pressed", String(listedSensor === selectedSensor)),
        bindingsPanel.append(listedSensorButton));
    }
    if (!selectedSensor) {
      (controlsPanel.append(createDomElement("p", "有人时走动，无人时隐藏。", "presence-note")),
        fitPlanToContent(),
        syncRuntimePreview());
      return;
    }
    const editingSensor = selectedSensor,
      entityPickerButton = createActionButton(
        entityNameById.get(editingSensor.entityId) || editingSensor.entityId || "选择人在传感器",
        async () => {
          try {
            await pickers.entity({
              trigger: entityPickerButton,
              current: editingSensor.entityId,
              deviceKind: "presence",
              onSelect: (selectedEntityId, selectedEntityOption) => {
                (flushPendingEdits(),
                  (pendingSyncHandlers = []),
                  (editingSensor.entityId = selectedEntityId),
                  selectedEntityId.startsWith("event.") &&
                    !(editingSensor.displayDuration > 0) &&
                    (editingSensor.displayDuration = 30),
                  selectedEntityOption?.name &&
                    entityNameById.set(selectedEntityId, selectedEntityOption.name),
                  editingSensor.route.length ||
                    (statusElement.textContent = "已选择传感器，请在顶视图中绘制行走路径。"),
                  renderSensorPanel());
              },
            });
          } catch (pickerError) {
            statusElement.textContent = pickerError.message;
          }
        },
      );
    (entityPickerButton.setAttribute("aria-label", "选择人在传感器"),
      manageBindings
        ? addFieldLabel("人在传感器", entityPickerButton)
        : controlsPanel.append(
            createDomElement(
              "p",
              "检测设备：" +
                (editingSensor.deviceName ||
                  entityNameById.get(editingSensor.entityId) ||
                  editingSensor.entityId ||
                  "未绑定") +
                "（在安防设置中修改）",
              "presence-note",
            ),
          ));
    const nameInput = createDomElement("input");
    ((nameInput.value = editingSensor.label),
      (nameInput.maxLength = 128),
      (nameInput.placeholder = "可选，自定义名称"),
      nameInput.setAttribute("aria-label", "显示名称"));
    const commitNameInput = () => {
      editingSensor.label = nameInput.value.slice(0, 128);
    };
    (pendingSyncHandlers.push(commitNameInput),
      nameInput.addEventListener("input", commitNameInput),
      nameInput.addEventListener("change", () => {
        commitNameInput();
        const sensorTabButton =
          bindingsPanel.querySelectorAll("button")[
            presenceSensors.indexOf(editingSensor) + (manageBindings ? 1 : 0)
          ];
        sensorTabButton &&
          (sensorTabButton.textContent =
            editingSensor.label ||
            entityNameById.get(editingSensor.entityId) ||
            editingSensor.entityId ||
            "未选择传感器");
      }),
      addFieldLabel("显示名称", nameInput));
    const floorSelect = createDomElement("select");
    if (
      (floorSelect.setAttribute("aria-label", "路线楼层"),
      !floors.some((knownFloor) => knownFloor.id === editingSensor.floorId))
    ) {
      const missingFloorOption = createDomElement("option", "原楼层已不存在，请重新选择");
      ((missingFloorOption.value = ""), floorSelect.append(missingFloorOption));
    }
    for (const floorOptionSource of floors) {
      const floorOption = createDomElement(
        "option",
        floorOptionSource.name || floorOptionSource.id,
      );
      ((floorOption.value = floorOptionSource.id), floorSelect.append(floorOption));
    }
    ((floorSelect.value = editingSensor.floorId),
      floorSelect.addEventListener("change", () => {
        ((editingSensor.floorId = floorSelect.value),
          delete editingSensor.modelId,
          (editingSensor.route = []),
          closedRouteSensorIds.delete(editingSensor.id),
          renderSensorPanel());
      }),
      addFieldLabel("路线楼层", floorSelect),
      (floorSelect.disabled = !manageBindings),
      (editingSensor.displayPages = "all"),
      controlsPanel.append(createDomElement("p", "显示页面：ALL（全部页面）", "presence-note")),
      controlsPanel.append(createDomElement("strong", "人物方案")));
    const designsContainer = createDomElement("div", "", "presence-designs");
    for (const [designKey, design] of Object.entries(DESIGNS)) {
      const designButton = createActionButton(design.name, () => {
        ((editingSensor.character = designKey), renderSensorPanel());
      });
      (designButton.setAttribute("aria-pressed", String(editingSensor.character === designKey)),
        designsContainer.append(designButton));
    }
    controlsPanel.append(designsContainer);
    const characterPreviewElement = createDomElement("div", "", "presence-character-preview");
    (characterPreviewElement.setAttribute("aria-label", "人物行走预览"),
      controlsPanel.append(characterPreviewElement),
      characterWalker && characterPreviewElement.append(characterWalker.renderer.domElement),
      controlsPanel.append(
        createDomElement("p", DESIGNS[editingSensor.character]?.description || "", "presence-note"),
      ));
    const colorsContainer = createDomElement("div", "", "presence-colors");
    for (const [colorKey, colorLabel] of [
      ["cyan", "统一青色"],
      ["orange", "统一橙色"],
    ]) {
      const colorButton = createActionButton(colorLabel, () => {
        ((editingSensor.color = colorKey), renderSensorPanel());
      });
      ((colorButton.dataset.color = colorKey),
        colorButton.setAttribute("aria-pressed", String(editingSensor.color === colorKey)),
        colorsContainer.append(colorButton));
    }
    if ((controlsPanel.append(colorsContainer), manageBindings)) {
      const triggerModeSelect = createDomElement("select");
      triggerModeSelect.setAttribute("aria-label", "触发方式");
      for (const [triggerModeKey, triggerModeLabel] of PRESENCE_TRIGGER_MODES) {
        const triggerModeOption = createDomElement("option", triggerModeLabel);
        ((triggerModeOption.value = triggerModeKey), triggerModeSelect.append(triggerModeOption));
      }
      if (
        ((triggerModeSelect.value = editingSensor.triggerMode || "auto"),
        triggerModeSelect.addEventListener("change", () => {
          (flushPendingEdits(),
            (pendingSyncHandlers = []),
            (editingSensor.triggerMode = triggerModeSelect.value),
            triggerModeSelect.value === "equals" && (editingSensor.triggerValue ||= "on"),
            triggerModeSelect.value === "threshold" && (editingSensor.triggerThreshold ??= 0),
            presenceTriggerIsTimed(editingSensor) &&
              !(editingSensor.displayDuration > 0) &&
              (editingSensor.displayDuration = 30),
            renderSensorPanel());
        }),
        addFieldLabel("触发方式", triggerModeSelect),
        editingSensor.triggerMode === "threshold" &&
          ((editingSensor.triggerThreshold ??= 0),
          addNumberField("数值大于", "triggerThreshold", -1000000, 1000000, 0.1)),
        editingSensor.triggerMode === "equals")
      ) {
        const triggerValueInput = createDomElement("input");
        ((triggerValueInput.value = editingSensor.triggerValue ?? "on"),
          (triggerValueInput.maxLength = 128),
          triggerValueInput.setAttribute("aria-label", "触发值"));
        const commitTriggerValue = () => {
          triggerValueInput.value.trim() &&
            (editingSensor.triggerValue = triggerValueInput.value.trim().slice(0, 128));
        };
        (pendingSyncHandlers.push(commitTriggerValue),
          triggerValueInput.addEventListener("input", commitTriggerValue),
          addFieldLabel("触发值", triggerValueInput));
      }
    }
    const isTimedTrigger = presenceTriggerIsTimed(editingSensor);
    (addNumberField("每次触发显示时长（秒）", "displayDuration", isTimedTrigger ? 1 : 0, 3600, 1),
      controlsPanel.append(
        createDomElement(
          "p",
          isTimedTrigger
            ? "每次满足触发条件后显示，再次触发重新计时；到时隐藏。"
            : "0：随有人状态显示；其他值：到时隐藏，无人立即隐藏，下次触发重新计时。",
          "presence-note",
        ),
      ),
      addNumberField("行走速度（米/秒）", "speed", 0.1, 2, 0.05),
      addNumberField("人物大小（%）", "size", 25, 300, 5, 100),
      controlsPanel.append(
        createDomElement(
          "p",
          (isTimedTrigger
            ? "事件触发后沿路线走动；计时结束或离线时隐藏。"
            : "有人时沿路线循环走动；无人或离线时隐藏。") + "路线是展示动画，不代表实际人员位置。",
          "presence-note",
        ),
      ));
    const focusToggleInput = createDomElement("input");
    ((focusToggleInput.type = "checkbox"),
      (focusToggleInput.checked = editingSensor.clickToFocus === true),
      focusToggleInput.setAttribute("aria-label", "点击模型聚焦"),
      focusToggleInput.addEventListener("change", () => {
        ((editingSensor.clickToFocus = focusToggleInput.checked), renderSensorPanel());
      }));
    const focusToggleLabel = addFieldLabel("点击模型聚焦", focusToggleInput);
    if (
      ((focusToggleLabel.parentElement.className = "i3d-setting-toggle"),
      editingSensor.clickToFocus)
    ) {
      ((editingSensor.hitPadding ??= 8),
        addNumberField("触控范围扩展（px）", "hitPadding", 0, 80, 1));
      const hitRangeToggleInput = createDomElement("input");
      ((hitRangeToggleInput.type = "checkbox"),
        (hitRangeToggleInput.checked = isHitRangeVisible),
        hitRangeToggleInput.setAttribute("aria-label", "显示触控范围"),
        hitRangeToggleInput.addEventListener("change", () => {
          ((isHitRangeVisible = hitRangeToggleInput.checked),
            isRuntimeReady &&
              interaction3dHandle
                .focusCommand("presence-show-hit-range", "", isHitRangeVisible)
                .catch(showError));
        }),
        (addFieldLabel("显示触控范围", hitRangeToggleInput).parentElement.className =
          "i3d-setting-toggle"),
        controlsPanel.append(
          createDomElement(
            "p",
            "在模型周围扩展点击范围，不改变人物大小。0 表示只点击模型本身。",
            "presence-note",
          ),
        ),
        controlsPanel.append(createDomElement("h4", "聚焦视角")));
      const openFocusEditor = (previewOnly) =>
          openPresenceFocusEditor({
            component: component,
            properties: draftProperties,
            item: editingSensor,
            panelDocument: panelDocument,
            previewOnly: previewOnly,
            onSave: (focusCameraOption) => {
              ((editingSensor.focusCamera = focusCameraOption), renderSensorPanel());
            },
          }),
        focusSettingsButton = createActionButton(
          editingSensor.focusCamera ? "调整视角" : "设置视角",
          () => openFocusEditor(false),
        );
      ((focusSettingsButton.dataset.presenceFocus = "true"),
        (focusSettingsButton.disabled =
          !closedRouteSensorIds.has(editingSensor.id) || !validPresenceRoute(editingSensor.route)));
      const focusPreviewButton = createActionButton("预览聚焦", () => openFocusEditor(true));
      focusPreviewButton.disabled = focusSettingsButton.disabled;
      const focusActionsContainer = createDomElement("div", "", "i3d-focus-actions");
      (focusActionsContainer.append(focusSettingsButton, focusPreviewButton),
        controlsPanel.append(focusActionsContainer));
      const resetFocusButton = createActionButton("恢复自动聚焦", () => {
        (delete editingSensor.focusCamera, renderSensorPanel());
      });
      ((resetFocusButton.disabled = !editingSensor.focusCamera),
        controlsPanel.append(resetFocusButton));
    }
    (manageBindings &&
      controlsPanel.append(
        createActionButton("删除此传感器", () => {
          (presenceSensors.splice(presenceSensors.indexOf(editingSensor), 1),
            closedRouteSensorIds.delete(editingSensor.id),
            (selectedSensor = presenceSensors[0] || null),
            renderSensorPanel());
        }),
      ),
      fitPlanToContent(),
      syncRuntimePreview());
  }
  const clientToSvgPoint = (pointerDownOrigin) => {
    const svgPoint = planSvgElement.createSVGPoint();
    return (
      (svgPoint.x = pointerDownOrigin.clientX),
      (svgPoint.y = pointerDownOrigin.clientY),
      svgPoint.matrixTransform(planSvgElement.getScreenCTM().inverse())
    );
  };
  (planSvgElement.addEventListener("pointerdown", (pointerDownEvent) => {
    if (
      viewMode !== "plan" ||
      pointerDownEvent.button !== 0 ||
      !selectedSensor ||
      !floors.some((pointerFloor) => pointerFloor.id === selectedSensor.floorId)
    )
      return;
    const dataPointIndex = pointerDownEvent.target.getAttribute("data-point");
    if (
      (pointerDownEvent.preventDefault(),
      planSvgElement.setPointerCapture(pointerDownEvent.pointerId),
      !closedRouteSensorIds.has(selectedSensor.id) &&
        snapsToPresenceStart(
          selectedSensor.route,
          clientToSvgPoint(pointerDownEvent),
          planSvgElement.getScreenCTM()?.a || 1,
        ))
    ) {
      (closedRouteSensorIds.add(selectedSensor.id),
        (hoverPoint = null),
        (statusElement.textContent = "路径已吸附闭合，可以切换 3D 预览大小和行走效果。"),
        renderPlan(),
        syncRuntimePreview());
      return;
    }
    if (dataPointIndex !== null) {
      if (
        Number(dataPointIndex) === 0 &&
        !closedRouteSensorIds.has(selectedSensor.id) &&
        validPresenceRoute(selectedSensor.route)
      ) {
        (closedRouteSensorIds.add(selectedSensor.id), renderPlan());
        return;
      }
      dragPoint = {
        index: Number(dataPointIndex),
      };
    } else {
      if (!closedRouteSensorIds.has(selectedSensor.id) && selectedSensor.route.length < 128) {
        const newRoutePoint = clientToSvgPoint(pointerDownEvent);
        (selectedSensor.route.push({
          x: newRoutePoint.x,
          y: newRoutePoint.y,
        }),
          renderPlan());
      }
    }
  }),
    planSvgElement.addEventListener("pointermove", (pointerMoveEvent) => {
      if (viewMode !== "plan") return;
      const movedRoutePoint = clientToSvgPoint(pointerMoveEvent);
      if (!dragPoint) {
        selectedSensor &&
          !closedRouteSensorIds.has(selectedSensor.id) &&
          ((hoverPoint = movedRoutePoint), renderPlan(false));
        return;
      }
      ((selectedSensor.route[dragPoint.index] = {
        x: movedRoutePoint.x,
        y: movedRoutePoint.y,
      }),
        renderPlan(false));
    }),
    planSvgElement.addEventListener("pointerleave", () => {
      ((hoverPoint = null), dragPoint || renderPlan(false));
    }));
  const finishDragging = () => {
    ((dragPoint = null), syncRuntimePreview());
  };
  for (const pointerEventName of ["pointerup", "pointercancel", "lostpointercapture"])
    planSvgElement.addEventListener(pointerEventName, finishDragging);
  const planResizeObserver = new ResizeObserver(renderPlan);
  (planResizeObserver.observe(planSvgElement),
    dialogElement.addEventListener("cancel", (cancelEvent) => {
      (cancelEvent.preventDefault(), closeEditor());
    }));
  function renderCharacterFrame(frameTimestamp) {
    if (!(isClosed || ownerDocument.hidden)) {
      if (characterWalker && selectedSensor) {
        const walkerKey = selectedSensor.character + ":" + selectedSensor.color;
        appliedWalkerKey !== walkerKey &&
          (disposeWalker(characterWalker.root),
          (characterWalker.root = createWalker(
            characterWalker.THREE,
            selectedSensor.color === "orange" ? 15376452 : 5421233,
            selectedSensor.character,
          )),
          characterWalker.scene.add(characterWalker.root),
          (appliedWalkerKey = walkerKey));
        const frameDeltaSeconds = lastFrameTimestamp
          ? Math.min(0.1, (frameTimestamp - lastFrameTimestamp) / 1000)
          : 0;
        ((lastFrameTimestamp = frameTimestamp),
          (walkerElapsed += frameDeltaSeconds),
          (walkerDistance += frameDeltaSeconds * selectedSensor.speed * 12),
          animateWalker(characterWalker.root, walkerDistance, 1, walkerElapsed),
          characterWalker.renderer.render(characterWalker.scene, characterWalker.camera));
      }
      animationFrameId = requestAnimationFrame(renderCharacterFrame);
    }
  }
  function startCharacterAnimation() {
    (cancelAnimationFrame(animationFrameId),
      (lastFrameTimestamp = 0),
      !ownerDocument.hidden &&
        !isClosed &&
        (animationFrameId = requestAnimationFrame(renderCharacterFrame)));
  }
  (ownerDocument.addEventListener("visibilitychange", startCharacterAnimation),
    dialogElement.showModal(),
    renderSensorPanel());
  try {
    const threeModule =
      await import("/static/vendor/three/0.186.0/three.module.min.js");
    if (isClosed) return;
    const webglRenderer = new threeModule.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    (webglRenderer.setPixelRatio(Math.min(devicePixelRatio, 2)), webglRenderer.setSize(240, 160));
    const threeScene = new threeModule.Scene(),
      threeCamera = new threeModule.PerspectiveCamera(32, 1.5, 0.1, 20);
    (threeCamera.position.set(2, 1.7, 3),
      threeCamera.lookAt(0, 0.7, 0),
      threeScene.add(new threeModule.HemisphereLight(16777215, 7831948, 2.5)));
    const directionalLight = new threeModule.DirectionalLight(16772824, 3);
    (directionalLight.position.set(3, 5, 3), threeScene.add(directionalLight));
    const walkerRoot = createWalker(threeModule);
    (threeScene.add(walkerRoot),
      (characterWalker = {
        THREE: threeModule,
        renderer: webglRenderer,
        scene: threeScene,
        camera: threeCamera,
        root: walkerRoot,
      }),
      controlsPanel.querySelector(".presence-character-preview")?.append(webglRenderer.domElement),
      startCharacterAnimation());
  } catch {}
  return {
    close: closeEditor,
  };
}
