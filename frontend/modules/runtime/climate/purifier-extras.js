/**
 * 「附加功能」卡片网格：把一台设备上除主控之外的相关实体（开关 / 选项 / 数值 / 按钮 /
 */
// 网格换算里的固定量：卡片区把一行切成 6 份，`--extra-columns` 写的就是「占几份」。
const GRID_GAP = 8;
// 一行之内至少要放得下的内容宽度：低于它就必须让卡片长高（或变宽）而不是硬挤。
const CARD_MIN_WIDTH = 64;
// 单行高度（含行距），行数换算的分母。
const ROW_UNIT = 44;
// select / number 卡天然比其它卡高一档（标题 + 状态 + 控件需要两行）。
const CARD_MIN_ROWS = 2;
// 「形态值 → 占几份网格」：1=半行、2=整行、3=1/3 行、4=2/3 行。这四个数值同时被 CSS 依赖。
const COLUMN_SPAN = { 3: 2, 4: 4, 1: 3, 2: 6 };
// 键盘 / 拖拽调整列宽时按这个顺序循环，顺序即「从窄到宽」的视觉直觉。
const COLUMN_ORDER = [3, 1, 4, 2];
const TAP_LONG_PRESS_DELAY = 300;
const DRAG_START_DISTANCE = 6;
// 等待设备确认状态变化的最长时间，超时报「未确认」而不是一直转圈。
const CONFIRM_TIMEOUT = 10000;
// 下拉菜单的尺寸 / 定位约束：至少 140px 宽，高 42~260px，四周留 8px 视口边距。
const SELECT_MENU_MIN_WIDTH = 140;
const SELECT_MENU_MARGIN = 8;
const SELECT_MENU_ROW = 42;
const SELECT_MENU_MIN_HEIGHT = 42;
const SELECT_MENU_MAX_HEIGHT = 260;
// 拖到滚动容器上下边缘 32px 内就自动滚动，步长 12px。
const AUTOSCROLL_EDGE = 32;
const AUTOSCROLL_STEP = 12;
// 无法测到视口大小时的兜底尺寸（老浏览器 / 离屏文档）。
const FALLBACK_VIEWPORT = { width: 1024, height: 768 };

/**
 * 推出某个实体 ID 可用的卡片形态列表。
 */
export function extraTypes(entityId) {
  const domain = String(entityId).split(".")[0];
  const mapped = {
    switch: "switch",
    input_boolean: "switch",
    light: "switch",
    select: "select",
    input_select: "select",
    number: "number",
    input_number: "number",
    button: "button",
    input_button: "button"
  }[domain];
  return mapped ? [mapped, "state"] : ["state"];
}

/**
 * 去掉卡片标题开头的「设备名 + 分隔符」冗余前缀，其余原样返回。
 */
export function extraTitle(rawTitle, prefix) {
  const text = String(rawTitle ?? "").trim();
  const deviceName = String(prefix ?? "").trim();
  if (!deviceName || !text.startsWith(deviceName)) {
    return text;
  }
  const rest = text.slice(deviceName.length).replace(/^[\s·・:：\-—_()（）[\]【】/、]+/, "").trim();
  return rest || text;
}

export const extraLabels = {
  switch: "开关",
  select: "选项",
  number: "数值",
  button: "按钮",
  state: "状态显示"
};

/**
 * 找出与某个实体同属一台设备（deviceId / device_id 相同）的其它实体。
 */
export function purifierRelatedEntities(entities, entityId) {
  const target = entities.find(item => item.entityId === entityId);
  const deviceId = target?.deviceId || target?.device_id;
  return deviceId
    ? entities.filter(
        item => item.entityId !== entityId && (item.deviceId || item.device_id) === deviceId
      )
    : [];
}

/**
 * 判断「换绑」之后设备是否真的变了，用来决定要不要整块重建卡片网格。
 */
export function purifierDeviceChanged(entities, previousEntityId, nextEntityId) {
  if (previousEntityId === nextEntityId) {
    return false;
  }
  const deviceIdOf = id => {
    const found = entities.find(item => item.entityId === id);
    return found?.deviceId || found?.device_id;
  };
  return !deviceIdOf(previousEntityId) || deviceIdOf(previousEntityId) !== deviceIdOf(nextEntityId);
}

/**
 * 把一次用户操作翻译成后端命令，并在下发前做齐本地校验。
 */
