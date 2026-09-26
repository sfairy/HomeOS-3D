/**
 * 「附加功能」卡片网格：把一台设备上除主控之外的相关实体（开关 / 选项 / 数值 / 按钮 /
 * 纯状态显示）渲染成一整套可拖拽排序、可拉伸尺寸的卡片，嵌进面板的附加控件区。
 *
 * extraTypes 是这套渲染的总开关：它先取实体 ID 的域（`light.kitchen` → `light`），再把域
 * 映射成卡片该长成什么形态 ——
 *
 *   switch 类（switch / input_boolean / light）→ "switch"：卡片主体是一枚开关按钮
 *   select 类（select / input_select）        → "select"：自定义下拉（popover + 方向键）
 *   number 类（number / input_number）        → "number"：带 min / max / step 的数字输入
 *   button 类（button / input_button）        → "button"：点击后二次确认再下发
 *   其余域                                    → "state"：只读，用来显示一个小状态
 *
 * 返回值固定是「形态 + state」两元素数组：第一个元素决定主控件长什么样，第二个元素告诉
 * 调用方这个实体同时也能当状态显示用；调用方拿它和配置里写死的 type 求交，取不到交集就
 * 退化成 state（配置里改错了类型也不会渲染出一个发不出命令的滑稽控件）。
 *
 * 布局偏好（顺序 / 列宽 / 行高）一律通过 onLayout 回调交回给调用方，本模块自己不持久化：
 * 一是这套卡片在「配置预览」与「真实运行时」跑的是同一份代码，只有调用方能判断当前是不是
 * 编辑态、以及这份偏好该写回哪个配置字段；二是拖拽期间会临时重排 DOM，若模块再存一份私有
 * 布局，回传的新配置一旦被 update 送回来就会和私有副本打架；三是键盘排序、拖拽换位、尺寸
 * 吸附最终都归约成同一份 layout 数组，调用方按配置格式落盘、下次 update 原样送回，这就是
 * 唯一的真相来源。模块只做「把当前状态画出来」和「把用户意图翻译成 layout」两件事。
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
// 触屏长按多久才算「拿起卡片」，避免滑动面板时误触发拖拽。
const TAP_LONG_PRESS_DELAY = 300;
// 指针移动超过它才算拖拽，否则当作点击。
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
 *
 * 之所以返回「形态 + state」而不是单个形态：同一张卡片既要能操作、又要在只读场景里
 * 当状态显示；调用方用 `includes(item.type)` 求交，交集为空时退化成 state。域不认领的
 * 实体（sensor / binary_sensor / climate…）一律是只读的 state，不会凭空造出控件。
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
 *
 * 只在「标题确实以该前缀开头、且去掉后还剩内容」时才动它：设备名与实体名对不上、或者
 * 前缀等于整条标题（实体名恰好就是设备名）时，去掉只会得到空标题，那是比冗余更糟的结果。
 * 分隔符按 HA 与中文命名的常见写法收：空格 / 中点 / 括号 / 横线 / 下划线 / 冒号 / 顿号 / 斜杠。
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

/** 形态 → 中文名的唯一词表：卡片标题、编辑器选项都读它，避免各处自己再写一遍文案。 */
export const extraLabels = {
  switch: "开关",
  select: "选项",
  number: "数值",
  button: "按钮",
  state: "状态显示"
};

