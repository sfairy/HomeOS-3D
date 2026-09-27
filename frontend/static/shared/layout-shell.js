/**
 * 布局交互层：面板折叠 / 拖拽调宽 / 状态记忆。
 */
import { clampNumber, finiteNumberOr } from "../utils/numbers.js?v=2609271226";
import { capturePointer, releasePointer } from "../utils/pointer-capture.js?v=2609271226";

/** 存储结构的版本号。字段语义变了就加一：旧值会被当作无效而回落到默认，不做迁移。 */
const SCHEMA_VERSION = 1;
/** 分隔条键盘微调步长（px）。与工作室原有的 0.03 比例步长观感接近。 */
const KEYBOARD_STEP_PX = 16;
/** 百分比栏写进 CSS 变量的小数位。工作室原有实现用 2 位，保持一致。 */
const PERCENT_DECIMALS = 2;

/**
 * 取存储对象。拿不到（无痕模式 / 被策略禁用）时返回 null，调用方原地降级为仅内存。
 */
function resolveStorage(explicitStorage) {
  if (explicitStorage) {
    return explicitStorage;
  }
  try {
    return window.localStorage;
  } catch {
    // 访问 window.localStorage 本身就会抛（隐私模式），这里必须连取值一起兜住。
    return null;
  }
}

function readStoredState(storage, storageKey) {
  try {
    const rawValue = storage?.getItem(storageKey);
    if (!rawValue) {
      return null;
    }
    const parsedValue = JSON.parse(rawValue);
    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
  } catch {
    // 值不是合法 JSON（或被别处写坏）时当作「没存过」，用默认布局继续，不打断页面。
    return null;
  }
}

function writeStoredState(storage, storageKey, state) {
  try {
    storage?.setItem(storageKey, JSON.stringify(state));
  } catch {
    // 写失败（配额满 / 无痕模式）不影响本次会话：内存里的 state 仍是权威。
  }
}

/**
 * 在跨进程重启后仍能安全解析的前提下把一个 CSS 长度读成数字。只认纯数字或 px，其余当读不到。
 */
function readCssLengthPx(element, cssVarName) {
  if (!cssVarName || !element) {
    return null;
  }
  const rawValue = getComputedStyle(element).getPropertyValue(cssVarName).trim();
  if (!rawValue) {
    return null;
  }
  const numericValue = Number.parseFloat(rawValue);
  return Number.isFinite(numericValue) ? numericValue : null;
}

/**
 * 把状态写进 DOM 与 CSS 变量。折叠与展开走两条不同的路径，见文件头第 2 条。
 */
function applyPanelState(panel, panelState, shell) {
  // 面板本体：CSS 用它藏掉除把手条以外的子元素。
  if (panel.element) {
    panel.element.dataset.collapsed = String(panelState.collapsed);
  }
  // 外壳：CSS 用它覆盖整条网格轨道。折叠时轨道宽度只能由 CSS 决定（可能不是「这一栏的宽度」，
  shell.dataset[panel.shellMarkerName] = panelState.collapsed ? "collapsed" : "open";

  const varTarget = panel.varTarget || shell;
  if (panelState.collapsed) {
    varTarget.style.removeProperty(panel.sizeVar);
    return;
  }
  varTarget.style.setProperty(panel.sizeVar, formatPanelSize(panel, panelState.size));
}

function formatPanelSize(panel, size) {
  return panel.unit === "%"
    ? size.toFixed(PERCENT_DECIMALS) + "%"
    : Math.round(size * 100) / 100 + "px";
}

function resolvePanelLimits(panel, shell) {
  if (typeof panel.limits === "function") {
    const dynamicLimits = panel.limits();
    if (dynamicLimits) {
      const dynamicMin = finiteNumberOr(dynamicLimits.min, panel.def);
      const dynamicMax = finiteNumberOr(dynamicLimits.max, panel.def);
      // 下限是硬底线（多半来自 CSS 的 minmax），上限则可能被「别的栏占了多少」压到下限以下
      return { min: dynamicMin, max: Math.max(dynamicMin, dynamicMax) };
    }
  }
  if (panel.cachedLimits) {
    return panel.cachedLimits;
  }
  const fallbackValue = finiteNumberOr(panel.def, 0);
  const cssMin = readCssLengthPx(shell, panel.minVar);
  const cssMax = readCssLengthPx(shell, panel.maxVar);
  const staticMin = finiteNumberOr(panel.min, cssMin ?? fallbackValue);
  const staticMax = finiteNumberOr(panel.max, cssMax ?? fallbackValue);
  panel.cachedLimits = { min: Math.min(staticMin, staticMax), max: Math.max(staticMin, staticMax) };
  return panel.cachedLimits;
}

