/**
 * 3D 交互组件的属性面板（inspector）。
 *
 * 位置：编辑器侧边栏的入口，负责把「一个 interaction3d 组件」的属性渲染成表单，
 *   并处理权限校验、户型载入、楼层视角、渲染质量、压暗与弹窗等分组设置。
 *   面板内所有「配置设备 / 灯光 / 环境 / 安防 / 扫地机」按钮都只是拉取懒加载编辑器，
 *   真正复杂的设备选择逻辑不在这里。
 * 对外导出：interaction3dEntries、changesInteraction3d、guardInteraction3dChanges、
 *   renderInteraction3dThumbnail、updateInteraction3dCard、requestInteraction3dScene、
 *   renderInteraction3dInspector。
 * 全局约定：
 *   - 改动一律通过 editorOptions.onChange(patch) 提交，patch 形如 { properties, position, style }；
 *     需要整段替换属性时额外传 { replaceProperties: true }；
 *   - 组件的渲染结果不会即时回传，面板通过 editorOptions.prepareCanvas() +
 *     waitInteraction3dEditorView(componentId) 拿到「已挂载的视图句柄」再下命令；
 *   - 户型 ID（sceneId）是 32 位十六进制，由后端签发，面板只做格式校验不做语义解析。
 * 副作用：发起授权校验与户型载入请求，动态 import 各子编辑器模块，并直接操作宿主 DOM。
 */
import { resolvePageBehavior } from "./page-behavior.js?v=20260918233037";
import {
  performanceWarnings,
  confirmPerformanceWarning
} from "./performance-warning.js?v=20260918233037";
import { normalizeGroundReflection } from "./reflection-settings.js?v=20260918233037";
import {
  requestInteraction3dAccess,
  getInteraction3dEditorView,
  waitInteraction3dEditorView,
  cancelOtherInteraction3dViews
} from "./bridge.js?v=20260918233037";
import {
  createInteraction3dCover,
  updateInteraction3dCoverMessage
} from "./cover.js?v=20260918233037";
import { withRequestTimeout } from "../../utils/request-timeout.js?v=20260918233037";
import {
  INTERACTION3D_LIGHTING_MODES,
  normalizeInteraction3dLightingMode,
  BACKGROUND_THEMES,
  normalizeBackgroundTheme
} from "./definition.js?v=20260918233037";
/**
 * 递归收集组件树里的 interaction3d 组件。
 *
 * 用「路径片段数组」的 JSON 串当键：同一个组件可能被页面与共享组件引用，
 * 路径才是它在文档里的唯一位置，仅靠 id 无法区分。
 *
 * @param {any} componentTree 组件树（数组或对象）。
 * @param {Array<string>} [pathSegments] 当前递归到的路径。
 * @param {Map<string, object>} [entriesByPath] 累积结果。
 * @returns {Map<string, object>} 路径 → 组件。
 */
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
      // 命中即止，不再往组件内部递归（内部不会再嵌套 3D 交互组件）。
      entriesByPath.set(JSON.stringify(pathSegments), componentTree);
      return entriesByPath;
    }
    for (const [propertyKey, propertyValue] of Object.entries(componentTree)) {
      interaction3dEntries(propertyValue, [...pathSegments, propertyKey], entriesByPath);
    }
  }
  return entriesByPath;
}
// 用于判断「保存前后的 3D 交互配置是否变了」的深比较；
// 只需要正确性，不需要处理循环引用（项目文档是纯 JSON 树）。
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
// 比较前剥掉 position.zIndex：它纯粹是画布层叠序，改动它不该触发重新授权校验。
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
/**
 * 判断两个项目版本之间「3D 交互相关内容」是否发生变化。
 *
 * 用于决定保存前是否需要重新做一次授权校验（3D 交互是受限功能）。
 * 除了组件属性，还要看「页面是否新引用了含 3D 交互的共享组件」——
 * 这种情况组件本身没变，但新的页面上会出现 3D 交互。
 *
 * @param {object} previousProject 旧项目文档。
 * @param {object} nextProject 新项目文档。
 * @returns {boolean} 有变化为 true。
 */
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
  // 只关心「本身含 3D 交互」的共享组件，其余共享组件引用变化与本功能无关。
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
/**
 * 保存前守卫：涉及 3D 交互内容的改动必须先通过授权校验。
 *
 * @param {object} currentProject 当前项目文档。
 * @param {object} incomingProject 即将保存的项目文档。
 * @returns {Promise<void>} 无返回；无变化时直接返回，有变化时校验失败会抛错以阻断保存。
 * @throws {Error} 授权校验失败（如 403）时抛出。
 */