/**
 * 找出与某个实体同属一台设备（deviceId / device_id 相同）的其它实体。
 *
 * 净化器这类设备在 HA 里会拆成一堆实体（开关、模式、滤芯寿命…），配置里往往只绑定其中一个；
 * 换绑时必须能把整台设备的实体一起带过来，否则新选的实体拿不到兄弟实体，卡片网格会空掉。
 * 实体表里两种字段名并存（后端归一化前后不一致），所以两个都读，谁先有值用谁。
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
 *
 * 关键在比较的是 deviceId 而不是 entityId：同一台设备下从实体 A 换到实体 B，卡片集合其实是
 * 同一批，重建只会让正在编辑的布局白白跳动。只有「原设备查不到」或「新旧设备 ID 不同」才
 * 算真换了设备。前后实体相同则直接 false，省一次查表。
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
 *
 * 校验放在这里而不是交给后端：实体离线 / 未就绪、类型不匹配、选项过期、数值越界或不符合
 * 步长，这些都能在本地立刻判断出来，提前抛中文错误比等一次失败的网络往返体验好得多。抛错
 * 只代表「这条命令不该发」，调用方会把 message 显示在卡片下方的错误行里，不是程序异常。
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
    // 选项可能被设备端改过，下发前必须拿最新 attributes.options 复核，否则会静默失败。
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
    // 步长对齐：允许浮点误差，但 (值 - 下限) 必须是步长的整数倍，否则设备会自行取整。
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
 *
 * 归一做三件事：补出 type（配置里可能只写了 entityId）、把 columns 收进合法集合、把 rows 收成
 * 1 / 2。这样渲染、拖拽、键盘调整、尺寸吸附全都面对同一份形状固定的数据，不必到处判空。
 * （label 被有意剔除：它只用于控件无障碍名，不属于布局字段，留在数组里会让布局比较永远不等。）
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
 *
 * 先 extraLayout 再找下标，保证传入的是原始配置也能算对；先摘出再插入，等于「把源位置
 * 抽掉、目标位置补上」，语义与拖拽落点一致。任一实体找不到就原样返回，绝不静默改动顺序。
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
 *
 * 对外只暴露 `update({ item, states })` 与 `dispose()`：update 负责按当前配置重建 / 刷新卡片并
 * 读取 states 里的实时值，dispose 负责摘掉挂在 document 上的全局监听与所有 DOM。所有布局
 * 变更（拖拽换位、键盘排序、拉伸尺寸）都从 `onLayout(layout)` 回传，本模块不保存也不猜测
 * 配置格式；调用方落盘后通过下一次 update 送回来即可。onControl 收到的就是 extraCommand 的
 * 产物，发送失败由调用方决定怎么抛，卡片会显示错误。
 */