/**
 * 创建布局控制器。
 * @param {object} options
 * @param {string} options.storageKey localStorage 键名。
 * @param {HTMLElement} options.shell 三栏网格容器；CSS 变量与 data-* 标记都写在它上面。
 * @param {Array<object>} options.panels 栏描述，见 createLayoutController 内的字段说明。
 * @param {Array<object>} [options.separators] 分隔条描述。
 * @param {object} [options.storage] 注入的存储对象（测试用）；默认 window.localStorage。
 */
export function createLayoutController(options) {
  const {
    storageKey,
    shell,
    panels: panelConfigs,
    separators: separatorConfigs = [],
    storage: explicitStorage,
    onChange
  } = options;
  const storage = resolveStorage(explicitStorage);

  const panels = panelConfigs.map(panelConfig => ({
    unit: "px",
    collapsible: false,
    ...panelConfig,
    shellMarkerName:
      panelConfig.shellMarkerName ||
      "layout" + panelConfig.id.charAt(0).toUpperCase() + panelConfig.id.slice(1)
  }));
  const panelsById = new Map(panels.map(panel => [panel.id, panel]));

  /**
   * 把任意来源（存储 / 预设）的栏状态收敛到合法区间。折叠态只对声明了 collapsible 的栏生效 ——
   */
  function normalizePanelState(panel, rawPanelState) {
    const limits = resolvePanelLimits(panel, shell);
    const rawSize = finiteNumberOr(rawPanelState?.size, panel.def);
    return {
      size: clampNumber(rawSize, limits.min, limits.max),
      collapsed: panel.collapsible && rawPanelState?.collapsed === true
    };
  }

  /** 归一化一栏并立刻落到 DOM：见 normalizePanelState 的注释（跨栏上限依赖实测宽度）。 */
  function normalizeAndApplyPanelState(panel, rawPanelState) {
    const panelState = normalizePanelState(panel, rawPanelState);
    applyPanelState(panel, panelState, shell);
    return panelState;
  }

  function defaultState() {
    const panelStates = {};
    for (const panel of panels) {
      panelStates[panel.id] = normalizeAndApplyPanelState(panel, null);
    }
    return { version: SCHEMA_VERSION, panels: panelStates };
  }

  /**
   * 本地是否已经有布局记录。两个来源都算：磁盘上读到一份合法记录，或本次会话里用户
   */
  let hasLayoutRecord = false;

  /** 读取存储并逐栏校验。版本不符、结构不对、数值越界都在这里被收敛，后续代码可当作可信输入。 */
  function loadState() {
    const storedState = readStoredState(storage, storageKey);
    if (!storedState || storedState.version !== SCHEMA_VERSION) {
      return defaultState();
    }
    hasLayoutRecord = true;
    const panelStates = {};
    for (const panel of panels) {
      panelStates[panel.id] = normalizeAndApplyPanelState(panel, storedState.panels?.[panel.id]);
    }
    // 旧记录里可能还留着 preset / immersive 两个字段（预设与沉浸模式已删）：这里只挑 panels 读，
    return { version: SCHEMA_VERSION, panels: panelStates };
  }

  let state = loadState();

  function persist() {
    // 落过一次盘就算「本地已有布局记录」：之后 seedPanels() 不再用旧文档里的值播种。
    hasLayoutRecord = true;
    writeStoredState(storage, storageKey, state);
  }

  function notify() {
    onChange?.();
  }

  function applyAll() {
    for (const panel of panels) {
      applyPanelState(panel, state.panels[panel.id], shell);
    }
    syncSeparatorAria();
  }

  // ---- 分隔条 ARIA：只反映「用于表述的那一栏」，与工作室原先只报高度比例的做法一致。
  function syncSeparatorAria() {
    for (const separator of separatorConfigs) {
      const ariaPanel = panelsById.get(separator.ariaPanel || separator.axes[0]?.panelId);
      if (!ariaPanel || !separator.element) {
        continue;
      }
      const limits = resolvePanelLimits(ariaPanel, shell);
      const currentSize = state.panels[ariaPanel.id].size;
      separator.element.setAttribute("aria-valuemin", String(Math.round(limits.min)));
      separator.element.setAttribute("aria-valuemax", String(Math.round(limits.max)));
      separator.element.setAttribute("aria-valuenow", String(Math.round(currentSize)));
      separator.element.setAttribute(
        "aria-valuetext",
        ariaPanel.unit === "%"
          ? Math.round(currentSize) + "%"
          : Math.round(currentSize) + " 像素"
      );
    }
  }

  function setPanelSize(panelId, size, commit = true) {
    const panel = panelsById.get(panelId);
    if (!panel) {
      return;
    }
    const limits = resolvePanelLimits(panel, shell);
    const nextSize = clampNumber(finiteNumberOr(size, panel.def), limits.min, limits.max);
    const panelState = state.panels[panelId];
    if (panelState.size === nextSize) {
      return;
    }
    panelState.size = nextSize;
    applyPanelState(panel, panelState, shell);
    syncSeparatorAria();
    if (commit) {
      persist();
      notify();
    }
  }

  function setPanelCollapsed(panelId, collapsed, commit = true) {
    const panel = panelsById.get(panelId);
    if (!panel?.collapsible) {
      return;
    }
    const panelState = state.panels[panelId];
    const nextCollapsed = collapsed === true;
    if (panelState.collapsed === nextCollapsed) {
      return;
    }
    panelState.collapsed = nextCollapsed;
    applyPanelState(panel, panelState, shell);
    if (commit) {
      persist();
      notify();
    }
  }

  function togglePanel(panelId) {
    const panelState = state.panels[panelId];
    if (!panelState) {
      return;
    }
    setPanelCollapsed(panelId, !panelState.collapsed);
  }

  // ---- 分隔条。

  /**
   * 把一个轴的像素位移换算成该栏尺寸的增量。
   */
  function axisPixelDeltaToSizeDelta(axis, deltaPx) {
    const panel = panelsById.get(axis.panelId);
    if (!panel) {
      return 0;
    }
    // 缩放系数读不到 / 是 0 时按 1 处理：除以 0 会把拖拽变成「一步跳到极限」。
    const viewportScale = finiteNumberOr(axis.viewportScale?.(), 1) || 1;
    const signedDeltaPx = (deltaPx / viewportScale) * finiteNumberOr(axis.sign, 1);
    if (panel.unit !== "%") {
      return signedDeltaPx;
    }
    const referencePx = finiteNumberOr(axis.reference?.(), 0);
    return referencePx > 0 ? (signedDeltaPx / referencePx) * 100 : 0;
  }

  function axisKeyboardStepSize(axis) {
    return Math.abs(axisPixelDeltaToSizeDelta(axis, KEYBOARD_STEP_PX));
  }

  for (const separator of separatorConfigs) {
    const separatorElement = separator.element;
    if (!separatorElement) {
      continue;
    }
    separatorElement.setAttribute("aria-orientation", separator.orientation || "vertical");
    if (separator.orientation === "vertical") {
      separatorElement.setAttribute("aria-label", separator.label || "拖动调整面板宽度");
    } else if (separator.orientation === "horizontal") {
      separatorElement.setAttribute("aria-label", separator.label || "拖动调整面板高度");
    } else if (separator.label) {
      separatorElement.setAttribute("aria-label", separator.label);
    }
    // 双击复位：把本分隔条牵动的栏恢复成默认尺寸，是「调歪了」最常用的出口。
    if (separator.resettable !== false) {
      separatorElement.addEventListener("dblclick", () => {
        for (const axis of separator.axes) {
          const panel = panelsById.get(axis.panelId);
          if (panel) {
            setPanelSize(axis.panelId, panel.def, false);
          }
        }
        persist();
        notify();
      });
    }
    bindSeparatorPointer(separator);
    bindSeparatorKeyboard(separator);
  }

  function bindSeparatorPointer(separator) {
    const separatorElement = separator.element;
    let dragState = null;

    const endDrag = pointerEvent => {
      if (!dragState) {
        return;
      }
      // 只在收尾的是同一次拖拽时才结束：多指触控 / 多键鼠标会有别的指针的 up 事件打进来，
      if (
        pointerEvent &&
        pointerEvent.pointerId !== undefined &&
        pointerEvent.pointerId !== dragState.pointerId
      ) {
        return;
      }
      const activeDrag = dragState;
      dragState = null;
      delete separatorElement.dataset.layoutDragAxis;
      shell.removeAttribute("data-layout-resizing");
      if (activeDrag.didChange) {
        persist();
        notify();
      }
      if (pointerEvent !== false) {
        releasePointer(separatorElement, activeDrag.pointerId);
      }
    };

    separatorElement.addEventListener("pointerdown", pointerDownEvent => {
      if (pointerDownEvent.button !== 0) {
        return;
      }
      dragState = {
        pointerId: pointerDownEvent.pointerId,
        startX: pointerDownEvent.clientX,
        startY: pointerDownEvent.clientY,
        startSizes: new Map(
          separator.axes.map(axis => [axis.panelId, state.panels[axis.panelId].size])
        ),
        didChange: false
      };
      shell.setAttribute("data-layout-resizing", "true");
      capturePointer(separatorElement, pointerDownEvent.pointerId);
      pointerDownEvent.preventDefault();
    });

    separatorElement.addEventListener("pointermove", pointerMoveEvent => {
      if (dragState?.pointerId !== pointerMoveEvent.pointerId) {
        return;
      }
      if ((pointerMoveEvent.buttons & 1) === 0) {
        // 指针在元素外抬起时 pointerup 可能收不到（例如中途切了窗口），这里补一次收尾。
        endDrag(pointerMoveEvent);
        return;
      }
      const deltaX = pointerMoveEvent.clientX - dragState.startX;
      const deltaY = pointerMoveEvent.clientY - dragState.startY;
      // 位移小于 2px 视为抖动：按下瞬间常有几像素偏移，处理它会让分隔条「点一下自己跳一格」。
      if (Math.hypot(deltaX, deltaY) < 2) {
        return;
      }
      separatorElement.dataset.layoutDragAxis = "active";
      for (const axis of separator.axes) {
        const deltaPx = axis.axis === "x" ? deltaX : deltaY;
        const startSize = dragState.startSizes.get(axis.panelId);
        setPanelSize(axis.panelId, startSize + axisPixelDeltaToSizeDelta(axis, deltaPx), false);
      }
      dragState.didChange = true;
    });

    separatorElement.addEventListener("pointerup", endDrag);
    separatorElement.addEventListener("pointercancel", endDrag);
    // 捕获被浏览器收回时它已自行释放，再释放一次是多余的（releasePointer 会吞掉这类异常，
    separatorElement.addEventListener("lostpointercapture", () => endDrag(false));
    window.addEventListener("pointerup", endDrag, true);
    window.addEventListener("pointercancel", endDrag, true);
    window.addEventListener("blur", endDrag);
  }

  /**
   * 键盘调宽。只在分隔条自己获焦时生效 —— 方向键在两个页面都已被「微调选中对象」占用
   */
  function bindSeparatorKeyboard(separator) {
    separator.element.addEventListener("keydown", keyDownEvent => {
      const isArrowLeft = keyDownEvent.key === "ArrowLeft";
      const isArrowRight = keyDownEvent.key === "ArrowRight";
      const isArrowUp = keyDownEvent.key === "ArrowUp";
      const isArrowDown = keyDownEvent.key === "ArrowDown";
      const isJumpToEdge = keyDownEvent.key === "Home" || keyDownEvent.key === "End";
      // 方向键与本轴对齐：左/右调宽度，上/下调高度；两轴都有的分隔条四个方向都收。
      const keyboardDeltaPx = isArrowLeft || isArrowUp ? -KEYBOARD_STEP_PX : KEYBOARD_STEP_PX;
      if (!isJumpToEdge && !isArrowLeft && !isArrowRight && !isArrowUp && !isArrowDown) {
        return;
      }
      keyDownEvent.preventDefault();

      for (const axis of separator.axes) {
        const panel = panelsById.get(axis.panelId);
        if (!panel) {
          continue;
        }
        if (isJumpToEdge) {
          // Home / End 是「一键到边」，两轴都跳；方向键只作用在方向对得上的那个轴。
          const limits = resolvePanelLimits(panel, shell);
          setPanelSize(axis.panelId, keyDownEvent.key === "Home" ? limits.min : limits.max, false);
          continue;
        }
        const isAxisAligned =
          (axis.axis === "x" && (isArrowLeft || isArrowRight)) ||
          (axis.axis === "y" && (isArrowUp || isArrowDown));
        if (!isAxisAligned) {
          continue;
        }
        setPanelSize(
          axis.panelId,
          state.panels[axis.panelId].size + axisPixelDeltaToSizeDelta(axis, keyboardDeltaPx),
          false
        );
      }
      persist();
      notify();
    });
  }

  /**
   * 一次性播种（迁移用）：把「旧版本存在文档里的布局值」搬进本地存储。
   * @param {Record<string, number>} seedSizes 栏 id → 尺寸，量纲与 panel.unit 一致（px 或百分比）。
   * @returns {boolean} 是否真的改变了某一栏的尺寸。
   */
  function seedPanels(seedSizes) {
    if (hasLayoutRecord) {
      return false;
    }
    let didSeed = false;
    for (const [panelId, seedSize] of Object.entries(seedSizes || {})) {
      const panel = panelsById.get(panelId);
      // 非有限值一律跳过：调用方常用 undefined 表示「这个比例旧文档里没有」，不能当成 0。
      if (!panel || typeof seedSize !== "number" || !Number.isFinite(seedSize)) {
        continue;
      }
      const limits = resolvePanelLimits(panel, shell);
      const panelState = state.panels[panelId];
      const seededSize = clampNumber(seedSize, limits.min, limits.max);
      if (panelState.size === seededSize) {
        continue;
      }
      panelState.size = seededSize;
      applyPanelState(panel, panelState, shell);
      didSeed = true;
    }
    // 落到这里的每一次调用都算「播种已尝试」：哪怕旧值恰好等于默认值，也不该被下一份旧文档再覆盖。
    hasLayoutRecord = true;
    if (didSeed) {
      syncSeparatorAria();
      persist();
      notify();
    }
    return didSeed;
  }

  /**
   * 窗口尺寸变化后重算：百分比栏的上下限随窗口变化（例如窗口变矮后旧的预览高度比例会把预览区
   */
  function refresh() {
    for (const panel of panels) {
      const limits = resolvePanelLimits(panel, shell);
      const panelState = state.panels[panel.id];
      const clampedSize = clampNumber(panelState.size, limits.min, limits.max);
      if (clampedSize !== panelState.size) {
        panelState.size = clampedSize;
        applyPanelState(panel, panelState, shell);
      }
    }
    syncSeparatorAria();
  }

  applyAll();

  return {
    getState: () => state,
    getPanelSize: panelId => state.panels[panelId]?.size,
    isCollapsed: panelId => state.panels[panelId]?.collapsed === true,
    setPanelSize,
    setPanelCollapsed,
    togglePanel,
    seedPanels,
    refresh,
    /** 供页面在自身布局变化后同步一次（折叠 / 展开之后调用）。 */
    sync: applyAll
  };
}

