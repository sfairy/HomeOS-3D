/**
 * 3D 交互模块的外层运行时（宿主页侧，非 iframe 内）：在宿主 DOM 里建 iframe 指向 3D 舞台。
 * 三件事：① 状态——订阅被追踪实体（优先 lightStream 增量流，退化到 registerRuntimeStateHandler）
 * 并随配置推给舞台；② 配置——update 收到属性后做差异判断，必要时重载 iframe 或只发 config；
 * ③ 命令——舞台回传的 control 落到 /api/v1/modules/interaction3d/control，编辑类指令用 editor-command
 * 下发并按 requestId 等回执。
 * 协议：channel 固定 "hb-i3d-v1"，双向只认同源窗口；控制请求 12 秒超时，编辑回执 5 秒，
 * 加载兜底 45 秒（超时按加载失败提示，避免永远停在骨架屏）。dispose 后所有方法都是空操作。
 */
// 状态条目归一与「按 ID 切域」只有一份实现（/static/utils/），这里经 static-helpers 桥取用。
import {
  apiErrorMessage,
  entityDomainFromId,
  resolveStateEntry,
  stateTextOf
} from "./static-helpers.js?v=20260921151446";
import {
  createPopupLayoutPreview,
  createFocusDevicePopup
} from "./popup-preview.js?v=20260921151446";
import { createLightStream } from "../light/light-stream.js?v=20260921151446";
// 3D 模块专用的后端前缀：控制命令与照射范围读写都挂在这里。
const INTERACTION3D_API_BASE = "/api/v1/modules/interaction3d";
/**
 * 把 3D 交互控件挂到宿主元素上，返回运行时句柄。
 * 挂载时会建 iframe + 加载占位、注册窗口级事件（指针 / 键盘 / 页面可见性 / 祖先尺寸）、
 * 起状态订阅，并在舞台回报 ready 后下发配置。
 */