export function extraCommand(item, state, value) {
  const liveState = state?.newState || state;
  if (
    !liveState ||
    liveState.available === false ||
    ["", "unknown", "unavailable"].includes(liveState.state)
  ) {
    throw new Error("该实体当前不可用");
  }
  if (!extraTypes(item.entityId).includes(item.type) || item.type === "state") {
    throw new Error("不支持此操作");
  }
  const domain = item.entityId.split(".")[0];
  const data = {};
  let service;
  if (item.type === "switch") {
    service = liveState.state === "on" ? "turn_off" : "turn_on";
  }
  if (item.type === "button") {
    service = "press";
  }
  if (item.type === "select") {
    if (!liveState.attributes?.options?.includes(value)) {
      throw new Error("选项已失效");
    }
    service = "select_option";
    data.option = value;
  }
  if (item.type === "number") {
    const { min, max, step = 1 } = liveState.attributes || {};
    const numeric = Number(value);
    if (
      value === "" ||
      !Number.isFinite(numeric) ||
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      !Number.isFinite(step) ||
      step <= 0 ||
      numeric < min ||
      numeric > max
    ) {
      throw new Error("数值超出设备范围");
    }
    if (Math.abs((numeric - min) / step - Math.round((numeric - min) / step)) > 0.00001) {
      throw new Error("数值不符合设备步长");
    }
    service = "set_value";
    data.value = numeric;
  }
  return {
    entityId: item.entityId,
    domain,
    service,
    data,
    deviceKind: "purifier-extra"
  };
}

/**
 * 把配置里的原始控件列表归一化成渲染用的布局数组。
 */
export function extraLayout(controls) {
  return controls.map(({ label, ...rest }) => ({
    ...rest,
    type: extraTypes(rest.entityId)[0],
    columns: [1, 2, 3, 4].includes(rest.columns)
      ? rest.columns
      : ["select", "number"].includes(extraTypes(rest.entityId)[0])
        ? 1
        : 3,
    rows: rest.rows === 2 ? 2 : 1
  }));
}

/**
 * 把某个卡片移动到另一个卡片的位置，返回新的布局数组。
 */
export function moveExtra(controls, entityId, targetEntityId) {
  const layout = extraLayout(controls);
  const fromIndex = layout.findIndex(item => item.entityId === entityId);
  const toIndex = layout.findIndex(item => item.entityId === targetEntityId);
  if (fromIndex < 0 || toIndex < 0) {
    return layout;
  }
  const [moved] = layout.splice(fromIndex, 1);
  layout.splice(toIndex, 0, moved);
  return layout;
}

/**
 * 创建附加功能卡片网格控制器。
 */