export async function guardInteraction3dChanges(currentProject, incomingProject) {
  if (changesInteraction3d(currentProject, incomingProject)) {
    await requestInteraction3dAccess();
  }
}
// 组件卡片上的缩略图：统一套用封面样式，保证与画布上的占位外观一致。
export function renderInteraction3dThumbnail(thumbnailButton) {
  thumbnailButton.classList.add("interaction3d-thumbnail");
  thumbnailButton.append(createInteraction3dCover());
}
// 每张卡片的授权状态单独记：状态对象还兼任「本次异步流程是否已被新的流程取代」的凭据，
// 因此一旦重新开始校验就换新对象，旧回调靠身份比较自动失效。
const cardStateByButton = new WeakMap();
/**
 * 刷新组件卡片按钮的可用状态（授权校验 + 文案）。
 *
 * @param {HTMLElement} cardButton 组件卡片按钮。
 * @returns {Promise<void>} 无返回；失败时以文案形式反馈，不抛错。
 */
export async function updateInteraction3dCard(cardButton) {
  const cardState = {
    // 保留上一次「已确认无权限」的结论：无权限是稳定状态，不必每次重试都先闪一次加载文案。
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
    // 期间若卡片被重新渲染（状态对象被替换），本次结果已经过期，不能再改 DOM。
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
    // 403 视为「这套部署没有该功能」，封面上直接说明原因；
    // 401 只是登录过期，提示重新登录即可，不要让用户以为功能不可用。
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
// 户型载入状态按「项目 + 组件」缓存：同一个组件反复打开面板时，
// 只有第一次需要请求，也让「正在载入 / 失败」这类过程状态在面板重建后仍然可见。
const sceneStateByKey = new Map();
// 每个宿主元素一份 AbortController：面板重建时会中断上一次仍在飞的校验 / 弹窗流程。
const inspectorAbortByHost = new WeakMap();
/**
 * 向后端申请一个新的户型场景 ID。
 *
 * @returns {Promise<{sceneId: string}>} 新签发的 sceneId。
 * @throws {Error} 请求失败、超时或返回体不符合约定（非 32 位十六进制）时抛出中文错误。
 */
export async function requestInteraction3dScene() {
  // 户型解析在后端做，耗时不可控，因此必须带超时，否则面板会一直停在「正在载入」。
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
    // sceneId 是后端签发的 32 位十六进制；格式不对说明拿到的不是正常响应
    // （例如被登录页 / 网关改写），此时宁可当作失败，也不能把脏值写进组件属性。
    if (!/^[0-9a-f]{32}$/.test(responseBody.sceneId || "")) {
      throw new Error("户型载入失败，请重试。");
    }
    return {
      sceneId: responseBody.sceneId
    };
  });
}
/**
 * 渲染（或重建）3D 交互组件的属性面板。
 *
 * 面板采用「整块重建」策略：任何影响结构的改动都会重新走一遍本函数，
 * 因此下面刻意保存并恢复滚动位置、焦点控件名与最小高度，避免重建造成视觉跳动。
 *
 * @param {HTMLElement} hostElement 面板宿主容器。
 * @param {object} targetComponent 当前选中的组件；非 interaction3d 时用于隐藏面板。
 * @param {object} editorOptions 编辑器回调：onChange / onError / document / entities /
 *   states / pickers / prepareCanvas / enhanceControls 等。
 * @returns {void}
 */
