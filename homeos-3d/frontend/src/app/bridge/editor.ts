import { resolvePageBehavior } from "./page-behavior";
import {
  performanceWarnings,
  confirmPerformanceWarning,
} from "./performance-warning";
import { normalizeGroundReflection } from "./reflection-settings";
import {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  waitInteraction3dEditorView,
  cancelOtherInteraction3dViews,
} from "./bridge";
import type { Interaction3dEditorView } from "./bridge";
import {
  createInteraction3dCover,
  updateInteraction3dCoverMessage,
} from "./cover";
import { withRequestTimeout } from "../utils/request-timeout";
import {
  INTERACTION3D_LIGHTING_MODES,
  normalizeInteraction3dLightingMode,
  BACKGROUND_THEMES,
  normalizeBackgroundTheme,
} from "./definition";
import type { DomControl } from "@app/utils/dom-control";
function interaction3dEntries(componentTree, pathSegments = [], entriesByPath = new Map()) {
  if (Array.isArray(componentTree))
    componentTree.forEach((arrayItem, arrayIndex) =>
      interaction3dEntries(
        arrayItem,
        [...pathSegments, String(arrayItem?.id ?? arrayItem?.path ?? arrayIndex)],
        entriesByPath,
      ),
    );
  else {
    if (componentTree && typeof componentTree == "object") {
      if (componentTree.type === "interaction3d")
        return (entriesByPath.set(JSON.stringify(pathSegments), componentTree), entriesByPath);
      for (const [propertyKey, propertyValue] of Object.entries(componentTree))
        interaction3dEntries(propertyValue, [...pathSegments, propertyKey], entriesByPath);
    }
  }
  return entriesByPath;
}
function isDeepEqual(leftValue, rightValue) {
  if (leftValue === rightValue) return true;
  if (
    !leftValue ||
    !rightValue ||
    typeof leftValue != "object" ||
    typeof rightValue != "object" ||
    Array.isArray(leftValue) !== Array.isArray(rightValue)
  )
    return false;
  const leftKeys = Object.keys(leftValue);
  return leftKeys.length !== Object.keys(rightValue).length
    ? false
    : leftKeys.every(
        (objectKey) =>
          Object.hasOwn(rightValue, objectKey) &&
          isDeepEqual(leftValue[objectKey], rightValue[objectKey]),
      );
}
function stripPositionZIndex(component) {
  if (!component) return null;
  const { zIndex: strippedZIndex, ...remainingPosition } = component.position || {};
  return {
    ...component,
    position: remainingPosition,
  };
}
function changesInteraction3d(previousProject, nextProject) {
  const previousEntriesByPath = interaction3dEntries(previousProject),
    nextEntriesByPath = interaction3dEntries(nextProject);
  for (const [entryPath, nextEntry] of nextEntriesByPath)
    if (
      !isDeepEqual(
        stripPositionZIndex(nextEntry),
        stripPositionZIndex(previousEntriesByPath.get(entryPath)),
      )
    )
      return true;
  const nextSharedComponentIdSet = new Set(
    (nextProject?.sharedComponents || [])
      .filter((sharedComponentCandidate) => interaction3dEntries(sharedComponentCandidate).size)
      .map((sharedComponentEntry) => sharedComponentEntry.id),
  );
  return (nextProject?.pages || []).some((nextPage) => {
    const previousSharedComponentIdSet = new Set(
      (previousProject?.pages || []).find((previousPage) => previousPage.id === nextPage.id)
        ?.sharedComponentIds || [],
    );
    return (nextPage.sharedComponentIds || []).some(
      (sharedComponentId) =>
        nextSharedComponentIdSet.has(sharedComponentId) &&
        !previousSharedComponentIdSet.has(sharedComponentId),
    );
  });
}
export async function guardInteraction3dChanges(currentProject, incomingProject) {
  changesInteraction3d(currentProject, incomingProject) && (await requestInteraction3dAccess());
}
export function renderInteraction3dThumbnail(thumbnailButton) {
  (thumbnailButton.classList.add("interaction3d-thumbnail"),
    thumbnailButton.append(createInteraction3dCover()));
}
const cardStateByButton = new WeakMap();
export async function updateInteraction3dCard(cardButton) {
  const cardState = {
    denied: cardStateByButton.get(cardButton)?.denied === true,
  };
  (cardStateByButton.set(cardButton, cardState),
    (cardButton.disabled = true),
    (cardButton.title = "3D 交互"));
  const titleElement = (cardButton as DomControl).querySelector<DomControl>(".interaction3d-cover-title");
  ((titleElement.hidden = false),
    cardState.denied || updateInteraction3dCoverMessage(titleElement, ["正在验证 3D 交互授权…"]));
  try {
    if ((await requestInteraction3dAccess(), cardStateByButton.get(cardButton) !== cardState))
      return;
    ((cardState.denied = false),
      (cardButton.disabled = false),
      (cardButton.title = "添加 3D 交互控件"),
      (titleElement.hidden = true));
  } catch (accessError) {
    if (cardStateByButton.get(cardButton) !== cardState) return;
    ((cardState.denied ||= accessError?.status === 403),
      (titleElement.hidden = false),
      updateInteraction3dCoverMessage(
        titleElement,
        cardState.denied
          ? undefined
          : [
              accessError?.status === 401
                ? "登录状态已失效，请重新登录"
                : "暂时无法验证授权，请稍后重试",
            ],
      ),
      (cardButton.title =
        accessError?.status === 403 ? "3D 交互" : "3D 交互暂时无法连接，请稍后重试"));
  }
}
const sceneStateByKey = new Map(),
  inspectorAbortByHost = new WeakMap();