/**
 * 把共享的布局 chrome 接到控制器上：折叠把手条（每栏一个）。
 * @param {object} options
 * @param {object} options.controller createLayoutController 的返回值。
 * @param {ParentNode} options.root 标记的查找范围（一般是 document）。
 */
export function bindLayoutControls({ controller, root }) {
  const syncCallbacks = [];

  function syncAll() {
    for (const syncCallback of syncCallbacks) {
      syncCallback();
    }
  }

  for (const railElement of root.querySelectorAll("[data-layout-toggle]")) {
    const panelId = railElement.dataset.layoutToggle;
    const panelLabel = railElement.dataset.layoutToggleLabel || "面板";
    syncCallbacks.push(() => {
      const collapsed = controller.isCollapsed(panelId);
      const actionLabel = (collapsed ? "展开" : "折叠") + panelLabel;
      railElement.setAttribute("aria-expanded", String(!collapsed));
      railElement.setAttribute("aria-label", actionLabel);
      railElement.title = actionLabel;
    });
    railElement.addEventListener("click", () => {
      controller.togglePanel(panelId);
      syncAll();
    });
  }

  syncAll();

  // 只返回 sync：控件在页面存活期内一直存在（顶栏与三栏都不会被重建），没有卸载路径，
  return { sync: syncAll };
}