export function mountInteraction3d(
  hostElement,
  {
    component: componentDescriptor,
    context: runtimeContext = {},
    editing: isEditing = false,
    editingModule: editingModuleKind = "light",
    editingVacuumId: editingVacuumId = "",
    rangeEditorOnly: isRangeEditorOnly = false,
    onEdit: onEdit = () => {},
    onReady: onReady = () => {},
    onStates: onStatesUpdate = null,
    onPresented: onPresented = () => {},
    onLoadError: onLoadError = () => {},
    onFocusChange: onFocusChange = () => {}
  }
) {
  hostElement.className = "hb-interaction3d-runtime";
  let componentProperties = structuredClone(componentDescriptor.properties || {});
  let isDisposed = false;
  let isAuthorized = true;
  let selectedId = "";
  let loadingTimeoutId;
  let componentMetadata;
  let isPageHidden = false;
  let popupLayoutPreview = null;
  let focusDevicePopup = null;
  // 关闭聚焦设备弹窗（摄像头 / 扫地机），幂等：重复调用不会报错。
  function disposeFocusDevicePopup() {
    focusDevicePopup?.dispose();
    focusDevicePopup = null;
  }
  // 打开聚焦设备弹窗。目标 ID 形如 "camera:xxx" / "vacuum:xxx"，
  // 先按前缀判断设备类型，再从配置里找出对应项；找不到就静默返回（配置可能刚被改过）。
  // 弹窗自身初始化失败时只回收弹窗并回调 onLoadError，不影响舞台主体。
  function openFocusDevicePopup(popupTargetId) {
    disposeFocusDevicePopup();
    const focusDeviceKind = popupTargetId?.startsWith("camera:")
      ? "camera"
      : popupTargetId?.startsWith("vacuum:") || editingModuleKind === "vacuum"
        ? "vacuum"
        : null;
    const focusDeviceId = popupTargetId?.replace(/^(camera|vacuum):/, "");
    const focusDeviceItem = (
      focusDeviceKind === "camera"
        ? componentProperties.security?.cameras
        : focusDeviceKind === "vacuum"
          ? componentProperties.devices?.vacuums
          : []
    )?.find(deviceCandidate => deviceCandidate.id === focusDeviceId);
    if (!focusDeviceItem) {
      return;
    }
    const createdFocusPopup = createFocusDevicePopup(hostElement, {
      kind: focusDeviceKind,
      item: focusDeviceItem,
      getLayout: () => presentationLayout,
      getSettings: () => ({
        ...componentProperties.popupLayout,
        opacity: componentProperties.popupOpacity
      }),
      getStates: getCurrentStates,
      panelDocument: runtimeContext.document
    });
    focusDevicePopup = createdFocusPopup;
    createdFocusPopup.ready.catch(popupReadyError => {
      if (focusDevicePopup === createdFocusPopup) {
        disposeFocusDevicePopup();
        onLoadError(popupReadyError);
      }
    });
  }
  // 一次性关掉所有预览浮层：设备弹窗 + 弹窗布局预览。
  function closePopupLayoutPreview() {
    disposeFocusDevicePopup();
    popupLayoutPreview?.dispose();
    popupLayoutPreview = null;
  }
  // 舞台是否已回报 presented（画面真正可见）；未呈现前不做聚焦与视角编辑。
  let isScenePresented = false;
  let isViewEditing = false;
  // 请求 ID 自增源（range- / view- / focus- 前缀）：回执按 ID 配对，
  // 与舞台侧自己的控制请求计数互不干扰。
  let requestIdCounter = 0;
  // 配置代次：随之发送的 configId 让舞台能把 presented / error 对回到具体那份配置。
  let configIdCounter = 0;
  let defaultCamera;
  let activeCamera =
    componentProperties.floorCameras?.[componentProperties.floorSelection] ||
    componentProperties.camera;
  // 上次下发的配置 JSON：完全相同时不重发，只补一次布局与状态刷新，
  // 避免父页面的重渲染把整份配置再推一遍导致舞台重算。
  let lastConfigJson = "";
  // 预览挂起：被顶层对话框遮住时暂停状态推送与渲染，
  // 既省算力，也避免弹窗后面继续跑 3D 动画造成卡顿。
  let isPreviewSuspended = false;
  let isFocusActive = false;
  let isFocusPanelOpen = false;
  let isStageReady = false;
  let hasBeenConnected = false;
  let hasLoadFailed = false;
  // iframe 重载代次：异步回调据此判断自己等的加载是否已被新一次重载取代。
  let reloadGeneration = 0;
  let isRangeEditing = false;
  const pendingEditsByRequestId = new Map();
  const pendingRangeRequestsByRequestId = new Map();
  const editSubscribersSet = new Set();
  // 光照模式只有两种取值，非法值一律按 standard 处理，
  // 免得旧数据里的未知值触发一次无谓的 iframe 重载。
  const normalizeLightingMode = lightingMode => (lightingMode === "region" ? "region" : "standard");
  // 建舞台 iframe。非编辑 / 非视角编辑 / 非范围编辑时把指针事件关掉：
  // 否则 iframe 会吃掉宿主页面的滚动与点击。
  function createStageFrameElement() {
    const frameElement = document.createElement("iframe");
    frameElement.title = "3D 交互户型";
    frameElement.className = "i3d-frame";
    frameElement.setAttribute("allow", "fullscreen");
    if (runtimeContext.editable && !isEditing && !isViewEditing && !isRangeEditing) {
      frameElement.style.pointerEvents = "none";
    }
    return frameElement;
  }
  let stageFrameElement = createStageFrameElement();
  const loadingElement = document.createElement("p");
  loadingElement.className = "i3d-loading";
  loadingElement.setAttribute("role", "status");
  hostElement.replaceChildren(stageFrameElement, loadingElement);
  const projectId = runtimeContext.document?.projectId || "";
  // 统一发给舞台的通道：带 channel 标识，只发给同源 iframe，
  // iframe 尚未建立 contentWindow 时直接丢弃（后面 ready 后会重发配置）。
  const postToStageFrame = outgoingMessage => {
    if (!isDisposed && stageFrameElement.contentWindow) {
      stageFrameElement.contentWindow.postMessage(
        {
          channel: "hb-i3d-v1",
          ...outgoingMessage
        },
        location.origin
      );
    }
  };
  // 编辑事件广播：先回调构造时的 onEdit，再分发给 addEditSubscriber 注册的订阅者。
  // 复制一份集合再遍历，允许订阅者在回调里退订。
  function notifyEditSubscribers(editEvent) {
    onEdit(editEvent);
    for (const subscriber of [...editSubscribersSet]) {
      subscriber(editEvent);
    }
  }
  // 更新照射范围编辑状态：即使状态没变，只要带错误信息也要广播一次，
  // 否则「拒绝进入范围编辑」的原因传不出去。
  function setRangeEditingState(requestedActive, errorMessage = "") {
    const isRangeEditingActive = requestedActive === true;
    if (isRangeEditingActive !== isRangeEditing || !!errorMessage) {
      isRangeEditing = isRangeEditingActive;
      hostElement.classList.toggle("is-range-editing", isRangeEditingActive);
      if (runtimeContext.editable && !isEditing) {
        stageFrameElement.style.pointerEvents =
          isRangeEditingActive || isViewEditing ? "auto" : "none";
      }
      notifyEditSubscribers({
        action: "range-editor-state",
        active: isRangeEditingActive,
        ...(errorMessage
          ? {
              error: errorMessage
            }
          : {})
      });
    }
  }
  let isSceneActive = false;
  let isAwaitingPresentation = false;
  let lastVisible;
  let lastPresentedVisible;
  let isPageHiddenByEvent = false;
  let lastActivityAtMs = -Infinity;
  const activePointerIdsSet = new Set();
  const heldKeySet = new Set();
  // 有指针按下或按键未松开，就算「用户正在操作」，空闲动画必须让位。
  const hasHeldInput = () => activePointerIdsSet.size > 0 || heldKeySet.size > 0;
  let isInViewport = typeof IntersectionObserver === "undefined";
  // 弹窗遮挡检测：取最上层的、标记了 data-i3d-preview-scope 的 dialog，
  // 若它不包含宿主元素，说明 3D 预览被挡住了，挂起状态推送与渲染。
  function syncPreviewSuspension() {
    const topmostScopedDialog = [
      ...(document.querySelectorAll?.("dialog[data-i3d-preview-scope][open]") || [])
    ].at(-1);
    const isCoveredByDialog = !!topmostScopedDialog && !topmostScopedDialog.contains(hostElement);
    if (isPreviewSuspended !== isCoveredByDialog && !isDisposed) {
      isPreviewSuspended = isCoveredByDialog;
      hostElement.setAttribute("data-preview-suspended", String(isCoveredByDialog));
      clearTimeout(loadingTimeoutId);
      if (!isCoveredByDialog) {
        if (!isScenePresented && componentProperties.sceneId && !hasLoadFailed) {
          scheduleLoadTimeout();
        }
        if (isStageReady) {
          publishStates();
        }
        if (lightStream) {
          onStatesUpdate?.(getCurrentStates());
        }
        focusDevicePopup?.updateStates?.();
        vacuumDetailsPopup?.updateStates?.(getCurrentStates());
        sendConfigUpdate();
      }
      refreshActivityState();
    }
  }
  // 宿主是否真的可见：断开连接 / hidden / inert / iframe hidden / 不在视口 / 被弹窗盖住
  // 任一成立都算不可见 —— 这些条件都会让 3D 渲染白跑，早停早省电。
  function isHostActuallyVisible() {
    if (
      hostElement.isConnected === false ||
      hostElement.hidden ||
      hostElement.inert ||
      stageFrameElement.hidden ||
      hostElement.checkVisibility?.({
        opacityProperty: true,
        visibilityProperty: true,
        contentVisibilityAuto: true
      }) === false
    ) {
      return false;
    }
    for (
      let visibilityAncestorElement = hostElement;
      visibilityAncestorElement;
      visibilityAncestorElement = visibilityAncestorElement.parentElement
    ) {
      if (
        visibilityAncestorElement.hidden ||
        visibilityAncestorElement.inert ||
        visibilityAncestorElement.getAttribute?.("aria-hidden") === "true"
      ) {
        return false;
      }
      const visibilityAncestorStyle = window.getComputedStyle?.(visibilityAncestorElement);
      if (
        visibilityAncestorStyle &&
        (visibilityAncestorStyle.display === "none" ||
          visibilityAncestorStyle.visibility === "hidden" ||
          visibilityAncestorStyle.visibility === "collapse" ||
          Number(visibilityAncestorStyle.opacity) === 0)
      ) {
        return false;
      }
    }
    const hostBoundingRect = hostElement.getBoundingClientRect();
    const viewportWidthPx = document.documentElement?.clientWidth || window.innerWidth || Infinity;
    const viewportHeightPx =
      document.documentElement?.clientHeight || window.innerHeight || Infinity;
    return (
      hostBoundingRect.width > 0 &&
      hostBoundingRect.height > 0 &&
      (hostBoundingRect.left || 0) < viewportWidthPx &&
      (hostBoundingRect.top || 0) < viewportHeightPx &&
      (hostBoundingRect.right ?? (hostBoundingRect.left || 0) + hostBoundingRect.width) > 0 &&
      (hostBoundingRect.bottom ?? (hostBoundingRect.top || 0) + hostBoundingRect.height) > 0
    );
  }
  // 汇总可见性与活动态并同步给舞台：把「宿主可见 / 呈现层可见 / 用户是否在操作」
  // 组合成 activity-state 消息。forceImmediate 用于忽略节流，立刻发一次。
  function refreshActivityState(forceImmediate = false) {
    if (isDisposed) {
      return;
    }
    syncLightStreamActive();
    const isPresentedVisible =
      isAuthorized &&
      !isPreviewSuspended &&
      !isPageHiddenByEvent &&
      !isPageHidden &&
      document.hidden !== true &&
      document.visibilityState !== "hidden" &&
      isInViewport &&
      isHostActuallyVisible();
    const isVisible =
      isSceneActive &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable &&
      !isViewEditing &&
      isPresentedVisible;
    if (!isVisible) {
      activePointerIdsSet.clear();
      heldKeySet.clear();
    }
    if (
      forceImmediate ||
      isVisible !== lastVisible ||
      isPresentedVisible !== lastPresentedVisible
    ) {
      lastVisible = isVisible;
      lastPresentedVisible = isPresentedVisible;
      lastActivityAtMs = -Infinity;
      postToStageFrame({
        type: "activity-state",
        visible: isVisible,
        presentedVisible: isPresentedVisible
      });
    }
  }
  // 活动输入监听：只认 isTrusted 的事件（合成事件不算用户操作），
  // 按下时记录指针 / 按键，松开时移除，并在变化时刷新活动态。
  function handleActivityInputEvent(inputEvent) {
    if (isDisposed || inputEvent.isTrusted === false) {
      return;
    }
    const hadHeldInput = hasHeldInput();
    if (inputEvent.type === "pointerdown") {
      activePointerIdsSet.add(inputEvent.pointerId);
    }
    if (inputEvent.type === "pointerup" || inputEvent.type === "pointercancel") {
      activePointerIdsSet.delete(inputEvent.pointerId);
    }
    if (inputEvent.type === "keydown") {
      heldKeySet.add(inputEvent.code || inputEvent.key);
    }
    if (inputEvent.type === "keyup") {
      heldKeySet.delete(inputEvent.code || inputEvent.key);
    }
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    if (hasHeldInput() !== hadHeldInput || !(nowMs - lastActivityAtMs < 200)) {
      refreshActivityState();
      lastActivityAtMs = nowMs;
      if (lastVisible) {
        postToStageFrame({
          type: "user-activity",
          held: hasHeldInput()
        });
      }
    }
  }
  // 窗口失焦：清空所有按下状态。否则切走再切回来时，
  // 那些「按下没松开」的集合会永远留着，空闲动画再也不启动。
  function handleWindowBlur() {
    if (isDisposed) {
      return;
    }
    const hadHeldInputBeforeBlur = hasHeldInput();
    activePointerIdsSet.clear();
    heldKeySet.clear();
    refreshActivityState();
    if (hadHeldInputBeforeBlur && lastVisible) {
      lastActivityAtMs = globalThis.performance?.now?.() ?? Date.now();
      postToStageFrame({
        type: "user-activity",
        held: false
      });
    }
  }
  // 页面进入后台（含 from bfcache 的 pagehide）：关掉预览浮层并刷新活动态。
  function handlePageHide() {
    closePopupLayoutPreview();
    isPageHiddenByEvent = true;
    refreshActivityState();
  }
  // 页面从 bfcache 恢复：iframe 里的 WebGL 上下文通常已经失效，
  // 直接重载舞台而不是尝试复用（persisted 为 true 就代表走的是往返缓存）。
  function handlePageShow(pageShowEvent) {
    isPageHiddenByEvent = false;
    if (pageShowEvent?.persisted && !isDisposed) {
      reloadStageFrame();
    } else {
      refreshActivityState();
    }
  }
  // 页面可见性变化：隐藏时关掉预览浮层，避免弹窗留在后台状态不一致。
  function handleVisibilityChange() {
    if (document.hidden) {
      closePopupLayoutPreview();
    }
    refreshActivityState();
  }
  let latestStates = {};
  let lastPublishedStates = null;
  let supportsStatePatches = false;
  const lightStream =
    typeof window.WebSocket == "function"
      ? createLightStream({
          onStates(states) {
            latestStates = states;
            if (!isPreviewSuspended) {
              focusDevicePopup?.updateStates?.();
              vacuumDetailsPopup?.updateStates?.(states);
              onStatesUpdate?.(states);
              if (isStageReady) {
                publishStates();
              }
            }
          },
          onPatch(patch) {
            latestStates = {
              ...latestStates,
              ...patch
            };
            if (!isPreviewSuspended) {
              focusDevicePopup?.updateStates?.();
              vacuumDetailsPopup?.updateStates?.(latestStates);
              onStatesUpdate?.(latestStates);
              if (isStageReady) {
                publishStates(patch);
              }
            }
          }
        })
      : null;
  // 决定状态流是否激活：只有在宿主曾真正连接过、且当前可见时才开流，
  // 防止隐藏期间白白拉长连接。
  function syncLightStreamActive() {
    if (!lightStream || isDisposed) {
      return;
    }
    if (hostElement.isConnected === true) {
      hasBeenConnected = true;
    }
    let isStreamActive =
      isAuthorized &&
      !hasLoadFailed &&
      !!componentProperties.sceneId &&
      !isPageHiddenByEvent &&
      !isPageHidden &&
      document.hidden !== true &&
      document.visibilityState !== "hidden" &&
      (!hasBeenConnected || hostElement.isConnected !== false);
    for (
      let ancestorElement = hostElement;
      isStreamActive && ancestorElement;
      ancestorElement = ancestorElement.parentElement
    ) {
      const ancestorStyle = window.getComputedStyle?.(ancestorElement);
      if (
        ancestorElement.hidden ||
        ancestorElement.inert ||
        ancestorElement.getAttribute?.("aria-hidden") === "true" ||
        ancestorStyle?.display === "none" ||
        ["hidden", "collapse"].includes(ancestorStyle?.visibility)
      ) {
        isStreamActive = false;
      }
    }
    lightStream.setActive(isStreamActive);
  }
  // 找出窗帘的「电机反向」实体。它是集成侧暴露的开关，实体 ID 不在配置里，
  // 只能从运行时实体元数据里按设备归属反查，因此这里做了能力探测（没有元数据就返回空）。
  function findCurtainMotorReverseEntities() {
    const entityMetadata = runtimeContext.entityMetadata;
    if (!entityMetadata?.get || !entityMetadata?.values) {
      return [];
    } else {
      return (componentProperties.environment?.curtains || []).flatMap(curtain => {
        const curtainMetadata = entityMetadata.get(curtain.entityId);
        if (!curtainMetadata?.deviceId) {
          return [];
        }
        const motorReverseCandidates = [...entityMetadata.values()].filter(
          candidateMetadata =>
            candidateMetadata.deviceId === curtainMetadata.deviceId &&
            (!curtainMetadata.platform ||
              !candidateMetadata.platform ||
              candidateMetadata.platform === curtainMetadata.platform) &&
            ["switch", "select"].includes(
              candidateMetadata.domain || entityDomainFromId(candidateMetadata.entityId)
            ) &&
            !candidateMetadata.disabledBy &&
            !["disabled", "missing"].includes(candidateMetadata.status) &&
            /motor_reverse|电机反向/i.test(
              (candidateMetadata.entityId || "") +
                " " +
                (candidateMetadata.name || "") +
                " " +
                (candidateMetadata.translationKey || "")
            )
        );
        if (motorReverseCandidates.length === 1) {
          return [
            {
              entityId: motorReverseCandidates[0].entityId,
              coverEntityId: curtain.entityId
            }
          ];
        } else {
          return [];
        }
      });
    }
  }
  // 把电机反向状态合进状态表：它影响窗帘开合方向的正负解释，
  // 舞台侧拿不到这个信息，所以在宿主侧统一补齐后再下发。
  function mergeMotorReverseStates(statesMap, patchStates) {
    const mergedStates = {
      ...(patchStates || statesMap)
    };
    for (const motorReversePair of findCurtainMotorReverseEntities()) {
      if (
        patchStates &&
        !(motorReversePair.entityId in patchStates) &&
        !(motorReversePair.coverEntityId in patchStates)
      ) {
        continue;
      }
      const coverState = statesMap[motorReversePair.coverEntityId];
      if (!coverState) {
        continue;
      }
      const motorReverseEntityState =
        resolveStateEntry(statesMap[motorReversePair.entityId]);
      const motorReverseStateText = stateTextOf(motorReverseEntityState);
      const isMotorReverseEnabled =
        motorReverseEntityState?.available === false
          ? null
          : ["on", "true", "1", "enabled", "开启", "打开", "reverse", "reversed", "反向"].includes(
                motorReverseStateText
              )
            ? true
            : ["off", "false", "0", "disabled", "关闭", "normal", "forward", "正向"].includes(
                  motorReverseStateText
                )
              ? false
              : null;
      mergedStates[motorReversePair.coverEntityId] = {
        ...resolveStateEntry(coverState),
        motorReverse: {
          entityId: motorReversePair.entityId,
          enabled: isMotorReverseEnabled
        }
      };
    }
    return mergedStates;
  }
  // 需要跟踪状态的实体全集：窗帘反向开关、摄像头、人体传感器、扫地机及其关联实体、
  // 灯光、电视电源等。多订阅几个实体换来的是一次订阅覆盖全部面板。
  const collectTrackedEntities = () => [
    ...findCurtainMotorReverseEntities(),
    ...(componentProperties.security?.cameras || []),
    ...(componentProperties.security?.presenceSensors || []),
    ...(componentProperties.devices?.vacuums || []),
    ...(componentProperties.devices?.vacuums || []).flatMap(vacuum =>
      [
        ...(vacuum.relatedEntityIds || []).map(relatedEntityId => ({
          entityId: relatedEntityId
        })),
        vacuum.map,
        ...(vacuum.shortcuts || [])
      ].filter(Boolean)
    ),
    ...(componentProperties.lights || []),
    ...(componentProperties.environment?.airConditioners || []),
    ...(componentProperties.environment?.curtains || []),
    ...(componentProperties.devices?.nas || []),
    ...(componentProperties.devices?.televisions || []),
    ...(componentProperties.devices?.televisions || [])
      .filter(television => television.powerEntityId)
      .map(televisionWithPower => ({
        entityId: televisionWithPower.powerEntityId
      })),
    ...(componentProperties.devices?.nas || []).flatMap(nas => {
      const nasStatusSource = nas.statusSource;
      return (nasStatusSource?.metrics || []).filter(
        nasMetric =>
          !nasStatusSource.visibleMetrics ||
          nasStatusSource.visibleMetrics.includes(nasMetric.entityId) ||
          nasMetric.entityId === nasStatusSource.primaryEntityId
      );
    })
  ];
  // 判断选中 ID 是否仍在当前配置里存在：配置更新后旧的选中项可能已被删除，
  // 这时要清掉选中，不能让下游一直拿着一个不存在的 ID。
  function isKnownSelectionId(selectionId) {
    if (typeof selectionId != "string" || !selectionId) {
      return false;
    } else if (
      (componentProperties.lights || []).some(lightItem => lightItem.id === selectionId) ||
      (componentProperties.security?.cameras || []).some(
        cameraDevice => selectionId === "camera:" + cameraDevice.id
      ) ||
      (componentProperties.security?.presenceSensors || []).some(
        presenceSensorDevice => selectionId === "presence:" + presenceSensorDevice.id
      )
    ) {
      return true;
    } else {
      return [
        ["climate", componentProperties.environment?.airConditioners],
        ["cover", componentProperties.environment?.curtains],
        ["nas", componentProperties.devices?.nas],
        ["television", componentProperties.devices?.televisions],
        ["vacuum", componentProperties.devices?.vacuums]
      ].some(([moduleKey, moduleItems]) =>
        (moduleItems || []).some(
          moduleItem =>
            typeof moduleItem.id == "string" &&
            moduleItem.id &&
            selectionId === moduleKey + ":" + moduleItem.id
        )
      );
    }
  }
  // 取当前状态表：优先用 lightStream 的合并结果，没有流时退回到宿主注册的处理器缓存。
  const getCurrentStates = () =>
    lightStream
      ? latestStates
      : Object.fromEntries(
          collectTrackedEntities().map(entityRef => [
            entityRef.entityId,
            runtimeContext.states?.get(entityRef.entityId) || null
          ])
        );
  // 把状态推给舞台。挂起（被弹窗遮挡）或页面隐藏时不推，
  // 并且用引用比较跳过「状态对象没换过」的重复推送。
  const publishStates = (statePatch = null) => {
    if (isPreviewSuspended || isPageHidden) {
      return;
    }
    const currentStates = getCurrentStates();
    if (lightStream && currentStates === lastPublishedStates) {
      return;
    }
    const shouldSendPatch = !!lightStream && supportsStatePatches && statePatch !== null;
    postToStageFrame({
      type: "states",
      states: mergeMotorReverseStates(currentStates, shouldSendPatch ? statePatch : null),
      ...(shouldSendPatch
        ? {
            patch: true
          }
        : {})
    });
    lastPublishedStates = currentStates;
    if (!lightStream) {
      focusDevicePopup?.updateStates?.();
      onStatesUpdate?.(currentStates);
    }
  };
  const registeredEntityIdsSet = new Set();
  // 配置状态订阅：有 lightStream 时把「主实体 + 附加实体」一起交给它按需订阅；
  // 没有流时退回逐实体注册 runtimeContext.registerRuntimeStateHandler，并去重。
  function configureStateSubscriptions() {
    if (lightStream) {
      lightStream.configure(
        collectTrackedEntities().map(primaryEntity => primaryEntity.entityId),
        {
          additionalEntityIds: [
            ...findCurtainMotorReverseEntities().map(
              motorReverseEntity => motorReverseEntity.entityId
            ),
            ...(componentProperties.lights || []).map(lightEntity => lightEntity.entityId),
            ...(componentProperties.security?.presenceSensors || []).map(
              presenceSensorEntity => presenceSensorEntity.entityId
            ),
            ...(componentProperties.devices?.televisions || []).map(
              televisionEntity => televisionEntity.powerEntityId
            ),
            ...(componentProperties.devices?.vacuums || []).flatMap(vacuumEntity => [
              ...(vacuumEntity.relatedEntityIds || []),
              ...(vacuumEntity.shortcuts || []).map(vacuumShortcut => vacuumShortcut.entityId)
            ])
          ]
        }
      );
      syncLightStreamActive();
      return;
    }
    for (const trackedEntity of collectTrackedEntities()) {
      if (trackedEntity.entityId && !registeredEntityIdsSet.has(trackedEntity.entityId)) {
        registeredEntityIdsSet.add(trackedEntity.entityId);
        runtimeContext.registerRuntimeStateHandler?.(trackedEntity.entityId, publishStates);
      }
    }
  }
  // 下发配置。用 JSON 比对做短路：内容没变时只补一次布局 / 活动态 / 状态推送。
  // 每次真正下发都自增 configId 并把 isSceneActive 复位 —— 舞台要用它回报 presented。
  function sendConfigUpdate() {
    if (!isStageReady || isDisposed || isPreviewSuspended) {
      return;
    }
    const configPayload = {
      properties: componentProperties,
      editing: isEditing,
      editingModule: editingModuleKind,
      editingVacuumId: editingVacuumId,
      rangeEditorOnly: isRangeEditorOnly,
      viewEditing: isViewEditing,
      editorCanvas: !!runtimeContext.editable && !isEditing,
      allowRangeEditing: isAuthorized && (isEditing || !!runtimeContext.editable),
      interactive: !isEditing && !runtimeContext.editable,
      selectedId: selectedId
    };
    const configJson = JSON.stringify(configPayload);
    if (configJson === lastConfigJson) {
      syncFrameLayout();
      refreshActivityState();
      publishStates();
      return;
    }
    lastConfigJson = configJson;
    isSceneActive = false;
    isAwaitingPresentation = true;
    refreshActivityState(true);
    syncFrameLayout(true);
    postToStageFrame({
      type: "config",
      configId: ++configIdCounter,
      ...configPayload,
      states: mergeMotorReverseStates(getCurrentStates())
    });
    lastPublishedStates = getCurrentStates();
    if (!isScenePresented) {
      refreshActivityState(true);
    }
  }
  // 背景图开关只通过类名控制，交给 CSS 决定具体表现；缺省即透明，只有显式 true 才画背景。
  function syncBackgroundVisibility() {
    hostElement.classList.toggle(
      "is-background-hidden",
      componentProperties.backgroundVisible !== true
    );
    // 材质风格挂在宿主属性上：runtime.css 里整套暖色弹窗规则都由
    // [data-scene-style="warm-wood"] 选择器下的后代选择器驱动。
    // 取值归一成 default / warm-wood 两种，未设置时按 default 处理。
    hostElement.dataset.sceneStyle =
      componentProperties.sceneStyle === "warm-wood" ? "warm-wood" : "default";
  }
  // 聚焦状态变化时才回调，避免宿主每帧收到重复通知。
  function updateFocusActive(focusActive) {
    if (isFocusActive !== focusActive) {
      isFocusActive = focusActive;
      onFocusChange(focusActive);
    }
  }
  // 统一失败所有在途编辑请求（卸载 / 失去授权 / 重载时调用），
  // 让调用方的 Promise 立刻 reject，而不是各自等到 5 秒超时。
  function rejectPendingEdits(reason) {
    for (const pendingEditRequest of pendingEditsByRequestId.values()) {
      clearTimeout(pendingEditRequest.timeout);
      pendingEditRequest.reject(new Error(reason));
    }
    pendingEditsByRequestId.clear();
  }
  // 同上，处理照射范围相关的在途请求。
  function rejectPendingRangeRequests(failureReason) {
    for (const pendingRangeRequest of pendingRangeRequestsByRequestId.values()) {
      clearTimeout(pendingRangeRequest.timeout);
      pendingRangeRequest.reject(new Error(failureReason));
    }
    pendingRangeRequestsByRequestId.clear();
  }
  // 退出聚焦：清空焦点目标、关掉两个详情弹窗与面板，并通知宿主。
  // immediate 透传给舞台，表示不做相机过渡。
  function dismissFocus(immediate = false) {
    activeFocusTargetId = "";
    closeCameraPreviewPopup();
    closeVacuumDetailsPopup();
    isFocusPanelOpen = false;
    updateFocusActive(false);
    postToStageFrame({
      type: "dismiss-focus",
      immediate: immediate
    });
  }
  let cameraPreviewPopup = null;
  let cameraPreviewTargetId = "";
  let activeFocusTargetId = "";
  // 关闭摄像头预览浮层。先摘引用再 close()：浮层的关闭回调里可能再次调用本函数，
  // 引用已经清空才不会无限递归。
  const closeCameraPreviewPopup = () => {
    const popupToClose = cameraPreviewPopup;
    cameraPreviewPopup = null;
    cameraPreviewTargetId = "";
    popupToClose?.close?.();
  };
  let vacuumDetailsPopup = null;
  let isVacuumFollowActive = false;
  // 关闭扫地机详情浮层；与摄像头预览同一套「先摘引用再 close」的写法，
  // 保证重复调用与浮层内的关闭回调都不会递归。
  const closeVacuumDetailsPopup = () => {
    const vacuumPopupToClose = vacuumDetailsPopup;
    vacuumDetailsPopup = null;
    vacuumPopupToClose?.close?.();
  };
  // 点击外部退出聚焦：指针落在弹窗内不算（弹窗自己处理），
  // 落在宿主之外才算「点到别处了」。
  function handleWindowPointerDown(pointerEvent) {
    if (
      !cameraPreviewPopup?.contains?.(pointerEvent.target) &&
      !vacuumDetailsPopup?.contains?.(pointerEvent.target)
    ) {
      if ((isFocusActive || isFocusPanelOpen) && !hostElement.contains(pointerEvent.target)) {
        dismissFocus();
      }
    }
  }
  // ESC 优先关预览浮层，其次退出聚焦；顺序不能反，
  // 否则弹窗打开时按 ESC 会先把下面的聚焦一起关掉。
  function handleWindowKeyDown(keyEvent) {
    if (keyEvent.key === "Escape") {
      closePopupLayoutPreview();
    }
    if ((isFocusActive || isFocusPanelOpen) && keyEvent.key === "Escape") {
      dismissFocus();
    }
  }
  // 舞台加载失败（含 45 秒兜底超时）：复位所有「正在加载」的标志，
  // 让骨架屏与交互状态回到可重试的初始态。
  function handleStageLoadError(messageText) {
    hasLoadFailed = true;
    isScenePresented = false;
    isSceneActive = false;
    isAwaitingPresentation = false;
    refreshActivityState(true);
    rejectPendingRangeRequests(messageText || "户型画面已关闭，请重新调整照射范围。");
    postToStageFrame({
      type: "range-editor",
      open: false
    });
    setRangeEditingState(false);
    pendingAbortControllersSet.forEach(staleController => staleController.abort());
    rejectPendingEdits("户型加载失败，请重新载入后调整视角。");
    dismissFocus(true);
    clearTimeout(loadingTimeoutId);
    hostElement.classList.remove("is-loading");
    hostElement.classList.add("is-load-error");
    loadingElement.hidden = false;
    loadingElement.textContent = messageText || "3D 户型加载失败，请重新载入户型。";
    onLoadError(new Error(loadingElement.textContent));
  }
  // 重建 iframe（换场景、光照模式变化、从 bfcache 恢复时调用）。
  // 所有与旧 iframe 绑定的浮层与焦点都必须重置，否则会挂在已卸载的文档上。
  function reloadStageFrame() {
    closePopupLayoutPreview();
    isVacuumFollowActive = false;
    activeFocusTargetId = "";
    closeCameraPreviewPopup();
    closeVacuumDetailsPopup();
    lastConfigJson = "";
    if (reloadGeneration++) {
      stageFrameElement.removeAttribute("src");
      stageFrameElement = createStageFrameElement();
      hostElement.replaceChildren(stageFrameElement, loadingElement);
    }
    setRangeEditingState(false);
    pendingAbortControllersSet.forEach(replacementController => replacementController.abort());
    rejectPendingEdits("户型已切换，请在新户型中重新调整视角。");
    rejectPendingRangeRequests("户型已切换，请在新户型中重新调整照射范围。");
    isFocusPanelOpen = false;
    updateFocusActive(false);
    hasLoadFailed = false;
    isScenePresented = false;
    isStageReady = false;
    isSceneActive = false;
    isAwaitingPresentation = false;
    refreshActivityState(true);
    clearTimeout(loadingTimeoutId);
    hostElement.classList.remove("is-ready", "is-load-error");
    hostElement.classList.toggle("is-loading", !!componentProperties.sceneId);
    hostElement.setAttribute("aria-busy", String(!!componentProperties.sceneId));
    syncBackgroundVisibility();
    configureStateSubscriptions();
    if (!componentProperties.sceneId) {
      stageFrameElement.hidden = true;
      loadingElement.hidden = false;
      loadingElement.textContent = "请在属性面板中配置 3D 户型";
      return;
    }
    stageFrameElement.hidden = false;
    loadingElement.hidden = false;
    loadingElement.textContent = "";
    loadingElement.setAttribute("aria-label", "正在准备 3D 户型");
    stageFrameElement.src =
      INTERACTION3D_API_BASE +
      "/stage.html?" +
      new URLSearchParams({
        sceneId: componentProperties.sceneId,
        projectId: projectId,
        lighting: normalizeLightingMode(componentProperties.lightingMode)
      });
    if (!isPreviewSuspended) {
      scheduleLoadTimeout();
    }
  }
  // 45 秒加载兜底：慢到这一步基本是网络或后端异常，
  // 与其让用户对着骨架屏，不如给出可重试的提示。
  function scheduleLoadTimeout() {
    loadingTimeoutId = setTimeout(
      () => handleStageLoadError("3D 户型加载较慢，请稍候；若一直没有画面，请重新载入户型。"),
      45000
    );
  }
  const pendingAbortControllersSet = new Set();
  /**
   * 舞台消息总入口（同源 + iframe 来源 + channel 三重校验后分发）。
   * 处理类型见文件头；控制类落到后端 /control 并按 requestId 回执，
   * 编辑类（视角 / 聚焦 / 范围）按各自 requestId 兑现 Promise。
   */
  async function handleStageMessage(messageEvent) {
    if (
      isDisposed ||
      messageEvent.origin !== location.origin ||
      messageEvent.source !== stageFrameElement.contentWindow ||
      messageEvent.data?.channel !== "hb-i3d-v1"
    ) {
      return;
    }
    const incomingMessage = messageEvent.data;
    if (incomingMessage.type === "vacuum-follow-state") {
      isVacuumFollowActive = incomingMessage.active === true;
      if (isVacuumFollowActive) {
        closeVacuumDetailsPopup();
      }
    }
    if (incomingMessage.type === "vacuum-popup-close") {
      closeVacuumDetailsPopup();
    }
    if (incomingMessage.type === "camera-popup-close") {
      closeCameraPreviewPopup();
    }
    if (
      incomingMessage.type === "camera-popup" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable &&
      activeFocusTargetId === incomingMessage.id
    ) {
      const cameraItem = (componentProperties.security?.cameras || []).find(
        cameraCandidate =>
          "camera:" + cameraCandidate.id === incomingMessage.id &&
          cameraCandidate.visible !== false &&
          cameraCandidate.entityId
      );
      if (
        cameraItem &&
        runtimeContext.openCameraPreview &&
        cameraPreviewTargetId !== incomingMessage.id
      ) {
        closeCameraPreviewPopup();
        closeVacuumDetailsPopup();
        cameraPreviewTargetId = incomingMessage.id;
        cameraPreviewPopup = runtimeContext.openCameraPreview(
          cameraItem,
          () => {
            cameraPreviewPopup = null;
            cameraPreviewTargetId = "";
            dismissFocus();
          },
          {
            root: hostElement,
            frame: stageFrameElement,
            popupOpacity: componentProperties.popupOpacity,
            getPresentationLayout: () => presentationLayout,
            getPopupLayout: () => componentProperties.popupLayout?.camera
          }
        );
      }
    }
    if (
      incomingMessage.type === "vacuum-popup" &&
      !isVacuumFollowActive &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const vacuumItem = (componentProperties.devices?.vacuums || []).find(
        vacuumCandidate =>
          "vacuum:" + vacuumCandidate.id === incomingMessage.id &&
          vacuumCandidate.visible !== false &&
          vacuumCandidate.entityId
      );
      if (vacuumItem && runtimeContext.openVacuumDetails) {
        closeVacuumDetailsPopup();
        vacuumDetailsPopup = runtimeContext.openVacuumDetails(
          vacuumItem,
          () => {
            vacuumDetailsPopup = null;
            dismissFocus();
          },
          {
            states: getCurrentStates(),
            root: hostElement,
            frame: stageFrameElement,
            popupOpacity: componentProperties.popupOpacity,
            getPresentationLayout: () => presentationLayout,
            getPopupLayout: () => componentProperties.popupLayout?.general
          }
        );
      }
    }
    if (
      incomingMessage.type === "vacuum-room" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const vacuumDevice = (componentProperties.devices?.vacuums || []).find(
        vacuumDeviceCandidate =>
          vacuumDeviceCandidate.id === incomingMessage.vacuumId &&
          vacuumDeviceCandidate.visible !== false &&
          vacuumDeviceCandidate.entityId
      );
      const vacuumShortcutItem = vacuumDevice?.shortcuts?.find(
        shortcutCandidate =>
          shortcutCandidate.id === incomingMessage.shortcutId &&
          shortcutCandidate.visible !== false &&
          shortcutCandidate.entityId
      );
      if (
        !vacuumShortcutItem ||
        incomingMessage.id !== "vacuum-room:" + vacuumDevice.id + ":" + vacuumShortcutItem.id
      ) {
        return;
      }
      try {
        if (!runtimeContext.runVacuumRoom) {
          throw new Error("清扫操作入口尚未准备好，请刷新页面。");
        }
        await runtimeContext.runVacuumRoom(vacuumShortcutItem);
        postToStageFrame({
          type: "vacuum-room-result",
          id: incomingMessage.id
        });
      } catch (runRoomError) {
        postToStageFrame({
          type: "vacuum-room-result",
          id: incomingMessage.id,
          error: runRoomError.message
        });
      }
    }
    if (incomingMessage.type === "focus-state" && !isEditing && !runtimeContext.editable) {
      const canFocusSelection =
        isAuthorized && isScenePresented && isKnownSelectionId(incomingMessage.id);
      activeFocusTargetId =
        canFocusSelection && incomingMessage.active === true ? incomingMessage.id : "";
      if (cameraPreviewTargetId && cameraPreviewTargetId !== activeFocusTargetId) {
        closeCameraPreviewPopup();
      }
      isFocusPanelOpen = canFocusSelection && incomingMessage.panelOpen === true;
      updateFocusActive(canFocusSelection && incomingMessage.active === true);
    }
    if (incomingMessage.type === "model-metadata") {
      componentMetadata = incomingMessage.metadata;
      onReady(componentMetadata);
    }
    if (incomingMessage.type === "ready") {
      supportsStatePatches = incomingMessage.statePatches === true;
      lastPublishedStates = null;
      lastConfigJson = "";
      hasLoadFailed = false;
      isStageReady = true;
      componentMetadata = incomingMessage.metadata;
      defaultCamera = incomingMessage.metadata?.camera;
      activeCamera =
        componentProperties.floorCameras?.[componentProperties.floorSelection] ||
        componentProperties.camera ||
        defaultCamera;
      sendConfigUpdate();
      if (isPreviewSuspended) {
        refreshActivityState(true);
      }
      onReady(incomingMessage.metadata);
    }
    if (
      incomingMessage.type === "presented" &&
      incomingMessage.configId === configIdCounter &&
      isAwaitingPresentation
    ) {
      isAwaitingPresentation = false;
      if (!isScenePresented) {
        isScenePresented = true;
        defaultCamera = incomingMessage.camera || defaultCamera;
        activeCamera =
          componentProperties.floorCameras?.[componentProperties.floorSelection] ||
          componentProperties.camera ||
          defaultCamera;
        clearTimeout(loadingTimeoutId);
        hostElement.classList.remove("is-loading", "is-load-error");
        hostElement.classList.add("is-ready");
        hostElement.setAttribute("aria-busy", "false");
        onPresented();
      }
      isSceneActive = true;
      refreshActivityState();
    }
    if (incomingMessage.type === "error") {
      handleStageLoadError(incomingMessage.message);
    }
    const isRangeEditingAvailable =
      isAuthorized &&
      isScenePresented &&
      (isEditing || runtimeContext.editable) &&
      normalizeLightingMode(componentProperties.lightingMode) === "region";
    if (incomingMessage.type === "range-editor-state" && isRangeEditingAvailable) {
      const rangeRequest = pendingRangeRequestsByRequestId.get(incomingMessage.requestId);
      if (incomingMessage.requestId && !rangeRequest) {
        return;
      }
      if (rangeRequest) {
        clearTimeout(rangeRequest.timeout);
        pendingRangeRequestsByRequestId.delete(incomingMessage.requestId);
        if (incomingMessage.active === rangeRequest.open && !incomingMessage.error) {
          rangeRequest.resolve();
        } else {
          rangeRequest.reject(new Error(incomingMessage.error || "照射范围编辑未能打开。"));
        }
      }
      setRangeEditingState(
        incomingMessage.active === true && !incomingMessage.error,
        incomingMessage.error || ""
      );
    }
    if (
      incomingMessage.type === "range-overrides" &&
      isRangeEditingAvailable &&
      incomingMessage.overrides &&
      typeof incomingMessage.overrides == "object" &&
      !Array.isArray(incomingMessage.overrides)
    ) {
      componentProperties.lightRegionOverrides = structuredClone(incomingMessage.overrides);
      notifyEditSubscribers({
        action: "light-region-overrides",
        overrides: structuredClone(componentProperties.lightRegionOverrides)
      });
    }
    if (
      incomingMessage.type === "edit" &&
      incomingMessage.action === "camera" &&
      runtimeContext.editable &&
      isViewEditing
    ) {
      const cameraEditRequest = pendingEditsByRequestId.get(incomingMessage.requestId);
      if (cameraEditRequest) {
        activeCamera = incomingMessage.camera;
        clearTimeout(cameraEditRequest.timeout);
        pendingEditsByRequestId.delete(incomingMessage.requestId);
        cameraEditRequest.resolve(incomingMessage.camera);
      }
    }
    if (incomingMessage.type === "edit" && isEditing && isAuthorized && isScenePresented) {
      if (incomingMessage.action === "focus-exited") {
        disposeFocusDevicePopup();
      }
      if (incomingMessage.action === "focus-camera") {
        const focusEditRequest = pendingEditsByRequestId.get(incomingMessage.requestId);
        if (!focusEditRequest) {
          return;
        }
        if (focusEditRequest) {
          clearTimeout(focusEditRequest.timeout);
          pendingEditsByRequestId.delete(incomingMessage.requestId);
          if (incomingMessage.error) {
            focusEditRequest.reject(new Error(incomingMessage.error));
          } else {
            if (["edit-light-camera", "preview-light-camera"].includes(focusEditRequest.command)) {
              openFocusDevicePopup(focusEditRequest.id);
            }
            if (
              ["save-light-camera", "cancel-light-camera", "edit-follow-camera"].includes(
                focusEditRequest.command
              )
            ) {
              disposeFocusDevicePopup();
            }
            focusEditRequest.resolve(incomingMessage);
          }
        }
      }
      notifyEditSubscribers(incomingMessage);
    }
    if (
      incomingMessage.type === "control" &&
      isAuthorized &&
      isScenePresented &&
      !isEditing &&
      !runtimeContext.editable
    ) {
      const controlEntityId = incomingMessage.command?.entityId;
      if (
        typeof controlEntityId != "string" ||
        !controlEntityId.trim() ||
        ![
          ...(componentProperties.lights || []),
          ...(componentProperties.environment?.airConditioners || []),
          ...(componentProperties.environment?.curtains || []),
          ...(componentProperties.devices?.televisions || []),
          ...(componentProperties.devices?.televisions || []).map(televisionItem => ({
            entityId: televisionItem.powerEntityId || televisionItem.entityId
          }))
        ].some(controlTarget => controlTarget.entityId === controlEntityId)
      ) {
        postToStageFrame({
          type: "control-result",
          requestId: incomingMessage.requestId,
          error: "此实体未绑定到当前 3D 控件，请检查设备配置。"
        });
        return;
      }
      const controlGeneration = reloadGeneration;
      // 结果回传的门卫：只有期间没发生整页重载（generation 未变）、场景已呈现且仍持有授权
      // 时才回发，否则宿主会收到一条属于旧页面的 control-result。
      const sendControlResult = resultPayload => {
        if (controlGeneration === reloadGeneration && isScenePresented && isAuthorized) {
          postToStageFrame(resultPayload);
        }
      };
      const controlAbortController = new AbortController();
      pendingAbortControllersSet.add(controlAbortController);
      // 12 秒超时并 abort：设备操作的真实耗时不长，卡这么久基本都是链路问题，
      // 主动断开比让舞台侧一直等更省资源。
      const controlTimeoutId = setTimeout(() => controlAbortController.abort(), 12000);
      try {
        const controlResponse = await fetch(INTERACTION3D_API_BASE + "/control", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            ...incomingMessage.command,
            // 定位字段一律带上（不再只给空调/窗帘/电视带）：后端四个分支都要用它
            // 反查「实体是不是真配在这个控件上」，灯光/开关那条也不例外。
            // 少了它后端会回 422，而不是悄悄退回「只校验实体可见范围」。
            projectId: projectId,
            componentId: componentDescriptor.id
          }),
          signal: controlAbortController.signal
        });
        const responseBody = await controlResponse.json().catch(() => ({}));
        if (!controlResponse.ok) {
          // 文案归一交给 /static/utils/api-error.js（经 static-helpers 桥取用）。
          throw new Error(apiErrorMessage(responseBody, "设备操作失败。"));
        }
        sendControlResult({
          type: "control-result",
          requestId: incomingMessage.requestId
        });
      } catch (controlError) {
        sendControlResult({
          type: "control-result",
          requestId: incomingMessage.requestId,
          error:
            controlError.name === "AbortError"
              ? "请求超时，请检查设备状态。"
              : controlError.message,
          timedOut: controlError.name === "AbortError"
        });
      } finally {
        clearTimeout(controlTimeoutId);
        pendingAbortControllersSet.delete(controlAbortController);
      }
    }
  }
  window.addEventListener("message", handleStageMessage);
  window.addEventListener("pointerdown", handleWindowPointerDown);
  window.addEventListener("keydown", handleWindowKeyDown);
  const activityEventTarget = document.addEventListener ? document : window;
  activityEventTarget.addEventListener("hb-i3d-preview-scope", syncPreviewSuspension);
  const ACTIVITY_EVENT_TYPES = [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "wheel",
    "keydown",
    "keyup"
  ];
  const ACTIVITY_LISTENER_OPTIONS = {
    capture: true,
    passive: true
  };
  for (const activityEventType of ACTIVITY_EVENT_TYPES) {
    activityEventTarget.addEventListener(
      activityEventType,
      handleActivityInputEvent,
      ACTIVITY_LISTENER_OPTIONS
    );
  }
  activityEventTarget.addEventListener("visibilitychange", handleVisibilityChange);
  activityEventTarget.addEventListener("transitionend", handleVisibilityChange, true);
  activityEventTarget.addEventListener("animationend", handleVisibilityChange, true);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("pageshow", handlePageShow);
  window.addEventListener("blur", handleWindowBlur);
  const intersectionObserver =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          observerEntries => {
            for (const observerEntry of observerEntries) {
              if (observerEntry.target === hostElement) {
                isInViewport = observerEntry.isIntersecting && observerEntry.intersectionRatio > 0;
              }
            }
            refreshActivityState();
          },
          {
            threshold: [0, 0.001]
          }
        );
  intersectionObserver?.observe(hostElement);
  let observedAncestorElements = [];
  // 观察宿主的所有祖先尺寸变化：控件常被放在可折叠面板里，
  // 面板展开时窗口 resize 不会触发，只能靠 MutationObserver / ResizeObserver 补。
  function observeAncestors() {
    if (isDisposed) {
      return;
    }
    const nextAncestorElements = [];
    for (
      let walkedAncestor = hostElement;
      walkedAncestor;
      walkedAncestor = walkedAncestor.parentElement
    ) {
      nextAncestorElements.push(walkedAncestor);
    }
    if (
      nextAncestorElements.length !== observedAncestorElements.length ||
      !nextAncestorElements.every(
        (ancestorCandidate, ancestorIndex) =>
          ancestorCandidate === observedAncestorElements[ancestorIndex]
      )
    ) {
      observedAncestorElements = nextAncestorElements;
      ancestorMutationObserver?.disconnect();
      for (const observedAncestor of nextAncestorElements) {
        ancestorMutationObserver?.observe(observedAncestor, {
          attributes: true,
          childList: true,
          attributeFilter: ["hidden", "inert", "aria-hidden", "style", "class"]
        });
      }
    }
  }
  const ancestorMutationObserver =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeAncestors();
          syncFrameLayout();
        });
  observeAncestors();
  let lastLayoutJson = "";
  let presentationLayout = null;
  // 同步 iframe 尺寸：宿主还没有宽高时直接返回（此时测量必然为 0）。
  // forceLayout 用于绕过「尺寸没变」的短路，强制重排一次。
  function syncFrameLayout(forceLayout = false) {
    refreshActivityState();
    const hostRect = hostElement.getBoundingClientRect();
    if (!hostRect.width || !hostElement.clientWidth) {
      return;
    }
    const scaleX = hostElement.clientWidth / hostRect.width;
    const scaleY =
      hostElement.clientHeight > 0 && hostRect.height > 0
        ? hostElement.clientHeight / hostRect.height
        : scaleX;
    stageFrameElement.style.width = hostRect.width + "px";
    stageFrameElement.style.height = hostRect.height + "px";
    stageFrameElement.style.transform =
      scaleX === scaleY ? "scale(" + scaleX + ")" : "scale(" + scaleX + "," + scaleY + ")";
    const rendererCanvasElement = hostElement.closest?.(".hb-renderer-canvas");
    const canvasRect = rendererCanvasElement?.getBoundingClientRect();
    const layoutReferenceSize =
      componentProperties.layoutMode === "fill"
        ? runtimeContext.document?.canvas
        : componentDescriptor.position;
    const componentScale =
      componentProperties.layoutMode === "fill"
        ? 1
        : Math.max(0.01, Math.min(5, Number(componentDescriptor.style?.scale) || 1));
    const layoutWidthPx =
      canvasRect?.width > 0 && rendererCanvasElement.clientWidth > 0
        ? (hostRect.width * rendererCanvasElement.clientWidth) / canvasRect.width
        : Number(layoutReferenceSize?.width) * componentScale;
    const layoutHeightPx =
      canvasRect?.height > 0 && rendererCanvasElement.clientHeight > 0
        ? (hostRect.height * rendererCanvasElement.clientHeight) / canvasRect.height
        : Number(layoutReferenceSize?.height) * componentScale;
    const layoutMessage = {
      type: "presentation-layout",
      width: layoutWidthPx > 0 ? layoutWidthPx : hostRect.width,
      height: layoutHeightPx > 0 ? layoutHeightPx : hostRect.height
    };
    presentationLayout = layoutMessage;
    popupLayoutPreview?.resize();
    focusDevicePopup?.resize();
    vacuumDetailsPopup?.updateLayout?.();
    cameraPreviewPopup?.updateLayout?.();
    const layoutJson = JSON.stringify(layoutMessage);
    if (forceLayout === true || layoutJson !== lastLayoutJson) {
      lastLayoutJson = layoutJson;
      postToStageFrame(layoutMessage);
    }
  }
  const frameResizeObserver = new ResizeObserver(syncFrameLayout);
  frameResizeObserver.observe(hostElement);
  window.addEventListener("resize", syncFrameLayout);
  syncPreviewSuspension();
  reloadStageFrame();
  const layoutFrameRequestId = requestAnimationFrame(syncFrameLayout);
  // 释放一切：清定时器、断开观察者、移除所有事件监听、abort 在途请求、
  // 清空 iframe 与宿主内容，并把在途编辑请求统一失败。
  // 之后所有 runtimeApi 方法都会因 isDisposed 变成空操作。
  const runtimeApi = () => {
    if (!isDisposed) {
      closePopupLayoutPreview();
      isSceneActive = false;
      refreshActivityState(true);
      updateFocusActive(false);
      closeCameraPreviewPopup();
      closeVacuumDetailsPopup();
      lightStream?.dispose();
      editSubscribersSet.clear();
      isRangeEditing = false;
      hostElement.classList.remove("is-range-editing");
      isDisposed = true;
      clearTimeout(loadingTimeoutId);
      cancelAnimationFrame(layoutFrameRequestId);
      frameResizeObserver.disconnect();
      intersectionObserver?.disconnect();
      ancestorMutationObserver?.disconnect();
      rejectPendingEdits("户型画面已关闭，请重新调整。");
      rejectPendingRangeRequests("户型画面已关闭，请重新调整照射范围。");
      window.removeEventListener("resize", syncFrameLayout);
      window.removeEventListener("message", handleStageMessage);
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
      for (const activityEventTypeToRemove of ACTIVITY_EVENT_TYPES) {
        activityEventTarget.removeEventListener(
          activityEventTypeToRemove,
          handleActivityInputEvent,
          ACTIVITY_LISTENER_OPTIONS
        );
      }
      activityEventTarget.removeEventListener("visibilitychange", handleVisibilityChange);
      activityEventTarget.removeEventListener("hb-i3d-preview-scope", syncPreviewSuspension);
      activityEventTarget.removeEventListener("transitionend", handleVisibilityChange, true);
      activityEventTarget.removeEventListener("animationend", handleVisibilityChange, true);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("blur", handleWindowBlur);
      pendingAbortControllersSet.forEach(pendingController => pendingController.abort());
      stageFrameElement.removeAttribute("src");
      hostElement.replaceChildren();
    }
  };
  runtimeApi.update = (
    nextComponentProperties,
    nextSelectedId = selectedId,
    editContext = null
  ) => {
    if (isDisposed) {
      return;
    }
    if (
      isEditing &&
      editContext &&
      ["light", "climate", "cover", "nas", "television", "vacuum", "vacuum-shortcut"].includes(
        editContext.module
      )
    ) {
      editingModuleKind = editContext.module;
      editingVacuumId =
        editingModuleKind === "vacuum-shortcut" ? String(editContext.vacuumId || "") : "";
    }
    if (
      nextSelectedId !== selectedId ||
      nextComponentProperties.floorSelection !== componentProperties.floorSelection
    ) {
      disposeFocusDevicePopup();
    }
    const previousSceneId = componentProperties.sceneId;
    const previousCameraJson = JSON.stringify(componentProperties.camera);
    const previousLightingMode = normalizeLightingMode(componentProperties.lightingMode);
    const previousPreviewCameraJson = JSON.stringify(
      (componentProperties.security?.cameras || []).find(
        previewCameraCandidate => "camera:" + previewCameraCandidate.id === cameraPreviewTargetId
      )
    );
    const previousFloorSelection = componentProperties.floorSelection;
    componentProperties = structuredClone(nextComponentProperties);
    selectedId = nextSelectedId;
    configureStateSubscriptions();
    syncBackgroundVisibility();
    cameraPreviewPopup?.updateLayout?.();
    vacuumDetailsPopup?.updateLayout?.();
    if (
      cameraPreviewPopup &&
      (previousFloorSelection !== componentProperties.floorSelection ||
        previousPreviewCameraJson !==
          JSON.stringify(
            (componentProperties.security?.cameras || []).find(
              selectedPreviewCamera =>
                "camera:" + selectedPreviewCamera.id === cameraPreviewTargetId
            )
          ))
    ) {
      dismissFocus(true);
    }
    if (
      isViewEditing &&
      (previousSceneId !== componentProperties.sceneId ||
        previousLightingMode !== normalizeLightingMode(componentProperties.lightingMode) ||
        previousCameraJson !== JSON.stringify(componentProperties.camera))
    ) {
      isViewEditing = false;
      activeCamera =
        componentProperties.floorCameras?.[componentProperties.floorSelection] ||
        componentProperties.camera ||
        defaultCamera;
      hostElement.classList.remove("is-view-editing");
      stageFrameElement.style.pointerEvents = "none";
    }
    if (
      previousSceneId !== componentProperties.sceneId ||
      previousLightingMode !== normalizeLightingMode(componentProperties.lightingMode)
    ) {
      reloadStageFrame();
    } else {
      sendConfigUpdate();
    }
  };
  runtimeApi.setPageVisible = pageVisible => {
    if (!isDisposed && isPageHidden !== !pageVisible) {
      isPageHidden = !pageVisible;
      if (isPageHidden) {
        closePopupLayoutPreview();
        dismissFocus(true);
      }
      refreshActivityState(true);
      if (!isPageHidden) {
        syncFrameLayout();
        if (!lightStream) {
          publishStates();
        }
      }
    }
  };
  runtimeApi.closePopupLayoutPreview = closePopupLayoutPreview;
  runtimeApi.previewPopupLayout = (popupKind, previewOptions = {}) =>
    isDisposed ||
    !isAuthorized ||
    !runtimeContext.editable ||
    isPageHidden ||
    document.hidden ||
    isPreviewSuspended ||
    isViewEditing ||
    isRangeEditing ||
    !["general", "camera"].includes(popupKind)
      ? false
      : (popupLayoutPreview ||
          (dismissFocus(true),
          (popupLayoutPreview = createPopupLayoutPreview(
            hostElement,
            () => presentationLayout,
            closePopupLayoutPreview
          ))),
        popupLayoutPreview.update(popupKind, previewOptions),
        true);
  runtimeApi.command = commandName =>
    postToStageFrame({
      type: "editor-command",
      command: commandName
    });
  runtimeApi.subscribeEdit = subscriberCallback =>
    isDisposed || typeof subscriberCallback != "function"
      ? () => {}
      : (editSubscribersSet.add(subscriberCallback),
        () => editSubscribersSet.delete(subscriberCallback));
  runtimeApi.openRangeEditor = () => {
    closePopupLayoutPreview();
    if (isDisposed || !isAuthorized || (!isEditing && !runtimeContext.editable)) {
      return Promise.reject(new Error("请在已授权的控件编辑器中调整照射范围。"));
    }
    if (!isScenePresented) {
      return Promise.reject(new Error("户型还在加载，请稍候再调整照射范围。"));
    }
    if (normalizeLightingMode(componentProperties.lightingMode) !== "region") {
      return Promise.reject(new Error("请先选择轻量柔光模式。"));
    }
    if (isRangeEditing) {
      return Promise.resolve();
    }
    const activeRangeRequest = pendingRangeRequestsByRequestId.values().next().value;
    if (activeRangeRequest) {
      return activeRangeRequest.promise;
    }
    if (isViewEditing) {
      runtimeApi.setViewEditing(false);
    }
    const rangeRequestId = "range-" + ++requestIdCounter;
    let resolveRangeOpen;
    let rejectRangeOpen;
    const rangeOpenPromise = new Promise((resolveOpen, rejectOpen) => {
      resolveRangeOpen = resolveOpen;
      rejectRangeOpen = rejectOpen;
    });
    const rangeOpenTimeoutId = setTimeout(() => {
      pendingRangeRequestsByRequestId.delete(rangeRequestId);
      postToStageFrame({
        type: "range-editor",
        open: false
      });
      setRangeEditingState(false);
      rejectRangeOpen(new Error("打开照射范围编辑超时，请重试。"));
    }, 5000);
    pendingRangeRequestsByRequestId.set(rangeRequestId, {
      resolve: resolveRangeOpen,
      reject: rejectRangeOpen,
      timeout: rangeOpenTimeoutId,
      promise: rangeOpenPromise,
      open: true
    });
    postToStageFrame({
      type: "range-editor",
      open: true,
      requestId: rangeRequestId
    });
    return rangeOpenPromise;
  };
  runtimeApi.flushRangeEditor = () => {
    if (isDisposed || !isAuthorized || !isScenePresented || !isRangeEditing) {
      return Promise.reject(new Error("请先打开照射范围编辑。"));
    }
    const flushRequestId = "range-" + ++requestIdCounter;
    return new Promise((resolveFlush, rejectFlush) => {
      const flushTimeoutId = setTimeout(() => {
        pendingRangeRequestsByRequestId.delete(flushRequestId);
        rejectFlush(new Error("读取照射范围超时，请重试。"));
      }, 5000);
      pendingRangeRequestsByRequestId.set(flushRequestId, {
        resolve: resolveFlush,
        reject: rejectFlush,
        timeout: flushTimeoutId,
        open: true
      });
      postToStageFrame({
        type: "range-editor",
        flush: true,
        requestId: flushRequestId
      });
    });
  };
  runtimeApi.closeRangeEditor = ({ flush: shouldFlush = false } = {}) => {
    rejectPendingRangeRequests("照射范围编辑已取消。");
    if (!shouldFlush) {
      postToStageFrame({
        type: "range-editor",
        open: false
      });
      setRangeEditingState(false);
      return;
    }
    if (isDisposed || !isAuthorized || !isScenePresented) {
      return Promise.reject(new Error("户型画面暂不可用，请重新打开照射范围。"));
    }
    const closeRequestId = "range-" + ++requestIdCounter;
    return new Promise((resolveClose, rejectClose) => {
      const closeTimeoutId = setTimeout(() => {
        pendingRangeRequestsByRequestId.delete(closeRequestId);
        rejectClose(new Error("读取照射范围超时，请重试。"));
      }, 5000);
      pendingRangeRequestsByRequestId.set(closeRequestId, {
        resolve: resolveClose,
        reject: rejectClose,
        timeout: closeTimeoutId,
        open: false
      });
      postToStageFrame({
        type: "range-editor",
        open: false,
        requestId: closeRequestId
      });
    });
  };
  // 授权状态变化：未授权时把宿主置 inert，并关掉范围编辑、拒绝在途编辑请求、
  // abort 所有请求；授权恢复后若处于编辑场景，重发一次配置让舞台恢复可交互。
  runtimeApi.setAuthorized = authorized => {
    const hasAuthorizationChanged = isAuthorized !== (authorized === true);
    isAuthorized = authorized === true;
    hostElement.inert = !isAuthorized;
    refreshActivityState();
    if (!isAuthorized) {
      closePopupLayoutPreview();
      runtimeApi.closeRangeEditor();
      rejectPendingEdits("授权验证暂不可用，请恢复后重新调整。");
      dismissFocus(true);
      pendingAbortControllersSet.forEach(expiredController => expiredController.abort());
    }
    if (hasAuthorizationChanged && (isEditing || runtimeContext.editable)) {
      sendConfigUpdate();
    }
  };
  Object.defineProperty(runtimeApi, "metadata", {
    get: () => componentMetadata
  });
  Object.defineProperty(runtimeApi, "presentationLayout", {
    get: () => presentationLayout
  });
  Object.defineProperty(runtimeApi, "ready", {
    get: () => isScenePresented && !isDisposed && isAuthorized
  });
  Object.defineProperty(runtimeApi, "viewEditing", {
    get: () => isViewEditing
  });
  Object.defineProperty(runtimeApi, "viewCamera", {
    get: () => activeCamera
  });
  Object.defineProperty(runtimeApi, "rangeEditing", {
    get: () => isRangeEditing && !isDisposed && isAuthorized
  });
  // 进入 / 退出视角调整。前置条件不满足时直接抛中文错误，由调用方展示；
  // 进入视角调整前必须先退出照射范围编辑，两者共用同一套指针交互。
  runtimeApi.setViewEditing = viewEditingEnabled => {
    if (viewEditingEnabled) {
      closePopupLayoutPreview();
    }
    if (!runtimeContext.editable || isDisposed) {
      throw new Error("请在编辑器中调整户型视角。");
    }
    if (viewEditingEnabled && !isScenePresented) {
      throw new Error("户型还在加载，请稍候再调整视角。");
    }
    if (viewEditingEnabled && (isRangeEditing || pendingRangeRequestsByRequestId.size)) {
      runtimeApi.closeRangeEditor();
    }
    isViewEditing = viewEditingEnabled === true;
    if (!isViewEditing) {
      activeCamera =
        componentProperties.floorCameras?.[componentProperties.floorSelection] ||
        componentProperties.camera ||
        defaultCamera;
    }
    hostElement.classList.toggle("is-view-editing", isViewEditing);
    stageFrameElement.style.pointerEvents = isViewEditing || isRangeEditing ? "auto" : "none";
    sendConfigUpdate();
  };
  // 视角指令：发给舞台的 editor-command 并按 requestId 等回执（5 秒超时）。
  // 只有宿主页（editable）且在视角编辑中才允许，展示页调用一律拒绝。
  runtimeApi.viewCommand = (viewCommandName, viewCommandValue) =>
    new Promise((resolveView, rejectView) => {
      if (!runtimeContext.editable || !isViewEditing || !isScenePresented || isDisposed) {
        rejectView(new Error("请先进入户型视角调整。"));
        return;
      }
      const viewRequestId = "view-" + ++requestIdCounter;
      const viewTimeoutId = setTimeout(() => {
        pendingEditsByRequestId.delete(viewRequestId);
        rejectView(new Error("读取视角超时，请重试。"));
      }, 5000);
      pendingEditsByRequestId.set(viewRequestId, {
        resolve: resolveView,
        reject: rejectView,
        timeout: viewTimeoutId
      });
      postToStageFrame({
        type: "editor-command",
        command: viewCommandName,
        value: viewCommandValue,
        requestId: viewRequestId
      });
    });
  runtimeApi.captureView = () => runtimeApi.viewCommand("save-camera");
  // 聚焦视角指令：编辑态专用，同样 5 秒超时；目标默认取当前选中项。
  runtimeApi.focusCommand = (focusCommandName, focusTargetId = selectedId, focusCommandValue) =>
    new Promise((resolveFocus, rejectFocus) => {
      if (!isEditing || !isScenePresented || isDisposed || !isAuthorized) {
        rejectFocus(new Error("户型还在加载，请稍候再设置聚焦视角。"));
        return;
      }
      const focusRequestId = "focus-" + ++requestIdCounter;
      const focusTimeoutId = setTimeout(() => {
        pendingEditsByRequestId.delete(focusRequestId);
        rejectFocus(new Error("读取聚焦视角超时，请重试。"));
      }, 5000);
      pendingEditsByRequestId.set(focusRequestId, {
        resolve: resolveFocus,
        reject: rejectFocus,
        timeout: focusTimeoutId,
        command: focusCommandName,
        id: focusTargetId
      });
      postToStageFrame({
        type: "editor-command",
        command: focusCommandName,
        id: focusTargetId,
        value: focusCommandValue,
        requestId: focusRequestId
      });
    });
  return runtimeApi;
}
