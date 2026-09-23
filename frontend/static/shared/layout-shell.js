/**
 * 布局交互层：面板折叠 / 拖拽调宽 / 状态记忆。
 *
 * 两个主工作台（仪表盘编辑器 `/index`、3D 户型工作室 `/3d-studio`）共用这一份实现。页面侧只提供
 * 一份配置（栏描述 + 分隔条），本文件负责状态、持久化、拖拽与键盘。
 *
 * 这里**只有**折叠与调宽两件事。曾经还有一层「布局预设 + 沉浸模式 + 恢复默认」（顶栏一个布局
 * 下拉菜单，外加一套 ⌘⇧1..3 的快捷键），用户判定它对两页都没有实际价值，已整层删除：连同
 * layout.css 的对应样式、layout-shortcuts.js 的 bindLayoutMenu 一起撤掉，不留只藏样式的空壳。
 * 要重新加回这类「整体切换布局」的能力，请先想清楚它比「把栏收起来 / 拖宽」多解决了什么问题。
 *
 * 三条设计前提，动这个文件之前先读：
 *
 * 1. **布局状态不是业务数据。** 它只描述「用户怎么看」，不属于文档，因此一律存 localStorage，
 *    绝不写回仪表盘文档或 3D 草稿。3D 工作室原先把两个比例放在 `activeScene.settings` 里，拖动
 *    分隔条会 `markDocumentDirty()` → 触发自动保存 → 可能弹出 409 保存冲突框：那是把「观察方式」
 *    当成了「内容」。而 `bridge/scene-update.js` 与 `bridge/render-cache.js` 早把这两个键列入忽略
 *    名单，注释也写着它们「只改变编辑器的观察方式」—— 本文件只是把项目已有的判断落实到存储层。
 *
 * 2. **JS 只写属性与变量，不写几何。** 折叠态由 `data-*` 与 CSS 变量表达，列宽由 CSS 消费。
 *    这样断点、过渡、`@container` 查询仍全归 CSS 管，JS 不需要知道任何像素布局规则。折叠时本文件
 *    **移除**内联变量而不是写一个 36px —— 内联样式会盖过 CSS 的折叠规则，而轨道宽度只能由 CSS
 *    决定（工作室右栏是百分比轨道，硬写 36px 会撞上 `minmax(420px, …)` 的下限）。
 *
 * 3. **上下限只有一份，在 CSS 里。** 每栏的 min/max 由 CSS 自定义属性声明，本文件用
 *    `getComputedStyle` 读出（`minVar` / `maxVar`）。JS 侧再抄一份数字就会与 CSS 漂移 —— 工作室
 *    原先正是这种漂移：CSS 写库栏 204px、JS 兜底 168；CSS 写中栏最小 400px、JS 却允许压到 320，
 *    拖到极限时三条轨道之和超过容器，网格真的溢出并被 `body{overflow:hidden}` 裁掉。
 *    需要随窗口变化的上下限（工作室两个百分比就是）用 `limits()` 回调给出，它是唯一豁免。
 *
 * 存储不可用（无痕模式 / 配额满）时全线静默降级为「仅内存」：布局是纯偏好，读不到就用默认值，
 * 写失败也不该打断用户。这一点与 `shared/sound-effects.js` 的处理一致。
 */
import { clampNumber, finiteNumberOr } from "../utils/numbers.js?v=2609231402";
import { capturePointer, releasePointer } from "../utils/pointer-capture.js?v=2609231402";

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
 * 不读 `getBoundingClientRect`：那会强制布局，而本函数在拖拽热路径上会被反复调用。
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
  // 而是一整条 minmax() 表达式），所以这里只给标记，不给尺寸。
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

/**
 * 解析一栏的当前上下限。优先级：`limits()` 动态回调 → CSS 变量（`minVar` / `maxVar`）→ 描述里的
 * 静态数字。CSS 变量只在首次成功读到后缓存：它在页面生命周期内是常量，而 getComputedStyle 在
 * 拖拽热路径上每帧都调一次是没必要的开销。
 */