export function createPurifierExtras({
  element: hostElement,
  onControl,
  onLayout = () => {},
  // 可选的「冗余前缀」提供者：返回一段设备名（如「冰箱」）时，卡片标题开头的它连同分隔符
  // 会被去掉。HA 的 friendly_name 惯例是「设备名 + 实体名」，而卡片网格的宿主面板标题已经
  // 写着同一个设备名，再带一遍只会让长实体名更快换行。默认不提供即完全不改标题。
  // 传函数而不是字符串：绑定可能在同一个面板里换设备，前缀要跟着 update 一起变。
  titlePrefixProvider = () => ""
}) {
  // 刻意用宿主的 ownerDocument：卡片可能被放进弹窗 / 预览 iframe，用全局 document 会造出属于
  // 外部文档的孤儿节点，事件与样式都对不上。
  const doc = hostElement.ownerDocument || globalThis.document;
  let viewModel = {};
  // 布局签名：item.id + 归一化后的 layout + 是否编辑态，任一变化才重建 DOM，避免每次状态
  // 回包都把卡片推倒重来（那样会打断输入框焦点与下拉）。
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
   *
   * popover 不支持时菜单被临时搬到 body（portal），关闭时必须搬回卡片内，否则下次重建
   * DOM 会留下一个游离节点。restoreFocus 用于键盘交互（Escape / 选中后）把焦点还给触发按钮。
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
   *
   * 同一下拉再点一次就是收起；popover 可用时用原生 popover（浏览器负责层级与关闭），不可用
   * 时把菜单搬到 body 并手动按视口夹取 left / top，保证再靠边的卡片也能把菜单完整露出来。
   * 菜单高度按剩余空间与选项数取小，方向键焦点落在当前值上。
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
      // 菜单 portal 出去后脱离卡片色上下文，需要把场景主题一并带过去，否则浅 / 深色会串。
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
    // 下方放得下整份选项（或下方本来就比上方宽敞）就向下开，否则贴控件上沿向上开。
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
   *
   * 拖拽改尺寸和响应式重排共用这一处算术：列数只能落在「内容放得下」的档位上，行数则由
   * 内容高度撑开。容器还没量到宽度（隐藏 / 首帧）时只补最小行数，不猜列数。
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
   *
   * 同样被响应式重排和拖拽改尺寸共用。select / number 是「标题 + 控件」竖排，两块高度相加；
   * 其余形态取两者较大值。confirm / error 这些临时块出现时额外占一行。最后换算成行数并按
   * 传入行数取大——只增不减，避免用户手动调大的卡片被一次测量打回最小高度。
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

  /** 把算好的列 / 行写回卡片 CSS 变量；拖拽进行中不抢写，避免拖拽反馈与实际尺寸打架。 */
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
   *
   * cancelled 为真（Esc / pointercancel / 长按失败）时回滚到配置里的原始顺序；否则把拖拽过程中
   * 算出的临时 layout 落到 DOM 上，并在「真的换过位且确实在编辑态」时通过 onLayout 回传，
   * 让调用方落盘。两者 JSON 相同就不回传，避免白白触发一次配置写入。
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

  /** 拖拽中按 Esc 取消：capture 阶段拦下，避免面板把它当成「关闭弹窗」。 */
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
   *
   * resize 为 true 时走尺寸分支，false 时走换位分支，共用同一套指针生命周期。触屏上没有
   * hover，必须长按 300ms 才进入拖拽，期间指针移动超过阈值就取消——这样面板本身的滚动不受
   * 影响。换位用「所有卡片矩形的中心距」找最近落点，尺寸则把指针位移折算成最近的一档列宽 / 行高，
   * 并用一个浮层（i3d-extra-gesture-hint）实时汇报「会变成什么样」。
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
      // 指针捕获做幂等兜底：已经捕获就跳过，否则补一次（部分浏览器 pointerdown 后不会自动捕获）。
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
   *
   * 全程只改文本 / 属性、不重建 DOM（重建只在布局签名变化时发生），这样输入框焦点与展开的
   * 下拉不会被打断。pending 的卡片一旦等到期望值或实体掉线就立刻解除，错误行也随之更新；
   * 下拉选项只在 options 真的变了（JSON 比较）时才重建按钮。
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
      // 标题取配置里的 label（会被 extraLayout 有意剔除，故通常落到 friendly_name），
      // 再过一道「去设备名前缀」；tooltip 保留完整原名，悬停仍能看到全称。
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
        // 等待确认期间先把下拉显示成期望值（乐观），否则用户会看到值「跳回去」。
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
        // 正在输入的输入框不要被状态回包覆盖，否则用户打一半的数字会被抹掉。
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
   *
   * 重建只发生在「设备 / 布局 / 编辑态」签名变化时，并且会先收干净上一批的全局监听残留、
   * 拖拽、下拉与定时器；generation 自增让所有在途异步回包失效。刷新状态则每次都做，因为它
   * 只改文本、开销小，且 states 可能随时到达。整个逻辑对 `viewModel.item.extraControls`
   * 为空的设备直接隐藏宿主，不挂空壳。
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
        // i3d-climate-option-group 复用空调面板的卡片底色 / 圆角，i3d-extra-<type> 决定布局细节。
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
        // 配置里的 type 必须落在 extraTypes 给的集合里才作数，否则退化成只读状态。
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
            // 原生 popover 被 Esc / 点击外部关掉时同步内部状态，避免 openSelect 悬空。
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
            // switch 用 click、number 用 change：数字输入等失焦 / 回车再发，避免每敲一位都发命令。
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
