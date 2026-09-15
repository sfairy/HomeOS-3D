import { resolvePageBehavior } from "./page-behavior.js?v=20260915211726";
import {
  performanceWarnings,
  confirmPerformanceWarning
} from "./performance-warning.js?v=20260915211726";
import { normalizeGroundReflection } from "./reflection-settings.js?v=20260915211726";
import {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  waitInteraction3dEditorView,
  cancelOtherInteraction3dViews
} from "./bridge.js?v=20260915211726";
import {
  createInteraction3dCover,
  updateInteraction3dCoverMessage
} from "./cover.js?v=20260915211726";
import { withRequestTimeout } from "../../utils/request-timeout.js?v=20260915211726";
import {
  INTERACTION3D_LIGHTING_MODES,
  normalizeInteraction3dLightingMode,
  BACKGROUND_THEMES,
  normalizeBackgroundTheme
} from "./definition.js?v=20260915211726";
export function interaction3dEntries(componentTree, pathSegments = [], entriesByPath = new Map()) {
  if (Array.isArray(componentTree)) {
    componentTree.forEach((arrayItem, arrayIndex) =>
      interaction3dEntries(
        arrayItem,
        [...pathSegments, String(arrayItem?.id ?? arrayItem?.path ?? arrayIndex)],
        entriesByPath
      )
    );
  } else if (componentTree && typeof componentTree == "object") {
    if (componentTree.type === "interaction3d") {
      entriesByPath.set(JSON.stringify(pathSegments), componentTree);
      return entriesByPath;
    }
    for (const [propertyKey, propertyValue] of Object.entries(componentTree)) {
      interaction3dEntries(propertyValue, [...pathSegments, propertyKey], entriesByPath);
    }
  }
  return entriesByPath;
}
function isDeepEqual(leftValue, rightValue) {
  if (leftValue === rightValue) {
    return true;
  }
  if (
    !leftValue ||
    !rightValue ||
    typeof leftValue != "object" ||
    typeof rightValue != "object" ||
    Array.isArray(leftValue) !== Array.isArray(rightValue)
  ) {
    return false;
  }
  const leftKeys = Object.keys(leftValue);
  if (leftKeys.length !== Object.keys(rightValue).length) {
    return false;
  } else {
    return leftKeys.every(
      objectKey =>
        Object.hasOwn(rightValue, objectKey) &&
        isDeepEqual(leftValue[objectKey], rightValue[objectKey])
    );
  }
}
function stripPositionZIndex(component) {
  if (!component) {
    return null;
  }
  const { zIndex: strippedZIndex, ...remainingPosition } = component.position || {};
  return {
    ...component,
    position: remainingPosition
  };
}
export function changesInteraction3d(previousProject, nextProject) {
  const previousEntriesByPath = interaction3dEntries(previousProject);
  const nextEntriesByPath = interaction3dEntries(nextProject);
  for (const [entryPath, nextEntry] of nextEntriesByPath) {
    if (
      !isDeepEqual(
        stripPositionZIndex(nextEntry),
        stripPositionZIndex(previousEntriesByPath.get(entryPath))
      )
    ) {
      return true;
    }
  }
  const nextSharedComponentIdSet = new Set(
    (nextProject?.sharedComponents || [])
      .filter(sharedComponentCandidate => interaction3dEntries(sharedComponentCandidate).size)
      .map(sharedComponentEntry => sharedComponentEntry.id)
  );
  return (nextProject?.pages || []).some(nextPage => {
    const previousSharedComponentIdSet = new Set(
      (previousProject?.pages || []).find(previousPage => previousPage.id === nextPage.id)
        ?.sharedComponentIds || []
    );
    return (nextPage.sharedComponentIds || []).some(
      sharedComponentId =>
        nextSharedComponentIdSet.has(sharedComponentId) &&
        !previousSharedComponentIdSet.has(sharedComponentId)
    );
  });
}
export async function guardInteraction3dChanges(currentProject, incomingProject) {
  if (changesInteraction3d(currentProject, incomingProject)) {
    await requestInteraction3dAccess();
  }
}
export function renderInteraction3dThumbnail(thumbnailButton) {
  thumbnailButton.classList.add("interaction3d-thumbnail");
  thumbnailButton.append(createInteraction3dCover());
}
const cardStateByButton = new WeakMap();
export async function updateInteraction3dCard(cardButton) {
  const cardState = {
    denied: cardStateByButton.get(cardButton)?.denied === true
  };
  cardStateByButton.set(cardButton, cardState);
  cardButton.disabled = true;
  cardButton.title = "3D 交互";
  const titleElement = cardButton.querySelector(".interaction3d-cover-title");
  titleElement.hidden = false;
  if (!cardState.denied) {
    updateInteraction3dCoverMessage(titleElement, ["正在验证 3D 交互授权…"]);
  }
  try {
    await requestInteraction3dAccess();
    if (cardStateByButton.get(cardButton) !== cardState) {
      return;
    }
    cardState.denied = false;
    cardButton.disabled = false;
    cardButton.title = "添加 3D 交互控件";
    titleElement.hidden = true;
  } catch (accessError) {
    if (cardStateByButton.get(cardButton) !== cardState) {
      return;
    }
    cardState.denied ||= accessError?.status === 403;
    titleElement.hidden = false;
    updateInteraction3dCoverMessage(
      titleElement,
      cardState.denied
        ? undefined
        : [
            accessError?.status === 401
              ? "登录状态已失效，请重新登录"
              : "暂时无法验证授权，请稍后重试"
          ]
    );
    cardButton.title = accessError?.status === 403 ? "3D 交互" : "3D 交互暂时无法连接，请稍后重试";
  }
}
const sceneStateByKey = new Map();
const inspectorAbortByHost = new WeakMap();
export async function requestInteraction3dScene() {
  return withRequestTimeout(20000, async abortSignal => {
    const response = await fetch("/api/v1/modules/interaction3d/scenes", {
      method: "POST",
      credentials: "same-origin",
      signal: abortSignal
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        typeof responseBody.detail == "string" ? responseBody.detail : "户型载入失败，请重试。"
      );
    }
    if (!/^[0-9a-f]{32}$/.test(responseBody.sceneId || "")) {
      throw new Error("户型载入失败，请重试。");
    }
    return {
      sceneId: responseBody.sceneId
    };
  });
}
export function renderInteraction3dInspector(hostElement, targetComponent, editorOptions) {
  inspectorAbortByHost.get(hostElement)?.abort();
  const inspectorAbortController = new AbortController();
  inspectorAbortByHost.set(hostElement, inspectorAbortController);
  cancelOtherInteraction3dViews(
    targetComponent?.type === "interaction3d" ? targetComponent.id : null
  );
  let inspectorElement = hostElement.querySelector("#interaction3d-inspector");
  if (!inspectorElement) {
    inspectorElement = document.createElement("section");
    inspectorElement.id = "interaction3d-inspector";
    inspectorElement.className = "inspector-form";
    hostElement.append(inspectorElement);
  }
  const isSameComponentOpen =
    !inspectorElement.hidden && inspectorElement.dataset.componentId === targetComponent?.id;
  const previousScrollTop = hostElement.scrollTop;
  const focusedControlName = inspectorElement.contains(document.activeElement)
    ? document.activeElement.name
    : "";
  const previousMinHeight = inspectorElement.style.minHeight;
  if (isSameComponentOpen) {
    inspectorElement.style.minHeight = inspectorElement.getBoundingClientRect().height + "px";
  }
  inspectorElement.hidden = targetComponent?.type !== "interaction3d";
  if (inspectorElement.hidden) {
    inspectorElement.style.minHeight = previousMinHeight;
    return;
  }
  inspectorElement.dataset.componentId = targetComponent.id;
  const openStateByGroup = new Map(
    [...inspectorElement.querySelectorAll("details")]
      .filter(detailsElement => detailsElement.dataset.inspectorGroup)
      .map(detailsEntry => [detailsEntry.dataset.inspectorGroup, detailsEntry.open])
  );
  inspectorElement.replaceChildren();
  const createElement = (tagName, className = "", textContent = "") => {
    const createdElement = document.createElement(tagName);
    createdElement.className = className;
    createdElement.textContent = textContent;
    return createdElement;
  };
  const createSection = sectionTitle => {
    const sectionElement = createElement("section", "inspector-section");
    sectionElement.append(createElement("h3", "", sectionTitle));
    inspectorElement.append(sectionElement);
    return sectionElement;
  };
  const createLabeledField = (containerElement, labelText, controlElement) => {
    const labelElement = createElement("label");
    labelElement.append(createElement("span", "", labelText), controlElement);
    containerElement.append(labelElement);
    return controlElement;
  };
  const commitChange = propertiesPatch =>
    Promise.resolve(editorOptions.onChange(propertiesPatch)).catch(changeError =>
      editorOptions.onError?.(changeError)
    );
  const properties = targetComponent.properties || {};
  const position = targetComponent.position || {};
  const programmaticControls = new WeakSet();
  const setControlValue = (inputControl, nextValue) => {
    inputControl.value = String(nextValue);
    programmaticControls.add(inputControl);
    try {
      inputControl.dispatchEvent?.(
        new Event("change", {
          bubbles: true
        })
      );
    } finally {
      programmaticControls.delete(inputControl);
    }
  };
  const confirmChangeWithWarning = async pendingProperties =>
    (await confirmPerformanceWarning(performanceWarnings(properties, pendingProperties), {
      document: document,
      signal: inspectorAbortController.signal
    })) &&
    !inspectorAbortController.signal.aborted &&
    !inspectorElement.hidden &&
    inspectorElement.dataset.componentId === targetComponent.id;
  const interactionSettings = {
    rotationMode: properties.interaction?.rotationMode || properties.camera?.rotationMode || "free",
    panEnabled: false,
    zoomEnabled: false
  };
  const editorView = getInteraction3dEditorView(targetComponent.id);
  const isViewEditing = !!editorView?.viewEditing;
  const sourceCanvas = editorOptions.document?.canvas || {};
  const canvasWidthPx = Number(sourceCanvas.width || 2778);
  const canvasHeightPx = Number(sourceCanvas.height || 1940);
  const componentWidthPx = Number(position.width || 100);
  const componentHeightPx = Number(position.height || 100);
  const layoutSection = createSection("布局与位置");
  const layoutModeGroupElement = createElement("div", "image-layout-options");
  layoutModeGroupElement.setAttribute("role", "group");
  layoutModeGroupElement.setAttribute("aria-label", "3D 交互布局");
  const isFillLayout = properties.layoutMode === "fill";
  for (const [layoutModeValue, layoutModeLabel] of [
    ["free", "自由"],
    ["fill", "铺满"]
  ]) {
    const layoutModeButton = createElement("button", "", layoutModeLabel);
    layoutModeButton.type = "button";
    layoutModeButton.dataset.interaction3dLayout = layoutModeValue;
    const isActiveLayoutMode = (isFillLayout ? "fill" : "free") === layoutModeValue;
    layoutModeButton.classList.toggle("active", isActiveLayoutMode);
    layoutModeButton.setAttribute("aria-pressed", String(isActiveLayoutMode));
    layoutModeButton.addEventListener("click", () => {
      if (!isActiveLayoutMode) {
        commitChange({
          properties: {
            layoutMode: layoutModeValue
          }
        });
      }
    });
    layoutModeGroupElement.append(layoutModeButton);
  }
  const layoutGridElement = createElement("div", "inspector-grid two-columns");
  layoutSection.append(layoutModeGroupElement, layoutGridElement);
  layoutGridElement.hidden = isFillLayout;
  const createPercentInput = (fieldLabel, fieldValue, minValue, maxValue, buildPatch) => {
    const fieldInputElement = createElement("input");
    Object.assign(fieldInputElement, {
      name: "i3d-position-" + fieldLabel,
      type: "number",
      min: String(minValue),
      max: String(maxValue),
      step: ".1",
      value: String(Math.round(fieldValue * 10) / 10),
      disabled: isFillLayout
    });
    fieldInputElement.addEventListener("change", () => {
      if (Number.isFinite(fieldInputElement.valueAsNumber)) {
        commitChange(
          buildPatch(Math.max(minValue, Math.min(maxValue, fieldInputElement.valueAsNumber)))
        );
      }
    });
    createLabeledField(layoutGridElement, fieldLabel, fieldInputElement);
  };
  createPercentInput(
    "左侧（%）",
    ((Number(position.x || 0) + componentWidthPx / 2) / canvasWidthPx) * 100,
    0,
    100,
    leftPercent => ({
      position: {
        x: (leftPercent * canvasWidthPx) / 100 - componentWidthPx / 2
      }
    })
  );
  createPercentInput(
    "顶部（%）",
    ((Number(position.y || 0) + componentHeightPx / 2) / canvasHeightPx) * 100,
    0,
    100,
    topPercent => ({
      position: {
        y: (topPercent * canvasHeightPx) / 100 - componentHeightPx / 2
      }
    })
  );
  createPercentInput(
    "宽度（%）",
    (componentWidthPx / canvasWidthPx) * 100,
    0.1,
    100,
    widthPercent => ({
      position: {
        width: (widthPercent * canvasWidthPx) / 100
      }
    })
  );
  createPercentInput(
    "高度（%）",
    (componentHeightPx / canvasHeightPx) * 100,
    0.1,
    100,
    heightPercent => ({
      position: {
        height: (heightPercent * canvasHeightPx) / 100
      }
    })
  );
  createPercentInput(
    "缩放（%）",
    Number(targetComponent.style?.scale || 1) * 100,
    1,
    500,
    scalePercent => ({
      style: {
        scale: scalePercent / 100
      }
    })
  );
  createPercentInput("旋转（°）", Number(position.rotation || 0), -360, 360, rotationDeg => ({
    position: {
      rotation: rotationDeg
    }
  }));
  const houseSection = createSection("户型");
  const houseStatusElement = createElement("p", "inspector-section-note");
  houseStatusElement.setAttribute("role", "status");
  const sceneStateKey = (editorOptions.document?.projectId || "") + "/" + targetComponent.id;
  if (!sceneStateByKey.has(sceneStateKey)) {
    sceneStateByKey.set(sceneStateKey, {
      state: "idle",
      error: ""
    });
  }
  const sceneState = sceneStateByKey.get(sceneStateKey);
  const reloadSceneButton = createElement("button", "", "重新载入户型");
  reloadSceneButton.type = "button";
  const lightingConfigButton = createElement("button", "", "配置灯光");
  lightingConfigButton.type = "button";
  const environmentConfigButton = createElement("button", "", "配置环境");
  environmentConfigButton.type = "button";
  const planRenderButton = createElement("button", "", "户型渲染");
  planRenderButton.type = "button";
  const ensureEditorView = async () => {
    editorOptions.prepareCanvas?.();
    viewStatusElement.hidden = false;
    viewStatusElement.textContent = "正在准备户型…";
    const readyView = await waitInteraction3dEditorView(targetComponent.id);
    if (inspectorElement.hidden || inspectorElement.dataset.componentId !== targetComponent.id) {
      return null;
    } else {
      viewStatusElement.hidden = true;
      return readyView;
    }
  };
  planRenderButton.addEventListener("click", async () => {
    planRenderButton.disabled = true;
    try {
      if (!(await ensureEditorView())) {
        return;
      }
      await requestInteraction3dAccess();
      const { openInteraction3dAppearanceEditor: openAppearanceEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260915211726");
      await openAppearanceEditor({
        component: targetComponent,
        onSave: savedBaseLighting =>
          editorOptions.onChange({
            properties: {
              baseLighting: savedBaseLighting
            }
          })
      });
    } catch (appearanceError) {
      viewStatusElement.hidden = false;
      viewStatusElement.textContent = appearanceError.message;
    } finally {
      planRenderButton.disabled = false;
    }
  });
  const houseActionsElement = createElement("div", "i3d-house-actions");
  houseSection.append(houseStatusElement, reloadSceneButton, houseActionsElement);
  const lightEffectsSection = createSection("灯光效果");
  const lightsSection = createSection("灯光");
  lightsSection.append(lightingConfigButton);
  const environmentSection = createSection("环境");
  environmentSection.append(environmentConfigButton);
  const devicesSection = createSection("设备");
  const configureDevicesButton = createElement("button", "", "配置设备");
  configureDevicesButton.type = "button";
  devicesSection.append(configureDevicesButton);
  configureDevicesButton.addEventListener("click", async () => {
    configureDevicesButton.disabled = true;
    try {
      const { openInteraction3dEditor: openDevicesEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260915211726");
      await openDevicesEditor({
        component: targetComponent,
        deviceKind: "devices",
        document: editorOptions.document,
        entities: editorOptions.entities,
        states: editorOptions.states,
        pickers: editorOptions.pickers,
        onSave: savedDeviceProperties =>
          editorOptions.onChange(
            {
              properties: savedDeviceProperties
            },
            {
              replaceProperties: true
            }
          )
      });
    } catch (devicesError) {
      editorOptions.onError?.(devicesError);
    } finally {
      configureDevicesButton.disabled = false;
    }
  });
  const securitySection = createSection("安防");
  const configureSecurityButton = createElement("button", "", "配置安防");
  configureSecurityButton.type = "button";
  securitySection.append(configureSecurityButton);
  configureSecurityButton.addEventListener("click", async () => {
    configureSecurityButton.disabled = true;
    try {
      await requestInteraction3dAccess();
      const { openSecurityEditor: openSecurityEditor } =
        await import("/api/v1/modules/interaction3d/security-editor.js?v=20260915211726");
      await openSecurityEditor({
        component: targetComponent,
        panelDocument: editorOptions.document,
        entities: editorOptions.entities,
        pickers: editorOptions.pickers,
        onSave: async savedSecurityConfig => {
          await editorOptions.onChange({
            properties: {
              security: savedSecurityConfig.security
            }
          });
        }
      });
    } catch (securityError) {
      editorOptions.onError?.(securityError);
    } finally {
      configureSecurityButton.disabled = false;
    }
  });
  const vacuumSection = createSection("扫地机");
  const configureVacuumButton = createElement("button", "", "配置扫地机");
  configureVacuumButton.type = "button";
  vacuumSection.append(configureVacuumButton);
  configureVacuumButton.addEventListener("click", async () => {
    configureVacuumButton.disabled = true;
    try {
      const { openInteraction3dEditor: openVacuumEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260915211726");
      await openVacuumEditor({
        component: targetComponent,
        deviceKind: "vacuum",
        document: editorOptions.document,
        entities: editorOptions.entities,
        states: editorOptions.states,
        pickers: editorOptions.pickers,
        onSave: savedVacuumProperties =>
          editorOptions.onChange(
            {
              properties: savedVacuumProperties
            },
            {
              replaceProperties: true
            }
          )
      });
    } catch (vacuumError) {
      editorOptions.onError?.(vacuumError);
    } finally {
      configureVacuumButton.disabled = false;
    }
  });
  sceneState.refresh = () => {
    if (houseStatusElement.isConnected) {
      houseStatusElement.textContent = properties.sceneId
        ? "已关联户型，可继续配置视角和灯光。"
        : sceneState.state === "loading"
          ? "正在载入已保存的户型…"
          : sceneState.error || "尚未载入户型。";
      houseStatusElement.hidden = !!properties.sceneId;
      reloadSceneButton.hidden = !!properties.sceneId || sceneState.state === "loading";
      lightingConfigButton.disabled = !properties.sceneId || isViewEditing;
      configureSecurityButton.disabled =
        configureVacuumButton.disabled =
        configureDevicesButton.disabled =
        environmentConfigButton.disabled =
          lightingConfigButton.disabled;
      planRenderButton.disabled = !properties.sceneId || isViewEditing;
    }
  };
  const loadScene = async () => {
    if (sceneState.state !== "loading") {
      sceneState.state = "loading";
      sceneState.error = "";
      sceneState.refresh();
      try {
        const loadedScene = await requestInteraction3dScene();
        await editorOptions.onChange({
          properties: loadedScene
        });
        sceneState.state = "ready";
      } catch (sceneLoadError) {
        sceneState.state = "error";
        sceneState.error =
          sceneLoadError.name === "TimeoutError"
            ? "户型载入超时，请重试。"
            : sceneLoadError.message;
      }
      sceneState.refresh();
    }
  };
  reloadSceneButton.addEventListener("click", () => void loadScene());
  lightingConfigButton.addEventListener("click", async () => {
    lightingConfigButton.disabled = true;
    try {
      await requestInteraction3dAccess();
      const { openInteraction3dEditor: openLightingEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260915211726");
      await openLightingEditor({
        component: targetComponent,
        document: editorOptions.document,
        entities: editorOptions.entities,
        states: editorOptions.states,
        pickers: editorOptions.pickers,
        onSave: savedLightingProperties =>
          editorOptions.onChange(
            {
              properties: savedLightingProperties
            },
            {
              replaceProperties: true
            }
          )
      });
    } catch (lightingError) {
      editorOptions.onError?.(lightingError);
    } finally {
      lightingConfigButton.disabled = false;
    }
  });
  environmentConfigButton.addEventListener("click", async () => {
    environmentConfigButton.disabled = true;
    try {
      await requestInteraction3dAccess();
      const { openInteraction3dEditor: openEnvironmentEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260915211726");
      await openEnvironmentEditor({
        component: targetComponent,
        deviceKind: "environment",
        document: editorOptions.document,
        entities: editorOptions.entities,
        states: editorOptions.states,
        pickers: editorOptions.pickers,
        onSave: savedEnvironmentProperties =>
          editorOptions.onChange(
            {
              properties: savedEnvironmentProperties
            },
            {
              replaceProperties: true
            }
          )
      });
    } catch (environmentError) {
      editorOptions.onError?.(environmentError);
    } finally {
      environmentConfigButton.disabled = false;
    }
  });
  const viewSection = createSection("楼层视角");
  const viewFloorRowElement = createElement("div", "i3d-view-floor-row");
  viewSection.append(viewFloorRowElement);
  const floorSelectElement = createElement("select");
  floorSelectElement.name = "i3d-view-floor";
  floorSelectElement.disabled = isViewEditing;
  createLabeledField(viewFloorRowElement, "视角楼层", floorSelectElement);
  const floorGapInput = createElement("input");
  Object.assign(floorGapInput, {
    name: "i3d-floor-gap",
    type: "number",
    min: "0",
    max: "20",
    step: "0.1",
    value: String(properties.floorGap ?? editorView?.metadata?.floorGap ?? 3)
  });
  createLabeledField(viewFloorRowElement, "楼层间距（m）", floorGapInput);
  floorGapInput.disabled = properties.floorSelection !== "all";
  floorGapInput.addEventListener("change", () => {
    if (!floorGapInput.disabled) {
      if (Number.isFinite(floorGapInput.valueAsNumber)) {
        const clampedFloorGap = Math.max(0, Math.min(20, floorGapInput.valueAsNumber));
        floorGapInput.value = String(clampedFloorGap);
        commitChange({
          properties: {
            floorGap: clampedFloorGap
          }
        });
      } else {
        floorGapInput.value = String(properties.floorGap ?? editorView?.metadata?.floorGap ?? 3);
      }
    }
  });
  const uniformOverviewStackInput = createElement("input");
  Object.assign(uniformOverviewStackInput, {
    name: "i3d-uniform-overview-stack",
    type: "checkbox",
    checked: properties.uniformOverviewStack ?? editorView?.metadata?.uniformOverviewStack ?? false
  });
  createLabeledField(viewSection, "多层等比例叠加", uniformOverviewStackInput);
  uniformOverviewStackInput.parentElement.className = "i3d-setting-toggle i3d-view-toggle";
  viewSection.append(
    createElement(
      "p",
      "inspector-section-note",
      "仅总览生效：各层使用相同视角。调小楼层间距可让各层继续靠近，允许重叠。"
    )
  );
  uniformOverviewStackInput.addEventListener("change", () => {
    if (!uniformOverviewStackInput.disabled) {
      commitChange({
        properties: {
          uniformOverviewStack: uniformOverviewStackInput.checked
        }
      });
    }
  });
  const floorNumberGroupElement = createElement("div", "i3d-floor-number-group");
  floorNumberGroupElement.append(createElement("span", "i3d-floor-number-title", "楼层编号"));
  const floorNumberFieldsElement = createElement("div", "i3d-floor-number-fields");
  floorNumberGroupElement.append(floorNumberFieldsElement);
  viewSection.append(floorNumberGroupElement);
  const renderFloorNumberFields = floorList => {
    floorNumberFieldsElement.replaceChildren();
    floorNumberGroupElement.hidden = !floorList.length;
    for (const [floorIndex, floorEntry] of floorList.entries()) {
      const floorId = floorEntry.id;
      const floorName = floorEntry.name || "未命名楼层";
      const floorNumber = properties.floorNumbers?.[floorId] ?? floorEntry.number ?? floorIndex + 1;
      const floorNumberInput = createElement("input");
      Object.assign(floorNumberInput, {
        type: "number",
        min: "-99",
        max: "99",
        step: "1",
        value: String(floorNumber),
        name: "i3d-floor-number-" + floorId,
        title: "负数为地下层，1 为一层",
        disabled: isViewEditing
      });
      createLabeledField(floorNumberFieldsElement, floorName, floorNumberInput);
      let committedFloorNumber = floorNumber;
      floorNumberInput.addEventListener("change", async () => {
        let nextFloorNumber = floorNumberInput.valueAsNumber;
        if (nextFloorNumber === 0) {
          nextFloorNumber = committedFloorNumber < 0 ? 1 : -1;
        }
        if (!Number.isInteger(nextFloorNumber) || nextFloorNumber < -99 || nextFloorNumber > 99) {
          floorNumberInput.value = String(committedFloorNumber);
          return;
        }
        const floorNumbersPatch = {
          ...properties.floorNumbers,
          [floorId]: nextFloorNumber
        };
        floorNumberInput.disabled = true;
        try {
          await editorOptions.onChange({
            properties: {
              floorNumbers: floorNumbersPatch
            }
          });
          properties.floorNumbers = floorNumbersPatch;
          committedFloorNumber = nextFloorNumber;
          floorNumberInput.value = String(nextFloorNumber);
        } catch (floorNumberError) {
          floorNumberInput.value = String(committedFloorNumber);
          editorOptions.onError?.(floorNumberError);
        } finally {
          floorNumberInput.disabled = isViewEditing;
        }
      });
    }
  };
  const syncFloorControls = editorViewData => {
    if (!floorSelectElement.isConnected) {
      return;
    }
    const floors = editorViewData?.metadata?.floors || [];
    renderFloorNumberFields(floors);
    if (properties.floorGap === undefined && Number.isFinite(editorViewData?.metadata?.floorGap)) {
      floorGapInput.value = String(editorViewData.metadata.floorGap);
    }
    floorSelectElement.replaceChildren();
    const floorOptions = floors.length
      ? [
          ...(floors.length > 1 ? [["all", "全部楼层"]] : []),
          ...floors.map(floorOptionEntry => [
            floorOptionEntry.id,
            floorOptionEntry.name || "未命名楼层"
          ])
        ]
      : [[properties.floorSelection || "all", "当前楼层"]];
    for (const [floorOptionValue, floorOptionLabel] of floorOptions) {
      const floorOptionElement = createElement("option", "", floorOptionLabel);
      floorOptionElement.value = floorOptionValue;
      floorSelectElement.append(floorOptionElement);
    }
    floorSelectElement.value = properties.floorSelection || floorOptions[0][0];
    floorGapInput.disabled = floorSelectElement.value !== "all" || floors.length < 2;
    uniformOverviewStackInput.disabled = floorGapInput.disabled;
    if (properties.uniformOverviewStack === undefined) {
      uniformOverviewStackInput.checked = editorViewData?.metadata?.uniformOverviewStack === true;
    }
    floorSelectElement.disabled = isViewEditing || floors.length < 2;
  };
  syncFloorControls(editorView);
  if (
    properties.sceneId &&
    !editorView?.metadata?.floors?.length &&
    typeof waitInteraction3dEditorView == "function"
  ) {
    waitInteraction3dEditorView(targetComponent.id)
      .then(syncFloorControls)
      .catch(() => {});
  }
  floorSelectElement.addEventListener("change", async () => {
    if (isViewEditing) {
      return;
    }
    const selectedFloorId = floorSelectElement.value;
    const floorCameras = {
      ...properties.floorCameras
    };
    if (
      properties.camera &&
      properties.floorSelection &&
      !floorCameras[properties.floorSelection]
    ) {
      floorCameras[properties.floorSelection] = properties.camera;
    }
    const floorSelectionPatch = {
      floorSelection: selectedFloorId,
      floorCameras: floorCameras,
      camera: floorCameras[selectedFloorId] || null
    };
    await commitChange({
      properties: floorSelectionPatch
    });
    renderInteraction3dInspector(
      hostElement,
      {
        ...targetComponent,
        properties: {
          ...properties,
          ...floorSelectionPatch
        }
      },
      editorOptions
    );
  });
  const viewEditingToggleButton = createElement(
    "button",
    isViewEditing ? "primary" : "",
    isViewEditing ? "完成并固定" : "调整户型视角"
  );
  viewEditingToggleButton.type = "button";
  viewEditingToggleButton.disabled = !properties.sceneId;
  viewEditingToggleButton.setAttribute("aria-pressed", String(isViewEditing));
  const cancelViewEditingButton = createElement("button", "", "取消本次调整");
  cancelViewEditingButton.type = "button";
  cancelViewEditingButton.hidden = !isViewEditing;
  const viewStatusElement = createElement("p", "inspector-section-note");
  viewStatusElement.hidden = true;
  viewEditingToggleButton.addEventListener("click", async () => {
    viewEditingToggleButton.disabled = true;
    try {
      const activeView = await ensureEditorView();
      if (!activeView) {
        return;
      }
      if (activeView.viewEditing) {
        const capturedViewCamera = await activeView.captureView();
        const updatedFloorCameras = {
          ...properties.floorCameras,
          [properties.floorSelection || floorSelectElement.value]: capturedViewCamera
        };
        await editorOptions.onChange({
          properties: {
            camera: capturedViewCamera,
            floorCameras: updatedFloorCameras,
            interaction: interactionSettings
          }
        });
        activeView.setViewEditing(false);
        renderInteraction3dInspector(
          hostElement,
          {
            ...targetComponent,
            properties: {
              ...properties,
              camera: capturedViewCamera,
              floorCameras: updatedFloorCameras,
              interaction: interactionSettings
            }
          },
          editorOptions
        );
      } else {
        activeView.setViewEditing(true);
        renderInteraction3dInspector(hostElement, targetComponent, editorOptions);
      }
    } catch (viewEditingError) {
      viewStatusElement.hidden = false;
      viewStatusElement.textContent = viewEditingError.message;
    } finally {
      viewEditingToggleButton.disabled = false;
    }
  });
  cancelViewEditingButton.addEventListener("click", () => {
    getInteraction3dEditorView(targetComponent.id)?.setViewEditing(false);
    renderInteraction3dInspector(hostElement, targetComponent, editorOptions);
  });
  houseActionsElement.append(viewEditingToggleButton);
  viewSection.append(houseActionsElement);
  viewSection.append(cancelViewEditingButton, viewStatusElement);
  const viewOptionsElement = createElement("div", "i3d-view-options");
  viewOptionsElement.hidden = !isViewEditing;
  viewSection.append(viewOptionsElement);
  const viewCamera = editorView?.viewCamera || properties.camera || {};
  const runViewCommand = async (commandName, commandValue) => {
    try {
      const currentEditorView = getInteraction3dEditorView(targetComponent.id);
      if (!currentEditorView?.viewEditing) {
        return;
      }
      await currentEditorView.viewCommand(commandName, commandValue);
      renderInteraction3dInspector(hostElement, targetComponent, editorOptions);
    } catch (viewCommandError) {
      viewStatusElement.hidden = false;
      viewStatusElement.textContent = viewCommandError.message;
    }
  };
  ((groupLabel, commandKey, groupOptions, activeOptionValue) => {
    const propertyControlElement = createElement("div", "navigation-property-control");
    const segmentedOptionsElement = createElement("div", "navigation-segmented-options");
    segmentedOptionsElement.setAttribute("role", "group");
    segmentedOptionsElement.setAttribute("aria-label", "3D " + groupLabel);
    for (const [optionValue, optionLabel] of groupOptions) {
      const optionButton = createElement("button", "", optionLabel);
      optionButton.type = "button";
      optionButton.disabled = !isViewEditing;
      optionButton.classList.toggle("active", optionValue === activeOptionValue);
      optionButton.setAttribute("aria-pressed", String(optionValue === activeOptionValue));
      optionButton.addEventListener("click", () => void runViewCommand(commandKey, optionValue));
      segmentedOptionsElement.append(optionButton);
    }
    propertyControlElement.append(createElement("span", "", groupLabel), segmentedOptionsElement);
    viewOptionsElement.append(propertyControlElement);
  })(
    "投影",
    "projection",
    [
      ["orthographic", "正交"],
      ["perspective", "透视"]
    ],
    viewCamera.mode || "orthographic"
  );
  const focalLengthInput = createElement("input");
  Object.assign(focalLengthInput, {
    name: "i3d-focal-length",
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: String(Math.round(viewCamera.focalLength || 50)),
    disabled: !isViewEditing || viewCamera.mode !== "perspective"
  });
  focalLengthInput.addEventListener("change", () => {
    if (Number.isFinite(focalLengthInput.valueAsNumber)) {
      runViewCommand("focal-length", Math.max(18, Math.min(120, focalLengthInput.valueAsNumber)));
    }
  });
  createLabeledField(viewOptionsElement, "焦段（mm）", focalLengthInput);
  const navigationSection = createSection("导航位置");
  const navigationSettings = {
    categories: {
      x: 50,
      y: 94,
      ...properties.navigation?.categories
    },
    floors: {
      x: 96,
      y: 50,
      ...properties.navigation?.floors
    },
    followOffset: properties.navigation?.followOffset ?? 16
  };
  const positionInputRefs = [];
  for (const [navigationGroupKey, navigationGroupLabel] of [
    ["categories", "分类栏"],
    ["floors", "楼层栏"]
  ]) {
    const navigationGroupRowElement = createElement("div", "i3d-finishing-row");
    navigationSection.append(navigationGroupRowElement);
    for (const [axisKey, axisLabel] of [
      ["x", "横向"],
      ["y", "纵向"]
    ]) {
      const navigationAxisInput = createElement("input");
      Object.assign(navigationAxisInput, {
        name: "i3d-navigation-" + navigationGroupKey + "-" + axisKey,
        type: "number",
        min: "0",
        max: "100",
        step: "1",
        value: String(navigationSettings[navigationGroupKey][axisKey]),
        disabled: isViewEditing
      });
      navigationAxisInput.addEventListener("change", () => {
        if (!isViewEditing) {
          if (Number.isFinite(navigationAxisInput.valueAsNumber)) {
            navigationSettings[navigationGroupKey][axisKey] = Math.max(
              0,
              Math.min(100, navigationAxisInput.valueAsNumber)
            );
            commitChange({
              properties: {
                navigation: structuredClone(navigationSettings)
              }
            });
          }
          navigationAxisInput.value = String(navigationSettings[navigationGroupKey][axisKey]);
        }
      });
      createLabeledField(
        navigationGroupRowElement,
        "" + navigationGroupLabel + axisLabel + "（%）",
        navigationAxisInput
      );
      positionInputRefs.push([navigationAxisInput, navigationGroupKey, axisKey]);
    }
  }
  const navigationScaleRowElement = createElement("div", "i3d-finishing-row");
  navigationSection.append(navigationScaleRowElement);
  const scaleInputRefs = [];
  for (const [scaleGroupKey, scaleGroupLabel] of [
    ["categories", "分类栏"],
    ["floors", "楼层栏"]
  ]) {
    const navigationScaleInput = createElement("input");
    Object.assign(navigationScaleInput, {
      name: "i3d-navigation-" + scaleGroupKey + "-scale",
      type: "number",
      min: "50",
      max: "200",
      step: "5",
      value: String(Math.round((navigationSettings[scaleGroupKey].scale ?? 1) * 100)),
      disabled: isViewEditing
    });
    navigationScaleInput.addEventListener("change", () => {
      if (!isViewEditing) {
        if (Number.isFinite(navigationScaleInput.valueAsNumber)) {
          navigationSettings[scaleGroupKey].scale =
            Math.max(50, Math.min(200, navigationScaleInput.valueAsNumber)) / 100;
          commitChange({
            properties: {
              navigation: structuredClone(navigationSettings)
            }
          });
        }
        navigationScaleInput.value = String(
          Math.round((navigationSettings[scaleGroupKey].scale ?? 1) * 100)
        );
      }
    });
    createLabeledField(
      navigationScaleRowElement,
      scaleGroupLabel + "缩放（%）",
      navigationScaleInput
    );
    scaleInputRefs.push(navigationScaleInput);
  }
  const resetNavigationButton = createElement("button", "secondary-button", "恢复默认位置与大小");
  resetNavigationButton.type = "button";
  resetNavigationButton.disabled = isViewEditing;
  resetNavigationButton.addEventListener("click", () => {
    if (!isViewEditing) {
      Object.assign(navigationSettings, {
        categories: {
          x: 50,
          y: 94
        },
        floors: {
          x: 96,
          y: 50
        }
      });
      for (const [positionAxisControl, positionGroupKey, positionAxisKey] of positionInputRefs) {
        positionAxisControl.value = String(navigationSettings[positionGroupKey][positionAxisKey]);
      }
      for (const scaleControl of scaleInputRefs) {
        scaleControl.value = "100";
      }
      commitChange({
        properties: {
          navigation: structuredClone(navigationSettings)
        }
      });
    }
  });
  navigationSection.append(resetNavigationButton);
  const behaviorSection = createSection("交互行为");
  let behaviorScope = properties.behaviorScope === "page" ? "page" : "global";
  const behaviorPageOptions = [
    ["overview", "ALL（全部楼层）"],
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"]
  ];
  let behaviorPage = hostElement.dataset.behaviorPage || "light";
  let pageBehaviors = structuredClone(properties.pageBehaviors || {});
  let draftProperties = {
    ...properties,
    pageBehaviors: pageBehaviors
  };
  const resolveCurrentBehavior = () =>
    resolvePageBehavior(
      {
        ...draftProperties,
        behaviorScope: behaviorScope,
        pageBehaviors: pageBehaviors
      },
      behaviorPage
    );
  const readBehaviorFlag = behaviorKey =>
    behaviorKey === "hideIconsWhileRotating"
      ? resolveCurrentBehavior()[behaviorKey]
      : resolveCurrentBehavior()[behaviorKey].enabled;
  const behaviorScopeRowElement = createElement("div", "i3d-behavior-scope-row");
  const behaviorScopeSelect = createElement("select");
  const behaviorPageSelect = createElement("select");
  Object.assign(behaviorScopeSelect, {
    name: "i3d-behavior-scope",
    disabled: isViewEditing
  });
  behaviorScopeSelect.setAttribute("aria-label", "交互行为设置范围");
  for (const [scopeValue, scopeLabel] of [
    ["global", "全部页面"],
    ["page", "单页面"]
  ]) {
    const scopeOptionElement = createElement("option", "", scopeLabel);
    scopeOptionElement.value = scopeValue;
    behaviorScopeSelect.append(scopeOptionElement);
  }
  behaviorScopeSelect.value = behaviorScope;
  Object.assign(behaviorPageSelect, {
    name: "i3d-behavior-page",
    disabled: isViewEditing
  });
  behaviorPageSelect.setAttribute("aria-label", "交互设置页面");
  for (const [pageValue, pageLabel] of behaviorPageOptions) {
    const pageOptionElement = createElement("option", "", pageLabel);
    pageOptionElement.value = pageValue;
    behaviorPageSelect.append(pageOptionElement);
  }
  behaviorPageSelect.value = behaviorPage;
  const behaviorPageRowElement = createElement("div");
  behaviorPageRowElement.append(behaviorPageSelect);
  behaviorPageRowElement.hidden = behaviorScope !== "page";
  behaviorScopeRowElement.append(behaviorScopeSelect, behaviorPageRowElement);
  behaviorSection.append(behaviorScopeRowElement);
  behaviorSection.append(
    createElement(
      "p",
      "inspector-section-note",
      "以下设置统一应用于所选范围；单页面未单独设置的参数沿用全部页面。"
    )
  );
  const commitBehavior = (behaviorField, behaviorValue) => {
    if (!isViewEditing) {
      if (behaviorScope === "page") {
        const pageBehaviorValue = pageBehaviors[behaviorPage]?.[behaviorField];
        const nextPageBehaviorValue =
          typeof behaviorValue == "boolean"
            ? behaviorValue
            : {
                ...(typeof pageBehaviorValue == "boolean"
                  ? {
                      enabled: pageBehaviorValue
                    }
                  : pageBehaviorValue || {}),
                ...behaviorValue
              };
        pageBehaviors = {
          ...pageBehaviors,
          [behaviorPage]: {
            ...pageBehaviors[behaviorPage],
            [behaviorField]: nextPageBehaviorValue
          }
        };
        commitChange({
          properties: {
            pageBehaviors: pageBehaviors
          }
        });
      } else {
        const nextGlobalBehaviorValue =
          typeof behaviorValue == "boolean"
            ? behaviorValue
            : {
                ...resolvePageBehavior({
                  ...draftProperties,
                  behaviorScope: "global"
                })[behaviorField],
                ...behaviorValue
              };
        draftProperties = {
          ...draftProperties,
          [behaviorField]: nextGlobalBehaviorValue
        };
        commitChange({
          properties: {
            [behaviorField]: nextGlobalBehaviorValue
          }
        });
      }
    }
  };
  const commitBehaviorEnabled = (behaviorName, enabled) =>
    commitBehavior(
      behaviorName,
      behaviorName === "hideIconsWhileRotating"
        ? enabled
        : {
            enabled: enabled
          }
    );
  behaviorScopeSelect.addEventListener("change", () => {
    if (!isViewEditing) {
      behaviorScope = behaviorScopeSelect.value;
      syncBehaviorControls();
      commitChange({
        properties: {
          behaviorScope: behaviorScope,
          ...(behaviorScope === "page"
            ? {
                pageBehaviors: pageBehaviors
              }
            : {})
        }
      });
    }
  });
  behaviorPageSelect.addEventListener("change", () => {
    behaviorPage = behaviorPageSelect.value;
    hostElement.dataset.behaviorPage = behaviorPage;
    syncBehaviorControls();
  });
  const rotationControlElement = createElement("div", "navigation-property-control");
  const rotationOptionsElement = createElement("div", "navigation-segmented-options three-columns");
  rotationOptionsElement.setAttribute("role", "group");
  rotationOptionsElement.setAttribute("aria-label", "3D 旋转方式");
  for (const [rotationModeValue, rotationModeLabel] of [
    ["free", "自由"],
    ["horizontal", "仅左右"],
    ["vertical", "仅上下"]
  ]) {
    const rotationModeButton = createElement("button", "", rotationModeLabel);
    rotationModeButton.type = "button";
    rotationModeButton.disabled = isViewEditing;
    rotationModeButton.dataset.rotationMode = rotationModeValue;
    const isActiveRotationMode =
      resolveCurrentBehavior().interaction.rotationMode === rotationModeValue;
    rotationModeButton.classList.toggle("active", isActiveRotationMode);
    rotationModeButton.setAttribute("aria-pressed", String(isActiveRotationMode));
    rotationModeButton.addEventListener("click", () => {
      commitBehavior("interaction", {
        rotationMode: rotationModeValue
      });
      syncBehaviorControls();
    });
    rotationOptionsElement.append(rotationModeButton);
  }
  rotationControlElement.append(createElement("span", "", "旋转方式"), rotationOptionsElement);
  behaviorSection.append(rotationControlElement);
  const autoRotateSection = createSection("自动旋转");
  const autoRotateSettings = {
    ...resolveCurrentBehavior().autoRotate
  };
  const autoRotateToggleLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle");
  const autoRotateEnabledInput = createElement("input");
  Object.assign(autoRotateEnabledInput, {
    name: "i3d-auto-rotate-enabled",
    type: "checkbox",
    checked: autoRotateSettings.enabled,
    disabled: isViewEditing
  });
  autoRotateToggleLabel.append(createElement("span", "", "开启自动旋转"), autoRotateEnabledInput);
  const autoRotateFieldsElement = createElement("div", "inspector-grid two-columns");
  autoRotateFieldsElement.hidden = !autoRotateSettings.enabled;
  const autoRotateRowElement = createElement("div", "i3d-auto-rotate-row");
  const autoRotateDirectionOptionsElement = createElement("div", "navigation-segmented-options");
  autoRotateDirectionOptionsElement.setAttribute("role", "group");
  autoRotateDirectionOptionsElement.setAttribute("aria-label", "自动旋转方向");
  for (const [directionValue, directionLabel] of [
    ["clockwise", "顺时针"],
    ["counterclockwise", "逆时针"]
  ]) {
    const directionButton = createElement("button", "", directionLabel);
    directionButton.type = "button";
    directionButton.disabled = isViewEditing;
    directionButton.dataset.direction = directionValue;
    directionButton.classList.toggle("active", autoRotateSettings.direction === directionValue);
    directionButton.setAttribute(
      "aria-pressed",
      String(autoRotateSettings.direction === directionValue)
    );
    directionButton.addEventListener("click", () => {
      if (!isViewEditing && autoRotateSettings.direction !== directionValue) {
        autoRotateSettings.direction = directionValue;
        for (const directionButtonSibling of autoRotateDirectionOptionsElement.children) {
          const isActiveDirection = directionButtonSibling === directionButton;
          directionButtonSibling.classList.toggle("active", isActiveDirection);
          directionButtonSibling.setAttribute("aria-pressed", String(isActiveDirection));
        }
        commitBehavior("autoRotate", {
          direction: autoRotateSettings.direction
        });
      }
    });
    autoRotateDirectionOptionsElement.append(directionButton);
  }
  autoRotateRowElement.append(autoRotateToggleLabel, autoRotateDirectionOptionsElement);
  autoRotateSection.append(autoRotateRowElement, autoRotateFieldsElement);
  const createAutoRotateField = (
    autoRotateFieldLabel,
    settingKey,
    minBound,
    maxBound,
    stepSize
  ) => {
    const autoRotateInput = createElement("input");
    Object.assign(autoRotateInput, {
      type: "number",
      min: String(minBound),
      max: String(maxBound),
      step: String(stepSize),
      name: "i3d-auto-rotate-" + settingKey,
      value: String(autoRotateSettings[settingKey]),
      disabled: isViewEditing || !autoRotateSettings.enabled
    });
    autoRotateInput.addEventListener("change", () => {
      const typedSettingValue = autoRotateInput.valueAsNumber;
      if (Number.isFinite(typedSettingValue)) {
        autoRotateSettings[settingKey] = Math.max(
          minBound,
          Math.min(
            maxBound,
            settingKey === "idleSeconds" ? Math.round(typedSettingValue) : typedSettingValue
          )
        );
        commitBehavior("autoRotate", {
          [settingKey]: autoRotateSettings[settingKey]
        });
      }
      autoRotateInput.value = String(autoRotateSettings[settingKey]);
    });
    createLabeledField(autoRotateFieldsElement, autoRotateFieldLabel, autoRotateInput);
  };
  createAutoRotateField("等待时间（秒）", "idleSeconds", 1, 3600, 1);
  createAutoRotateField("旋转速度（°/秒）", "speed", 0.5, 30, 0.5);
  const returnToDefaultLabel = createElement(
    "label",
    "i3d-setting-toggle i3d-view-toggle i3d-return-default"
  );
  const returnToDefaultInput = createElement("input");
  Object.assign(returnToDefaultInput, {
    name: "i3d-auto-rotate-return-default",
    type: "checkbox",
    checked: autoRotateSettings.returnToDefault,
    disabled: isViewEditing || !autoRotateSettings.enabled
  });
  returnToDefaultLabel.append(
    createElement("span", "", "旋转前回到默认视角"),
    returnToDefaultInput
  );
  returnToDefaultInput.addEventListener("change", () => {
    if (!returnToDefaultInput.disabled) {
      autoRotateSettings.returnToDefault = returnToDefaultInput.checked;
      commitBehavior("autoRotate", {
        returnToDefault: autoRotateSettings.returnToDefault
      });
    }
  });
  autoRotateEnabledInput.addEventListener("change", () => {
    if (!isViewEditing) {
      autoRotateSettings.enabled = autoRotateEnabledInput.checked;
      autoRotateFieldsElement.hidden = !autoRotateSettings.enabled;
      returnToDefaultInput.disabled = isViewEditing || !autoRotateSettings.enabled;
      for (const autoRotateChildInput of autoRotateFieldsElement.querySelectorAll("input")) {
        autoRotateChildInput.disabled = isViewEditing || !autoRotateSettings.enabled;
      }
      commitBehaviorEnabled("autoRotate", autoRotateSettings.enabled);
    }
  });
  const idleExitSection = createSection("闲置退出聚焦");
  const idleExitSettings = {
    ...resolveCurrentBehavior().idleExitFocus
  };
  const idleExitToggleLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle");
  const idleExitEnabledInput = createElement("input");
  Object.assign(idleExitEnabledInput, {
    name: "i3d-idle-exit-enabled",
    type: "checkbox",
    checked: idleExitSettings.enabled,
    disabled: isViewEditing
  });
  idleExitToggleLabel.append(createElement("span", "", "无操作时自动退出"), idleExitEnabledInput);
  const idleExitFieldsElement = createElement("div", "inspector-grid");
  idleExitFieldsElement.hidden = !idleExitSettings.enabled;
  const idleExitSecondsInput = createElement("input");
  Object.assign(idleExitSecondsInput, {
    name: "i3d-idle-exit-seconds",
    type: "number",
    min: "1",
    max: "3600",
    step: "1",
    value: String(idleExitSettings.idleSeconds),
    disabled: isViewEditing || !idleExitSettings.enabled
  });
  idleExitSecondsInput.addEventListener("change", () => {
    if (!idleExitSecondsInput.disabled) {
      if (Number.isFinite(idleExitSecondsInput.valueAsNumber)) {
        idleExitSettings.idleSeconds = Math.max(
          1,
          Math.min(3600, Math.round(idleExitSecondsInput.valueAsNumber))
        );
        commitBehavior("idleExitFocus", {
          idleSeconds: idleExitSettings.idleSeconds
        });
      }
      idleExitSecondsInput.value = String(idleExitSettings.idleSeconds);
    }
  });
  idleExitSecondsInput.setAttribute("aria-label", "闲置退出聚焦等待秒数");
  createLabeledField(idleExitFieldsElement, "等待时间（秒）", idleExitSecondsInput);
  idleExitEnabledInput.addEventListener("change", () => {
    if (!idleExitEnabledInput.disabled) {
      idleExitSettings.enabled = idleExitEnabledInput.checked;
      idleExitFieldsElement.hidden = !idleExitSettings.enabled;
      idleExitSecondsInput.disabled = isViewEditing || !idleExitSettings.enabled;
      commitBehaviorEnabled("idleExitFocus", idleExitSettings.enabled);
    }
  });
  idleExitSection.append(idleExitToggleLabel, idleExitFieldsElement);
  const iconVisibilitySection = createSection("图标显示");
  iconVisibilitySection.classList.add("i3d-icon-visibility-row");
  const idleHideIconsSettings = {
    ...resolveCurrentBehavior().idleHideIcons
  };
  const hideIconsToggleLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle");
  const hideIconsEnabledInput = createElement("input");
  Object.assign(hideIconsEnabledInput, {
    name: "i3d-idle-icons-enabled",
    type: "checkbox",
    checked: idleHideIconsSettings.enabled,
    disabled: isViewEditing
  });
  hideIconsToggleLabel.append(createElement("span", "", "闲置后隐藏图标"), hideIconsEnabledInput);
  const hideIconsFieldsElement = createElement("div", "inspector-grid");
  hideIconsFieldsElement.hidden = !idleHideIconsSettings.enabled;
  const hideIconsSecondsInput = createElement("input");
  Object.assign(hideIconsSecondsInput, {
    name: "i3d-idle-icons-seconds",
    type: "number",
    min: "1",
    max: "3600",
    step: "1",
    value: String(idleHideIconsSettings.idleSeconds),
    disabled: isViewEditing || !idleHideIconsSettings.enabled
  });
  hideIconsSecondsInput.addEventListener("change", () => {
    if (Number.isFinite(hideIconsSecondsInput.valueAsNumber)) {
      idleHideIconsSettings.idleSeconds = Math.max(
        1,
        Math.min(3600, Math.round(hideIconsSecondsInput.valueAsNumber))
      );
      commitBehavior("idleHideIcons", {
        idleSeconds: idleHideIconsSettings.idleSeconds
      });
    }
    hideIconsSecondsInput.value = String(idleHideIconsSettings.idleSeconds);
  });
  hideIconsSecondsInput.setAttribute("aria-label", "隐藏图标等待秒数");
  createLabeledField(hideIconsFieldsElement, "等待时间（秒）", hideIconsSecondsInput);
  hideIconsEnabledInput.addEventListener("change", () => {
    if (!isViewEditing) {
      idleHideIconsSettings.enabled = hideIconsEnabledInput.checked;
      hideIconsFieldsElement.hidden = !idleHideIconsSettings.enabled;
      hideIconsSecondsInput.disabled = isViewEditing || !idleHideIconsSettings.enabled;
      commitBehaviorEnabled("idleHideIcons", idleHideIconsSettings.enabled);
    }
  });
  iconVisibilitySection.append(hideIconsToggleLabel, hideIconsFieldsElement);
  const hideWhileRotatingLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle");
  const hideWhileRotatingInput = createElement("input");
  Object.assign(hideWhileRotatingInput, {
    type: "checkbox",
    name: "i3d-hide-icons-rotating",
    checked: readBehaviorFlag("hideIconsWhileRotating"),
    disabled: isViewEditing
  });
  hideWhileRotatingInput.addEventListener("change", () =>
    commitBehaviorEnabled("hideIconsWhileRotating", hideWhileRotatingInput.checked)
  );
  hideWhileRotatingLabel.append(
    createElement("span", "", "旋转时隐藏图标"),
    hideWhileRotatingInput
  );
  iconVisibilitySection.append(hideWhileRotatingLabel);
  function syncBehaviorControls() {
    behaviorPageRowElement.hidden = behaviorScope !== "page";
    const resolvedBehavior = resolveCurrentBehavior();
    Object.assign(autoRotateSettings, resolvedBehavior.autoRotate);
    Object.assign(idleExitSettings, resolvedBehavior.idleExitFocus);
    Object.assign(idleHideIconsSettings, resolvedBehavior.idleHideIcons);
    for (const rotationOptionButton of rotationOptionsElement.children) {
      const isActiveRotationOption =
        rotationOptionButton.dataset.rotationMode === resolvedBehavior.interaction.rotationMode;
      rotationOptionButton.classList.toggle("active", isActiveRotationOption);
      rotationOptionButton.setAttribute("aria-pressed", String(isActiveRotationOption));
    }
    for (const directionOptionButton of autoRotateDirectionOptionsElement.children) {
      const isActiveDirectionOption =
        directionOptionButton.dataset.direction === autoRotateSettings.direction;
      directionOptionButton.classList.toggle("active", isActiveDirectionOption);
      directionOptionButton.setAttribute("aria-pressed", String(isActiveDirectionOption));
    }
    for (const autoRotateFieldInput of autoRotateFieldsElement.querySelectorAll("input")) {
      autoRotateFieldInput.value = String(
        autoRotateSettings[autoRotateFieldInput.name.replace("i3d-auto-rotate-", "")]
      );
    }
    returnToDefaultInput.checked = autoRotateSettings.returnToDefault;
    idleExitEnabledInput.checked = idleExitSettings.enabled;
    idleExitSecondsInput.value = String(idleExitSettings.idleSeconds);
    idleExitFieldsElement.hidden = !idleExitSettings.enabled;
    idleExitSecondsInput.disabled = isViewEditing || !idleExitSettings.enabled;
    hideIconsSecondsInput.value = String(idleHideIconsSettings.idleSeconds);
    autoRotateEnabledInput.checked = autoRotateSettings.enabled;
    autoRotateFieldsElement.hidden = !autoRotateSettings.enabled;
    returnToDefaultInput.disabled = isViewEditing || !autoRotateSettings.enabled;
    for (const autoRotateChildFieldInput of autoRotateFieldsElement.querySelectorAll("input")) {
      autoRotateChildFieldInput.disabled = isViewEditing || !autoRotateSettings.enabled;
    }
    idleHideIconsSettings.enabled = readBehaviorFlag("idleHideIcons");
    hideIconsEnabledInput.checked = idleHideIconsSettings.enabled;
    hideIconsFieldsElement.hidden = !idleHideIconsSettings.enabled;
    hideIconsSecondsInput.disabled = isViewEditing || !idleHideIconsSettings.enabled;
    hideWhileRotatingInput.checked = readBehaviorFlag("hideIconsWhileRotating");
  }
  const displaySection = createSection("画面显示");
  let lightingMode = normalizeInteraction3dLightingMode(properties.lightingMode);
  const lightingModeSelect = createElement("select");
  lightingModeSelect.name = "i3d-lighting-mode";
  lightingModeSelect.setAttribute("aria-label", "灯光模式");
  for (const [lightingModeValue, lightingModeLabel] of INTERACTION3D_LIGHTING_MODES) {
    const lightingModeOptionElement = createElement("option", "", lightingModeLabel);
    lightingModeOptionElement.value = lightingModeValue;
    lightingModeSelect.append(lightingModeOptionElement);
  }
  lightingModeSelect.value = lightingMode;
  createLabeledField(lightEffectsSection, "灯光模式", lightingModeSelect);
  lightingModeSelect.addEventListener("change", async () => {
    if (programmaticControls.has(lightingModeSelect)) {
      return;
    }
    const nextLightingMode = normalizeInteraction3dLightingMode(lightingModeSelect.value);
    setControlValue(lightingModeSelect, lightingMode);
    lightingModeSelect.disabled = true;
    try {
      await requestInteraction3dAccess();
      if (
        inspectorElement.hidden ||
        inspectorElement.dataset.componentId !== targetComponent.id ||
        !(await confirmChangeWithWarning({
          lightingMode: nextLightingMode
        }))
      ) {
        return;
      }
      await editorOptions.onChange({
        properties: {
          lightingMode: nextLightingMode
        }
      });
      lightingMode = nextLightingMode;
      setControlValue(lightingModeSelect, nextLightingMode);
    } catch (lightingModeError) {
      lightingModeSelect.value = lightingMode;
      editorOptions.onError?.(lightingModeError);
    } finally {
      lightingModeSelect.disabled = isViewEditing;
    }
  });
  lightEffectsSection.append(planRenderButton);
  const backgroundVisibilityControlElement = createElement("div", "navigation-property-control");
  const backgroundVisibilityOptionsElement = createElement("div", "navigation-segmented-options");
  backgroundVisibilityOptionsElement.setAttribute("role", "group");
  backgroundVisibilityOptionsElement.setAttribute("aria-label", "户型底图");
  for (const [visibilityValue, visibilityLabel] of [
    [true, "显示"],
    [false, "隐藏"]
  ]) {
    const visibilityButton = createElement("button", "", visibilityLabel);
    visibilityButton.type = "button";
    const isActiveVisibility = (properties.backgroundVisible !== false) === visibilityValue;
    visibilityButton.classList.toggle("active", isActiveVisibility);
    visibilityButton.setAttribute("aria-pressed", String(isActiveVisibility));
    visibilityButton.addEventListener("click", () => {
      if (!isActiveVisibility) {
        commitChange({
          properties: {
            backgroundVisible: visibilityValue
          }
        });
      }
    });
    backgroundVisibilityOptionsElement.append(visibilityButton);
  }
  backgroundVisibilityControlElement.append(
    createElement("span", "", "户型底图"),
    backgroundVisibilityOptionsElement
  );
  displaySection.append(backgroundVisibilityControlElement);
  const backgroundThemeSelect = createElement("select");
  backgroundThemeSelect.name = "i3d-background-theme";
  backgroundThemeSelect.setAttribute("aria-label", "背景主题");
  for (const [themeValue, themeLabel] of BACKGROUND_THEMES) {
    const themeOptionElement = createElement("option", "", themeLabel);
    themeOptionElement.value = themeValue;
    backgroundThemeSelect.append(themeOptionElement);
  }
  backgroundThemeSelect.value = normalizeBackgroundTheme(properties.backgroundTheme);
  backgroundThemeSelect.addEventListener("change", () => {
    if (!programmaticControls.has(backgroundThemeSelect)) {
      commitChange({
        properties: {
          backgroundTheme: normalizeBackgroundTheme(backgroundThemeSelect.value)
        }
      });
    }
  });
  createLabeledField(displaySection, "背景主题", backgroundThemeSelect);
  displaySection.append(
    createElement(
      "p",
      "inspector-section-note",
      "微光围绕户型中心渐隐，随视角呈现远近层次；操作反馈会逐渐消退。"
    )
  );
  const renderScaleSelect = createElement("select");
  renderScaleSelect.name = "i3d-render-scale";
  for (const [renderScaleValue, renderScaleLabel] of [
    [1.5, "高清 150%"],
    [1, "标准 100%"],
    [0.8, "均衡 80%"],
    [0.75, "均衡 75%"],
    [0.5, "流畅 50%"],
    [0.25, "低负载 25%"]
  ]) {
    const renderScaleOptionElement = createElement("option", "", renderScaleLabel);
    renderScaleOptionElement.value = String(renderScaleValue);
    renderScaleSelect.append(renderScaleOptionElement);
  }
  const renderScaleSection = createSection("渲染分辨率");
  renderScaleSelect.setAttribute("aria-label", "渲染分辨率");
  renderScaleSelect.value = String(properties.renderScale ?? 1);
  renderScaleSelect.addEventListener("change", async () => {
    if (programmaticControls.has(renderScaleSelect)) {
      return;
    }
    const nextRenderScale = Number(renderScaleSelect.value);
    const currentRenderScale = properties.renderScale ?? 1;
    setControlValue(renderScaleSelect, currentRenderScale);
    renderScaleSelect.disabled = true;
    try {
      if (
        await confirmChangeWithWarning({
          renderScale: nextRenderScale
        })
      ) {
        await commitChange({
          properties: {
            renderScale: nextRenderScale
          }
        });
      }
    } finally {
      renderScaleSelect.disabled = isViewEditing;
    }
  });
  renderScaleSection.append(renderScaleSelect);
  renderScaleSelect.title = "画面卡顿时，可降低渲染分辨率。";
  const motionResolutionSection = createSection("转动分辨率");
  const motionResolutionGridElement = createElement("div", "inspector-grid two-columns");
  const motionModeSelect = createElement("select");
  const motionScaleInput = createElement("input");
  let motionRenderScale =
    typeof properties.motionRenderScale == "number" && Number.isFinite(properties.motionRenderScale)
      ? Math.max(0.25, Math.min(1, properties.motionRenderScale))
      : null;
  let lastMotionRenderScale = motionRenderScale ?? 0.75;
  for (const [motionModeValue, motionModeLabel] of [
    ["auto", "自动"],
    ["custom", "自定义"]
  ]) {
    const motionModeOptionElement = createElement("option", "", motionModeLabel);
    motionModeOptionElement.value = motionModeValue;
    motionModeSelect.append(motionModeOptionElement);
  }
  motionModeSelect.name = "i3d-motion-resolution-mode";
  motionModeSelect.setAttribute("aria-label", "转动分辨率调整方式");
  Object.assign(motionScaleInput, {
    name: "i3d-motion-render-scale",
    type: "number",
    min: "25",
    max: "100",
    step: "1"
  });
  motionScaleInput.setAttribute("aria-label", "转动分辨率百分比");
  const syncMotionResolutionControls = () => {
    setControlValue(motionModeSelect, motionRenderScale === null ? "auto" : "custom");
    motionModeSelect.disabled = isViewEditing;
    motionScaleInput.disabled = isViewEditing || motionRenderScale === null;
    motionScaleInput.value = String(Math.round(lastMotionRenderScale * 100));
  };
  const commitMotionRenderScale = async nextMotionScale => {
    motionModeSelect.disabled = motionScaleInput.disabled = true;
    try {
      if (
        await confirmChangeWithWarning({
          motionRenderScale: nextMotionScale
        })
      ) {
        await commitChange({
          properties: {
            motionRenderScale: nextMotionScale
          }
        });
        motionRenderScale = nextMotionScale;
        if (nextMotionScale !== null) {
          lastMotionRenderScale = nextMotionScale;
        }
      }
    } catch (motionScaleError) {
      editorOptions.onError?.(motionScaleError);
    } finally {
      syncMotionResolutionControls();
    }
  };
  motionModeSelect.addEventListener("change", () => {
    if (!programmaticControls.has(motionModeSelect) && !motionModeSelect.disabled) {
      commitMotionRenderScale(motionModeSelect.value === "auto" ? null : lastMotionRenderScale);
    }
  });
  motionScaleInput.addEventListener("change", () => {
    if (motionScaleInput.disabled) {
      return;
    }
    const typedMotionPercent =
      motionScaleInput.value.trim() === "" ? NaN : Number(motionScaleInput.value);
    if (!Number.isFinite(typedMotionPercent)) {
      syncMotionResolutionControls();
      return;
    }
    commitMotionRenderScale(Math.max(25, Math.min(100, Math.round(typedMotionPercent))) / 100);
  });
  createLabeledField(motionResolutionGridElement, "调整方式", motionModeSelect);
  createLabeledField(motionResolutionGridElement, "转动比例（%）", motionScaleInput);
  motionResolutionSection.append(motionResolutionGridElement);
  syncMotionResolutionControls();
  const motionResolutionNote = createElement(
    "p",
    "inspector-section-note",
    "按静止分辨率计算，停止转动后恢复。100% 不降清晰度。"
  );
  motionResolutionSection.append(motionResolutionNote);
  const groundReflectionSection = createSection("地面反射");
  groundReflectionSection.classList.add("i3d-reflection-section");
  let groundReflectionSettings = normalizeGroundReflection(properties.groundReflection);
  const reflectionModeSelect = createElement("select");
  const reflectionResolutionSelect = createElement("select");
  reflectionModeSelect.name = "i3d-reflection-mode";
  reflectionModeSelect.setAttribute("aria-label", "地面反射范围");
  reflectionResolutionSelect.name = "i3d-reflection-resolution";
  reflectionResolutionSelect.setAttribute("aria-label", "反射清晰度");
  for (const [reflectionModeValue, reflectionModeLabel] of [
    ["off", "关闭"],
    ["inside", "室内"],
    ["outside", "室外"],
    ["all", "室内＋室外"]
  ]) {
    const reflectionModeOptionElement = createElement("option", "", reflectionModeLabel);
    reflectionModeOptionElement.value = reflectionModeValue;
    reflectionModeSelect.append(reflectionModeOptionElement);
  }
  for (const [reflectionResolutionValue, reflectionResolutionLabel] of [
    [256, "低"],
    [512, "中"],
    [768, "高"]
  ]) {
    const reflectionResolutionOptionElement = createElement(
      "option",
      "",
      reflectionResolutionLabel
    );
    reflectionResolutionOptionElement.value = String(reflectionResolutionValue);
    reflectionResolutionSelect.append(reflectionResolutionOptionElement);
  }
  reflectionModeSelect.value = groundReflectionSettings.mode;
  reflectionResolutionSelect.value = String(groundReflectionSettings.resolution);
  const reflectionOptionsElement = createElement("div", "i3d-reflection-options");
  createLabeledField(reflectionOptionsElement, "范围", reflectionModeSelect);
  createLabeledField(reflectionOptionsElement, "清晰度", reflectionResolutionSelect);
  const reflectionStrengthSettingElement = createElement("div", "i3d-vignette-setting");
  const reflectionStrengthInput = createElement("input");
  const reflectionStrengthOutput = createElement("output");
  Object.assign(reflectionStrengthInput, {
    name: "i3d-reflection-strength",
    type: "range",
    min: "0",
    max: "45",
    step: "1",
    value: String(Math.round(groundReflectionSettings.strength * 100))
  });
  reflectionStrengthInput.setAttribute("aria-label", "反射强度");
  reflectionStrengthOutput.textContent = reflectionStrengthInput.value + "%";
  reflectionStrengthSettingElement.append(reflectionStrengthInput, reflectionStrengthOutput);
  groundReflectionSection.append(reflectionOptionsElement);
  createLabeledField(groundReflectionSection, "强度", reflectionStrengthSettingElement);
  const syncReflectionControls = () => {
    reflectionResolutionSelect.disabled = reflectionStrengthInput.disabled =
      isViewEditing || groundReflectionSettings.mode === "off";
  };
  const commitGroundReflection = async changeEvent => {
    if (programmaticControls.has(changeEvent?.target)) {
      return;
    }
    const nextGroundReflection = normalizeGroundReflection({
      mode: reflectionModeSelect.value,
      resolution: Number(reflectionResolutionSelect.value),
      strength: Number(reflectionStrengthInput.value) / 100
    });
    setControlValue(reflectionModeSelect, groundReflectionSettings.mode);
    setControlValue(reflectionResolutionSelect, groundReflectionSettings.resolution);
    reflectionStrengthInput.value = String(Math.round(groundReflectionSettings.strength * 100));
    reflectionStrengthOutput.textContent = reflectionStrengthInput.value + "%";
    reflectionModeSelect.disabled =
      reflectionResolutionSelect.disabled =
      reflectionStrengthInput.disabled =
        true;
    try {
      if (
        !(await confirmChangeWithWarning({
          groundReflection: nextGroundReflection
        }))
      ) {
        return;
      }
      await commitChange({
        properties: {
          groundReflection: {
            ...nextGroundReflection
          }
        }
      });
    } finally {
      reflectionModeSelect.disabled = isViewEditing;
      syncReflectionControls();
    }
  };
  reflectionModeSelect.addEventListener("change", commitGroundReflection);
  reflectionResolutionSelect.addEventListener("change", commitGroundReflection);
  reflectionStrengthInput.addEventListener("input", () => {
    reflectionStrengthOutput.textContent = reflectionStrengthInput.value + "%";
  });
  reflectionStrengthInput.addEventListener("change", commitGroundReflection);
  syncReflectionControls();
  const dimmingSection = createElement("section", "inspector-section i3d-page-dimming");
  dimmingSection.append(createElement("h3", "", "画面压暗"));
  const dimmingPageSelect = createElement("select");
  const dimStrengthInput = createElement("input");
  const dimStrengthOutput = createElement("output");
  dimmingPageSelect.name = "i3d-dim-page";
  dimmingPageSelect.setAttribute("aria-label", "压暗页面");
  for (const [dimmingPageValue, dimmingPageLabel] of [
    ["overview", "ALL（全部楼层）"],
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"]
  ]) {
    const dimmingPageOptionElement = createElement("option", "", dimmingPageLabel);
    dimmingPageOptionElement.value = dimmingPageValue;
    dimmingPageSelect.append(dimmingPageOptionElement);
  }
  dimmingPageSelect.value = hostElement.dataset.dimmingPage || "light";
  let pageDimStrengthByPage = {
    ...properties.pageDimStrength
  };
  let pageSaturationByPage = {
    ...properties.pageSaturation
  };
  const saturationInput = createElement("input");
  const saturationOutput = createElement("output");
  const saturationSettingElement = createElement("div", "i3d-vignette-setting");
  const readPageSaturation = () =>
    pageSaturationByPage[dimmingPageSelect.value] ??
    (dimmingPageSelect.value === "overview" ? 100 : 75);
  Object.assign(saturationInput, {
    name: "i3d-page-saturation",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(readPageSaturation())
  });
  saturationInput.setAttribute("aria-label", "页面饱和度");
  saturationOutput.textContent = saturationInput.value + "%";
  saturationInput.addEventListener("input", () => {
    saturationOutput.textContent = saturationInput.value + "%";
  });
  saturationInput.addEventListener("change", async () => {
    const nextSaturationByPage = {
      ...pageSaturationByPage,
      [dimmingPageSelect.value]: Number(saturationInput.value)
    };
    await commitChange({
      properties: {
        pageSaturation: nextSaturationByPage
      }
    });
    pageSaturationByPage = nextSaturationByPage;
  });
  saturationSettingElement.append(saturationInput, saturationOutput);
  const readPageDimStrength = () =>
    pageDimStrengthByPage[dimmingPageSelect.value] ??
    (dimmingPageSelect.value === "overview" ? 0 : (properties.environment?.dimStrength ?? 70));
  Object.assign(dimStrengthInput, {
    name: "i3d-page-dim-strength",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(readPageDimStrength())
  });
  dimStrengthInput.setAttribute("aria-label", "页面压暗强度");
  dimStrengthOutput.textContent = dimStrengthInput.value + "%";
  dimmingPageSelect.addEventListener("change", () => {
    hostElement.dataset.dimmingPage = dimmingPageSelect.value;
    dimStrengthInput.value = String(readPageDimStrength());
    dimStrengthOutput.textContent = dimStrengthInput.value + "%";
    saturationInput.value = String(readPageSaturation());
    saturationOutput.textContent = saturationInput.value + "%";
  });
  dimStrengthInput.addEventListener("input", () => {
    dimStrengthOutput.textContent = dimStrengthInput.value + "%";
  });
  dimStrengthInput.addEventListener("change", async () => {
    const nextDimStrengthByPage = {
      ...pageDimStrengthByPage,
      [dimmingPageSelect.value]: Number(dimStrengthInput.value)
    };
    await commitChange({
      properties: {
        pageDimStrength: nextDimStrengthByPage
      }
    });
    pageDimStrengthByPage = nextDimStrengthByPage;
  });
  const dimmingRowElement = createElement("div", "i3d-page-dim-row");
  const dimStrengthSettingElement = createElement("div", "i3d-vignette-setting");
  dimStrengthSettingElement.append(dimStrengthInput, dimStrengthOutput);
  dimmingRowElement.append(dimmingPageSelect);
  dimmingSection.append(dimmingRowElement);
  createLabeledField(dimmingSection, "整体压暗", dimStrengthSettingElement);
  createLabeledField(dimmingSection, "饱和度", saturationSettingElement);
  const focusDimInput = createElement("input");
  const focusDimOutput = createElement("output");
  const focusDimSettingElement = createElement("div", "i3d-vignette-setting");
  Object.assign(focusDimInput, {
    name: "i3d-focus-dim-strength",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(properties.focusDimStrength ?? 15)
  });
  focusDimInput.setAttribute("aria-label", "聚焦加深");
  focusDimOutput.textContent = focusDimInput.value + "%";
  focusDimInput.addEventListener("input", () => {
    focusDimOutput.textContent = focusDimInput.value + "%";
  });
  focusDimInput.addEventListener(
    "change",
    () =>
      void commitChange({
        properties: {
          focusDimStrength: Number(focusDimInput.value)
        }
      })
  );
  focusDimSettingElement.append(focusDimInput, focusDimOutput);
  createLabeledField(dimmingSection, "聚焦加深", focusDimSettingElement);
  const popupSettingsSection = createElement("section", "inspector-section i3d-popup-settings");
  const popupLayout = structuredClone(properties.popupLayout || {});
  popupSettingsSection.append(
    createElement(
      "p",
      "inspector-section-note",
      "100% 为默认大小。调整时在 3D 区域实时预览，空间不足时自动缩小。"
    )
  );
  for (const [popupPresetKey, popupPresetLabel] of [
    ["general", "通用弹窗"],
    ["camera", "摄像头弹窗"]
  ]) {
    const popupGroupSection = createElement("section", "i3d-popup-setting-group");
    const popupHeadingElement = createElement("div", "i3d-popup-setting-heading");
    popupHeadingElement.append(createElement("h4", "", popupPresetLabel));
    popupGroupSection.append(popupHeadingElement);
    popupSettingsSection.append(popupGroupSection);
    const popupPresetLayout = {
      scale: 1,
      ...popupLayout[popupPresetKey]
    };
    const previewPopupLayout = (previewLayout = popupPresetLayout) => {
      if (!isViewEditing) {
        getInteraction3dEditorView(targetComponent.id)?.previewPopupLayout?.(popupPresetKey, {
          ...previewLayout
        });
      }
    };
    const previewPopupButton = createElement("button", "secondary-button", "预览");
    previewPopupButton.type = "button";
    previewPopupButton.disabled = isViewEditing;
    previewPopupButton.setAttribute("aria-label", "预览" + popupPresetLabel);
    previewPopupButton.addEventListener("click", () => previewPopupLayout());
    popupHeadingElement.append(previewPopupButton);
    const popupScaleInput = createElement("input");
    const popupScaleOutput = createElement("output");
    const popupScaleSettingElement = createElement("div", "i3d-vignette-setting");
    Object.assign(popupScaleInput, {
      name: "i3d-popup-" + popupPresetKey + "-scale",
      type: "range",
      min: "50",
      max: "200",
      step: "5",
      value: String(Math.round(popupPresetLayout.scale * 100)),
      disabled: isViewEditing
    });
    popupScaleInput.setAttribute("aria-label", popupPresetLabel + "大小");
    popupScaleOutput.textContent = popupScaleInput.value + "%";
    popupScaleSettingElement.append(popupScaleInput, popupScaleOutput);
    createLabeledField(popupGroupSection, "等比例大小", popupScaleSettingElement);
    const popupCustomPositionInput = createElement("input");
    Object.assign(popupCustomPositionInput, {
      name: "i3d-popup-" + popupPresetKey + "-custom",
      type: "checkbox",
      checked: Number.isFinite(popupPresetLayout.x) || Number.isFinite(popupPresetLayout.y),
      disabled: isViewEditing
    });
    popupCustomPositionInput.setAttribute("aria-label", popupPresetLabel + "自定义位置");
    createLabeledField(popupGroupSection, "自定义位置", popupCustomPositionInput);
    popupCustomPositionInput.parentElement.className = "i3d-setting-toggle i3d-view-toggle";
    const popupPositionElement = createElement("div", "i3d-popup-position");
    popupGroupSection.append(popupPositionElement);
    const popupPositionInputsByAxis = {};
    const commitPopupLayout = () => {
      previewPopupLayout();
      popupLayout[popupPresetKey] = {
        ...popupPresetLayout
      };
      commitChange({
        properties: {
          popupLayout: structuredClone(popupLayout)
        }
      });
    };
    const syncPopupPositionControls = () => {
      popupPositionElement.hidden = !popupCustomPositionInput.checked;
      for (const popupPositionInput of Object.values(popupPositionInputsByAxis)) {
        popupPositionInput.disabled = isViewEditing || !popupCustomPositionInput.checked;
      }
    };
    for (const [popupAxisKey, popupAxisLabel, popupAxisDefault] of [
      ["x", "横向", 100],
      ["y", "纵向", 0]
    ]) {
      const popupAxisInput = createElement("input");
      popupPositionInputsByAxis[popupAxisKey] = popupAxisInput;
      Object.assign(popupAxisInput, {
        name: "i3d-popup-" + popupPresetKey + "-" + popupAxisKey,
        type: "range",
        min: "0",
        max: "100",
        step: "1",
        value: String(popupPresetLayout[popupAxisKey] ?? popupAxisDefault)
      });
      popupAxisInput.setAttribute(
        "aria-label",
        "" + popupPresetLabel + (popupAxisKey === "x" ? "横向位置" : "纵向位置")
      );
      const popupAxisOutput = createElement("output");
      const popupAxisSettingElement = createElement("div", "i3d-vignette-setting");
      popupAxisOutput.textContent = popupAxisInput.value + "%";
      popupAxisSettingElement.append(popupAxisInput, popupAxisOutput);
      popupAxisInput.addEventListener("input", () => {
        if (!popupAxisInput.disabled) {
          popupAxisOutput.textContent = popupAxisInput.value + "%";
          previewPopupLayout({
            ...popupPresetLayout,
            [popupAxisKey]: Number(popupAxisInput.value)
          });
        }
      });
      popupAxisInput.addEventListener("change", () => {
        if (popupAxisInput.disabled) {
          return;
        }
        const typedPopupPosition =
          popupAxisInput.value.trim() === "" ? NaN : Number(popupAxisInput.value);
        if (!Number.isFinite(typedPopupPosition)) {
          popupAxisInput.value = String(popupPresetLayout[popupAxisKey] ?? popupAxisDefault);
          return;
        }
        popupPresetLayout[popupAxisKey] = Math.max(0, Math.min(100, typedPopupPosition));
        popupAxisInput.value = String(popupPresetLayout[popupAxisKey]);
        popupAxisOutput.textContent = popupAxisInput.value + "%";
        commitPopupLayout();
      });
      createLabeledField(popupPositionElement, popupAxisLabel, popupAxisSettingElement);
    }
    popupCustomPositionInput.addEventListener("change", () => {
      if (!popupCustomPositionInput.disabled) {
        if (popupCustomPositionInput.checked) {
          popupPresetLayout.x = Number(popupPositionInputsByAxis.x.value);
          popupPresetLayout.y = Number(popupPositionInputsByAxis.y.value);
        } else {
          delete popupPresetLayout.x;
          delete popupPresetLayout.y;
        }
        syncPopupPositionControls();
        commitPopupLayout();
      }
    });
    popupScaleInput.addEventListener("input", () => {
      popupScaleOutput.textContent = popupScaleInput.value + "%";
      if (!popupScaleInput.disabled) {
        previewPopupLayout({
          ...popupPresetLayout,
          scale: Number(popupScaleInput.value) / 100
        });
      }
    });
    popupScaleInput.addEventListener("change", () => {
      if (popupScaleInput.disabled) {
        return;
      }
      const typedPopupScale = Number(popupScaleInput.value);
      if (Number.isFinite(typedPopupScale)) {
        popupPresetLayout.scale = Math.max(0.5, Math.min(2, typedPopupScale / 100));
        commitPopupLayout();
      }
    });
    const resetPopupPresetButton = createElement("button", "secondary-button", "恢复默认");
    resetPopupPresetButton.type = "button";
    resetPopupPresetButton.disabled = isViewEditing;
    resetPopupPresetButton.setAttribute("aria-label", "恢复" + popupPresetLabel + "默认大小和位置");
    resetPopupPresetButton.addEventListener("click", () => {
      if (!resetPopupPresetButton.disabled) {
        delete popupLayout[popupPresetKey];
        popupPresetLayout.scale = 1;
        delete popupPresetLayout.x;
        delete popupPresetLayout.y;
        popupScaleInput.value = "100";
        popupScaleOutput.textContent = "100%";
        popupCustomPositionInput.checked = false;
        popupPositionInputsByAxis.x.value = "100";
        popupPositionInputsByAxis.y.value = "0";
        syncPopupPositionControls();
        for (const popupAxisControl of Object.values(popupPositionInputsByAxis)) {
          popupAxisControl.parentElement.children[1].textContent = popupAxisControl.value + "%";
        }
        previewPopupLayout();
        commitChange({
          properties: {
            popupLayout: structuredClone(popupLayout)
          }
        });
      }
    });
    popupHeadingElement.append(resetPopupPresetButton);
    syncPopupPositionControls();
  }
  const popupHintNote = createElement(
    "p",
    "inspector-section-note",
    "通用示例为窗帘，摄像头示例为 16:9；实际高度随内容或画面比例变化。横向从左到右，纵向从上到下。"
  );
  const closePreviewButton = createElement(
    "button",
    "secondary-button i3d-popup-preview-close",
    "关闭预览"
  );
  closePreviewButton.type = "button";
  closePreviewButton.addEventListener("click", () =>
    getInteraction3dEditorView(targetComponent.id)?.closePopupLayoutPreview?.()
  );
  popupSettingsSection.append(popupHintNote, closePreviewButton);
  const popupAppearanceSection = createElement("section", "inspector-section i3d-finishing-row");
  const popupTransparencySettingElement = createElement("div", "i3d-vignette-setting");
  const popupTransparencyInput = createElement("input");
  const popupTransparencyOutput = createElement("output");
  const popupTransparency =
    100 -
    (Number.isFinite(properties.popupOpacity)
      ? Math.max(0, Math.min(100, properties.popupOpacity))
      : 74);
  Object.assign(popupTransparencyInput, {
    name: "i3d-popup-transparency",
    type: "range",
    min: "0",
    max: "100",
    step: "1",
    value: String(popupTransparency)
  });
  popupTransparencyInput.setAttribute("aria-label", "弹窗透明度");
  popupTransparencyOutput.textContent = popupTransparency + "%";
  popupTransparencyInput.addEventListener("input", () => {
    popupTransparencyOutput.textContent = popupTransparencyInput.value + "%";
  });
  popupTransparencyInput.addEventListener("change", () => {
    const typedPopupTransparency = Math.max(0, Math.min(100, Number(popupTransparencyInput.value)));
    if (Number.isFinite(typedPopupTransparency)) {
      commitChange({
        properties: {
          popupOpacity: 100 - typedPopupTransparency
        }
      });
    }
  });
  popupTransparencySettingElement.append(popupTransparencyInput, popupTransparencyOutput);
  createLabeledField(popupAppearanceSection, "弹窗透明度", popupTransparencySettingElement);
  const focusVignetteSettingElement = createElement("div", "i3d-vignette-setting");
  const focusVignetteInput = createElement("input");
  const focusVignetteOutput = createElement("output");
  const focusVignetteStrength = Number.isFinite(properties.focusVignetteStrength)
    ? Math.max(0, Math.min(60, properties.focusVignetteStrength))
    : 14;
  Object.assign(focusVignetteInput, {
    name: "i3d-focus-vignette",
    type: "range",
    min: "0",
    max: "60",
    step: "1",
    value: String(focusVignetteStrength)
  });
  focusVignetteInput.setAttribute("aria-label", "聚焦暗角强度");
  focusVignetteOutput.textContent = focusVignetteStrength + "%";
  focusVignetteInput.addEventListener("input", () => {
    focusVignetteOutput.textContent = focusVignetteInput.value + "%";
  });
  focusVignetteInput.addEventListener(
    "change",
    () =>
      void commitChange({
        properties: {
          focusVignetteStrength: Number(focusVignetteInput.value)
        }
      })
  );
  focusVignetteSettingElement.append(focusVignetteInput, focusVignetteOutput);
  createLabeledField(popupAppearanceSection, "聚焦暗角", focusVignetteSettingElement);
  if (isViewEditing) {
    for (const disabledSection of [
      layoutSection,
      lightsSection,
      environmentSection,
      devicesSection,
      vacuumSection,
      lightEffectsSection,
      displaySection,
      renderScaleSection,
      groundReflectionSection,
      dimmingSection,
      popupAppearanceSection
    ]) {
      for (const disabledControl of disabledSection.querySelectorAll("input, select, button")) {
        disabledControl.disabled = true;
      }
    }
  }
  for (const categorySection of [
    lightsSection,
    environmentSection,
    devicesSection,
    vacuumSection,
    securitySection
  ]) {
    categorySection.classList.add("i3d-category-entry");
  }
  for (const inlineSection of [
    houseSection,
    displaySection,
    layoutSection,
    lightsSection,
    environmentSection,
    devicesSection,
    vacuumSection,
    securitySection,
    lightEffectsSection,
    renderScaleSection
  ]) {
    inlineSection.classList.add("i3d-inline-section");
  }
  houseSection.classList.add("i3d-house-section");
  layoutSection.classList.add("i3d-placement-section");
  lightEffectsSection.classList.add("i3d-light-effects-row");
  lightingModeSelect.parentElement.children[0].hidden = true;
  for (const inspectorSubsection of [autoRotateSection, idleExitSection, iconVisibilitySection]) {
    inspectorSubsection.classList.add("i3d-inspector-subsection");
  }
  for (const [idleSubsectionElement, idleWaitElement] of [
    [idleExitSection, idleExitFieldsElement],
    [iconVisibilitySection, hideIconsFieldsElement]
  ]) {
    idleSubsectionElement.classList.add("i3d-idle-inline");
    idleWaitElement.classList.add("i3d-idle-wait");
    idleWaitElement.children[0].children[0].textContent = "秒";
  }
  idleExitToggleLabel.children[0].textContent = "闲置时退出聚焦";
  const behaviorRowElement = createElement("div", "i3d-behavior-row i3d-inspector-subsection");
  idleExitSection.classList.remove("i3d-inspector-subsection");
  autoRotateSection.append(returnToDefaultLabel);
  behaviorRowElement.append(idleExitSection);
  behaviorSection.append(autoRotateSection, behaviorRowElement, iconVisibilitySection);
  const appendInspectorGroup = (groupKey, groupTitle, groupChildren, defaultOpen = false) => {
    const detailsGroupElement = createElement("details", "i3d-inspector-group");
    detailsGroupElement.dataset.inspectorGroup = groupKey;
    detailsGroupElement.open = openStateByGroup.get(groupKey) ?? defaultOpen;
    detailsGroupElement.append(createElement("summary", "", groupTitle), ...groupChildren);
    inspectorElement.append(detailsGroupElement);
    if (groupKey === "popups") {
      detailsGroupElement.addEventListener("toggle", () => {
        if (!detailsGroupElement.open && detailsGroupElement.isConnected) {
          getInteraction3dEditorView(targetComponent.id)?.closePopupLayoutPreview?.();
        }
      });
    }
  };
  appendInspectorGroup(
    "layout",
    "户型与布局",
    [houseSection, layoutSection, displaySection],
    !properties.sceneId
  );
  appendInspectorGroup(
    "devices",
    "设备配置",
    [lightsSection, environmentSection, devicesSection, vacuumSection, securitySection],
    true
  );
  appendInspectorGroup("appearance", "画面效果", [
    lightEffectsSection,
    renderScaleSection,
    motionResolutionSection,
    groundReflectionSection,
    dimmingSection,
    popupAppearanceSection
  ]);
  appendInspectorGroup("view", "视角与导航", [viewSection, navigationSection], isViewEditing);
  appendInspectorGroup("popups", "弹窗大小与位置", [popupSettingsSection]);
  behaviorSection.children[0].hidden = true;
  appendInspectorGroup("interaction", "交互行为", [behaviorSection], true);
  sceneState.refresh();
  editorOptions.enhanceControls?.(inspectorElement);
  inspectorElement.style.minHeight = previousMinHeight;
  if (isSameComponentOpen) {
    hostElement.scrollTop = previousScrollTop;
    if (focusedControlName) {
      [...inspectorElement.querySelectorAll("input,select")]
        .find(focusCandidate => focusCandidate.name === focusedControlName)
        ?.focus({
          preventScroll: true
        });
    }
  }
  if (!properties.sceneId && sceneState.state === "idle") {
    loadScene();
  }
}