export function createPurifierExtras({
  element: hostElement,
  onControl,
  onLayout = () => {},
  // 可选的「冗余前缀」提供者：返回一段设备名（如「冰箱」）时，卡片标题开头的它连同分隔符
  titlePrefixProvider = () => ""
}) {
  const doc = hostElement.ownerDocument || globalThis.document;
  let viewModel = {};
  let layoutSignature = "";
  let cards = [];
  // 每次绑定 / 重建就自增，用来丢弃属于上一批卡片的异步回包与定时器。
  let generation = 0;
  let dragState = null;
  let selectedEntityId = null;
  let openSelect = null;

  /** 造一个只带文本的元素；textContent 赋值天然防注入，比 innerHTML 安全。 */
  const createEl = (tag, text = "") => {
    const node = doc.createElement(tag);
    node.textContent = text;
    return node;
  };

  /**
   * 关掉当前打开的自定义下拉。
   */
  function closeSelect(restoreFocus = false) {
    if (!openSelect) {
      return;
    }
    const current = openSelect;
    openSelect = null;
    current.menu.hidePopover?.();
    current.menu.hidden = true;
    if (current.portal) {
      current.section.append(current.menu);
      current.portal = false;
    }
    current.control.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      current.control.focus?.({ preventScroll: true });
    }
  }

  /** 点击卡片 / 菜单以外的地方收起下拉（菜单 portal 到 body 时也算「菜单内」）。 */
  const onDocumentPointerDown = event => {
    if (
      openSelect &&
      !openSelect.section.contains?.(event.target) &&
      !openSelect.menu.contains?.(event.target)
    ) {
      closeSelect();
    }
  };
  /** 面板一滚动就收起下拉：菜单用 fixed / portal 定位，不跟着滚就会飘在错的位置。 */
  const onDocumentScroll = event => {
    if (openSelect && !openSelect.menu.contains?.(event.target)) {
      closeSelect();
    }
  };
  doc.addEventListener?.("pointerdown", onDocumentPointerDown);
  doc.addEventListener?.("scroll", onDocumentScroll, true);

  /**
   * 打开某个 select 卡的下拉，并做视口内的定位。
   */
  function openSelectMenu(record) {
    if (record.control.disabled) {
      return;
    }
    if (openSelect === record) {
      closeSelect(true);
      return;
    }
    closeSelect();
    openSelect = record;
    if (!record.menu.showPopover && doc.body) {
      record.menu.dataset.theme =
        hostElement.closest?.("[data-scene-style]")?.dataset.sceneStyle || "";
      doc.body.append(record.menu);
      record.portal = true;
    }
    record.menu.hidden = false;
    record.control.setAttribute("aria-expanded", "true");

    const rect = record.control.getBoundingClientRect();
    const win = doc.defaultView;
    const viewportWidth = win?.innerWidth || FALLBACK_VIEWPORT.width;
    const viewportHeight = win?.innerHeight || FALLBACK_VIEWPORT.height;
    const width = Math.min(
      Math.max(rect.width, SELECT_MENU_MIN_WIDTH),
      viewportWidth - SELECT_MENU_MARGIN * 2
    );
    const spaceBelow = viewportHeight - rect.bottom - SELECT_MENU_MARGIN;
    const spaceAbove = rect.top - SELECT_MENU_MARGIN;
    record.menu.style.width = width + "px";
    // 水平方向按视口夹取，保证左右两边都留出 margin。
    record.menu.style.left =
      Math.max(
        SELECT_MENU_MARGIN,
        Math.min(rect.left, viewportWidth - width - SELECT_MENU_MARGIN)
      ) + "px";
    record.menu.style.maxHeight =
      Math.max(
        SELECT_MENU_MIN_HEIGHT,
        Math.min(SELECT_MENU_MAX_HEIGHT, Math.max(spaceBelow, spaceAbove))
      ) + "px";
    record.menu.style.top =
      spaceBelow >= Math.min(SELECT_MENU_MAX_HEIGHT, record.choices.length * SELECT_MENU_ROW + GRID_GAP) ||
      spaceBelow >= spaceAbove
        ? rect.bottom + 4 + "px"
        : "auto";
    record.menu.style.bottom =
      record.menu.style.top === "auto" ? viewportHeight - rect.top + 4 + "px" : "auto";
    record.menu.showPopover?.();
    (record.choices.find(choice => choice.value === record.control.value) ||
      record.choices[0])?.focus?.({ preventScroll: true });
  }

  /**
   * 按卡片当前内容与容器宽度，算出它能接受的最小列数 / 行数。
   */
  function fitLayout(record, item = record.item) {
    const gridWidth = hostElement.clientWidth;
    const minRows = ["select", "number"].includes(item.type) ? CARD_MIN_ROWS : 1;
    if (!gridWidth) {
      return { ...item, rows: Math.max(item.rows, minRows) };
    }
    const neededSpan = COLUMN_SPAN[item.columns];
    // 在 [2,3,4,6] 里找第一个「不小于所需占位、不小于最小行数、且实际像素宽度够用」的档位。
    const span =
      [2, 3, 4, 6].find(
        candidate =>
          candidate >= neededSpan &&
          candidate >= CARD_MIN_ROWS &&
          ((gridWidth + GRID_GAP) * candidate) / 6 - GRID_GAP >= CARD_MIN_WIDTH
      ) || 6;
    return {
      ...item,
      columns: COLUMN_ORDER.find(column => COLUMN_SPAN[column] === span),
      rows: Math.max(item.rows, minRows, CARD_MIN_WIDTH > gridWidth ? 2 : 1)
    };
  }

  /**
   * 量出卡片内容实际需要几行。
   */
  function measureRows(record, rowCount) {
    const computed = doc.defaultView?.getComputedStyle?.(record.section);
    if (!computed) {
      return rowCount;
    }
    const toPx = value => Number.parseFloat(value) || 0;
    const measured = node => (node && !node.hidden && node.offsetHeight) || 0;
    const gap = toPx(computed.rowGap);
    const descriptionHeight = measured(record.description);
    const controlHeight = measured(record.control);
    let content = ["select", "number"].includes(record.item.type)
      ? descriptionHeight + controlHeight + (descriptionHeight && controlHeight ? gap : 0)
      : Math.max(descriptionHeight, controlHeight);
    for (const extra of [record.confirm, record.error]) {
      const extraHeight = measured(extra);
      if (extraHeight) {
        content += gap + extraHeight;
      }
    }
    content +=
      toPx(computed.paddingTop) +
      toPx(computed.paddingBottom) +
      toPx(computed.borderTopWidth) +
      toPx(computed.borderBottomWidth);
    return Math.max(rowCount, Math.ceil((content + GRID_GAP) / ROW_UNIT));
  }

  function syncCardMetrics(record) {
    if (dragState) {
      return;
    }
    const fitted = fitLayout(record);
    record.section.style.setProperty("--extra-columns", COLUMN_SPAN[fitted.columns]);
    record.section.style.setProperty("--extra-rows", measureRows(record, fitted.rows));
  }

  const resizeObserver =
    typeof ResizeObserver == "function"
      ? new ResizeObserver(() => cards.forEach(syncCardMetrics))
      : null;
  resizeObserver?.observe(hostElement);

  /** 按给定顺序把卡片重新排一遍（order + 尺寸变量）；找不到的卡片安静跳过。 */
  function applyLayout(layout) {
    layout.forEach((item, index) => {
      const record = cards.find(card => card.item.entityId === item.entityId);
      if (!record) {
        return;
      }
      const fitted = fitLayout(record, item);
      record.section.style.order = index;
      record.section.style.setProperty("--extra-columns", COLUMN_SPAN[fitted.columns]);
      record.section.style.setProperty("--extra-rows", measureRows(record, fitted.rows));
    });
  }

  /**
   * 结束一次拖拽。
   */
  function finishDrag(cancelled = false) {
    if (!dragState) {
      return;
    }
    const state = dragState;
    dragState = null;
    clearTimeout(state.timer);
    state.ghost?.remove?.();
    state.section.classList.toggle("is-dragging", false);
    cards.forEach(card => card.section.classList.toggle("is-drop-target", false));

    const currentLayout = extraLayout(viewModel.item.extraControls);
    const nextLayout =
      !cancelled && state.active && !state.resize && state.lastTarget
        ? moveExtra(state.layout, state.item.entityId, state.lastTarget)
        : state.layout;
    applyLayout(cancelled ? currentLayout : nextLayout);
    if (cancelled || !state.active) {
      cards.forEach(syncCardMetrics);
    }
    if (state.handle.hasPointerCapture?.(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId);
    }
    if (
      !cancelled &&
      state.active &&
      viewModel.editing &&
      JSON.stringify(nextLayout) !== JSON.stringify(currentLayout)
    ) {
      onLayout(nextLayout);
    }
  }

  const onEscapeKeydown = event => {
    if (event.key === "Escape" && dragState) {
      event.preventDefault();
      event.stopPropagation();
      finishDrag(true);
    }
  };
  doc.addEventListener?.("keydown", onEscapeKeydown, true);

  /**
   * 给一个拖拽把手（或整张卡片）绑上「拖拽换位 / 拉伸尺寸」的完整手势。
   */
  function bindDrag(handle, section, item, resize) {
    handle.addEventListener("pointerdown", event => {
      if (!viewModel.editing || (event.button != null && event.button !== 0)) {
        return;
      }
      // 触屏且不是尺寸把手时，不抢系统手势；其它情况立刻阻止默认滚动 / 选中。
      if (event.pointerType !== "touch" || resize) {
        event.preventDefault();
      }
      event.stopPropagation();
      finishDrag(true);
      selectedEntityId = item.entityId;
      cards.forEach(card =>
        card.section.classList.toggle("is-selected", card.item.entityId === item.entityId)
      );
      handle.focus?.({ preventScroll: true });
      if (event.pointerType !== "touch" || resize) {
        handle.setPointerCapture(event.pointerId);
      }

      const rect = section.getBoundingClientRect();
      const grid = hostElement.getBoundingClientRect();
      const scroller = hostElement.closest?.(".i3d-light-panel");
      dragState = {
        handle,
        section,
        item,
        resize,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        rect,
        grid,
        scroller,
        scrollTop: scroller?.scrollTop || 0,
        active: false,
        layout: extraLayout(viewModel.item.extraControls),
        touchReady: resize || event.pointerType !== "touch",
        // 提前缓存每张卡片的矩形；拖拽中 DOM 顺序会变，实时重算会抖。
        targets: cards.map(card => ({ row: card, rect: card.section.getBoundingClientRect() }))
      };
      if (!dragState.touchReady) {
        dragState.timer = setTimeout(() => {
          if (dragState?.handle === handle) {
            dragState.touchReady = true;
            section.classList.add("is-dragging");
          }
        }, TAP_LONG_PRESS_DELAY);
      }
    });

    // touchmove 需要 passive:false 才能在长按就绪后阻止页面滚动。
    handle.addEventListener(
      "touchmove",
      event => {
        if (dragState?.handle === handle && dragState.touchReady) {
          event.preventDefault();
        }
      },
      { passive: false }
    );

    handle.addEventListener("pointermove", event => {
      const state = dragState;
      if (!state || state.handle !== handle || event.pointerId !== state.pointerId) {
        return;
      }
      const deltaX = event.clientX - state.x;
      const deltaY = event.clientY - state.y;
      if (!state.touchReady) {
        // 长按还没就绪就大幅移动 → 用户其实是在滚动，放弃这次拖拽。
        if (Math.hypot(deltaX, deltaY) > DRAG_START_DISTANCE) {
          finishDrag(true);
        }
        return;
      }
      if (!state.handle.hasPointerCapture?.(event.pointerId)) {
        state.handle.setPointerCapture?.(event.pointerId);
      }
      if (!state.active && Math.hypot(deltaX, deltaY) < DRAG_START_DISTANCE) {
        return;
      }
      event.preventDefault();
      state.active = true;
      section.classList.toggle("is-dragging", true);
      // 拖到面板上下边缘自动滚动，方便把卡片拖到视口外。
      const scrollContainer = hostElement.closest?.(".i3d-light-panel");
      if (scrollContainer) {
        const bounds = scrollContainer.getBoundingClientRect();
        if (event.clientY > bounds.bottom - AUTOSCROLL_EDGE) {
          scrollContainer.scrollTop += AUTOSCROLL_STEP;
        } else if (event.clientY < bounds.top + AUTOSCROLL_EDGE) {
          scrollContainer.scrollTop -= AUTOSCROLL_STEP;
        }
      }
      if (!state.ghost) {
        state.ghost = createEl("div");
        state.ghost.className = "i3d-extra-gesture-hint";
        (doc.body || hostElement).append(state.ghost);
      }
      state.ghost.style.left = event.clientX + 12 + "px";
      state.ghost.style.top = event.clientY + 12 + "px";
      if (resize) {
        // 尺寸分支：把横向位移吸附到像素宽度最接近的一档列宽。
        const targetWidth = state.rect.width + deltaX;
        const nextColumns = COLUMN_ORDER.reduce(
          (best, column) =>
            Math.abs(
              ((state.grid.width + GRID_GAP) * COLUMN_SPAN[column]) / 6 - GRID_GAP - targetWidth
            ) <
            Math.abs(
              ((state.grid.width + GRID_GAP) * COLUMN_SPAN[best]) / 6 - GRID_GAP - targetWidth
            )
              ? column
              : best,
          state.item.columns
        );
        const nextRows = ["select", "number"].includes(item.type)
          ? 2
          : Math.abs(deltaY) < 12
            ? state.item.rows
            : state.rect.height + deltaY >= 58
              ? 2
              : 1;
        const row = cards.find(card => card.section === section);
        const fitted = fitLayout(row, { ...item, columns: nextColumns, rows: nextRows });
        state.layout = extraLayout(viewModel.item.extraControls).map(candidate =>
          candidate.entityId === item.entityId ? fitted : candidate
        );
        state.ghost.textContent =
          { 3: "1/3 行", 4: "2/3 行", 1: "半行", 2: "整行" }[fitted.columns] +
          " · " +
          (fitted.rows === 1 ? "36" : "80") +
          "px" +
          (fitted.columns !== nextColumns ? "（内容最小宽度）" : "");
        state.ghost.classList.add("is-size-outline");
        // 尺寸浮层画成卡片将占据的矩形轮廓，比跟随指针更能说明「会变成多大」。
        state.ghost.style.left = state.rect.left + "px";
        state.ghost.style.top = state.rect.top + "px";
        state.ghost.style.width =
          ((state.grid.width + GRID_GAP) * COLUMN_SPAN[fitted.columns]) / 6 - GRID_GAP + "px";
        state.ghost.style.height = ROW_UNIT * fitted.rows - GRID_GAP + "px";
      } else {
        // 换位分支：在所有卡片中心点里找离指针最近的一个作为落点。
        const scrollDelta = (state.scroller?.scrollTop || 0) - state.scrollTop;
        const closest = state.targets.reduce((best, target) => {
          const targetRect = target.rect;
          const distance = Math.hypot(
            targetRect.left + targetRect.width / 2 - event.clientX,
            targetRect.top - scrollDelta + targetRect.height / 2 - event.clientY
          );
          return !best || distance < best.distance ? { ...target, distance } : best;
        }, null);
        state.lastTarget = closest?.row.item.entityId;
        cards.forEach(card =>
          card.section.classList.toggle(
            "is-drop-target",
            card === closest?.row && card.section !== section
          )
        );
        const dragged = cards.find(card => card.section === section);
        state.ghost.textContent =
          (dragged?.title.textContent || "附加功能") +
          " → " +
          (closest?.row.title.textContent || "原位置");
      }
    });

    handle.addEventListener("pointerup", () => finishDrag(false));
    handle.addEventListener("pointercancel", () => finishDrag(true));
    handle.addEventListener("lostpointercapture", () => finishDrag(true));
  }

  /** 读某个实体的实时状态；states 里存的可能是包一层 newState 的信封，统一拆开。 */
  function readState(entityId) {
    const entry = viewModel.states?.[entityId];
    return entry?.newState || entry;
  }

  /**
   * 按最新 states 刷新所有卡片的文案、可用性与下拉选项。
   */
  function refreshRows() {
    // 每轮只问一次前缀：它是面板级属性（设备名），不必每张卡各问一次。
    const titlePrefix = titlePrefixProvider() || "";
    for (const row of cards) {
      const state = readState(row.item.entityId);
      const attributes = state?.attributes || {};
      const available =
        state && state.available !== false && !["", "unknown", "unavailable"].includes(state.state);

      if (row.pending && row.expected != null && String(state?.state) === String(row.expected)) {
        clearTimeout(row.timer);
        row.pending = false;
        row.expected = null;
        row.error.textContent = "";
      }
      if (row.pending && !available) {
        clearTimeout(row.timer);
        row.pending = false;
        row.expected = null;
        row.error.textContent = "实体已离线，操作结果未确认";
      }
      const rawTitle = row.item.label || attributes.friendly_name || row.item.entityId;
      row.title.textContent = extraTitle(rawTitle, titlePrefix);
      row.title.title = rawTitle;
      row.status.textContent = available
        ? ({ on: "已开启", off: "已关闭" }[state.state] || state.state) +
          (attributes.unit_of_measurement ? " " + attributes.unit_of_measurement : "")
        : "不可用";
      // select / 纯数字的下拉与输入框自己会显示当前值，状态行重复反而占高度，直接隐藏。
      row.status.hidden =
        !!available &&
        (row.item.type === "select" ||
          (row.item.type === "number" && !attributes.unit_of_measurement));
      if (!row.control) {
        syncCardMetrics(row);
        continue;
      }
      row.control.disabled = !!(viewModel.editing || row.pending || !available);
      if (row.item.type === "switch") {
        row.control.textContent = state?.state === "on" ? "已开启" : "已关闭";
        row.control.setAttribute("role", "switch");
        row.control.setAttribute("aria-checked", String(state?.state === "on"));
        row.control.setAttribute("aria-pressed", String(state?.state === "on"));
      }
      if (row.item.type === "select") {
        const options = Array.isArray(attributes.options)
          ? attributes.options.filter(option => typeof option === "string")
          : [];
        if (row.options !== JSON.stringify(options)) {
          if (openSelect === row) {
            closeSelect();
          }
          row.options = JSON.stringify(options);
          row.choices = options.map(option => {
            const button = createEl("button", option);
            button.type = "button";
            button.value = option;
            button.setAttribute("role", "option");
            button.addEventListener("click", () => {
              if (row.control.disabled) {
                return;
              }
              closeSelect(true);
              row.control.value = option;
              row.submit();
            });
            return button;
          });
          row.menu.replaceChildren(...row.choices);
        }
        row.control.value =
          row.pending && row.expected != null ? row.expected : available ? state.state : "";
        row.control.disabled ||= !options.length;
        row.control.textContent = row.pending
          ? "等待设备确认…"
          : available
            ? state.state
            : "不可用";
        for (const choice of row.choices) {
          choice.setAttribute("aria-selected", String(choice.value === row.control.value));
        }
        if (row.control.disabled && openSelect === row) {
          closeSelect();
        }
      }
      if (row.item.type === "number") {
        row.control.min = attributes.min;
        row.control.max = attributes.max;
        row.control.step = attributes.step || 1;
        if (doc.activeElement !== row.control) {
          row.control.value =
            row.pending && row.expected != null ? row.expected : available ? state.state : "";
        }
        row.control.disabled ||= !Number.isFinite(attributes.min) || !Number.isFinite(attributes.max);
      }
      syncCardMetrics(row);
    }
  }

  /**
   * 用新的视图模型刷新整块网格：必要时重建卡片 DOM，然后统一刷新一次状态。
   */
  function update(nextViewModel) {
    viewModel = nextViewModel;
    const layout = extraLayout(nextViewModel.item?.extraControls || []);
    const signature = JSON.stringify([nextViewModel.item?.id, layout, !!nextViewModel.editing]);
    hostElement.hidden = !layout.length;
    if (signature !== layoutSignature) {
      closeSelect();
      finishDrag(true);
      resizeObserver?.disconnect();
      resizeObserver?.observe(hostElement);
      cards.forEach(card => clearTimeout(card.timer));
      layoutSignature = signature;
      generation++;
      hostElement.replaceChildren();
      cards = [];
      for (const item of layout) {
        const section = createEl("section");
        section.className = "i3d-climate-option-group i3d-extra-card i3d-extra-" + item.type;
        section.style.setProperty("--extra-columns", COLUMN_SPAN[item.columns]);
        section.style.setProperty("--extra-rows", item.rows);
        if (nextViewModel.editing) {
          const dragHandle = createEl("button", "⠿");
          dragHandle.type = "button";
          dragHandle.className = "i3d-extra-drag";
          dragHandle.setAttribute("aria-label", "调整顺序 " + item.entityId);
          dragHandle.title = "拖动排序，方向键移动，Esc取消";
          section.classList.toggle("is-selected", selectedEntityId === item.entityId);
          // 点卡片任意位置也选中它，但不要动到卡片内部控件的点击。
          section.addEventListener("click", () => {
            selectedEntityId = item.entityId;
            cards.forEach(card =>
              card.section.classList.toggle("is-selected", card.section === section)
            );
          });
          bindDrag(dragHandle, section, item, false);
          bindDrag(section, section, item, false);
          // 方向键换位：不依赖指针，键盘用户也能排序。
          dragHandle.addEventListener("keydown", event => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              return;
            }
            event.preventDefault();
            const index = layout.findIndex(candidate => candidate.entityId === item.entityId);
            const neighbour =
              layout[index + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 1)];
            if (neighbour) {
              onLayout(moveExtra(layout, item.entityId, neighbour.entityId));
            }
          });
          const resizeHandle = createEl("button", "↘");
          resizeHandle.type = "button";
          resizeHandle.className = "i3d-extra-resize";
          resizeHandle.setAttribute("aria-label", "调整大小 " + item.entityId);
          resizeHandle.title = "拖动调整：1/3行、2/3行、半行、整行；36/80px；Esc取消，方向键调整";
          const emitResize = (columns, rows) => {
            if (!viewModel.editing) {
              return;
            }
            onLayout(
              extraLayout(
                extraLayout(viewModel.item.extraControls).map(candidate =>
                  candidate.entityId === item.entityId
                    ? { ...candidate, columns, rows }
                    : candidate
                )
              )
            );
          };
          bindDrag(resizeHandle, section, item, true);
          // 方向键改尺寸：左右调列宽、上下在 1/2 行之间切。
          resizeHandle.addEventListener("keydown", event => {
            if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
              return;
            }
            event.preventDefault();
            const columnIndex = COLUMN_ORDER.indexOf(item.columns);
            emitResize(
              event.key === "ArrowLeft"
                ? COLUMN_ORDER[Math.max(0, columnIndex - 1)]
                : event.key === "ArrowRight"
                  ? COLUMN_ORDER[Math.min(COLUMN_ORDER.length - 1, columnIndex + 1)]
                  : item.columns,
              event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? 2 : item.rows
            );
          });
          section.append(dragHandle, resizeHandle);
          section.classList.add("is-layout-editing");
        }
        const title = createEl("h4");
        const status = createEl("p");
        const error = createEl("p");
        error.setAttribute("role", "status");
        error.className = "i3d-climate-error";
        const type = extraTypes(item.entityId).includes(item.type) ? item.type : "state";
        const control =
          type === "state" ? null : createEl(type === "number" ? "input" : "button", "执行");
        const row = {
          item: { ...item, type },
          section,
          title,
          status,
          error,
          control,
          pending: false
        };
        cards.push(row);
        const description = createEl("div");
        row.description = description;
        description.className = "i3d-extra-description";
        description.append(title, status);
        section.append(description);
        if (control) {
          control.className = "i3d-climate-choice";
          control.setAttribute("aria-label", item.label || item.entityId);
          if (type === "number") {
            control.type = "number";
          } else {
            control.type = "button";
          }
          row.submit = async () => {
            if (viewModel.editing || row.pending) {
              return;
            }
            const generationAtSend = generation;
            try {
              const command = extraCommand(row.item, readState(item.entityId), control.value);
              // 记下「这次操作完成后应该看到什么状态」，用于解除 pending。
              row.expected =
                type === "switch"
                  ? command.service === "turn_on"
                    ? "on"
                    : "off"
                  : type === "select"
                    ? command.data.option
                    : type === "number"
                      ? command.data.value
                      : null;
              row.pending = true;
              error.textContent = "";
              refreshRows();
              await onControl(command);
              // 期间卡片被重建（换设备 / 换布局）就丢弃这次回包。
              if (generationAtSend !== generation) {
                return;
              }
              if (type === "button") {
                // 一次性按钮没有「期望状态」可等，发完即结束，只留一句回执。
                row.pending = false;
                error.textContent = "指令已发送";
              } else if (row.pending) {
                error.textContent = "等待设备确认…";
                row.timer = setTimeout(() => {
                  if (generationAtSend === generation) {
                    row.pending = false;
                    row.expected = null;
                    error.textContent = "未收到状态确认，请检查设备后重试";
                    refreshRows();
                  }
                }, CONFIRM_TIMEOUT);
                row.timer.unref?.();
              }
            } catch (submitError) {
              if (generationAtSend === generation) {
                row.pending = false;
                row.expected = null;
                error.textContent = submitError.message || "操作失败";
              }
            } finally {
              if (generationAtSend === generation) {
                refreshRows();
              }
            }
          };
          if (type === "select") {
            control.classList.add("i3d-extra-select-trigger");
            control.setAttribute("aria-haspopup", "listbox");
            control.setAttribute("aria-expanded", "false");
            const menu = createEl("div");
            row.menu = menu;
            row.choices = [];
            menu.className = "i3d-extra-select-menu";
            menu.setAttribute("popover", "auto");
            menu.setAttribute("role", "listbox");
            menu.setAttribute("aria-label", (item.label || item.entityId) + " 选项");
            menu.hidden = true;
            section.append(menu);
            control.addEventListener("click", () => openSelectMenu(row));
            control.addEventListener("keydown", event => {
              if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                event.preventDefault();
                openSelectMenu(row);
              }
            });
            menu.addEventListener("toggle", event => {
              if (event.newState === "closed" && openSelect === row) {
                closeSelect();
              }
            });
            // 菜单键盘导航：Esc 收起、Tab 收起让焦点走、Home/End/上下键在选项间环绕。
            menu.addEventListener("keydown", event => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeSelect(true);
                return;
              }
              if (event.key === "Tab") {
                closeSelect(true);
                return;
              }
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                return;
              }
              event.preventDefault();
              const activeIndex = row.choices.indexOf(doc.activeElement);
              const count = row.choices.length;
              const nextIndex =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? count - 1
                    : (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
              row.choices[nextIndex]?.focus?.();
            });
          } else if (type === "button") {
            // button 域是不可逆的一次性动作，必须二次确认；确认条复用卡片的尺寸测量（会多占一行）。
            const confirm = createEl("div");
            confirm.className = "i3d-extra-confirm";
            confirm.hidden = true;
            const confirmText = createEl("span", "确认执行此操作？");
            const confirmButton = createEl("button", "确认");
            const cancelButton = createEl("button", "取消");
            confirmButton.type = cancelButton.type = "button";
            confirmButton.addEventListener("click", () => {
              confirm.hidden = true;
              row.submit();
            });
            cancelButton.addEventListener("click", () => {
              confirm.hidden = true;
              syncCardMetrics(row);
              control.focus?.();
            });
            confirm.append(confirmText, confirmButton, cancelButton);
            row.confirm = confirm;
            control.addEventListener("click", () => {
              if (!viewModel.editing && !control.disabled) {
                confirm.hidden = false;
                syncCardMetrics(row);
              }
            });
          } else {
            control.addEventListener(type === "number" ? "change" : "click", row.submit);
          }
          section.append(control);
          if (row.confirm) {
            section.append(row.confirm);
          }
        }
        section.append(error);
        hostElement.append(section);
        for (const observed of [description, control, error, row.confirm]) {
          if (observed) {
            resizeObserver?.observe(observed);
          }
        }
      }
    }
    refreshRows();
  }

  refreshRows();
  return {
    update,
    dispose() {
      closeSelect();
      finishDrag(true);
      resizeObserver?.disconnect();
      cards.forEach(card => clearTimeout(card.timer));
      doc.removeEventListener?.("pointerdown", onDocumentPointerDown);
      doc.removeEventListener?.("scroll", onDocumentScroll, true);
      doc.removeEventListener?.("keydown", onEscapeKeydown, true);
      generation++;
      cards = [];
      hostElement.replaceChildren();
    }
  };
}