async function requestInteraction3dScene() {
  return withRequestTimeout(20000, async (abortSignal) => {
    const response = await fetch("/api/v1/modules/interaction3d/scenes", {
        method: "POST",
        credentials: "same-origin",
        signal: abortSignal,
      }),
      responseBody = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        typeof responseBody.detail == "string" ? responseBody.detail : "户型载入失败，请重试。",
      );
    if (!/^[0-9a-f]{32}$/.test(responseBody.sceneId || ""))
      throw new Error("户型载入失败，请重试。");
    return {
      sceneId: responseBody.sceneId,
    };
  });
}
export function renderInteraction3dInspector(hostElement, targetComponent, editorOptions) {
  inspectorAbortByHost.get(hostElement)?.abort();
  const inspectorAbortController = new AbortController();
  (inspectorAbortByHost.set(hostElement, inspectorAbortController),
    cancelOtherInteraction3dViews(
      targetComponent?.type === "interaction3d" ? targetComponent.id : null,
    ));
  let interaction3dInspectorElement = (hostElement as DomControl).querySelector<DomControl>("#interaction3d-inspector");
  interaction3dInspectorElement ||
    ((interaction3dInspectorElement = document.createElement("section")),
    (interaction3dInspectorElement.id = "interaction3d-inspector"),
    (interaction3dInspectorElement.className = "inspector-form"),
    hostElement.append(interaction3dInspectorElement));
  const isSameComponentOpen =
      !interaction3dInspectorElement.hidden &&
      interaction3dInspectorElement.dataset.componentId === targetComponent?.id,
    previousScrollTop = hostElement.scrollTop,
    focusedControlName = interaction3dInspectorElement.contains(document.activeElement)
      ? (document.activeElement as DomControl).name
      : "",
    previousMinHeight = interaction3dInspectorElement.style.minHeight;
  if (
    (isSameComponentOpen &&
      (interaction3dInspectorElement.style.minHeight =
        interaction3dInspectorElement.getBoundingClientRect().height + "px"),
    (interaction3dInspectorElement.hidden = targetComponent?.type !== "interaction3d"),
    interaction3dInspectorElement.hidden)
  ) {
    interaction3dInspectorElement.style.minHeight = previousMinHeight;
    return;
  }
  interaction3dInspectorElement.dataset.componentId = targetComponent.id;
  const openStateByGroup = new Map(
    isSameComponentOpen
      ? [...interaction3dInspectorElement.querySelectorAll("details")]
          .filter((detailsElement) => detailsElement.dataset.inspectorGroup)
          .map((detailsEntryElement) => [
            detailsEntryElement.dataset.inspectorGroup,
            detailsEntryElement.open,
          ])
      : [],
  );
  interaction3dInspectorElement.replaceChildren();
/** 弹层布局存档：缩放比例 + 横向 / 纵向百分比位置。 */
type PopupPresetConfig = {
  scale?: number;
  x?: number;
  y?: number;
  [layoutKey: string]: any;
};

  const createElement = (tagName, className = "", textContent: any = "") => {
      const createdElement = document.createElement(tagName);
      return (
        (createdElement.className = className),
        (createdElement.textContent = textContent),
        createdElement
      );
    },
    createSection = (sectionTitle) => {
      const sectionElement = createElement("section", "inspector-section");
      return (
        sectionElement.append(createElement("h3", "", sectionTitle)),
        interaction3dInspectorElement.append(sectionElement),
        sectionElement
      );
    },
    createLabeledField = (containerElement, labelText, controlElement) => {
      const labelElement = createElement("label");
      return (
        labelElement.append(createElement("span", "", labelText), controlElement),
        containerElement.append(labelElement),
        controlElement
      );
    },
    commitChange = (propertiesPatch) =>
      Promise.resolve(editorOptions.onChange(propertiesPatch)).catch((changeError) =>
        editorOptions.onError?.(changeError),
      ),
    properties = targetComponent.properties || {},
    position = targetComponent.position || {},
    programmaticControlSet = new WeakSet(),
    setControlValue = (inputControl, nextValue) => {
      ((inputControl.value = String(nextValue)), programmaticControlSet.add(inputControl));
      try {
        inputControl.dispatchEvent?.(
          new Event("change", {
            bubbles: true,
          }),
        );
      } finally {
        programmaticControlSet.delete(inputControl);
      }
    },
    confirmChangeWithWarning = async (pendingProperties) =>
      (await confirmPerformanceWarning(performanceWarnings(properties, pendingProperties), {
        document: document,
        signal: inspectorAbortController.signal,
      })) &&
      !inspectorAbortController.signal.aborted &&
      !interaction3dInspectorElement.hidden &&
      interaction3dInspectorElement.dataset.componentId === targetComponent.id,
    interactionSettings = {
      rotationMode: properties.interaction?.rotationMode || "free",
      panEnabled: false,
      zoomEnabled: false,
    },
    editorView = getInteraction3dEditorView(targetComponent.id),
    isViewEditing = !!editorView?.viewEditing,
    sourceCanvas = editorOptions.document?.canvas || {},
    canvasWidthPx = Number(sourceCanvas.width || 2778),
    canvasHeightPx = Number(sourceCanvas.height || 1940),
    componentWidthPx = Number(position.width || 100),
    componentHeightPx = Number(position.height || 100),
    layoutSection = createSection("布局与位置"),
    layoutModeGroupElement = createElement("div", "image-layout-options");
  (layoutModeGroupElement.setAttribute("role", "group"),
    layoutModeGroupElement.setAttribute("aria-label", "3D 交互布局"));
  const isFillLayout = properties.layoutMode === "fill";
  for (const [layoutModeValue, layoutModeLabel] of [
    ["free", "自由"],
    ["fill", "铺满"],
  ]) {
    const layoutModeButton = createElement("button", "", layoutModeLabel);
    ((layoutModeButton.type = "button"),
      (layoutModeButton.dataset.interaction3dLayout = layoutModeValue));
    const isActiveLayoutMode = (isFillLayout ? "fill" : "free") === layoutModeValue;
    (layoutModeButton.classList.toggle("active", isActiveLayoutMode),
      layoutModeButton.setAttribute("aria-pressed", String(isActiveLayoutMode)),
      layoutModeButton.addEventListener("click", () => {
        isActiveLayoutMode ||
          commitChange({
            properties: {
              layoutMode: layoutModeValue,
            },
          });
      }),
      layoutModeGroupElement.append(layoutModeButton));
  }
  const layoutGridElement = createElement("div", "inspector-grid two-columns");
  (layoutSection.append(layoutModeGroupElement, layoutGridElement),
    (layoutGridElement.hidden = isFillLayout));
  const createPercentInput = (fieldLabel, fieldValue, minValue, maxValue, buildPatch) => {
    const fieldInputElement = createElement("input");
    (Object.assign(fieldInputElement, {
      name: "i3d-position-" + fieldLabel,
      type: "number",
      min: String(minValue),
      max: String(maxValue),
      step: ".1",
      value: String(Math.round(fieldValue * 10) / 10),
      disabled: isFillLayout,
    }),
      fieldInputElement.addEventListener("change", () => {
        Number.isFinite(fieldInputElement.valueAsNumber) &&
          commitChange(
            buildPatch(Math.max(minValue, Math.min(maxValue, fieldInputElement.valueAsNumber))),
          );
      }),
      createLabeledField(layoutGridElement, fieldLabel, fieldInputElement));
  };
  (createPercentInput(
    "左侧（%）",
    ((Number(position.x || 0) + componentWidthPx / 2) / canvasWidthPx) * 100,
    0,
    100,
    (leftPercent) => ({
      position: {
        x: (leftPercent * canvasWidthPx) / 100 - componentWidthPx / 2,
      },
    }),
  ),
    createPercentInput(
      "顶部（%）",
      ((Number(position.y || 0) + componentHeightPx / 2) / canvasHeightPx) * 100,
      0,
      100,
      (topPercent) => ({
        position: {
          y: (topPercent * canvasHeightPx) / 100 - componentHeightPx / 2,
        },
      }),
    ),
    createPercentInput(
      "宽度（%）",
      (componentWidthPx / canvasWidthPx) * 100,
      0.1,
      100,
      (widthPercent) => ({
        position: {
          width: (widthPercent * canvasWidthPx) / 100,
        },
      }),
    ),
    createPercentInput(
      "高度（%）",
      (componentHeightPx / canvasHeightPx) * 100,
      0.1,
      100,
      (heightPercent) => ({
        position: {
          height: (heightPercent * canvasHeightPx) / 100,
        },
      }),
    ),
    createPercentInput(
      "缩放（%）",
      Number(targetComponent.style?.scale || 1) * 100,
      1,
      500,
      (scalePercent) => ({
        style: {
          scale: scalePercent / 100,
        },
      }),
    ),
    createPercentInput("旋转（°）", Number(position.rotation || 0), -360, 360, (rotationDeg) => ({
      position: {
        rotation: rotationDeg,
      },
    })));
  const houseSection = createSection("户型"),
    houseStatusElement = createElement("p", "inspector-section-note");
  houseStatusElement.setAttribute("role", "status");
  const sceneStateKey = (editorOptions.document?.projectId || "") + "/" + targetComponent.id;
  sceneStateByKey.has(sceneStateKey) ||
    sceneStateByKey.set(sceneStateKey, {
      state: "idle",
      error: "",
    });
  const sceneState = sceneStateByKey.get(sceneStateKey),
    reloadSceneButton = createElement("button", "", "重新载入户型");
  reloadSceneButton.type = "button";
  const lightingConfigButton = createElement("button", "", "配置灯光");
  lightingConfigButton.type = "button";
  const environmentConfigButton = createElement("button", "", "配置环境");
  environmentConfigButton.type = "button";
  const planRenderButton = createElement("button", "", "户型渲染");
  planRenderButton.type = "button";
  const ensureEditorView = async (): Promise<Interaction3dEditorView> => {
    (editorOptions.prepareCanvas?.(),
      (viewStatusElement.hidden = false),
      (viewStatusElement.textContent = "正在准备户型…"));
    const readyView = await waitInteraction3dEditorView(targetComponent.id);
    return interaction3dInspectorElement.hidden ||
      interaction3dInspectorElement.dataset.componentId !== targetComponent.id
      ? null
      : ((viewStatusElement.hidden = true), readyView);
  };
  planRenderButton.addEventListener("click", async () => {
    if (lightingMode !== "region") {
      planRenderButton.disabled = true;
      try {
        if (!(await ensureEditorView())) return;
        await requestInteraction3dAccess();
        const { openInteraction3dAppearanceEditor: openAppearanceEditor } =
          await import("/api/v1/modules/interaction3d/editor/config-editor.js");
        await openAppearanceEditor({
          component: targetComponent,
          onSave: (savedBaseLighting) =>
            editorOptions.onChange({
              properties: {
                baseLighting: savedBaseLighting,
              },
            }),
        });
      } catch (appearanceError) {
        ((viewStatusElement.hidden = false),
          (viewStatusElement.textContent = appearanceError.message));
      } finally {
        planRenderButton.disabled = false;
      }
    }
  });
  const houseActionsElement = createElement("div", "i3d-house-actions");
  houseSection.append(houseStatusElement, reloadSceneButton, houseActionsElement);
  const lightEffectsSection = createSection("灯光效果"),
    lightsSection = createSection("灯光");
  lightsSection.append(lightingConfigButton);
  const environmentSection = createSection("环境");
  environmentSection.append(environmentConfigButton);
  const devicesSection = createSection("设备"),
    configureDevicesButton = createElement("button", "", "配置设备");
  ((configureDevicesButton.type = "button"),
    devicesSection.append(configureDevicesButton),
    configureDevicesButton.addEventListener("click", async () => {
      configureDevicesButton.disabled = true;
      try {
        const { openInteraction3dEditor: openDevicesEditor } =
          await import("/api/v1/modules/interaction3d/editor/config-editor.js");
        await openDevicesEditor({
          component: targetComponent,
          deviceKind: "devices",
          document: editorOptions.document,
          entities: editorOptions.entities,
          states: editorOptions.states,
          pickers: editorOptions.pickers,
          onSave: (savedDeviceProperties) =>
            editorOptions.onChange(
              {
                properties: savedDeviceProperties,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (devicesError) {
        editorOptions.onError?.(devicesError);
      } finally {
        configureDevicesButton.disabled = false;
      }
    }));
  const securitySection = createSection("安防"),
    configureSecurityButton = createElement("button", "", "配置安防");
  ((configureSecurityButton.type = "button"),
    securitySection.append(configureSecurityButton),
    configureSecurityButton.addEventListener("click", async () => {
      configureSecurityButton.disabled = true;
      try {
        await requestInteraction3dAccess();
        const { openSecurityEditor: openSecurityEditor } =
          await import("/api/v1/modules/interaction3d/security/security-editor.js");
        await openSecurityEditor({
          component: targetComponent,
          panelDocument: editorOptions.document,
          entities: editorOptions.entities,
          pickers: editorOptions.pickers,
          onSave: async (savedSecurityConfig) => {
            await editorOptions.onChange({
              properties: {
                security: savedSecurityConfig.security,
              },
            });
          },
        });
      } catch (securityError) {
        editorOptions.onError?.(securityError);
      } finally {
        configureSecurityButton.disabled = false;
      }
    }));
  const vacuumSection = createSection("扫地机"),
    configureVacuumButton = createElement("button", "", "配置扫地机");
  ((configureVacuumButton.type = "button"),
    vacuumSection.append(configureVacuumButton),
    configureVacuumButton.addEventListener("click", async () => {
      configureVacuumButton.disabled = true;
      try {
        const { openInteraction3dEditor: openVacuumEditor } =
          await import("/api/v1/modules/interaction3d/editor/config-editor.js");
        await openVacuumEditor({
          component: targetComponent,
          deviceKind: "vacuum",
          document: editorOptions.document,
          entities: editorOptions.entities,
          states: editorOptions.states,
          pickers: editorOptions.pickers,
          onSave: (savedVacuumProperties) =>
            editorOptions.onChange(
              {
                properties: savedVacuumProperties,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (vacuumError) {
        editorOptions.onError?.(vacuumError);
      } finally {
        configureVacuumButton.disabled = false;
      }
    }),
    (sceneState.refresh = () => {
      houseStatusElement.isConnected &&
        ((houseStatusElement.textContent = properties.sceneId
          ? "已关联户型，可继续配置视角和灯光。"
          : sceneState.state === "loading"
            ? "正在载入已保存的户型…"
            : sceneState.error || "尚未载入户型。"),
        (houseStatusElement.hidden = !!properties.sceneId),
        (reloadSceneButton.hidden = !!properties.sceneId || sceneState.state === "loading"),
        (lightingConfigButton.disabled = !properties.sceneId || isViewEditing),
        (configureSecurityButton.disabled =
          configureVacuumButton.disabled =
          configureDevicesButton.disabled =
          environmentConfigButton.disabled =
            lightingConfigButton.disabled),
        (planRenderButton.disabled = !properties.sceneId || isViewEditing));
    }));
  const loadScene = async () => {
    if (sceneState.state !== "loading") {
      ((sceneState.state = "loading"), (sceneState.error = ""), sceneState.refresh());
      try {
        const loadedScene = await requestInteraction3dScene();
        (await editorOptions.onChange({
          properties: loadedScene,
        }),
          (sceneState.state = "ready"));
      } catch (sceneLoadError) {
        ((sceneState.state = "error"),
          (sceneState.error =
            sceneLoadError.name === "TimeoutError"
              ? "户型载入超时，请重试。"
              : sceneLoadError.message));
      }
      sceneState.refresh();
    }
  };
  (reloadSceneButton.addEventListener("click", () => void loadScene()),
    lightingConfigButton.addEventListener("click", async () => {
      lightingConfigButton.disabled = true;
      try {
        await requestInteraction3dAccess();
        const { openInteraction3dEditor: openLightingEditor } =
          await import("/api/v1/modules/interaction3d/editor/config-editor.js");
        await openLightingEditor({
          component: targetComponent,
          document: editorOptions.document,
          entities: editorOptions.entities,
          states: editorOptions.states,
          pickers: editorOptions.pickers,
          onSave: (savedLightingProperties) =>
            editorOptions.onChange(
              {
                properties: savedLightingProperties,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (lightingError) {
        editorOptions.onError?.(lightingError);
      } finally {
        lightingConfigButton.disabled = false;
      }
    }),
    environmentConfigButton.addEventListener("click", async () => {
      environmentConfigButton.disabled = true;
      try {
        await requestInteraction3dAccess();
        const { openInteraction3dEditor: openEnvironmentEditor } =
          await import("/api/v1/modules/interaction3d/editor/config-editor.js");
        await openEnvironmentEditor({
          component: targetComponent,
          deviceKind: "environment",
          document: editorOptions.document,
          entities: editorOptions.entities,
          states: editorOptions.states,
          pickers: editorOptions.pickers,
          onSave: (savedEnvironmentProperties) =>
            editorOptions.onChange(
              {
                properties: savedEnvironmentProperties,
              },
              {
                replaceProperties: true,
              },
            ),
        });
      } catch (environmentError) {
        editorOptions.onError?.(environmentError);
      } finally {
        environmentConfigButton.disabled = false;
      }
    }));
  const viewSection = createSection("楼层视角"),
    viewFloorRowElement = createElement("div", "i3d-view-floor-row");
  viewSection.append(viewFloorRowElement);
  const floorSelectElement = createElement("select");
  ((floorSelectElement.name = "i3d-view-floor"),
    (floorSelectElement.disabled = isViewEditing),
    createLabeledField(viewFloorRowElement, "视角楼层", floorSelectElement));
  const floorGapInput = createElement("input");
  (Object.assign(floorGapInput, {
    name: "i3d-floor-gap",
    type: "number",
    min: "0",
    max: "20",
    step: "0.1",
    value: String(properties.floorGap ?? editorView?.metadata?.floorGap ?? 3),
  }),
    createLabeledField(viewFloorRowElement, "楼层间距（m）", floorGapInput),
    (floorGapInput.disabled = properties.floorSelection !== "all"),
    floorGapInput.addEventListener("change", () => {
      if (!floorGapInput.disabled) {
        if (Number.isFinite(floorGapInput.valueAsNumber)) {
          const clampedFloorGap = Math.max(0, Math.min(20, floorGapInput.valueAsNumber));
          ((floorGapInput.value = String(clampedFloorGap)),
            commitChange({
              properties: {
                floorGap: clampedFloorGap,
              },
            }));
        } else
          floorGapInput.value = String(properties.floorGap ?? editorView?.metadata?.floorGap ?? 3);
      }
    }));
  const uniformOverviewStackInput = createElement("input");
  (Object.assign(uniformOverviewStackInput, {
    name: "i3d-uniform-overview-stack",
    type: "checkbox",
    checked: properties.uniformOverviewStack ?? editorView?.metadata?.uniformOverviewStack ?? false,
  }),
    createLabeledField(viewSection, "多层等比例叠加", uniformOverviewStackInput),
    (uniformOverviewStackInput.parentElement.className = "i3d-setting-toggle i3d-view-toggle"),
    viewSection.append(
      createElement(
        "p",
        "inspector-section-note",
        "仅总览生效：各层使用相同视角。调小楼层间距可让各层继续靠近，允许重叠。",
      ),
    ),
    uniformOverviewStackInput.addEventListener("change", () => {
      uniformOverviewStackInput.disabled ||
        commitChange({
          properties: {
            uniformOverviewStack: uniformOverviewStackInput.checked,
          },
        });
    }));
  const floorNumberGroupElement = createElement("div", "i3d-floor-number-group");
  floorNumberGroupElement.append(createElement("span", "i3d-floor-number-title", "楼层编号"));
  const floorNumberFieldsElement = createElement("div", "i3d-floor-number-fields");
  (floorNumberGroupElement.append(floorNumberFieldsElement),
    viewSection.append(floorNumberGroupElement));
  const renderFloorNumberFields = (floorList) => {
      (floorNumberFieldsElement.replaceChildren(),
        (floorNumberGroupElement.hidden = !floorList.length));
      for (const [floorIndex, floorEntry] of floorList.entries()) {
        const floorId = floorEntry.id,
          floorName = floorEntry.name || "未命名楼层",
          floorNumber = properties.floorNumbers?.[floorId] ?? floorEntry.number ?? floorIndex + 1,
          floorNumberInput = createElement("input");
        (Object.assign(floorNumberInput, {
          type: "number",
          min: "-99",
          max: "99",
          step: "1",
          value: String(floorNumber),
          name: "i3d-floor-number-" + floorId,
          title: "负数为地下层，1 为一层",
          disabled: isViewEditing,
        }),
          createLabeledField(floorNumberFieldsElement, floorName, floorNumberInput));
        let committedFloorNumber = floorNumber;
        floorNumberInput.addEventListener("change", async () => {
          let nextFloorNumber = floorNumberInput.valueAsNumber;
          if (
            (nextFloorNumber === 0 && (nextFloorNumber = committedFloorNumber < 0 ? 1 : -1),
            !Number.isInteger(nextFloorNumber) || nextFloorNumber < -99 || nextFloorNumber > 99)
          ) {
            floorNumberInput.value = String(committedFloorNumber);
            return;
          }
          const floorNumbersPatch = {
            ...properties.floorNumbers,
            [floorId]: nextFloorNumber,
          };
          floorNumberInput.disabled = true;
          try {
            (await editorOptions.onChange({
              properties: {
                floorNumbers: floorNumbersPatch,
              },
            }),
              (properties.floorNumbers = floorNumbersPatch),
              (committedFloorNumber = nextFloorNumber),
              (floorNumberInput.value = String(nextFloorNumber)));
          } catch (floorNumberError) {
            ((floorNumberInput.value = String(committedFloorNumber)),
              editorOptions.onError?.(floorNumberError));
          } finally {
            floorNumberInput.disabled = isViewEditing;
          }
        });
      }
    },
    syncFloorControls = (editorViewState) => {
      if (!floorSelectElement.isConnected) return;
      const floors = editorViewState?.metadata?.floors || [];
      (renderFloorNumberFields(floors),
        properties.floorGap === undefined &&
          Number.isFinite(editorViewState?.metadata?.floorGap) &&
          (floorGapInput.value = String(editorViewState.metadata.floorGap)),
        floorSelectElement.replaceChildren());
      const floorOptions = floors.length
        ? [
            ...(floors.length > 1 ? [["all", "全部楼层"]] : []),
            ...floors.map((floorOptionEntry) => [
              floorOptionEntry.id,
              floorOptionEntry.name || "未命名楼层",
            ]),
          ]
        : [[properties.floorSelection || "all", "当前楼层"]];
      for (const [floorOptionValue, floorOptionLabel] of floorOptions) {
        const floorOptionElement = createElement("option", "", floorOptionLabel);
        ((floorOptionElement.value = floorOptionValue),
          floorSelectElement.append(floorOptionElement));
      }
      ((floorSelectElement.value = properties.floorSelection || floorOptions[0][0]),
        (floorGapInput.disabled = floorSelectElement.value !== "all" || floors.length < 2),
        (uniformOverviewStackInput.disabled = floorGapInput.disabled),
        properties.uniformOverviewStack === undefined &&
          (uniformOverviewStackInput.checked =
            editorViewState?.metadata?.uniformOverviewStack === true),
        (floorSelectElement.disabled = isViewEditing || floors.length < 2));
    };
  (syncFloorControls(editorView),
    properties.sceneId &&
      !editorView?.metadata?.floors?.length &&
      typeof waitInteraction3dEditorView == "function" &&
      waitInteraction3dEditorView(targetComponent.id)
        .then(syncFloorControls)
        .catch(() => {}),
    floorSelectElement.addEventListener("change", async () => {
      if (isViewEditing) return;
      const selectedFloorId = floorSelectElement.value,
        floorCameras = {
          ...properties.floorCameras,
        };
      properties.camera &&
        properties.floorSelection &&
        !floorCameras[properties.floorSelection] &&
        (floorCameras[properties.floorSelection] = properties.camera);
      const floorSelectionPatch = {
        floorSelection: selectedFloorId,
        floorCameras: floorCameras,
        camera: floorCameras[selectedFloorId] || null,
      };
      (await commitChange({
        properties: floorSelectionPatch,
      }),
        renderInteraction3dInspector(
          hostElement,
          {
            ...targetComponent,
            properties: {
              ...properties,
              ...floorSelectionPatch,
            },
          },
          editorOptions,
        ));
    }));
  const viewEditingToggleButton = createElement(
    "button",
    isViewEditing ? "primary" : "",
    isViewEditing ? "完成并固定" : "调整户型视角",
  );
  ((viewEditingToggleButton.type = "button"),
    (viewEditingToggleButton.disabled = !properties.sceneId),
    viewEditingToggleButton.setAttribute("aria-pressed", String(isViewEditing)));
  const cancelViewEditingButton = createElement("button", "", "取消本次调整");
  ((cancelViewEditingButton.type = "button"), (cancelViewEditingButton.hidden = !isViewEditing));
  const viewStatusElement = createElement("p", "inspector-section-note");
  ((viewStatusElement.hidden = true),
    viewEditingToggleButton.addEventListener("click", async () => {
      viewEditingToggleButton.disabled = true;
      try {
        const activeView = await ensureEditorView();
        if (!activeView) return;
        if (activeView.viewEditing) {
          const capturedViewCamera = await activeView.captureView(),
            updatedFloorCameras = {
              ...properties.floorCameras,
              [properties.floorSelection || floorSelectElement.value]: capturedViewCamera,
            };
          (await editorOptions.onChange({
            properties: {
              camera: capturedViewCamera,
              floorCameras: updatedFloorCameras,
              interaction: interactionSettings,
            },
          }),
            activeView.setViewEditing(false),
            renderInteraction3dInspector(
              hostElement,
              {
                ...targetComponent,
                properties: {
                  ...properties,
                  camera: capturedViewCamera,
                  floorCameras: updatedFloorCameras,
                  interaction: interactionSettings,
                },
              },
              editorOptions,
            ));
        } else
          (activeView.setViewEditing(true),
            renderInteraction3dInspector(hostElement, targetComponent, editorOptions));
      } catch (viewEditingError) {
        ((viewStatusElement.hidden = false),
          (viewStatusElement.textContent = viewEditingError.message));
      } finally {
        viewEditingToggleButton.disabled = false;
      }
    }),
    cancelViewEditingButton.addEventListener("click", () => {
      (getInteraction3dEditorView(targetComponent.id)?.setViewEditing(false),
        renderInteraction3dInspector(hostElement, targetComponent, editorOptions));
    }),
    houseActionsElement.append(viewEditingToggleButton),
    viewSection.append(houseActionsElement),
    viewSection.append(cancelViewEditingButton, viewStatusElement));
  const viewOptionsElement = createElement("div", "i3d-view-options");
  ((viewOptionsElement.hidden = !isViewEditing), viewSection.append(viewOptionsElement));
  const viewCamera = editorView?.viewCamera || properties.camera || {},
    runViewCommand = async (commandName, commandValue) => {
      try {
        const currentEditorView = getInteraction3dEditorView(targetComponent.id);
        if (!currentEditorView?.viewEditing) return;
        (await currentEditorView.viewCommand(commandName, commandValue),
          renderInteraction3dInspector(hostElement, targetComponent, editorOptions));
      } catch (viewCommandError) {
        ((viewStatusElement.hidden = false),
          (viewStatusElement.textContent = viewCommandError.message));
      }
    };
  ((groupLabel, commandKey, groupOptions, activeOptionValue) => {
    const projectionControlElement = createElement("div", "navigation-property-control"),
      projectionOptionsElement = createElement("div", "navigation-segmented-options");
    (projectionOptionsElement.setAttribute("role", "group"),
      projectionOptionsElement.setAttribute("aria-label", "3D " + groupLabel));
    for (const [optionValue, optionLabel] of groupOptions) {
      const optionButton = createElement("button", "", optionLabel);
      ((optionButton.type = "button"),
        (optionButton.disabled = !isViewEditing),
        optionButton.classList.toggle("active", optionValue === activeOptionValue),
        optionButton.setAttribute("aria-pressed", String(optionValue === activeOptionValue)),
        optionButton.addEventListener("click", () => void runViewCommand(commandKey, optionValue)),
        projectionOptionsElement.append(optionButton));
    }
    (projectionControlElement.append(
      createElement("span", "", groupLabel),
      projectionOptionsElement,
    ),
      viewOptionsElement.append(projectionControlElement));
  })(
    "投影",
    "projection",
    [
      ["orthographic", "正交"],
      ["perspective", "透视"],
    ],
    viewCamera.mode || "orthographic",
  );
  const focalLengthInput = createElement("input");
  (Object.assign(focalLengthInput, {
    name: "i3d-focal-length",
    type: "number",
    min: "18",
    max: "120",
    step: "1",
    value: String(Math.round(viewCamera.focalLength || 50)),
    disabled: !isViewEditing || viewCamera.mode !== "perspective",
  }),
    focalLengthInput.addEventListener("change", () => {
      Number.isFinite(focalLengthInput.valueAsNumber) &&
        runViewCommand("focal-length", Math.max(18, Math.min(120, focalLengthInput.valueAsNumber)));
    }),
    createLabeledField(viewOptionsElement, "焦段（mm）", focalLengthInput));
  const navigationSection = createSection("导航位置"),
    navigationSettings = {
      categories: {
        x: 50,
        y: 94,
        ...properties.navigation?.categories,
      },
      floors: {
        x: 96,
        y: 50,
        ...properties.navigation?.floors,
      },
      followOffset: properties.navigation?.followOffset ?? 16,
    },
    positionInputRefs = [];
  for (const [navigationGroupKey, navigationGroupLabel] of [
    ["categories", "分类栏"],
    ["floors", "楼层栏"],
  ]) {
    const navigationGroupElement = createElement("div", "i3d-finishing-row");
    navigationSection.append(navigationGroupElement);
    for (const [axisKey, axisLabel] of [
      ["x", "横向"],
      ["y", "纵向"],
    ]) {
      const navigationAxisInput = createElement("input");
      (Object.assign(navigationAxisInput, {
        name: "i3d-navigation-" + navigationGroupKey + "-" + axisKey,
        type: "number",
        min: "0",
        max: "100",
        step: "1",
        value: String(navigationSettings[navigationGroupKey][axisKey]),
        disabled: isViewEditing,
      }),
        navigationAxisInput.addEventListener("change", () => {
          isViewEditing ||
            (Number.isFinite(navigationAxisInput.valueAsNumber) &&
              ((navigationSettings[navigationGroupKey][axisKey] = Math.max(
                0,
                Math.min(100, navigationAxisInput.valueAsNumber),
              )),
              commitChange({
                properties: {
                  navigation: structuredClone(navigationSettings),
                },
              })),
            (navigationAxisInput.value = String(navigationSettings[navigationGroupKey][axisKey])));
        }),
        createLabeledField(
          navigationGroupElement,
          "" + navigationGroupLabel + axisLabel + "（%）",
          navigationAxisInput,
        ),
        positionInputRefs.push([navigationAxisInput, navigationGroupKey, axisKey]));
    }
  }
  const navigationScaleRowElement = createElement("div", "i3d-finishing-row");
  navigationSection.append(navigationScaleRowElement);
  const scaleInputRefs = [];
  for (const [scaleGroupKey, scaleGroupLabel] of [
    ["categories", "分类栏"],
    ["floors", "楼层栏"],
  ]) {
    const navigationScaleInput = createElement("input");
    (Object.assign(navigationScaleInput, {
      name: "i3d-navigation-" + scaleGroupKey + "-scale",
      type: "number",
      min: "50",
      max: "1000",
      step: "5",
      value: String(Math.round((navigationSettings[scaleGroupKey].scale ?? 1) * 100)),
      disabled: isViewEditing,
    }),
      navigationScaleInput.addEventListener("change", () => {
        isViewEditing ||
          (Number.isFinite(navigationScaleInput.valueAsNumber) &&
            ((navigationSettings[scaleGroupKey].scale =
              Math.max(50, Math.min(1000, navigationScaleInput.valueAsNumber)) / 100),
            commitChange({
              properties: {
                navigation: structuredClone(navigationSettings),
              },
            })),
          (navigationScaleInput.value = String(
            Math.round((navigationSettings[scaleGroupKey].scale ?? 1) * 100),
          )));
      }),
      createLabeledField(
        navigationScaleRowElement,
        scaleGroupLabel + "缩放（%）",
        navigationScaleInput,
      ),
      scaleInputRefs.push(navigationScaleInput));
  }
  const resetNavigationButton = createElement("button", "secondary-button", "恢复默认位置与大小");
  ((resetNavigationButton.type = "button"),
    (resetNavigationButton.disabled = isViewEditing),
    resetNavigationButton.addEventListener("click", () => {
      if (!isViewEditing) {
        Object.assign(navigationSettings, {
          categories: {
            x: 50,
            y: 94,
          },
          floors: {
            x: 96,
            y: 50,
          },
        });
        for (const [positionAxisControl, positionGroupKey, positionAxisKey] of positionInputRefs)
          positionAxisControl.value = String(navigationSettings[positionGroupKey][positionAxisKey]);
        for (const scaleControl of scaleInputRefs) scaleControl.value = "100";
        commitChange({
          properties: {
            navigation: structuredClone(navigationSettings),
          },
        });
      }
    }),
    navigationSection.append(resetNavigationButton));
  const behaviorSection = createSection("交互行为");
  let behaviorScope = properties.behaviorScope === "page" ? "page" : "global";
  const behaviorPageOptions = [
    ["overview", "ALL（全部楼层）"],
    ["light", "灯光"],
    ["environment", "环境"],
    ["devices", "设备"],
    ["vacuum", "扫地机"],
    ["security", "安防"],
  ];
  let behaviorPage = hostElement.dataset.behaviorPage || "light",
    pageBehaviors = structuredClone(properties.pageBehaviors || {}),
    draftProperties = {
      ...properties,
      pageBehaviors: pageBehaviors,
    };
  const resolveCurrentBehavior = () =>
      resolvePageBehavior(
        {
          ...draftProperties,
          behaviorScope: behaviorScope,
          pageBehaviors: pageBehaviors,
        },
        behaviorPage,
      ),
    readBehaviorFlag = (behaviorKey) =>
      behaviorKey === "hideIconsWhileRotating"
        ? resolveCurrentBehavior()[behaviorKey]
        : resolveCurrentBehavior()[behaviorKey].enabled,
    behaviorScopeRowElement = createElement("div", "i3d-behavior-scope-row"),
    behaviorScopeSelect = createElement("select"),
    behaviorPageSelect = createElement("select");
  (Object.assign(behaviorScopeSelect, {
    name: "i3d-behavior-scope",
    disabled: isViewEditing,
  }),
    behaviorScopeSelect.setAttribute("aria-label", "交互行为设置范围"));
  for (const [scopeValue, scopeLabel] of [
    ["global", "全部页面"],
    ["page", "单页面"],
  ]) {
    const scopeOptionElement = createElement("option", "", scopeLabel);
    ((scopeOptionElement.value = scopeValue), behaviorScopeSelect.append(scopeOptionElement));
  }
  ((behaviorScopeSelect.value = behaviorScope),
    Object.assign(behaviorPageSelect, {
      name: "i3d-behavior-page",
      disabled: isViewEditing,
    }),
    behaviorPageSelect.setAttribute("aria-label", "交互设置页面"));
  for (const [pageValue, pageLabel] of behaviorPageOptions) {
    const pageOptionElement = createElement("option", "", pageLabel);
    ((pageOptionElement.value = pageValue), behaviorPageSelect.append(pageOptionElement));
  }
  behaviorPageSelect.value = behaviorPage;
  const behaviorPageRowElement = createElement("div");
  (behaviorPageRowElement.append(behaviorPageSelect),
    (behaviorPageRowElement.hidden = behaviorScope !== "page"),
    behaviorScopeRowElement.append(behaviorScopeSelect, behaviorPageRowElement),
    behaviorSection.append(behaviorScopeRowElement),
    behaviorSection.append(
      createElement(
        "p",
        "inspector-section-note",
        "以下设置统一应用于所选范围；单页面未单独设置的参数沿用全部页面。",
      ),
    ));
  const commitBehavior = (behaviorField, behaviorValue) => {
      if (!isViewEditing) {
        if (behaviorScope === "page") {
          const pageBehaviorValue = pageBehaviors[behaviorPage]?.[behaviorField],
            nextPageBehaviorValue =
              typeof behaviorValue == "boolean"
                ? behaviorValue
                : {
                    ...(typeof pageBehaviorValue == "boolean"
                      ? {
                          enabled: pageBehaviorValue,
                        }
                      : pageBehaviorValue || {}),
                    ...behaviorValue,
                  };
          ((pageBehaviors = {
            ...pageBehaviors,
            [behaviorPage]: {
              ...pageBehaviors[behaviorPage],
              [behaviorField]: nextPageBehaviorValue,
            },
          }),
            commitChange({
              properties: {
                pageBehaviors: pageBehaviors,
              },
            }));
        } else {
          const nextGlobalBehaviorValue =
            typeof behaviorValue == "boolean"
              ? behaviorValue
              : {
                  ...resolvePageBehavior({
                    ...draftProperties,
                    behaviorScope: "global",
                  })[behaviorField],
                  ...behaviorValue,
                };
          ((draftProperties = {
            ...draftProperties,
            [behaviorField]: nextGlobalBehaviorValue,
          }),
            commitChange({
              properties: {
                [behaviorField]: nextGlobalBehaviorValue,
              },
            }));
        }
      }
    },
    commitBehaviorEnabled = (behaviorName, enabled) =>
      commitBehavior(
        behaviorName,
        behaviorName === "hideIconsWhileRotating"
          ? enabled
          : {
              enabled: enabled,
            },
      );
  (behaviorScopeSelect.addEventListener("change", () => {
    isViewEditing ||
      ((behaviorScope = behaviorScopeSelect.value),
      syncBehaviorControls(),
      commitChange({
        properties: {
          behaviorScope: behaviorScope,
          ...(behaviorScope === "page"
            ? {
                pageBehaviors: pageBehaviors,
              }
            : {}),
        },
      }));
  }),
    behaviorPageSelect.addEventListener("change", () => {
      ((behaviorPage = behaviorPageSelect.value),
        (hostElement.dataset.behaviorPage = behaviorPage),
        syncBehaviorControls());
    }));
  const rotationControlElement = createElement("div", "navigation-property-control"),
    rotationOptionsElement = createElement("div", "navigation-segmented-options three-columns");
  (rotationOptionsElement.setAttribute("role", "group"),
    rotationOptionsElement.setAttribute("aria-label", "3D 旋转方式"));
  for (const [rotationModeValue, rotationModeLabel] of [
    ["free", "自由"],
    ["horizontal", "仅左右"],
    ["vertical", "仅上下"],
  ]) {
    const rotationModeButton = createElement("button", "", rotationModeLabel);
    ((rotationModeButton.type = "button"),
      (rotationModeButton.disabled = isViewEditing),
      (rotationModeButton.dataset.rotationMode = rotationModeValue));
    const isActiveRotationMode =
      resolveCurrentBehavior().interaction.rotationMode === rotationModeValue;
    (rotationModeButton.classList.toggle("active", isActiveRotationMode),
      rotationModeButton.setAttribute("aria-pressed", String(isActiveRotationMode)),
      rotationModeButton.addEventListener("click", () => {
        (commitBehavior("interaction", {
          rotationMode: rotationModeValue,
        }),
          syncBehaviorControls());
      }),
      rotationOptionsElement.append(rotationModeButton));
  }
  (rotationControlElement.append(createElement("span", "", "旋转方式"), rotationOptionsElement),
    behaviorSection.append(rotationControlElement));
  const autoRotateSection = createSection("自动旋转"),
    autoRotateSettings = {
      ...resolveCurrentBehavior().autoRotate,
    },
    autoRotateToggleLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle"),
    autoRotateEnabledInput = createElement("input");
  (Object.assign(autoRotateEnabledInput, {
    name: "i3d-auto-rotate-enabled",
    type: "checkbox",
    checked: autoRotateSettings.enabled,
    disabled: isViewEditing,
  }),
    autoRotateToggleLabel.append(
      createElement("span", "", "开启自动旋转"),
      autoRotateEnabledInput,
    ));
  const autoRotateFieldsElement = createElement("div", "inspector-grid two-columns");
  autoRotateFieldsElement.hidden = !autoRotateSettings.enabled;
  const autoRotateRowElement = createElement("div", "i3d-auto-rotate-row"),
    autoRotateDirectionOptionsElement = createElement("div", "navigation-segmented-options");
  (autoRotateDirectionOptionsElement.setAttribute("role", "group"),
    autoRotateDirectionOptionsElement.setAttribute("aria-label", "自动旋转方向"));
  for (const [directionValue, directionLabel] of [
    ["clockwise", "顺时针"],
    ["counterclockwise", "逆时针"],
  ]) {
    const directionButton = createElement("button", "", directionLabel);
    ((directionButton.type = "button"),
      (directionButton.disabled = isViewEditing),
      (directionButton.dataset.direction = directionValue),
      directionButton.classList.toggle("active", autoRotateSettings.direction === directionValue),
      directionButton.setAttribute(
        "aria-pressed",
        String(autoRotateSettings.direction === directionValue),
      ),
      directionButton.addEventListener("click", () => {
        if (!(isViewEditing || autoRotateSettings.direction === directionValue)) {
          autoRotateSettings.direction = directionValue;
          for (const siblingDirectionButton of autoRotateDirectionOptionsElement.children) {
            const isActiveDirection = siblingDirectionButton === directionButton;
            (siblingDirectionButton.classList.toggle("active", isActiveDirection),
              siblingDirectionButton.setAttribute("aria-pressed", String(isActiveDirection)));
          }
          commitBehavior("autoRotate", {
            direction: autoRotateSettings.direction,
          });
        }
      }),
      autoRotateDirectionOptionsElement.append(directionButton));
  }
  (autoRotateRowElement.append(autoRotateToggleLabel, autoRotateDirectionOptionsElement),
    autoRotateSection.append(autoRotateRowElement, autoRotateFieldsElement));
  const createAutoRotateField = (
    autoRotateFieldLabel,
    settingKey,
    minBound,
    maxBound,
    stepSize,
  ) => {
    const autoRotateInput = createElement("input");
    (Object.assign(autoRotateInput, {
      type: "number",
      min: String(minBound),
      max: String(maxBound),
      step: String(stepSize),
      name: "i3d-auto-rotate-" + settingKey,
      value: String(autoRotateSettings[settingKey]),
      disabled: isViewEditing || !autoRotateSettings.enabled,
    }),
      autoRotateInput.addEventListener("change", () => {
        const typedSettingValue = autoRotateInput.valueAsNumber;
        (Number.isFinite(typedSettingValue) &&
          ((autoRotateSettings[settingKey] = Math.max(
            minBound,
            Math.min(
              maxBound,
              settingKey === "idleSeconds" ? Math.round(typedSettingValue) : typedSettingValue,
            ),
          )),
          commitBehavior("autoRotate", {
            [settingKey]: autoRotateSettings[settingKey],
          })),
          (autoRotateInput.value = String(autoRotateSettings[settingKey])));
      }),
      createLabeledField(autoRotateFieldsElement, autoRotateFieldLabel, autoRotateInput));
  };
  (createAutoRotateField("等待时间（秒）", "idleSeconds", 1, 3600, 1),
    createAutoRotateField("旋转速度（°/秒）", "speed", 0.5, 30, 0.5));
  const returnToDefaultLabel = createElement(
      "label",
      "i3d-setting-toggle i3d-view-toggle i3d-return-default",
    ),
    returnToDefaultInput = createElement("input");
  (Object.assign(returnToDefaultInput, {
    name: "i3d-auto-rotate-return-default",
    type: "checkbox",
    checked: autoRotateSettings.returnToDefault,
    disabled: isViewEditing || !autoRotateSettings.enabled,
  }),
    returnToDefaultLabel.append(
      createElement("span", "", "旋转前回到默认视角"),
      returnToDefaultInput,
    ),
    returnToDefaultInput.addEventListener("change", () => {
      returnToDefaultInput.disabled ||
        ((autoRotateSettings.returnToDefault = returnToDefaultInput.checked),
        commitBehavior("autoRotate", {
          returnToDefault: autoRotateSettings.returnToDefault,
        }));
    }),
    autoRotateEnabledInput.addEventListener("change", () => {
      if (!isViewEditing) {
        ((autoRotateSettings.enabled = autoRotateEnabledInput.checked),
          (autoRotateFieldsElement.hidden = !autoRotateSettings.enabled),
          (returnToDefaultInput.disabled = isViewEditing || !autoRotateSettings.enabled));
        for (const autoRotateChildInput of autoRotateFieldsElement.querySelectorAll("input"))
          autoRotateChildInput.disabled = isViewEditing || !autoRotateSettings.enabled;
        commitBehaviorEnabled("autoRotate", autoRotateSettings.enabled);
      }
    }));
  const idleExitSection = createSection("闲置退出聚焦"),
    idleExitSettings = {
      ...resolveCurrentBehavior().idleExitFocus,
    },
    idleExitToggleLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle"),
    idleExitEnabledInput = createElement("input");
  (Object.assign(idleExitEnabledInput, {
    name: "i3d-idle-exit-enabled",
    type: "checkbox",
    checked: idleExitSettings.enabled,
    disabled: isViewEditing,
  }),
    idleExitToggleLabel.append(
      createElement("span", "", "无操作时自动退出"),
      idleExitEnabledInput,
    ));
  const idleExitFieldsElement = createElement("div", "inspector-grid");
  idleExitFieldsElement.hidden = !idleExitSettings.enabled;
  const idleExitSecondsInput = createElement("input");
  (Object.assign(idleExitSecondsInput, {
    name: "i3d-idle-exit-seconds",
    type: "number",
    min: "1",
    max: "3600",
    step: "1",
    value: String(idleExitSettings.idleSeconds),
    disabled: isViewEditing || !idleExitSettings.enabled,
  }),
    idleExitSecondsInput.addEventListener("change", () => {
      idleExitSecondsInput.disabled ||
        (Number.isFinite(idleExitSecondsInput.valueAsNumber) &&
          ((idleExitSettings.idleSeconds = Math.max(
            1,
            Math.min(3600, Math.round(idleExitSecondsInput.valueAsNumber)),
          )),
          commitBehavior("idleExitFocus", {
            idleSeconds: idleExitSettings.idleSeconds,
          })),
        (idleExitSecondsInput.value = String(idleExitSettings.idleSeconds)));
    }),
    idleExitSecondsInput.setAttribute("aria-label", "闲置退出聚焦等待秒数"),
    createLabeledField(idleExitFieldsElement, "等待时间（秒）", idleExitSecondsInput),
    idleExitEnabledInput.addEventListener("change", () => {
      idleExitEnabledInput.disabled ||
        ((idleExitSettings.enabled = idleExitEnabledInput.checked),
        (idleExitFieldsElement.hidden = !idleExitSettings.enabled),
        (idleExitSecondsInput.disabled = isViewEditing || !idleExitSettings.enabled),
        commitBehaviorEnabled("idleExitFocus", idleExitSettings.enabled));
    }),
    idleExitSection.append(idleExitToggleLabel, idleExitFieldsElement));
  const iconVisibilitySection = createSection("图标显示");
  iconVisibilitySection.classList.add("i3d-icon-visibility-row");
  const idleHideIconsSettings = {
      ...resolveCurrentBehavior().idleHideIcons,
    },
    hideIconsToggleLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle"),
    hideIconsEnabledInput = createElement("input");
  (Object.assign(hideIconsEnabledInput, {
    name: "i3d-idle-icons-enabled",
    type: "checkbox",
    checked: idleHideIconsSettings.enabled,
    disabled: isViewEditing,
  }),
    hideIconsToggleLabel.append(
      createElement("span", "", "闲置后隐藏图标"),
      hideIconsEnabledInput,
    ));
  const hideIconsFieldsElement = createElement("div", "inspector-grid");
  hideIconsFieldsElement.hidden = !idleHideIconsSettings.enabled;
  const hideIconsSecondsInput = createElement("input");
  (Object.assign(hideIconsSecondsInput, {
    name: "i3d-idle-icons-seconds",
    type: "number",
    min: "1",
    max: "3600",
    step: "1",
    value: String(idleHideIconsSettings.idleSeconds),
    disabled: isViewEditing || !idleHideIconsSettings.enabled,
  }),
    hideIconsSecondsInput.addEventListener("change", () => {
      (Number.isFinite(hideIconsSecondsInput.valueAsNumber) &&
        ((idleHideIconsSettings.idleSeconds = Math.max(
          1,
          Math.min(3600, Math.round(hideIconsSecondsInput.valueAsNumber)),
        )),
        commitBehavior("idleHideIcons", {
          idleSeconds: idleHideIconsSettings.idleSeconds,
        })),
        (hideIconsSecondsInput.value = String(idleHideIconsSettings.idleSeconds)));
    }),
    hideIconsSecondsInput.setAttribute("aria-label", "隐藏图标等待秒数"),
    createLabeledField(hideIconsFieldsElement, "等待时间（秒）", hideIconsSecondsInput),
    hideIconsEnabledInput.addEventListener("change", () => {
      isViewEditing ||
        ((idleHideIconsSettings.enabled = hideIconsEnabledInput.checked),
        (hideIconsFieldsElement.hidden = !idleHideIconsSettings.enabled),
        (hideIconsSecondsInput.disabled = isViewEditing || !idleHideIconsSettings.enabled),
        commitBehaviorEnabled("idleHideIcons", idleHideIconsSettings.enabled));
    }),
    iconVisibilitySection.append(hideIconsToggleLabel, hideIconsFieldsElement));
  const hideWhileRotatingLabel = createElement("label", "i3d-setting-toggle i3d-view-toggle"),
    hideWhileRotatingInput = createElement("input");
  (Object.assign(hideWhileRotatingInput, {
    type: "checkbox",
    name: "i3d-hide-icons-rotating",
    checked: readBehaviorFlag("hideIconsWhileRotating"),
    disabled: isViewEditing,
  }),
    hideWhileRotatingInput.addEventListener("change", () =>
      commitBehaviorEnabled("hideIconsWhileRotating", hideWhileRotatingInput.checked),
    ),
    hideWhileRotatingLabel.append(
      createElement("span", "", "旋转时隐藏图标"),
      hideWhileRotatingInput,
    ),
    iconVisibilitySection.append(hideWhileRotatingLabel));
  function syncBehaviorControls() {
    behaviorPageRowElement.hidden = behaviorScope !== "page";
    const resolvedBehavior = resolveCurrentBehavior();
    (Object.assign(autoRotateSettings, resolvedBehavior.autoRotate),
      Object.assign(idleExitSettings, resolvedBehavior.idleExitFocus),
      Object.assign(idleHideIconsSettings, resolvedBehavior.idleHideIcons));
    for (const rotationOptionButton of rotationOptionsElement.children) {
      const isActiveRotationOption =
        rotationOptionButton.dataset.rotationMode === resolvedBehavior.interaction.rotationMode;
      (rotationOptionButton.classList.toggle("active", isActiveRotationOption),
        rotationOptionButton.setAttribute("aria-pressed", String(isActiveRotationOption)));
    }
    for (const directionOptionButton of autoRotateDirectionOptionsElement.children) {
      const isActiveDirectionOption =
        directionOptionButton.dataset.direction === autoRotateSettings.direction;
      (directionOptionButton.classList.toggle("active", isActiveDirectionOption),
        directionOptionButton.setAttribute("aria-pressed", String(isActiveDirectionOption)));
    }
    for (const autoRotateFieldInput of autoRotateFieldsElement.querySelectorAll("input"))
      autoRotateFieldInput.value = String(
        autoRotateSettings[autoRotateFieldInput.name.replace("i3d-auto-rotate-", "")],
      );
    ((returnToDefaultInput.checked = autoRotateSettings.returnToDefault),
      (idleExitEnabledInput.checked = idleExitSettings.enabled),
      (idleExitSecondsInput.value = String(idleExitSettings.idleSeconds)),
      (idleExitFieldsElement.hidden = !idleExitSettings.enabled),
      (idleExitSecondsInput.disabled = isViewEditing || !idleExitSettings.enabled),
      (hideIconsSecondsInput.value = String(idleHideIconsSettings.idleSeconds)),
      (autoRotateEnabledInput.checked = autoRotateSettings.enabled),
      (autoRotateFieldsElement.hidden = !autoRotateSettings.enabled),
      (returnToDefaultInput.disabled = isViewEditing || !autoRotateSettings.enabled));
    for (const autoRotateChildFieldInput of autoRotateFieldsElement.querySelectorAll("input"))
      autoRotateChildFieldInput.disabled = isViewEditing || !autoRotateSettings.enabled;
    ((idleHideIconsSettings.enabled = readBehaviorFlag("idleHideIcons")),
      (hideIconsEnabledInput.checked = idleHideIconsSettings.enabled),
      (hideIconsFieldsElement.hidden = !idleHideIconsSettings.enabled),
      (hideIconsSecondsInput.disabled = isViewEditing || !idleHideIconsSettings.enabled),
      (hideWhileRotatingInput.checked = readBehaviorFlag("hideIconsWhileRotating")));
  }
  const displaySection = createSection("画面显示");
  displaySection.classList.add("i3d-picture-settings");
  let lightingMode = normalizeInteraction3dLightingMode(properties.lightingMode);
  const lightingModeSelect = createElement("select");
  ((lightingModeSelect.name = "i3d-lighting-mode"),
    lightingModeSelect.setAttribute("aria-label", "灯光模式"));
  for (const [lightingModeValue, lightingModeLabel] of INTERACTION3D_LIGHTING_MODES) {
    const lightingModeOptionElement = createElement("option", "", lightingModeLabel);
    ((lightingModeOptionElement.value = lightingModeValue),
      lightingModeSelect.append(lightingModeOptionElement));
  }
  ((lightingModeSelect.value = lightingMode),
    createLabeledField(lightEffectsSection, "灯光模式", lightingModeSelect),
    lightingMode !== "region" && lightEffectsSection.append(planRenderButton));
  lightingModeSelect.addEventListener("change", () => {
    const nextLightingMode = normalizeInteraction3dLightingMode(lightingModeSelect.value);
    nextLightingMode === lightingMode ||
      commitChange({
        properties: {
          lightingMode: nextLightingMode,
        },
      });
  });
  const backgroundVisibilityControlElement = createElement("div", "navigation-property-control"),
    backgroundVisibilityOptionsElement = createElement("div", "navigation-segmented-options");
  (backgroundVisibilityOptionsElement.setAttribute("role", "group"),
    backgroundVisibilityOptionsElement.setAttribute("aria-label", "户型底图"));
  for (const [visibilityValue, visibilityLabel] of [
    [true, "显示"],
    [false, "隐藏"],
  ]) {
    const visibilityButton = createElement("button", "", visibilityLabel);
    visibilityButton.type = "button";
    const isActiveVisibility = (properties.backgroundVisible !== false) === visibilityValue;
    (visibilityButton.classList.toggle("active", isActiveVisibility),
      visibilityButton.setAttribute("aria-pressed", String(isActiveVisibility)),
      visibilityButton.addEventListener("click", () => {
        isActiveVisibility ||
          commitChange({
            properties: {
              backgroundVisible: visibilityValue,
            },
          });
      }),
      backgroundVisibilityOptionsElement.append(visibilityButton));
  }
  (backgroundVisibilityControlElement.append(
    createElement("span", "", "户型底图"),
    backgroundVisibilityOptionsElement,
  ),
    displaySection.append(backgroundVisibilityControlElement));
  const sceneStyleSelect = createElement("select");
  ((sceneStyleSelect.name = "i3d-scene-style"),
    sceneStyleSelect.setAttribute("aria-label", "材质风格"));
  for (const [styleValue, styleLabel] of [
    ["default", "默认风格"],
    ["warm-wood", "暖阳原木"],
  ]) {
    const styleOptionElement = createElement("option", "", styleLabel);
    ((styleOptionElement.value = styleValue), sceneStyleSelect.append(styleOptionElement));
  }
  const isWarmWood = properties.sceneStyle === "warm-wood";
  ((sceneStyleSelect.value = isWarmWood ? "warm-wood" : "default"),
    sceneStyleSelect.addEventListener("change", () => {
      if (programmaticControlSet.has(sceneStyleSelect)) return;
      const sceneStyleValue = sceneStyleSelect.value;
      commitChange({
        properties: {
          sceneStyle: sceneStyleValue,
        },
      });
    }),
    createLabeledField(displaySection, "材质风格", sceneStyleSelect));
  const backgroundThemeSelect = createElement("select");
  ((backgroundThemeSelect.name = "i3d-background-theme"),
    backgroundThemeSelect.setAttribute("aria-label", "背景主题"));
  for (const [themeValue, themeLabel] of isWarmWood
    ? [
        ["warm-sunlight", "暖阳微光"],
        ["warm-dusk", "暖阳暮色"],
      ]
    : BACKGROUND_THEMES) {
    const themeOptionElement = createElement("option", "", themeLabel);
    ((themeOptionElement.value = themeValue), backgroundThemeSelect.append(themeOptionElement));
  }
  if (
    ((backgroundThemeSelect.value =
      isWarmWood && ["warm-sunlight", "warm-dusk"].includes(properties.warmBackgroundTheme)
        ? properties.warmBackgroundTheme
        : isWarmWood
          ? "warm-sunlight"
          : normalizeBackgroundTheme(properties.backgroundTheme)),
    (backgroundThemeSelect.disabled = false),
    backgroundThemeSelect.addEventListener("change", () => {
      programmaticControlSet.has(backgroundThemeSelect) ||
        commitChange({
          properties: isWarmWood
            ? {
                warmBackgroundTheme: backgroundThemeSelect.value,
              }
            : {
                backgroundTheme: normalizeBackgroundTheme(backgroundThemeSelect.value),
              },
        });
    }),
    createLabeledField(displaySection, "背景主题", backgroundThemeSelect),
    isWarmWood)
  ) {
    const backgroundMotionToggle = createElement("input");
    ((backgroundMotionToggle.type = "checkbox"),
      (backgroundMotionToggle.name = "i3d-background-motion"),
      (backgroundMotionToggle.checked = properties.backgroundMotion !== false),
      backgroundMotionToggle.setAttribute("aria-label", "背景动态"),
      backgroundMotionToggle.addEventListener("change", () => {
        commitChange({
          properties: {
            backgroundMotion: backgroundMotionToggle.checked,
          },
        });
      }),
      createLabeledField(displaySection, "背景动态", backgroundMotionToggle),
      (backgroundMotionToggle.parentElement.className = "i3d-setting-toggle i3d-view-toggle"));
  }
  backgroundThemeSelect.title = isWarmWood
    ? "随材质风格切换，亮区跟随当前楼层底部；ALL 时跟随最底层。"
    : "微光围绕户型中心渐隐，随视角呈现远近层次。";
  const wallOpacityModeSelect = createElement("select");
  ((wallOpacityModeSelect.name = "i3d-wall-opacity-mode"),
    wallOpacityModeSelect.setAttribute("aria-label", "墙体透明度模式"));
  for (const [opacityModeValue, opacityModeLabel] of [
    ["diy", "沿用户型 DIY"],
    ["custom", "统一调整"],
  ]) {
    const opacityModeOptionElement = createElement("option", "", opacityModeLabel);
    ((opacityModeOptionElement.value = opacityModeValue),
      wallOpacityModeSelect.append(opacityModeOptionElement));
  }
  // 0.32 必须与 3D 工作台 `defaultViewSettings.wallOpacity` 一致：DIY（null）时场景用的就是
  // 那个默认值，而这里切到「统一调整」会把它落成一个显式值 —— 两边不一致会出现「切一下模式
  // 墙的透明度就跳一档」。
  const hasCustomWallOpacity =
    typeof properties.wallOpacity == "number" && Number.isFinite(properties.wallOpacity);
  ((wallOpacityModeSelect.value = hasCustomWallOpacity ? "custom" : "diy"),
    wallOpacityModeSelect.addEventListener("change", () => {
      commitChange({
        properties: {
          wallOpacity:
            wallOpacityModeSelect.value === "custom" ? (properties.wallOpacity ?? 0.32) : null,
        },
      });
    }),
    createLabeledField(displaySection, "墙体透明度", wallOpacityModeSelect));
  const wallOpacityRowElement = createElement("div", "i3d-wall-opacity-row"),
    wallOpacityRangeInput = createElement("input"),
    wallOpacityNumberInput = createElement("input");
  wallOpacityRowElement.hidden = !hasCustomWallOpacity;
  for (const [opacityInput, opacityInputType] of [
    [wallOpacityRangeInput, "range"],
    [wallOpacityNumberInput, "number"],
  ])
    (Object.assign(opacityInput, {
      type: opacityInputType,
      min: "0",
      max: "100",
      step: "1",
      value: String(Math.round((properties.wallOpacity ?? 0.32) * 100)),
      disabled: !hasCustomWallOpacity,
    }),
      opacityInput.setAttribute(
        "aria-label",
        opacityInputType === "range" ? "墙体透明度" : "墙体透明度百分比",
      ),
      opacityInput.addEventListener("input", () => {
        (opacityInput === wallOpacityRangeInput
          ? wallOpacityNumberInput
          : wallOpacityRangeInput
        ).value = opacityInput.value;
      }),
      opacityInput.addEventListener("change", () => {
        const nextOpacityPercent = Number(opacityInput.value);
        Number.isFinite(nextOpacityPercent) &&
          commitChange({
            properties: {
              wallOpacity: Math.max(0, Math.min(100, nextOpacityPercent)) / 100,
            },
          });
      }),
      wallOpacityRowElement.append(opacityInput));
  const wallOpacityUnitElement = createElement("span", "i3d-wall-opacity-unit", "%");
  (wallOpacityRowElement.append(wallOpacityUnitElement),
    (wallOpacityRowElement.title = "0% 全透明，100% 实心；切换风格保留此设置。"),
    displaySection.append(
      wallOpacityRowElement,
      createElement("p", "inspector-section-note", "仅影响当前控件，保留户型 DIY。"),
    ));
  const renderScaleSelect = createElement("select");
  renderScaleSelect.name = "i3d-render-scale";
  for (const [renderScaleValue, renderScaleLabel] of [
    [1.5, "高清 150%"],
    [1, "标准 100%"],
    [0.8, "均衡 80%"],
    [0.75, "均衡 75%"],
    [0.5, "流畅 50%"],
    [0.25, "低负载 25%"],
  ]) {
    const renderScaleOptionElement = createElement("option", "", renderScaleLabel);
    ((renderScaleOptionElement.value = String(renderScaleValue)),
      renderScaleSelect.append(renderScaleOptionElement));
  }
  const renderScaleSection = createSection("渲染分辨率");
  (renderScaleSelect.setAttribute("aria-label", "渲染分辨率"),
    (renderScaleSelect.value = String(properties.renderScale ?? 1)),
    renderScaleSelect.addEventListener("change", async () => {
      if (programmaticControlSet.has(renderScaleSelect)) return;
      const nextRenderScale = Number(renderScaleSelect.value),
        currentRenderScale = properties.renderScale ?? 1;
      (setControlValue(renderScaleSelect, currentRenderScale), (renderScaleSelect.disabled = true));
      try {
        (await confirmChangeWithWarning({
          renderScale: nextRenderScale,
        })) &&
          (await commitChange({
            properties: {
              renderScale: nextRenderScale,
            },
          }));
      } finally {
        renderScaleSelect.disabled = isViewEditing;
      }
    }),
    renderScaleSection.append(renderScaleSelect),
    (renderScaleSelect.title = "画面卡顿时，可降低渲染分辨率。"));
  const motionResolutionSection = createSection("转动分辨率"),
    motionResolutionGridElement = createElement("div", "inspector-grid two-columns"),
    motionModeSelect = createElement("select"),
    motionScaleInput = createElement("input");
  let motionRenderScale =
      typeof properties.motionRenderScale == "number" &&
      Number.isFinite(properties.motionRenderScale)
        ? Math.max(0.25, Math.min(1, properties.motionRenderScale))
        : null,
    lastMotionRenderScale = motionRenderScale ?? 0.75;
  for (const [motionModeValue, motionModeLabel] of [
    ["auto", "自动"],
    ["custom", "自定义"],
  ]) {
    const motionModeOptionElement = createElement("option", "", motionModeLabel);
    ((motionModeOptionElement.value = motionModeValue),
      motionModeSelect.append(motionModeOptionElement));
  }
  ((motionModeSelect.name = "i3d-motion-resolution-mode"),
    motionModeSelect.setAttribute("aria-label", "转动分辨率调整方式"),
    Object.assign(motionScaleInput, {
      name: "i3d-motion-render-scale",
      type: "number",
      min: "25",
      max: "100",
      step: "1",
    }),
    motionScaleInput.setAttribute("aria-label", "转动分辨率百分比"));
  const syncMotionResolutionControls = () => {
      (setControlValue(motionModeSelect, motionRenderScale === null ? "auto" : "custom"),
        (motionModeSelect.disabled = isViewEditing),
        (motionScaleInput.disabled = isViewEditing || motionRenderScale === null),
        (motionScaleInput.value = String(Math.round(lastMotionRenderScale * 100))));
    },
    commitMotionRenderScale = async (nextMotionScale) => {
      motionModeSelect.disabled = motionScaleInput.disabled = true;
      try {
        (await confirmChangeWithWarning({
          motionRenderScale: nextMotionScale,
        })) &&
          (await commitChange({
            properties: {
              motionRenderScale: nextMotionScale,
            },
          }),
          (motionRenderScale = nextMotionScale),
          nextMotionScale !== null && (lastMotionRenderScale = nextMotionScale));
      } catch (motionScaleError) {
        editorOptions.onError?.(motionScaleError);
      } finally {
        syncMotionResolutionControls();
      }
    };
  (motionModeSelect.addEventListener("change", () => {
    programmaticControlSet.has(motionModeSelect) ||
      motionModeSelect.disabled ||
      commitMotionRenderScale(motionModeSelect.value === "auto" ? null : lastMotionRenderScale);
  }),
    motionScaleInput.addEventListener("change", () => {
      if (motionScaleInput.disabled) return;
      const typedMotionPercent =
        motionScaleInput.value.trim() === "" ? NaN : Number(motionScaleInput.value);
      if (!Number.isFinite(typedMotionPercent)) {
        syncMotionResolutionControls();
        return;
      }
      commitMotionRenderScale(Math.max(25, Math.min(100, Math.round(typedMotionPercent))) / 100);
    }),
    createLabeledField(motionResolutionGridElement, "调整方式", motionModeSelect),
    createLabeledField(motionResolutionGridElement, "转动比例（%）", motionScaleInput),
    motionResolutionSection.append(motionResolutionGridElement),
    syncMotionResolutionControls());
  const motionResolutionNote = createElement(
    "p",
    "inspector-section-note",
    "按静止分辨率计算，停止转动后恢复。100% 不降清晰度。",
  );
  motionResolutionSection.append(motionResolutionNote);
  const groundReflectionSection = createSection("地面反射");
  groundReflectionSection.classList.add("i3d-reflection-section");
  let groundReflectionSettings = normalizeGroundReflection(properties.groundReflection);
  const reflectionModeSelect = createElement("select"),
    reflectionResolutionSelect = createElement("select");
  ((reflectionModeSelect.name = "i3d-reflection-mode"),
    reflectionModeSelect.setAttribute("aria-label", "地面反射范围"),
    (reflectionResolutionSelect.name = "i3d-reflection-resolution"),
    reflectionResolutionSelect.setAttribute("aria-label", "反射清晰度"));
  for (const [reflectionModeValue, reflectionModeLabel] of [
    ["off", "关闭"],
    ["inside", "室内"],
    ["outside", "室外"],
    ["all", "室内＋室外"],
  ]) {
    const reflectionModeOptionElement = createElement("option", "", reflectionModeLabel);
    ((reflectionModeOptionElement.value = reflectionModeValue),
      reflectionModeSelect.append(reflectionModeOptionElement));
  }
  for (const [reflectionResolutionValue, reflectionResolutionLabel] of [
    [256, "低"],
    [512, "中"],
    [768, "高"],
  ]) {
    const reflectionResolutionOptionElement = createElement(
      "option",
      "",
      reflectionResolutionLabel,
    );
    ((reflectionResolutionOptionElement.value = String(reflectionResolutionValue)),
      reflectionResolutionSelect.append(reflectionResolutionOptionElement));
  }
  ((reflectionModeSelect.value = groundReflectionSettings.mode),
    (reflectionResolutionSelect.value = String(groundReflectionSettings.resolution)));
  const reflectionOptionsElement = createElement("div", "i3d-reflection-options");
  (createLabeledField(reflectionOptionsElement, "范围", reflectionModeSelect),
    createLabeledField(reflectionOptionsElement, "清晰度", reflectionResolutionSelect));
  const reflectionStrengthSettingElement = createElement("div", "i3d-vignette-setting"),
    reflectionStrengthInput = createElement("input"),
    reflectionStrengthOutputElement = createElement("output");
  (Object.assign(reflectionStrengthInput, {
    name: "i3d-reflection-strength",
    type: "range",
    min: "0",
    max: "45",
    step: "1",
    value: String(Math.round(groundReflectionSettings.strength * 100)),
  }),
    reflectionStrengthInput.setAttribute("aria-label", "反射强度"),
    (reflectionStrengthOutputElement.textContent = reflectionStrengthInput.value + "%"),
    reflectionStrengthSettingElement.append(
      reflectionStrengthInput,
      reflectionStrengthOutputElement,
    ),
    groundReflectionSection.append(reflectionOptionsElement),
    createLabeledField(groundReflectionSection, "强度", reflectionStrengthSettingElement));
  const syncReflectionControls = () => {
      ((reflectionModeSelect.disabled = isViewEditing),
        (reflectionResolutionSelect.disabled = reflectionStrengthInput.disabled =
          isViewEditing || groundReflectionSettings.mode === "off"));
    },
    commitGroundReflection = async (changeEvent) => {
      if (programmaticControlSet.has(changeEvent?.target)) return;
      const nextGroundReflection = normalizeGroundReflection({
        mode: reflectionModeSelect.value,
        resolution: Number(reflectionResolutionSelect.value),
        strength: Number(reflectionStrengthInput.value) / 100,
      });
      (setControlValue(reflectionModeSelect, groundReflectionSettings.mode),
        setControlValue(reflectionResolutionSelect, groundReflectionSettings.resolution),
        (reflectionStrengthInput.value = String(
          Math.round(groundReflectionSettings.strength * 100),
        )),
        (reflectionStrengthOutputElement.textContent = reflectionStrengthInput.value + "%"),
        (reflectionModeSelect.disabled =
          reflectionResolutionSelect.disabled =
          reflectionStrengthInput.disabled =
            true));
      try {
        if (
          !(await confirmChangeWithWarning({
            groundReflection: nextGroundReflection,
          }))
        )
          return;
        await commitChange({
          properties: {
            groundReflection: {
              ...nextGroundReflection,
            },
          },
        });
      } finally {
        ((reflectionModeSelect.disabled = isViewEditing), syncReflectionControls());
      }
    };
  (reflectionModeSelect.addEventListener("change", commitGroundReflection),
    reflectionResolutionSelect.addEventListener("change", commitGroundReflection),
    reflectionStrengthInput.addEventListener("input", () => {
      reflectionStrengthOutputElement.textContent = reflectionStrengthInput.value + "%";
    }),
    reflectionStrengthInput.addEventListener("change", commitGroundReflection),
    syncReflectionControls());
  const popupSettingsSection = createElement("section", "inspector-section i3d-popup-settings"),
    popupLayout = structuredClone(properties.popupLayout || {});
  for (const [popupPresetKey, popupPresetLabel] of [
    ["general", "通用弹窗"],
    ["camera", "摄像头弹窗"],
  ]) {
    const popupGroupSection = createElement("section", "i3d-popup-setting-group"),
      popupHeadingElement = createElement("div", "i3d-popup-setting-heading");
    (popupHeadingElement.append(createElement("h4", "", popupPresetLabel)),
      popupGroupSection.append(popupHeadingElement),
      popupSettingsSection.append(popupGroupSection));
    const popupPresetConfig: PopupPresetConfig = {
        scale: 1,
        ...popupLayout[popupPresetKey],
      },
      previewPopupLayout = (previewLayout = popupPresetConfig) => {
        isViewEditing ||
          getInteraction3dEditorView(targetComponent.id)?.previewPopupLayout?.(popupPresetKey, {
            ...previewLayout,
          });
      },
      previewPopupButton = createElement("button", "secondary-button", "预览");
    ((previewPopupButton.type = "button"),
      (previewPopupButton.disabled = isViewEditing),
      previewPopupButton.setAttribute("aria-label", "预览" + popupPresetLabel),
      previewPopupButton.addEventListener("click", () => previewPopupLayout()),
      popupHeadingElement.append(previewPopupButton));
    const popupScaleInput = createElement("input"),
      popupScaleOutputElement = createElement("output"),
      popupScaleSettingElement = createElement("div", "i3d-vignette-setting");
    (Object.assign(popupScaleInput, {
      name: "i3d-popup-" + popupPresetKey + "-scale",
      type: "range",
      min: "50",
      max: "1000",
      step: "5",
      value: String(Math.round(popupPresetConfig.scale * 100)),
      disabled: isViewEditing,
    }),
      popupScaleInput.setAttribute("aria-label", popupPresetLabel + "大小"),
      (popupScaleOutputElement.textContent = popupScaleInput.value + "%"),
      popupScaleSettingElement.append(popupScaleInput, popupScaleOutputElement),
      createLabeledField(popupGroupSection, "等比例大小", popupScaleSettingElement));
    const popupCustomPositionInput = createElement("input");
    (Object.assign(popupCustomPositionInput, {
      name: "i3d-popup-" + popupPresetKey + "-custom",
      type: "checkbox",
      checked: Number.isFinite(popupPresetConfig.x) || Number.isFinite(popupPresetConfig.y),
      disabled: isViewEditing,
    }),
      popupCustomPositionInput.setAttribute("aria-label", popupPresetLabel + "自定义位置"),
      createLabeledField(popupGroupSection, "自定义位置", popupCustomPositionInput),
      (popupCustomPositionInput.parentElement.className = "i3d-setting-toggle i3d-view-toggle"));
    const popupPositionElement = createElement("div", "i3d-popup-position");
    popupGroupSection.append(popupPositionElement);
    const popupPositionInputsByAxis: Record<string, DomControl> = {},
      commitPopupLayout = () => {
        (previewPopupLayout(),
          (popupLayout[popupPresetKey] = {
            ...popupPresetConfig,
          }),
          commitChange({
            properties: {
              popupLayout: structuredClone(popupLayout),
            },
          }));
      },
      syncPopupPositionControls = () => {
        popupPositionElement.hidden = !popupCustomPositionInput.checked;
        for (const popupPositionInput of Object.values(popupPositionInputsByAxis))
          popupPositionInput.disabled = isViewEditing || !popupCustomPositionInput.checked;
      };
    for (const [popupAxisKey, popupAxisLabel, popupAxisDefault] of [
      ["x", "横向", 100],
      ["y", "纵向", 0],
    ]) {
      const popupAxisInput = createElement("input");
      ((popupPositionInputsByAxis[popupAxisKey] = popupAxisInput),
        Object.assign(popupAxisInput, {
          name: "i3d-popup-" + popupPresetKey + "-" + popupAxisKey,
          type: "range",
          min: "0",
          max: "100",
          step: "1",
          value: String(popupPresetConfig[popupAxisKey] ?? popupAxisDefault),
        }),
        popupAxisInput.setAttribute(
          "aria-label",
          "" + popupPresetLabel + (popupAxisKey === "x" ? "横向位置" : "纵向位置"),
        ));
      const popupAxisOutputElement = createElement("output"),
        popupAxisSettingElement = createElement("div", "i3d-vignette-setting");
      ((popupAxisOutputElement.textContent = popupAxisInput.value + "%"),
        popupAxisSettingElement.append(popupAxisInput, popupAxisOutputElement),
        popupAxisInput.addEventListener("input", () => {
          popupAxisInput.disabled ||
            ((popupAxisOutputElement.textContent = popupAxisInput.value + "%"),
            previewPopupLayout({
              ...popupPresetConfig,
              [popupAxisKey]: Number(popupAxisInput.value),
            }));
        }),
        popupAxisInput.addEventListener("change", () => {
          if (popupAxisInput.disabled) return;
          const typedPopupPosition =
            popupAxisInput.value.trim() === "" ? NaN : Number(popupAxisInput.value);
          if (!Number.isFinite(typedPopupPosition)) {
            popupAxisInput.value = String(popupPresetConfig[popupAxisKey] ?? popupAxisDefault);
            return;
          }
          ((popupPresetConfig[popupAxisKey] = Math.max(0, Math.min(100, typedPopupPosition))),
            (popupAxisInput.value = String(popupPresetConfig[popupAxisKey])),
            (popupAxisOutputElement.textContent = popupAxisInput.value + "%"),
            commitPopupLayout());
        }),
        createLabeledField(popupPositionElement, popupAxisLabel, popupAxisSettingElement));
    }
    (popupCustomPositionInput.addEventListener("change", () => {
      popupCustomPositionInput.disabled ||
        (popupCustomPositionInput.checked
          ? ((popupPresetConfig.x = Number(popupPositionInputsByAxis.x.value)),
            (popupPresetConfig.y = Number(popupPositionInputsByAxis.y.value)))
          : (delete popupPresetConfig.x, delete popupPresetConfig.y),
        syncPopupPositionControls(),
        commitPopupLayout());
    }),
      popupScaleInput.addEventListener("input", () => {
        ((popupScaleOutputElement.textContent = popupScaleInput.value + "%"),
          popupScaleInput.disabled ||
            previewPopupLayout({
              ...popupPresetConfig,
              scale: Number(popupScaleInput.value) / 100,
            }));
      }),
      popupScaleInput.addEventListener("change", () => {
        if (popupScaleInput.disabled) return;
        const typedPopupScale = Number(popupScaleInput.value);
        Number.isFinite(typedPopupScale) &&
          ((popupPresetConfig.scale = Math.max(0.5, Math.min(10, typedPopupScale / 100))),
          commitPopupLayout());
      }));
    const resetPopupPresetButton = createElement("button", "secondary-button", "恢复默认");
    ((resetPopupPresetButton.type = "button"),
      (resetPopupPresetButton.disabled = isViewEditing),
      resetPopupPresetButton.setAttribute(
        "aria-label",
        "恢复" + popupPresetLabel + "默认大小和位置",
      ),
      resetPopupPresetButton.addEventListener("click", () => {
        if (!resetPopupPresetButton.disabled) {
          (delete popupLayout[popupPresetKey],
            (popupPresetConfig.scale = 1),
            delete popupPresetConfig.x,
            delete popupPresetConfig.y,
            (popupScaleInput.value = "100"),
            (popupScaleOutputElement.textContent = "100%"),
            (popupCustomPositionInput.checked = false),
            (popupPositionInputsByAxis.x.value = "100"),
            (popupPositionInputsByAxis.y.value = "0"),
            syncPopupPositionControls());
          for (const popupAxisControl of Object.values(popupPositionInputsByAxis))
            popupAxisControl.parentElement.children[1].textContent = popupAxisControl.value + "%";
          (previewPopupLayout(),
            commitChange({
              properties: {
                popupLayout: structuredClone(popupLayout),
              },
            }));
        }
      }),
      popupHeadingElement.append(resetPopupPresetButton),
      syncPopupPositionControls());
  }
  const closePreviewButton = createElement(
    "button",
    "secondary-button i3d-popup-preview-close",
    "关闭预览",
  );
  ((closePreviewButton.type = "button"),
    closePreviewButton.addEventListener("click", () =>
      getInteraction3dEditorView(targetComponent.id)?.closePopupLayoutPreview?.(),
    ),
    popupSettingsSection.append(closePreviewButton));
  const popupTransparencySettingElement = createElement("div", "i3d-vignette-setting"),
    popupTransparencyInput = createElement("input"),
    popupTransparencyOutputElement = createElement("output"),
    popupTransparency =
      100 -
      (Number.isFinite(properties.popupOpacity)
        ? Math.max(0, Math.min(100, properties.popupOpacity))
        : 74);
  if (
    (Object.assign(popupTransparencyInput, {
      name: "i3d-popup-transparency",
      type: "range",
      min: "0",
      max: "100",
      step: "1",
      value: String(popupTransparency),
    }),
    popupTransparencyInput.setAttribute("aria-label", "弹窗透明度"),
    (popupTransparencyOutputElement.textContent = popupTransparency + "%"),
    popupTransparencyInput.addEventListener("input", () => {
      popupTransparencyOutputElement.textContent = popupTransparencyInput.value + "%";
    }),
    popupTransparencyInput.addEventListener("change", () => {
      const typedPopupTransparency = Math.max(
        0,
        Math.min(100, Number(popupTransparencyInput.value)),
      );
      Number.isFinite(typedPopupTransparency) &&
        commitChange({
          properties: {
            popupOpacity: 100 - typedPopupTransparency,
          },
        });
    }),
    popupTransparencySettingElement.append(popupTransparencyInput, popupTransparencyOutputElement),
    createLabeledField(popupSettingsSection, "弹窗透明度", popupTransparencySettingElement),
    isViewEditing)
  ) {
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
      popupSettingsSection,
    ])
      for (const disabledControl of disabledSection.querySelectorAll("input, select, button"))
        disabledControl.disabled = true;
  }
  for (const categorySection of [
    lightsSection,
    environmentSection,
    devicesSection,
    vacuumSection,
    securitySection,
  ])
    categorySection.classList.add("i3d-category-entry");
  for (const inlineSection of [
    houseSection,
    layoutSection,
    lightsSection,
    environmentSection,
    devicesSection,
    vacuumSection,
    securitySection,
    lightEffectsSection,
    renderScaleSection,
  ])
    inlineSection.classList.add("i3d-inline-section");
  (houseSection.classList.add("i3d-house-section"),
    layoutSection.classList.add("i3d-placement-section"),
    lightEffectsSection.classList.add("i3d-light-effects-row"),
    (lightingModeSelect.parentElement.children[0].hidden = true));
  for (const inspectorSubsectionElement of [
    autoRotateSection,
    idleExitSection,
    iconVisibilitySection,
  ])
    inspectorSubsectionElement.classList.add("i3d-inspector-subsection");
  for (const [idleSubsectionElement, idleWaitElement] of [
    [idleExitSection, idleExitFieldsElement],
    [iconVisibilitySection, hideIconsFieldsElement],
  ])
    (idleSubsectionElement.classList.add("i3d-idle-inline"),
      idleWaitElement.classList.add("i3d-idle-wait"),
      (idleWaitElement.children[0].children[0].textContent = "秒"));
  idleExitToggleLabel.children[0].textContent = "闲置时退出聚焦";
  const behaviorRowElement = createElement("div", "i3d-behavior-row i3d-inspector-subsection");
  (idleExitSection.classList.remove("i3d-inspector-subsection"),
    autoRotateSection.append(returnToDefaultLabel),
    behaviorRowElement.append(idleExitSection),
    behaviorSection.append(autoRotateSection, behaviorRowElement, iconVisibilitySection));
  const appendInspectorGroup = (groupKey, groupTitle, groupChildren) => {
    const detailsGroupElement = createElement("details", "i3d-inspector-group");
    ((detailsGroupElement.dataset.inspectorGroup = groupKey),
      (detailsGroupElement.open = openStateByGroup.get(groupKey) ?? false),
      detailsGroupElement.append(createElement("summary", "", groupTitle), ...groupChildren),
      interaction3dInspectorElement.append(detailsGroupElement),
      groupKey === "popups" &&
        detailsGroupElement.addEventListener("toggle", () => {
          !detailsGroupElement.open &&
            detailsGroupElement.isConnected &&
            getInteraction3dEditorView(targetComponent.id)?.closePopupLayoutPreview?.();
        }));
  };
  (appendInspectorGroup("layout", "户型与布局", [houseSection, layoutSection, displaySection]),
    appendInspectorGroup("devices", "设备配置", [
      lightsSection,
      environmentSection,
      devicesSection,
      vacuumSection,
      securitySection,
    ]),
    appendInspectorGroup("appearance", "画面效果", [
      lightEffectsSection,
      renderScaleSection,
      motionResolutionSection,
      groundReflectionSection,
    ]),
    appendInspectorGroup("view", "视角与导航", [viewSection, navigationSection]),
    appendInspectorGroup("popups", "弹窗大小与位置", [popupSettingsSection]),
    (behaviorSection.children[0].hidden = true),
    appendInspectorGroup("interaction", "交互行为", [behaviorSection]),
    sceneState.refresh(),
    editorOptions.enhanceControls?.(interaction3dInspectorElement),
    (interaction3dInspectorElement.style.minHeight = previousMinHeight),
    isSameComponentOpen &&
      ((hostElement.scrollTop = previousScrollTop),
      focusedControlName &&
        [...interaction3dInspectorElement.querySelectorAll<DomControl>("input,select")]
          .find((focusCandidate) => focusCandidate.name === focusedControlName)
          ?.focus({
            preventScroll: true,
          })),
    !properties.sceneId && sceneState.state === "idle" && loadScene());
}