export function renderInteraction3dInspector(hostElement, targetComponent, editorOptions) {
  // 每次重建都作废旧面板的在途异步流程（授权校验、性能告警弹窗等），
  // 否则它们会在新面板上写入已经过期的状态。
  inspectorAbortByHost.get(hostElement)?.abort();
  const inspectorAbortController = new AbortController();
  inspectorAbortByHost.set(hostElement, inspectorAbortController);
  // 3D 视口同一时刻只服务一个组件：切到别的组件时要先把其它视图关掉。
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
  // 「同一个组件重新打开」时要尽量保持视觉位置：记住滚动、焦点与高度。
  const isSameComponentOpen =
    !inspectorElement.hidden && inspectorElement.dataset.componentId === targetComponent?.id;
  const previousScrollTop = hostElement.scrollTop;
  const focusedControlName = inspectorElement.contains(document.activeElement)
    ? document.activeElement.name
    : "";
  const previousMinHeight = inspectorElement.style.minHeight;
  if (isSameComponentOpen) {
    // 先锁住当前高度，重建后内容高度可能短暂变小，导致面板塌陷再弹回。
    inspectorElement.style.minHeight = inspectorElement.getBoundingClientRect().height + "px";
  }
  inspectorElement.hidden = targetComponent?.type !== "interaction3d";
  if (inspectorElement.hidden) {
    inspectorElement.style.minHeight = previousMinHeight;
    return;
  }
  inspectorElement.dataset.componentId = targetComponent.id;
  // 折叠状态按 group 名记忆：重建后同名的分组保持原来的展开 / 收起。
  const openStateByGroup = new Map(
    [...inspectorElement.querySelectorAll("details")]
      .filter(detailsElement => detailsElement.dataset.inspectorGroup)
      .map(detailsEntry => [detailsEntry.dataset.inspectorGroup, detailsEntry.open])
  );
  inspectorElement.replaceChildren();
  // 面板重建时的统一元素工厂：所有子节点都经它创建，保证 className 与文本的赋值口径一致。
  const createElement = (tagName, className = "", textContent = "") => {
    // 文本一律用 textContent 赋值，避免面板里的用户数据（设备名等）被当作 HTML 解析。
    const createdElement = document.createElement(tagName);
    createdElement.className = className;
    createdElement.textContent = textContent;
    return createdElement;
  };
  // 新建一个带标题的 section 并挂到面板根节点，返回该 section 供调用方继续追加内容。
  const createSection = sectionTitle => {
    const sectionElement = createElement("section", "inspector-section");
    sectionElement.append(createElement("h3", "", sectionTitle));
    inspectorElement.append(sectionElement);
    return sectionElement;
  };
  // 把「标题 + 控件」包成一个 <label> 挂到容器上，点击标题文字即可聚焦 / 切换控件。
  const createLabeledField = (containerElement, labelText, controlElement) => {
    const labelElement = createElement("label");
    labelElement.append(createElement("span", "", labelText), controlElement);
    containerElement.append(labelElement);
    return controlElement;
  };
  // 统一把异步提交的失败交给宿主：面板不弹自己的错误 UI，保持与其它面板一致。
  const commitChange = propertiesPatch =>
    Promise.resolve(editorOptions.onChange(propertiesPatch)).catch(changeError =>
      editorOptions.onError?.(changeError)
    );
  const properties = targetComponent.properties || {};
  const position = targetComponent.position || {};
  // 以代码方式同步控件值时（如提交失败、外部状态回滚）会重新派发 change 事件，
  // 用这个弱集合标记「本次 change 是自己造的」，各监听器据此忽略，防止回环提交。
  const programmaticControls = new WeakSet();
  // 以代码方式写回控件值：先登记进 programmaticControls 再派发 change，
  // 各监听器据此识别「这次 change 是自己造的」并跳过，避免提交回环。
  const setControlValue = (inputControl, nextValue) => {
    inputControl.value = String(nextValue);
    // 标记期间派发的 change 必须被自家监听器忽略，否则会再次提交同一份改动。
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
  // 提交前的最后一道门：高负载设置需要用户确认；同时确认过程可能耗时，
  // 因此结束后还要复核面板是否仍是同一个组件的、且没被关闭 —— 否则放弃这次提交。
  const confirmChangeWithWarning = async pendingProperties =>
    (await confirmPerformanceWarning(performanceWarnings(properties, pendingProperties), {
      document: document,
      signal: inspectorAbortController.signal
    })) &&
    !inspectorAbortController.signal.aborted &&
    !inspectorElement.hidden &&
    inspectorElement.dataset.componentId === targetComponent.id;
  // 布局面板里的旋转设置也会写进 component.properties.interaction，
  // 这里先取一份用于「调整视角」时回写，避免把用户的交互配置覆盖成默认值。
  const interactionSettings = {
    rotationMode: properties.interaction?.rotationMode || properties.camera?.rotationMode || "free",
    panEnabled: false,
    zoomEnabled: false
  };
  const editorView = getInteraction3dEditorView(targetComponent.id);
  // 视角调整模式下，面板上绝大部分设置都会禁用：此刻用户在拖 3D 视口，改属性会互相干扰。
  const isViewEditing = !!editorView?.viewEditing;
  // 百分比输入需要换算像素，因此必须知道画布与组件的实际尺寸；
  // 默认值对应后端的默认画布（2778×1940），避免文档里缺字段时算出 NaN。
  const sourceCanvas = editorOptions.document?.canvas || {};
  const canvasWidthPx = Number(sourceCanvas.width || 2778);
  const canvasHeightPx = Number(sourceCanvas.height || 1940);
  const componentWidthPx = Number(position.width || 100);
  const componentHeightPx = Number(position.height || 100);
  const layoutSection = createSection("布局与位置");
  const layoutModeGroupElement = createElement("div", "image-layout-options");
  layoutModeGroupElement.setAttribute("role", "group");
  layoutModeGroupElement.setAttribute("aria-label", "3D 交互布局");
  // 布局模式只有自由 / 铺满两种：铺满时位置与尺寸都由宿主决定，相关输入要整体禁用。
  const isFillLayout = properties.layoutMode === "fill";
  for (const [layoutModeValue, layoutModeLabel] of [
    ["free", "自由"],
    ["fill", "铺满"]
  ]) {
    const layoutModeButton = createElement("button", "", layoutModeLabel);
    layoutModeButton.type = "button";
    layoutModeButton.dataset.interaction3dLayout = layoutModeValue;
    // 未显式声明 layoutMode（或写了非法值）时按自由布局处理，与渲染端默认值保持一致。
    const isActiveLayoutMode = (isFillLayout ? "fill" : "free") === layoutModeValue;
    layoutModeButton.classList.toggle("active", isActiveLayoutMode);
    layoutModeButton.setAttribute("aria-pressed", String(isActiveLayoutMode));
    // 已是当前项就不重复提交，避免产生无意义的文档改动与保存。
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
  // 位置 / 尺寸对用户按百分比呈现（与设计稿一致），提交时再换算回画布像素；
  // 数值统一夹在 [min,max] 内，避免手输越界值把组件推出画布。
  const createPercentInput = (fieldLabel, fieldValue, minValue, maxValue, buildPatch) => {
    const fieldInputElement = createElement("input");
    Object.assign(fieldInputElement, {
      name: "i3d-position-" + fieldLabel,
      type: "number",
      min: String(minValue),
      max: String(maxValue),
      step: ".1",
      // 保留一位小数即可，避免浮点换算结果在输入框里出现一长串尾数。
      value: String(Math.round(fieldValue * 10) / 10),
      disabled: isFillLayout
    });
    fieldInputElement.addEventListener("change", () => {
      // 空值 / 非法输入时什么都不做，让输入框保持原样由用户修正。
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
    // position 存的是左上角坐标，而用户填写的是中心点位置，因此这里要加上半个宽 / 高。
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
  // role=status 让屏幕阅读器在状态变化时自动播报（载入中 / 失败原因）。
  houseStatusElement.setAttribute("role", "status");
  // 过程状态按「项目 + 组件」缓存：面板重建（每次改属性都会重建）不应该把
  // 「正在载入」或失败原因丢掉，也不该重复发起请求。
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
  // 让宿主先把画布准备好（3D 视图需要挂到画布上），再等待视图句柄就绪。
  const ensureEditorView = async () => {
    editorOptions.prepareCanvas?.();
    viewStatusElement.hidden = false;
    viewStatusElement.textContent = "正在准备户型…";
    const readyView = await waitInteraction3dEditorView(targetComponent.id);
    // 等待期间面板可能已被关闭或切到别的组件，此时不能把句柄交回去。
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
      // 渲染外观编辑器会读写后端资源，打开前再校验一次授权。
      await requestInteraction3dAccess();
      // 子编辑器体积大且只在点击时才用得上，用动态 import 拆包。
      const { openInteraction3dAppearanceEditor: openAppearanceEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260918233037");
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
  // 设备 / 扫地机 / 灯光 / 环境这几个子编辑器都在维护「同一份 properties 的一组字段」，
  // 因此保存时用 replaceProperties 整段替换：子编辑器内部会自行清理被移除的字段，
  // 若只做浅合并，删掉的设备配置会残留下来。
  configureDevicesButton.addEventListener("click", async () => {
    configureDevicesButton.disabled = true;
    try {
      const { openInteraction3dEditor: openDevicesEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260918233037");
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
      // 安防编辑器会接触摄像头相关配置，同样先做一次授权校验。
      await requestInteraction3dAccess();
      const { openSecurityEditor: openSecurityEditor } =
        await import("/api/v1/modules/interaction3d/security-editor.js?v=20260918233037");
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
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260918233037");
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
  // 户型的「依赖状态」集中在一处刷新：所有按钮的可用性都由 sceneId 是否存在、
  // 以及是否处于视角调整模式决定，避免各处重复判断导致状态不一致。
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
  // 请求后端签发户型（sceneId）并写回组件属性；state / error 只影响提示与按钮可用性，
  // 由 sceneState.refresh 统一反映到界面。
  const loadScene = async () => {
    // 载入中就不重复发请求，防止用户连点「重新载入」产生多个并发户型请求。
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
        // 超时对用户来说「稍后重试」即可，与真正的后端错误区分开文案。
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
      // 灯光配置涉及实体绑定，先确认当前会话仍有 3D 交互权限。
      await requestInteraction3dAccess();
      const { openInteraction3dEditor: openLightingEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260918233037");
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
      // 环境（温湿度 / 空气质量）配置同样属于受限能力，打开前校验授权。
      await requestInteraction3dAccess();
      const { openInteraction3dEditor: openEnvironmentEditor } =
        await import("/api/v1/modules/interaction3d/config-editor.js?v=20260918233037");
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
  // 视角调整进行中时不允许切楼层：当前相机要回写到对应楼层，换了楼层就不知道往哪写。
  floorSelectElement.disabled = isViewEditing;
  createLabeledField(viewFloorRowElement, "视角楼层", floorSelectElement);
  const floorGapInput = createElement("input");
  // 楼层间距优先取组件里已保存的值，其次取视图元数据（同项目其它组件已设过的值），最后用 3m 兜底。
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
        // 非法输入时回填旧值，避免留下空框让用户以为自己改成功了。
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
  // 按当前户型的楼层列表渲染「楼层编号」输入行；编号存进 properties.floorNumbers，
  // 负数表示地下层，列表为空时整组隐藏。
  const renderFloorNumberFields = floorList => {
    floorNumberFieldsElement.replaceChildren();
    // 只有一层时楼层编号没有意义（不需要互相区分），整体隐藏。
    floorNumberGroupElement.hidden = !floorList.length;
    for (const [floorIndex, floorEntry] of floorList.entries()) {
      const floorId = floorEntry.id;
      const floorName = floorEntry.name || "未命名楼层";
      // 楼层编号优先用组件自己的配置，其次是户型文件里带的编号，最后按列表顺序推一个。
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
      // 记住「已提交成功」的编号：提交失败时用它回滚输入框，保证界面与文档一致。
      let committedFloorNumber = floorNumber;
      floorNumberInput.addEventListener("change", async () => {
        let nextFloorNumber = floorNumberInput.valueAsNumber;
        // 0 层不存在：按原有的正负方向「跳过」到相邻楼层，避免用户手动再输一次。
        if (nextFloorNumber === 0) {
          nextFloorNumber = committedFloorNumber < 0 ? 1 : -1;
        }
        if (!Number.isInteger(nextFloorNumber) || nextFloorNumber < -99 || nextFloorNumber > 99) {
          floorNumberInput.value = String(committedFloorNumber);
          return;
        }
        // 只提交这一层的编号，但仍要带上完整的 floorNumbers 对象（后端按整体校验）。
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
          // 面板不会重建，所以本地状态要跟着更新，否则下一次比较会用到旧值。
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
  // 用视图元数据同步楼层下拉、楼层间距与多层叠加开关；视图还没挂载时静默跳过。
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
  // 向正在调整视角的 3D 视图下发一条相机命令；视图已退出调整态时静默放弃，
  // 提交成功后整体重建面板，让按钮的选中态与最新相机配置对齐。
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
  // 算出当前范围下真正生效的行为配置：单页面未单独设置的字段由 resolvePageBehavior 回退到全局。
  const resolveCurrentBehavior = () =>
    resolvePageBehavior(
      {
        ...draftProperties,
        behaviorScope: behaviorScope,
        pageBehaviors: pageBehaviors
      },
      behaviorPage
    );
  // 统一读取行为开关：hideIconsWhileRotating 存布尔值本身，其余行为存 { enabled }。
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
  // 提交一条行为改动。两种范围的落点不同，必须分流：单页面写进 pageBehaviors[当前页]，
  // 全局写进顶层属性 draftProperties；布尔类设置存值本身，其余存 { ...原值, ...改动 }。
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
  // 开关类设置的统一入口：hideIconsWhileRotating 历史上存的是布尔值本身（与它会话内生效的
  // 语义一致），其余行为存 { enabled }，这里替调用方抹平差异。
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
  // 生成自动旋转的数值输入行；idleSeconds 以秒计必须取整，speed 允许 0.5 的步进。
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
  // 把当前生效的行为配置回灌到控件。切范围 / 切页面 / 提交失败回滚都走这里，
  // 因此它同时负责字段值、禁用态与折叠态三类同步。
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
  // 供 bridge.css 定位这一节的专属布局（墙体透明度那一行需要更紧凑的排布）。
  displaySection.classList.add("i3d-picture-settings");
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
    // backgroundVisible 缺省视为「显示」，只有显式 false 才算隐藏，与渲染端默认一致。
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
  // 材质风格：整套 3D 观感的总开关，切换后调色板、地板、家具与背景都会跟着换。
  const sceneStyleSelect = createElement("select");
  sceneStyleSelect.name = "i3d-scene-style";
  sceneStyleSelect.setAttribute("aria-label", "材质风格");
  for (const [styleValue, styleLabel] of [
    ["default", "默认风格"],
    ["warm-wood", "暖阳原木"]
  ]) {
    const styleOptionElement = createElement("option", "", styleLabel);
    styleOptionElement.value = styleValue;
    sceneStyleSelect.append(styleOptionElement);
  }
  // 只有 warm-wood 视为暖阳；文档里的其它历史值一律按默认风格处理。
  const isWarmWood = properties.sceneStyle === "warm-wood";
  sceneStyleSelect.value = isWarmWood ? "warm-wood" : "default";
  sceneStyleSelect.addEventListener("change", () => {
    if (!programmaticControls.has(sceneStyleSelect)) {
      commitChange({
        properties: {
          sceneStyle: sceneStyleSelect.value
        }
      });
    }
  });
  createLabeledField(displaySection, "材质风格", sceneStyleSelect);
  const backgroundThemeSelect = createElement("select");
  backgroundThemeSelect.name = "i3d-background-theme";
  backgroundThemeSelect.setAttribute("aria-label", "背景主题");
  // 暖阳下背景主题由材质风格接管：下拉只剩「暖阳微光」一项且禁用，
  // 让用户看到当前生效的是什么，但不会误以为自己能改。
  for (const [themeValue, themeLabel] of isWarmWood
    ? [["warm-sunlight", "暖阳微光"]]
    : BACKGROUND_THEMES) {
    const themeOptionElement = createElement("option", "", themeLabel);
    themeOptionElement.value = themeValue;
    backgroundThemeSelect.append(themeOptionElement);
  }
  backgroundThemeSelect.value = isWarmWood
    ? "warm-sunlight"
    : normalizeBackgroundTheme(properties.backgroundTheme);
  backgroundThemeSelect.disabled = isWarmWood;
  backgroundThemeSelect.addEventListener("change", () => {
    // 暖阳下的 change 只可能来自程序性写值，不需要（也不该）提交。
    if (!isWarmWood && !programmaticControls.has(backgroundThemeSelect)) {
      commitChange({
        properties: {
          backgroundTheme: normalizeBackgroundTheme(backgroundThemeSelect.value)
        }
      });
    }
  });
  createLabeledField(displaySection, "背景主题", backgroundThemeSelect);
  // 动态背景开关只在暖阳下出现：默认主题的星尘由交互驱动，没有「一直飘」的选项。
  if (isWarmWood) {
    const backgroundMotionToggle = createElement("input");
    backgroundMotionToggle.type = "checkbox";
    backgroundMotionToggle.name = "i3d-background-motion";
    // 缺省视为开启动态：只有显式 false 才是关闭。
    backgroundMotionToggle.checked = properties.backgroundMotion !== false;
    backgroundMotionToggle.setAttribute("aria-label", "背景动态");
    backgroundMotionToggle.addEventListener("change", () => {
      commitChange({
        properties: {
          backgroundMotion: backgroundMotionToggle.checked
        }
      });
    });
    createLabeledField(displaySection, "背景动态", backgroundMotionToggle);
    // 复用「视图开关」那套 label 布局：复选框与标题同一行，右侧对齐。
    backgroundMotionToggle.parentElement.className = "i3d-setting-toggle i3d-view-toggle";
  }
  // 说明文字挪进 title：暖阳与默认主题的文案不同，静态段落无法兼顾，且占高度。
  backgroundThemeSelect.title = isWarmWood
    ? "随材质风格切换，亮区跟随当前楼层底部；ALL 时跟随最底层。"
    : "微光围绕户型中心渐隐，随视角呈现远近层次。";
  // 墙体透明度：diy 表示沿用户型自带材质（wallOpacity 存 null），
  // custom 表示本控件统一覆盖，具体比例存在 wallOpacity（0~1）。
  const wallOpacityModeSelect = createElement("select");
  wallOpacityModeSelect.name = "i3d-wall-opacity-mode";
  wallOpacityModeSelect.setAttribute("aria-label", "墙体透明度模式");
  for (const [opacityModeValue, opacityModeLabel] of [
    ["diy", "沿用户型 DIY"],
    ["custom", "统一调整"]
  ]) {
    const opacityModeOptionElement = createElement("option", "", opacityModeLabel);
    opacityModeOptionElement.value = opacityModeValue;
    wallOpacityModeSelect.append(opacityModeOptionElement);
  }
  const hasCustomWallOpacity =
    typeof properties.wallOpacity == "number" && Number.isFinite(properties.wallOpacity);
  wallOpacityModeSelect.value = hasCustomWallOpacity ? "custom" : "diy";
  wallOpacityModeSelect.addEventListener("change", () => {
    commitChange({
      properties: {
        // 切到「统一调整」时沿用已有比例；从没设置过就用 25% 这个观感默认值。
        wallOpacity:
          wallOpacityModeSelect.value === "custom" ? properties.wallOpacity ?? 0.25 : null
      }
    });
  });
  createLabeledField(displaySection, "墙体透明度", wallOpacityModeSelect);
  const wallOpacityRowElement = createElement("div", "i3d-wall-opacity-row");
  const wallOpacityRangeInput = createElement("input");
  const wallOpacityNumberInput = createElement("input");
  // 没有自定义透明度时整行隐藏：滑杆保持在上次的值上，切回来不会跳回 25%。
  wallOpacityRowElement.hidden = !hasCustomWallOpacity;
  for (const [opacityInput, opacityInputType] of [
    [wallOpacityRangeInput, "range"],
    [wallOpacityNumberInput, "number"]
  ]) {
    Object.assign(opacityInput, {
      type: opacityInputType,
      min: "0",
      max: "100",
      step: "1",
      value: String(Math.round((properties.wallOpacity ?? 0.25) * 100)),
      disabled: !hasCustomWallOpacity
    });
    opacityInput.setAttribute(
      "aria-label",
      opacityInputType === "range" ? "墙体透明度" : "墙体透明度百分比"
    );
    // 两个控件互相同步：拖动滑杆时数字框跟着变，但此时不提交，等 change 再提交。
    opacityInput.addEventListener("input", () => {
      (opacityInput === wallOpacityRangeInput
        ? wallOpacityNumberInput
        : wallOpacityRangeInput
      ).value = opacityInput.value;
    });
    opacityInput.addEventListener("change", () => {
      const nextOpacityPercent = Number(opacityInput.value);
      if (Number.isFinite(nextOpacityPercent)) {
        // 越界值夹回 0~100，再折算成 0~1 的比例交给后端。
        commitChange({
          properties: {
            wallOpacity: Math.max(0, Math.min(100, nextOpacityPercent)) / 100
          }
        });
      }
    });
    wallOpacityRowElement.append(opacityInput);
  }
  const wallOpacityUnitElement = createElement("span", "i3d-wall-opacity-unit", "%");
  wallOpacityRowElement.append(wallOpacityUnitElement);
  wallOpacityRowElement.title = "0% 全透明，100% 实心；切换风格保留此设置。";
  displaySection.append(
    wallOpacityRowElement,
    createElement("p", "inspector-section-note", "仅影响当前控件，保留户型 DIY。")
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
  // 转动分辨率的显示口径：文档里存 0.25~1 的比例（null 表示自动跟随静止分辨率），
  // 面板上按整数百分比呈现，因此这里要做比例 ↔ 百分比的换算。
  const syncMotionResolutionControls = () => {
    setControlValue(motionModeSelect, motionRenderScale === null ? "auto" : "custom");
    motionModeSelect.disabled = isViewEditing;
    motionScaleInput.disabled = isViewEditing || motionRenderScale === null;
    motionScaleInput.value = String(Math.round(lastMotionRenderScale * 100));
  };
  // 提交转动分辨率：null 表示「自动」，数值是 0.25~1 的比例；提交前照例过高负载确认，
  // 结束后无论成功失败都回到 syncMotionResolutionControls 重算禁用态与显示值。
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
  // 反射范围选「关闭」时清晰度与强度都不生效，一并禁用，避免用户改了却看不到变化。
  const syncReflectionControls = () => {
    reflectionResolutionSelect.disabled = reflectionStrengthInput.disabled =
      isViewEditing || groundReflectionSettings.mode === "off";
  };
  // 提交地面反射设置（范围 / 清晰度 / 强度已归一）。三组控件共用这一个处理器，
  // 因此先按 programmaticControls 拦掉自身派发的 change，再把控件回滚到已提交的取值。
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
  // 饱和度按页面分别存储；缺省值区分「ALL（全部楼层，100% 即不降饱和）」与单页（75%）。
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
  // 压暗强度同样按页面存储：ALL 默认不压暗（0），单页回退到组件里的 environment.dimStrength。
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
    // 只在非视角调整模式下预览：调整视角时 3D 视图由相机接管，弹窗预览会互相干扰。
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
    // 提交弹窗布局：先立即预览（滑杆拖动要跟手），再把该预设写回本地副本并整体提交。
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
    // 只有勾选「自定义位置」时才显示并启用两个位置滑杆，否则位置由宿主自动排布。
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
  // 画面显示保留竖排表单（户型底图 / 材质 / 背景 / 墙体透明度），
  // 不进 i3d-inline-section，否则标题与控件会挤成一行并裁切文案。
  for (const inlineSection of [
    houseSection,
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
  const inspectorGroupElements = [];
  const rememberedOpenGroupKey =
    [...openStateByGroup.entries()].find(([, groupOpen]) => groupOpen)?.[0] ?? null;
  const hasRenderedGroups = openStateByGroup.size > 0;
  const defaultOpenGroupKey = isViewEditing ? "view" : "layout";
  // 追加一个可折叠分组。手风琴语义（同时只展开一组）与「弹窗分组被收起时撤回预览」
  // 都在 toggle 监听里处理；重建面板时按 groupKey 恢复上次展开的那一组。
  const appendInspectorGroup = (groupKey, groupTitle, groupChildren) => {
    const detailsGroupElement = createElement("details", "i3d-inspector-group");
    detailsGroupElement.dataset.inspectorGroup = groupKey;
    detailsGroupElement.open = hasRenderedGroups
      ? groupKey === rememberedOpenGroupKey
      : groupKey === defaultOpenGroupKey;
    detailsGroupElement.append(createElement("summary", "", groupTitle), ...groupChildren);
    inspectorElement.append(detailsGroupElement);
    detailsGroupElement.addEventListener("toggle", () => {
      if (detailsGroupElement.open) {
        for (const otherGroupElement of inspectorGroupElements) {
          if (otherGroupElement !== detailsGroupElement && otherGroupElement.open) {
            otherGroupElement.open = false;
          }
        }
      } else if (groupKey === "popups" && detailsGroupElement.isConnected) {
        getInteraction3dEditorView(targetComponent.id)?.closePopupLayoutPreview?.();
      }
    });
    inspectorGroupElements.push(detailsGroupElement);
  };
  appendInspectorGroup("layout", "户型与布局", [houseSection, layoutSection, displaySection]);
  appendInspectorGroup("devices", "设备配置", [
    lightsSection,
    environmentSection,
    devicesSection,
    vacuumSection,
    securitySection
  ]);
  appendInspectorGroup("appearance", "画面效果", [
    lightEffectsSection,
    renderScaleSection,
    motionResolutionSection,
    groundReflectionSection,
    dimmingSection,
    popupAppearanceSection
  ]);
  appendInspectorGroup("view", "视角与导航", [viewSection, navigationSection]);
  appendInspectorGroup("popups", "弹窗大小与位置", [popupSettingsSection]);
  behaviorSection.children[0].hidden = true;
  appendInspectorGroup("interaction", "交互行为", [behaviorSection]);
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