function resolvePanelLimits(panel, shell) {
  if (typeof panel.limits === "function") {
    const dynamicLimits = panel.limits();
    if (dynamicLimits) {
      const dynamicMin = finiteNumberOr(dynamicLimits.min, panel.def);
      const dynamicMax = finiteNumberOr(dynamicLimits.max, panel.def);
      // 下限是硬底线（多半来自 CSS 的 minmax），上限则可能被「别的栏占了多少」压到下限以下
      // （编辑器左右栏就受「三栏之和必须塞进外壳」约束）。此时取 max = min 而不是让两者交换：
      // 交换会把下限抬到上限之上，把一栏顶成比它的合法最小值还宽。
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
 *
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

  // ---- 栏描述：补齐默认值，并预先算出 data-* 标记名（dataset 是 camelCase，属性名是 kebab-case）。
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
   * 存储是可被用户直接改写的输入，不能因为里面写了 `collapsed: true` 就去折叠一个没有把手条的栏。
   *
   * 逐栏归一化时**顺手把结果写进 DOM**（就在 normalizeAndApplyPanelState 里）。原因是
   * 页面的 limits() 是按「另一栏此刻的实测宽度」算上限的，
   * 而实测宽度只有在写进 DOM 之后才变。不在循环里写，第二栏就会拿着第一栏的**旧宽度**算自己的
   * 上限 —— 窄外壳下两栏之和能超过共享预算（实测：外壳 932px 时算出 212 + 232 = 444 > 412，
   * 中栏被顶到 520 的最小宽度、三轨之和超出外壳，overflow: hidden 直接裁掉溢出的一栏）。
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
   * （调宽 / 折叠 / 套预设 / 复位）与播种已经把布局定下来过。
   *
   * `seedPanels()` 靠它判断「该不该用旧文档里的值播种」：只有在完全没有记录时才播种，
   * 否则用户已经调好的布局会被一份旧文档顶掉。存储不可用时也照样成立（persist 无条件置位），
   * 否则无痕模式下每次 UI 同步都会把旧文档的值重新盖回来。
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
    // 多余字段既不报错也不影响行为，下次 persist 时自然消失。
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

  /**
   * 写一栏的尺寸。`commit` 决定是否落盘：拖拽过程中每帧都写 localStorage 没有意义
   * （布局是纯偏好），所以只在拖拽收尾与离散操作时落盘。
   */
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
   *
   * 两处换算，顺序不能换：
   * 1. **视口像素 → 逻辑像素**（`viewportScale()`，默认 1）。编辑器整页处于
   *    `transform: scale()` 之下，指针位移量的是缩放后的屏幕像素，而面板尺寸写的是逻辑像素；
   *    不除这个系数，分隔条就会落后于光标（缩放 0.91 时每拖 100px 差 9px）。工作室不缩放，
   *    不声明这个回调即等于 1。
   * 2. **逻辑像素 → 该栏的单位**。百分比栏还要除「该轴对应的像素跨度」（由 `reference()` 给出，
   *    例如右栏宽度除以外壳宽度、预览高度除以详情栏高度）。
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
      // 拿它结束当前拖拽会让分隔条半途停在鼠标位置。`false` 是本文件内部约定的「无事件」标记。
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
    // 但传 false 更直白地表达「这次不用我们释放」）。
    separatorElement.addEventListener("lostpointercapture", () => endDrag(false));
    window.addEventListener("pointerup", endDrag, true);
    window.addEventListener("pointercancel", endDrag, true);
    window.addEventListener("blur", endDrag);
  }

  /**
   * 键盘调宽。只在分隔条自己获焦时生效 —— 方向键在两个页面都已被「微调选中对象」占用
   * （编辑器 nudge 选中控件、工作室 nudge 选中物件），挂在 window 上必然打架。
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
   *
   * 只在本地还没有任何布局记录时生效 —— 升级后第一次打开老文档要把它带过来，否则用户会看到默认
   * 布局、以为布局被重置了；而用户一旦手动调过布局（本地有了记录），这里就再也不生效，旧文档不会
   * 把新布局顶掉。调用点可以放心地反复调用：判定与去重都在这里。
   *
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
   * 压成负高度），所以要重新 clamp 一次。工作室原先在 applyPreviewPanelRatio 里顺带做这件事。
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
 *
 * 全部按 `data-*` 标记查找，不写死 id：标记写在 HTML 里，用属性接线可以让「HTML 里有哪些控件」
 * 与「JS 认哪些控件」一一对应；某个页面少写一个控件时这里逐项跳过，不会因为一个缺失的 id
 * 就整段失效（本仓的 invariant 只校验 `#id` 选择器，属性选择器天然不在它的管辖内，所以这里
 * 更需要显式地容错）。
 *
 * @param {object} options
 * @param {object} options.controller createLayoutController 的返回值。
 * @param {ParentNode} options.root 标记的查找范围（一般是 document）。
 */
export function bindLayoutControls({ controller, root }) {
  /** 每次状态变化后要把控件的可视态重算一遍，集中在这里，避免各入口各自记得刷新。 */
  const syncCallbacks = [];

  function syncAll() {
    for (const syncCallback of syncCallbacks) {
      syncCallback();
    }
  }

  // ---- 折叠把手条。折叠后把手条是面板上唯一还剩的控件，所以它的文案与 aria 必须跟着走。
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

  // 控制器把 onChange 交给页面（页面要顺带重算画布），所以 syncAll 只能由页面显式调用，
  // 不能反客为主地接管 onChange —— 否则页面与布局层会各持一半的刷新职责。
  syncAll();

  // 只返回 sync：控件在页面存活期内一直存在（顶栏与三栏都不会被重建），没有卸载路径，
  // 所以不提供 destroy —— 一个没有调用者的摘监听 API 只会让人以为「有清理在跑」。
  return { sync: syncAll };
}
