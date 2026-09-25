/**
 * 「配置安防 / 人物与行走路线」编辑对话框，是 presence 的配置入口：三栏布局（绑定列表 /
 * SVG 平面图 + 3D 预览 / 人物方案、颜色、速度、大小、触发方式等属性控件）。
 *
 * manageBindings=true 从安防设置进入（可增删绑定、改触发方式），false 从人物与路线面板进入（只调路线与外观）。
 * 路线点存楼层平面图坐标（像素，当量由 plan.pixelsPerMeter 决定），3D 侧由 presence-scene.js 换算；
 * 编辑结果写进 draftProperties.security.presenceSensors 经 onSave 交回，routeClosed 编辑期间用
 * closedRouteSensorIds 记录用户意图。舞台命令：presence-top-view / presence-3d-view /
 * presence-preview-walk / presence-show-hit-range。
 */
import { openPresenceFocusEditor } from "./presence-focus-editor.js?v=2609252210";
import { mountInteraction3d } from "../core/runtime.js?v=2609252210";
import {
  validPresenceRoute,
  snapsToPresenceStart,
  PRESENCE_TRIGGER_MODES,
  presenceTriggerIsTimed
} from "./presence-motion.js?v=2609252210";
import { DESIGNS, createWalker, animateWalker, disposeWalker } from "./presence-character.js?v=2609252210";
import { capturePointer } from "../core/static-helpers.js?v=2609252210";
import {
  createDomFactory,
  randomUuid,
  toSvgPoint as bridgedToSvgPoint
} from "../core/static-helpers-editor.js?v=2609252210";
import { serializeEditorDraft } from "../core/editor-save-status.js?v=2609252210";
/**
 * 打开人在传感器编辑对话框。
 */
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
  // 整份属性深拷贝一份草稿：编辑期间只改草稿，取消 / 报错都不会污染组件的真实 properties。
  const draftProperties = structuredClone(component.properties || {});
  draftProperties.security = {
    ...draftProperties.security,
    presenceSensors: structuredClone(draftProperties.security?.presenceSensors || [])
  };
  const sensorBindings = draftProperties.security.presenceSensors;
  // 实体名称索引：左栏按钮、只读模式提示都靠它把 entityId 显示成人可读的名字。
  const sensorNamesByEntityId = new Map(entities.map(entity => [entity.entityId, entity.name]));
  for (const sensor of sensorBindings) {
    // displayPages 固定 all（人物在所有页面都显示），与后端字段兼容。
    sensor.displayPages = "all";
    // 补齐历史数据缺失的字段默认值：老配置可能没有 character/color 等，
    // 这里统一成与新建绑定一致的默认值，避免后续处处判空。
    Object.assign(sensor, {
      character: sensor.character ?? "traveler",
      color: sensor.color ?? "cyan",
      speed: sensor.speed ?? 0.45,
      size: sensor.size ?? 1,
      // 定时触发的绑定时长必须 > 0，缺失时补 30 秒；非定时触发保持 0（跟随有人状态）。
      displayDuration: presenceTriggerIsTimed(sensor)
        ? sensor.displayDuration > 0
          ? sensor.displayDuration
          : 30
        : (sensor.displayDuration ?? 0)
    });
  }
  // 元素 / SVG / 按钮的唯一实现见 /static/shared/dom-factory.js。本文件的调用点沿用「文本在前、
  // 类名在后」的历史参数顺序，故只在工厂外面留一层一行的适配，不把顺序散到各调用点去改。
  const { el, svg, button } = createDomFactory(editorDocument);
  const createElement = (tagName, initialText, classNames) => el(tagName, classNames, initialText);
  const createSvgElement = (svgTagName, attributes) => svg(svgTagName, attributes);
  const styleLinkElement = createElement("link");
  styleLinkElement.rel = "stylesheet";
  // 样式与 3D 预览的 runtime.css 是两套：这里只加载编辑器自身的样式表。
  styleLinkElement.href =
    "/api/v1/modules/interaction3d/presence/presence-editor.css?v=2609252210";
  const dialogElement = createElement("dialog", "", "i3d-editor i3d-presence-editor");
  dialogElement.setAttribute("aria-label", manageBindings ? "配置安防" : "人物与行走路线");
  // 记下打开前的焦点，关闭时还回去，键盘用户不会丢失位置。
  const previouslyFocusedElement = editorDocument.activeElement;
  // 初始选中项：指定 ID → 指定楼层的第一条 → 第一条，都没有则为 null（空状态）。
  let selectedSensor =
    sensorBindings.find(sensorMatch => sensorMatch.id === initialSelectedId) ||
    sensorBindings.find(floorProbe => floorProbe.floorId === editingFloorId) ||
    sensorBindings[0] ||
    null;
  let isClosed = false;
  // 「用户意图上的闭合集合」：路线还没画完 / 正在拖动时，实际几何可能暂时不合法，
  // 因此不能直接读 routeClosed，而是把意图记在 Set 里，落盘时再与合法性求交。
  let closedRouteSensorIds = new Set(
    sensorBindings
      .filter(
        sensorCandidate =>
          sensorCandidate.routeClosed !== false && validPresenceRoute(sensorCandidate.route)
      )
      .map(routeSensorId => routeSensorId.id)
  );
  /**
   * 生成「将要落盘」的传感器列表快照。
   */
  const presencePersistState = () =>
    sensorBindings.map(sensorItem => ({
      ...sensorItem,
      // routeClosed 只在两者同时成立时为 true：用户点了闭合，且几何确实能构成闭合路线。
      routeClosed: closedRouteSensorIds.has(sensorItem.id) && validPresenceRoute(sensorItem.route)
    }));
  // 保存时的对比基准：脏判定与「保存后又改回来」都靠它，所以必须在任何编辑前取好。
  let savedPresenceSignature = serializeEditorDraft(presencePersistState());
  let draggedPoint = null;
  // 平面图画布的取景框（平面坐标系下的矩形），fitPlanBox 计算、renderRoutePlan 用。
  let planBox;
  let characterPreview = null;
  // 角色预览的「角色 + 颜色」签名，变了才重建模型。
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
  // 正在编辑中的控件提交函数：保存或重建面板前必须逐个 flush，否则最后一笔输入会丢。
  let fieldCollectors = [];
  let isDirty = false;
  /**
   * 提交所有正在编辑的字段值。
   */
  const flushFieldCollectors = () => {
    for (const fieldCollector of fieldCollectors) {
      fieldCollector();
    }
  };
  const statusElement = createElement("span", "", "presence-status");
  // role=status 让读屏器朗读提示文案（保存结果、错误信息都走这里）。
  statusElement.setAttribute("role", "status");
  const createButton = (buttonLabel, onButtonClick) => button(buttonLabel, onButtonClick);
  /**
   * 关闭编辑器并释放全部资源（幂等）。
   */
  function closeEditor() {
    if (!isClosed) {
      isClosed = true;
      cancelAnimationFrame(animationFrameId);
      routeResizeObserver.disconnect();
      clearTimeout(topViewTimer);
      editorRuntime?.();
      editorDocument.removeEventListener("visibilitychange", handleVisibilityChange);
      // 角色预览是独立的 WebGL 上下文，必须显式 dispose + forceContextLoss，
      // 否则反复开关编辑器会耗尽浏览器的 WebGL 上下文配额。
      if (characterPreview) {
        disposeWalker(characterPreview.root);
        characterPreview.renderer.dispose();
        characterPreview.renderer.forceContextLoss();
      }
      dialogElement.close();
      dialogElement.remove();
      styleLinkElement.remove();
      // 通知宿主：这块预览已收起，其它 3D 预览可以恢复渲染。
      editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
      // 焦点还回去，避免键盘用户在弹窗关闭后"失去光标"。
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
      // 先把正在输入的数字 / 文本提交进绑定对象，保证保存的是用户最后看到的值。
      flushFieldCollectors();
      // 落盘前再同步一次 routeClosed：这里是唯一真正写回该字段的地方。
      for (const sensorItem of sensorBindings) {
        sensorItem.routeClosed =
          closedRouteSensorIds.has(sensorItem.id) && validPresenceRoute(sensorItem.route);
      }
      // 幂等短路：提交字段后签名可能与基准一致（例如用户改了又改回来），
      // 此时不该弹出保存提示，只需要把按钮置灰。
      isDirty = serializeEditorDraft(presencePersistState()) !== savedPresenceSignature;
      if (!isDirty) {
        saveButtonElement.disabled = true;
        return;
      }
      saveButtonElement.disabled = true;
      try {
        await onSave(structuredClone(draftProperties));
        if (!isClosed) {
          // 保存成功后把基准推进到当前状态，后续编辑才是"新的脏"。
          savedPresenceSignature = serializeEditorDraft(presencePersistState());
          isDirty = false;
          saveButtonElement.disabled = true;
          statusElement.textContent = manageBindings
            ? "已应用到编辑器，请在退出后保存仪表盘"
            : "已应用，请返回后点击「保存配置」";
        }
      } catch (saveError) {
        // 失败时重新启用按钮，让用户可以直接重试。
        if (!isClosed) {
          statusElement.textContent = saveError.message || "保存失败，请重试。";
          saveButtonElement.disabled = false;
        }
      }
    }
  );
  saveButtonElement.className = "primary";
  // 初始不可保存：没有任何改动。
  saveButtonElement.disabled = true;
  /**
   * 重算脏标记并更新保存按钮与提示文案。
   */
  const markPresenceDirty = dirtyMessage => {
    // 先提交在编辑中的字段，否则「刚输入但未失焦」的改动会被判成"没改"。
    flushFieldCollectors();
    isDirty = serializeEditorDraft(presencePersistState()) !== savedPresenceSignature;
    saveButtonElement.disabled = !isDirty;
    if (isDirty) {
      if (dirtyMessage) {
        statusElement.textContent = dirtyMessage;
      }
      return;
    }
    // 已经没有改动（改回原样）：清掉任何"已修改"提示，但不覆盖错误等信息。
    if (
      dirtyMessage ||
      statusElement.textContent === "配置已修改，请保存安防配置。" ||
      statusElement.textContent === "配置已修改，请应用人物与路线。"
    ) {
      statusElement.textContent = "";
    }
  };
  // 用事件委托统一监听所有输入：任何控件改动都会冒泡到这里。
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
  // hintElement 是分场景变化的操作提示（吸附闭合、3D 拖动旋转等），由 renderRoutePlan 写入。
  const hintElement = createElement("p", "", "presence-note");
  const viewportElement = createElement("div", "", "presence-viewport");
  // 3D 预览挂载点与 SVG 平面图层叠在同一个 viewport 里，靠 viewMode 决定显示谁。
  const runtimeElement = createElement("div", "", "presence-plan-runtime");
  const routeSvgElement = createSvgElement("svg", {
    role: "img",
    // 键盘可达（tabindex=0）：下面绑定了 pointer 事件，同时也支持点击聚焦。
    "aria-label": "平面图行走路线",
    tabindex: "0"
  });
  const pointsLayerElement = createSvgElement("g");
  const routeLayerElement = createSvgElement("g");
  routeSvgElement.append(pointsLayerElement, routeLayerElement);
  const routeToolsElement = createElement("div", "", "presence-route-tools");
  routeToolsElement.append(
    createButton("闭合路线", () => {
      // 闭合需要合法路线（≥3 点且不共线），否则多边形会退化成一条线。
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
        // 撤销点会破坏闭合几何，因此同时退出闭合意图。
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
        // 清空后路线不合法，行走预览必须停下，否则 3D 侧会沿空路径报错。
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
  /**
   * 切换「平面 / 3D」编辑视图。
   */
  const setViewMode = nextViewMode => {
    viewMode = nextViewMode;
    // 平面视图下才显示 SVG 与路线工具；3D 视图靠 WebGL 预览，无需 SVG 覆盖。
    routeSvgElement.toggleAttribute("hidden", nextViewMode !== "plan");
    routeToolsElement.hidden = nextViewMode !== "plan";
    // 切视图会丢弃进行中的拖动 / 悬停，避免回到平面视图时残留幽灵点。
    draggedPoint = null;
    hoverPoint = null;
    planViewButton.setAttribute("aria-pressed", String(nextViewMode === "plan"));
    threeDViewButton.setAttribute("aria-pressed", String(nextViewMode === "3d"));
    // 预览还没就绪时不发命令：stage.js 会排队，过早发送只会白排一条。
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
    // 行走预览要求路线闭合且合法，否则角色只能在一条折线上来回走。
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
    // 预览未就绪时仅切换按钮状态，syncPreview 就绪后会补发一次命令。
    if (isPreviewReady) {
      editorRuntime
        .focusCommand("presence-preview-walk", "", isWalkPreviewRunning)
        .catch(showError);
    }
  });
  viewModeGroupElement.append(planViewButton, threeDViewButton);
  viewToolsElement.append(viewModeGroupElement, walkPreviewButton);
  // 顺序敏感：runtimeElement 先入 DOM，routeSvgElement 叠在其上（同为 absolute 定位）。
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
  // 等样式表加载完成再挂载对话框：否则首帧会闪一下无样式的表单。
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
    // 样式加载失败时把 link 摘掉，避免残留一个半加载的样式表影响下次打开。
    styleLinkElement.remove();
    throw styleLoadError;
  });
  editorDocument.body.append(dialogElement);
  // 标记预览作用域：宿主据此暂停其它 3D 预览的渲染，省下 GPU 时间给本对话框。
  dialogElement.dataset.i3dPreviewScope = "presence";
  /**
   * 把错误写到状态栏（编辑器已关闭时静默）。
   */
  function showError(loadError) {
    if (!isClosed) {
      statusElement.textContent = loadError.message || String(loadError);
    }
  }
  /**
   * 取当前应当显示的楼层：选中绑定的楼层优先，否则回退到初始楼层 / 草稿楼层 / 首层。
   */
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
  /**
   * 延时切到正交顶视图（用于平面视图）。
   * 30ms 延迟是为了合并连续调用：拖动窗户尺寸、连续 resize 时避免每帧都发命令；
   * 回调里重新判断条件，因为定时器触发时用户可能已经切走视图。
   */
  function scheduleTopView() {
    clearTimeout(topViewTimer);
    if (!!isPreviewReady && !!currentFloor() && viewMode === "plan" && !!planBox) {
      topViewTimer = setTimeout(() => {
        const scheduledFloor = currentFloor();
        if (!isClosed && isPreviewReady && viewMode === "plan" && scheduledFloor) {
          editorRuntime
            .focusCommand("presence-top-view", "", {
              floorId: scheduledFloor.id,
              // 传入平面图取景框，stage.js 据此把正交相机对齐到同一可视范围。
              box: planBox
            })
            .catch(showError);
        }
      }, 30);
    }
  }
  /**
   * 把当前草稿同步给 3D 预览（未挂载则先挂载）：预览用裁剪过的副本而不是原始草稿 ——
   * 只保留当前楼层的相机与传感器、关掉调暗/降饱和与自动旋转、只保留选中的那一条路线。
   */
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
      // 编辑态一律全亮 / 全彩：调暗效果会让用户误判人物颜色。
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
      // 已挂载时走 update：stage.js 内部做增量更新，比整块重建快得多。
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
        // editable=true 才允许 stage.js 接收本编辑器的 focusCommand。
        editable: true
      },
      editing: true,
      editingModule: "security",
      onPresented: () => {
        if (!isClosed) {
          isPreviewReady = true;
          // 预览就绪后才补发此前被跳过的视图 / 预览命令（见 walkPreviewButton）。
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
    // 新预览挂载后通知宿主：作用域变了，其它预览需要重新判定是否暂停渲染。
    editorDocument.dispatchEvent(new Event("hb-i3d-preview-scope"));
  }
  /**
   * 计算平面图的取景框 planBox（平面坐标系，单位是平面图像素）。
   * 取景范围 = 墙体端点 ∪ 路线点，两边各留 10% 边距（pixelMargin），路线贴墙时圆点不会被裁掉；
   * 没有数据时按 pixelsPerMeter 给一块默认视口。
   */
  function fitPlanBox() {
    const activeFloor = currentFloor();
    const planPoints = [
      ...(activeFloor?.plan?.walls || []).flatMap(planWall => [planWall.start, planWall.end]),
      ...(selectedSensor?.route || [])
    ];
    const xCoordinates = planPoints.map(planPointX => planPointX.x);
    const yCoordinates = planPoints.map(planPointY => planPointY.y);
    // 平面图像素当量缺省 100（即 100 像素 = 1 米），与 studio 侧默认一致。
    const pixelsPerMeter = activeFloor?.plan?.pixelsPerMeter || 100;
    const minX = planPoints.length ? Math.min(...xCoordinates) : 0;
    const minY = planPoints.length ? Math.min(...yCoordinates) : 0;
    // 下界取 1 米，避免只有一两个点时视野缩到不可用。
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
  /**
   * 重画 SVG 平面视图（路线、控制点、提示文案、按钮可用态）。
   */
  function renderRoutePlan(scheduleTopViewAfterRender = true) {
    if (!planBox) {
      return;
    }
    // 聚焦按钮由 presence-focus-editor.js 插入，存在与否取决于绑定是否可聚焦。
    const focusButtonElement = controlsPanelElement.querySelector("[data-presence-focus]");
    if (focusButtonElement) {
      focusButtonElement.disabled =
        !selectedSensor ||
        !closedRouteSensorIds.has(selectedSensor.id) ||
        !validPresenceRoute(selectedSensor.route);
    }
    // viewBox 直接用平面图像素坐标，SVG 缩放由浏览器处理，不必手动换算。
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
    // 提示文案按「是否有绑定 → 是否有楼层 → 当前视图 / 闭合状态」三级降级。
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
    // 两个主题色，与 presence-scene.js / presence-character.js 里的取色保持一致：
    // orange → 暖橙 #eaa044，其余（teal）→ 青绿 #52b8b1。
    const routeColor = selectedSensor.color === "orange" ? "#eaa044" : "#52b8b1";
    routeLayerElement.append(
      // 闭合用 polygon（自动连首尾），未闭合用 polyline，不能一律用 polygon。
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
    // 圆点半径希望固定成 6~8 个"屏幕像素"，但 viewBox 会随取景框缩放，
    // 所以用 CTM 的缩放系数换算回用户单位（1 / a = 每屏幕像素对应多少平面图像素）。
    // getScreenCTM 在元素离屏 / 未布局时可能为 null，兜底按 1 处理，避免 NaN 污染 SVG。
    const svgUnitsPerPixel = 1 / Math.max(0.0001, Math.abs(routeSvgElement.getScreenCTM()?.a || 1));
    selectedSensor.route.forEach((point, pointIndex) => {
      routeLayerElement.append(
        createSvgElement("circle", {
          cx: point.x,
          cy: point.y,
          // 起点画大一点（8 屏幕像素 vs 6），提示这里是可吸附的闭合点。
          r: (pointIndex === 0 ? 8 : 6) * svgUnitsPerPixel,
          fill: pointIndex === 0 ? routeColor : "#f7fafc",
          stroke: routeColor,
          "stroke-width": 2,
          "vector-effect": "non-scaling-stroke",
          // 命中检测靠 data-point 反查角标，拖动逻辑见 pointer 事件。
          "data-point": pointIndex
        })
      );
      const pointLabelElement = createSvgElement("text", {
        // 序号标注贴右上角，偏移量同样按屏幕像素换算，缩放时不会压到圆点上。
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
      // 悬停时预览"若在这里点击会画到哪"：靠近起点则吸附，画出虚线闭合并提示可点击。
      const snapTarget = snapsToPresenceStart(
        selectedSensor.route,
        hoverPoint,
        // 吸附阈值也是屏幕像素（10px），换算成用户单位后交给纯函数判断。
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
          // 虚线表示"尚未提交"的预览线段。
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
            // 吸附光晕 16 屏幕像素，半径比普通点大一圈。
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
  /**
   * 把「标签 + 控件」包成一行追加到右栏。
   */
  function appendField(fieldLabel, fieldControl) {
    const fieldElement = createElement("label", "", "presence-field");
    // 用 <label> 包住控件，点击文字即可聚焦输入框，无需手写 for/id。
    fieldElement.append(createElement("span", fieldLabel), fieldControl);
    controlsPanelElement.append(fieldElement);
    return fieldControl;
  }
  /**
   * 添加一个数值输入行，读写 selectedSensor 上的某个属性；input 只是视图，真正写回发生在
   * flushFieldCollectors() 或 change 事件，避免用户输入到一半（如 "0."）被规整成最小值。
   * displayScale 用于「存储是米 / 展示是厘米」这类单位换算。
   */
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
    // 捕获当前选中项：commitNumberField 可能晚于切换绑定才执行（save 前的 flush），
    // 这时 selectedSensor 已经指向别人了，用闭包里的引用才不会写错对象。
    const sensorRef = selectedSensor;
    /**
     * 把输入框里的值规整后写回绑定对象。
     */
    const commitNumberField = () => {
      const typedNumber = Number(numberInputElement.value);
      // 空串（用户清空准备重输）时保留原值；越界则夹取到 [min, max]。
      if (numberInputElement.value.trim() && Number.isFinite(typedNumber)) {
        sensorRef[propertyKey] = Math.max(minValue, Math.min(maxValue, typedNumber)) / displayScale;
      }
      // 回写视图：把夹取 / 单位换算后的真实值展示出来，用户能看到被"纠正"的结果。
      numberInputElement.value = sensorRef[propertyKey] * displayScale;
    };
    fieldCollectors.push(commitNumberField);
    numberInputElement.addEventListener("change", () => {
      commitNumberField();
      // 数值直接影响 3D（人物大小、速度），改完立刻同步预览。
      syncPreview();
    });
    appendField(numberLabel, numberInputElement).parentElement.classList.add(
      "presence-number-field"
    );
  }
  /**
   * 重建右栏属性面板与左栏绑定列表（选中项变化、增删绑定后调用）。
   */
  function renderControls() {
    // 重建会丢弃 DOM，必须先把在编辑的值提交回绑定对象，否则最后一笔输入丢失。
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
      // 新建绑定的默认值：与 offline 侧 presence 默认值保持一致
      // （速度 0.45 m/s 是成年人步速，size 1 = 标准身高，hitPadding 8px 是点击热区外扩）。
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
      // 新绑定没有路线，行走预览不成立，复位按钮与视图。
      isWalkPreviewRunning = false;
      walkPreviewButton.textContent = "预览行走";
      setViewMode("plan");
      markPresenceDirty("选择人在传感器后，请在顶视图中绘制行走路径。");
      renderControls();
    });
    addSensorButton.disabled = !floors.length;
    // 只读模式（从人物与路线面板进入）不给增删入口。
    if (manageBindings) {
      bindingsPanelElement.append(addSensorButton);
    }
    for (const listedSensor of sensorBindings) {
      // 按钮文案三级回退：自定义名称 → 实体名 → entityId → 占位文案。
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
      // 空状态也要刷新平面图与预览（可能只剩地板没有路线）。
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
            // 限定设备类型：只列出人在传感器类实体，避免选到灯 / 窗帘。
            deviceKind: "presence",
            onSelect: (entityId, pickedEntity) => {
              flushFieldCollectors();
              fieldCollectors = [];
              activeSensor.entityId = entityId;
              // 事件型实体（event.*）没有"持续有人"的语义，只在一瞬间触发，
              // 因此给一个 30 秒的默认展示时长，避免角色一闪而过。
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
      // 只读模式不再暴露选择器，只显示当前绑定（改名要去安防设置里改）。
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
    // 128 与后端字段长度限制对齐，避免保存时才报错。
    labelInputElement.maxLength = 128;
    labelInputElement.placeholder = "可选，自定义名称";
    labelInputElement.setAttribute("aria-label", "显示名称");
    /**
     * 把名称输入框的内容提交到绑定对象。
     */
    const commitLabelInput = () => {
      // 截断到 128 字符：与 maxLength 双保险（粘贴超长文本时 maxLength 不生效）。
      activeSensor.label = labelInputElement.value.slice(0, 128);
    };
    fieldCollectors.push(commitLabelInput);
    // input 事件即时提交：改名要马上反映在左栏与预览里。
    labelInputElement.addEventListener("input", commitLabelInput);
    labelInputElement.addEventListener("change", () => {
      commitLabelInput();
      // 直接改按钮文案而不是整体 renderControls()：后者会重建 DOM 导致输入框失焦。
      // 索引要跳过可能的「＋ 添加」按钮（manageBindings 时它排在列表最前）。
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
    // 楼层可能被删掉：补一个占位项而不是让 select 落到第一个楼层（会造成路线莫名搬家）。
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
      // 换楼层的路线坐标系不通用，必须清空路线并重新绘制；modelId 也随楼层失效。
      delete activeSensor.modelId;
      activeSensor.route = [];
      closedRouteSensorIds.delete(activeSensor.id);
      markPresenceDirty();
      renderControls();
    });
    appendField("路线楼层", floorSelectElement);
    floorSelectElement.disabled = !manageBindings;
    // 人物在所有页面都出现（displayPages 是既有字段，这里固定为 all）。
    activeSensor.displayPages = "all";
    controlsPanelElement.append(createElement("p", "显示页面：ALL（全部页面）", "presence-note"));
    controlsPanelElement.append(createElement("strong", "人物方案"));
    const designButtonsElement = createElement("div", "", "presence-designs");
    for (const [designKey, design] of Object.entries(DESIGNS)) {
      // DESIGNS 来自 presence-character.js，按钮文案就是方案中文名。
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
    // 角色预览容器：WebGL canvas 由 characterPreview 反复复用（见下方 append），
    // 重建面板时只把已有 canvas 重新挂上去，不重建模型与渲染器。
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
    // 只有两个配色：与 3D 侧 routeColor / 人物材质的取色一一对应（cyan=#52b8b1, orange=#eaa044）。
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
    // 触发方式只在安防模式可改：人物与路线面板只管外观与路径。
    if (manageBindings) {
      const triggerModeSelectElement = createElement("select");
      triggerModeSelectElement.setAttribute("aria-label", "触发方式");
      for (const [modeValue, modeLabel] of PRESENCE_TRIGGER_MODES) {
        const modeOptionElement = createElement("option", modeLabel);
        modeOptionElement.value = modeValue;
        triggerModeSelectElement.append(modeOptionElement);
      }
      // 缺省 auto：跟随传感器自身的开关 / 有人状态，无需额外规则。
      triggerModeSelectElement.value = activeSensor.triggerMode || "auto";
      triggerModeSelectElement.addEventListener("change", () => {
        // 切模式会增删后续字段，先 flush 再清空收集器，避免旧字段的提交函数残留。
        flushFieldCollectors();
        fieldCollectors = [];
        activeSensor.triggerMode = triggerModeSelectElement.value;
        // 为每个模式补齐它需要的字段默认值（??= 不覆盖用户已填的值）。
        if (triggerModeSelectElement.value === "equals") {
          activeSensor.triggerValue ||= "on";
        }
        if (triggerModeSelectElement.value === "threshold") {
          activeSensor.triggerThreshold ??= 0;
        }
        // 定时类触发（事件 / 数值）没有"持续有人"状态，必须给个显示时长，否则角色不出现。
        if (presenceTriggerIsTimed(activeSensor) && !(activeSensor.displayDuration > 0)) {
          activeSensor.displayDuration = 30;
        }
        renderControls();
      });
      appendField("触发方式", triggerModeSelectElement);
      if (activeSensor.triggerMode === "threshold") {
        activeSensor.triggerThreshold ??= 0;
        // 阈值是通用数值比较，范围取 ±100 万以覆盖电量、功率、照度等各种量纲。
        addNumberField("数值大于", "triggerThreshold", -1000000, 1000000, 0.1);
      }
      if (activeSensor.triggerMode === "equals") {
        const triggerValueInputElement = createElement("input");
        triggerValueInputElement.value = activeSensor.triggerValue ?? "on";
        triggerValueInputElement.maxLength = 128;
        triggerValueInputElement.setAttribute("aria-label", "触发值");
        /**
         * 把触发值输入框的内容提交到绑定对象（空值不提交）。
         */
        const commitTriggerValue = () => {
          // 空值不提交：留空时保留原触发值，避免把规则改成"永不触发"。
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
    // 定时触发的时长下限是 1 秒（0 会被解释成"跟随有人状态"）；上限 1 小时防止误填。
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
    // 速度范围 0.1~2 m/s（正常步速约 0.45~1.4 m/s，慢走 0.1 够演示用），步长 0.05 便于微调。
    addNumberField("行走速度（米/秒）", "speed", 0.1, 2, 0.05);
    // size 存的是倍率（1 = 标准身高），displayScale=100 让界面显示成百分比，范围 25%~300%。
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
      // 勾选后会多出触控范围 / 聚焦视角等字段，需要重建右栏。
      renderControls();
    });
    const clickToFocusFieldElement = appendField("点击模型聚焦", clickToFocusInputElement);
    clickToFocusFieldElement.parentElement.className = "i3d-setting-toggle";
    if (activeSensor.clickToFocus) {
      // 触控热区默认外扩 8px（与 presence-scene.js 的 hitPadding 默认值一致）。
      activeSensor.hitPadding ??= 8;
      // 上限 80px：再大相邻模型的热区会互相遮挡，误点率上升。
      addNumberField("触控范围扩展（px）", "hitPadding", 0, 80, 1);
      const hitRangeInputElement = createElement("input");
      hitRangeInputElement.type = "checkbox";
      hitRangeInputElement.checked = isHitRangeVisible;
      hitRangeInputElement.setAttribute("aria-label", "显示触控范围");
      hitRangeInputElement.addEventListener("change", () => {
        isHitRangeVisible = hitRangeInputElement.checked;
        // 仅切换 3D 侧的热区可视化，未就绪时留到 onPresented 补发。
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
      // 「调整聚焦视角」交给 presence-focus-editor.js：它自己开一个带 3D 预览的子弹窗。
      const focusCameraButton = createButton(
        activeSensor.focusCamera ? "调整聚焦视角" : "设置聚焦视角",
        () =>
          openPresenceFocusEditor({
            component: component,
            // 传草稿属性（而非组件属性），保证聚焦相机随本次保存一起落盘。
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
      // 没有合法闭合路线就无法定位镜头，禁用聚焦设置。
      focusCameraButton.disabled =
        !closedRouteSensorIds.has(activeSensor.id) || !validPresenceRoute(activeSensor.route);
      controlsPanelElement.append(focusCameraButton);
      if (activeSensor.focusCamera) {
        // 「恢复自动聚焦」即删掉自定义聚焦：presence-scene.js 会退回默认取景。
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
          // 同步清掉闭合意图，否则残留的 id 会被后续同 id 绑定误用。
          closedRouteSensorIds.delete(activeSensor.id);
          // 删除后回到第一条（或空状态），不能继续指向已移除的对象。
          selectedSensor = sensorBindings[0] || null;
          markPresenceDirty();
          renderControls();
        })
      );
    }
    // 重建完成后统一刷新：平面图取景框随楼层 / 路线变化，预览也要跟上新的属性。
    fitPlanBox();
    syncPreview();
  }
  /**
   * 屏幕坐标 → SVG 用户坐标：唯一实现在 /static/shared/svg-point.js（经 static-helpers-editor 桥取用）。
   * 这里只把 `routeSvgElement` 绑上，避免每个调用点都传一遍。
   */
  const toSvgPoint = pointerEvent => bridgedToSvgPoint(routeSvgElement, pointerEvent);
  routeSvgElement.addEventListener("pointerdown", pointerDownEvent => {
    // 只有平面视图、鼠标左键、且有合法楼层时才响应绘制。
    if (
      viewMode !== "plan" ||
      pointerDownEvent.button !== 0 ||
      !selectedSensor ||
      !floors.some(originatingFloorProbe => originatingFloorProbe.id === selectedSensor.floorId)
    ) {
      return;
    }
    const pointIndexAttribute = pointerDownEvent.target.getAttribute("data-point");
    // 阻止默认行为：否则会触发文本选择 / 原生拖拽，把绘制手势打断。
    pointerDownEvent.preventDefault();
    // 捕获指针：拖出 SVG 边界（甚至移出窗口）也能继续收到 pointermove。
    capturePointer(routeSvgElement, pointerDownEvent.pointerId);
    // 优先判断"吸附闭合"：悬停靠近起点时点击即闭合，而不是新增一个重合点。
    if (
      !closedRouteSensorIds.has(selectedSensor.id) &&
      snapsToPresenceStart(
        selectedSensor.route,
        toSvgPoint(pointerDownEvent),
        // 吸附阈值用屏幕像素（CTM.a = 用户单位→像素的缩放），保证缩放后手感一致。
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
      // 点到了序号 0 的起点且路线合法 → 视为"点击闭合"，与吸附闭合等价。
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
      // 否则进入拖动模式，实际移动在 pointermove 里做。
      draggedPoint = {
        index: Number(pointIndexAttribute)
      };
    } else if (!closedRouteSensorIds.has(selectedSensor.id) && selectedSensor.route.length < 128) {
      // 空白处点击 = 追加一个路径点。上限 128 点与后端字段容量一致，防止存不下的超长路线。
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
      // 未拖拽时只做"悬停预览"（虚线 + 吸附提示）。
      if (selectedSensor && !closedRouteSensorIds.has(selectedSensor.id)) {
        hoverPoint = pointerSvgPoint;
        // 传 false：拖动 / 悬停这类高频路径不顺带发相机命令，否则每帧都在移动镜头。
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
    // 拖拽中指针离开视口不移除预览线（还在 setPointerCapture 期间，用户仍会拖回来）。
    if (!draggedPoint) {
      renderRoutePlan(false);
    }
  });
  /**
   * 结束（或取消）拖拽 / 绘制手势：提交脏标记并同步 3D 预览。
   */
  const handlePointerEnd = () => {
    // 只有真的拖动过才标脏（点一下空白新增点的情况已在 pointerdown 标过）。
    if (draggedPoint) {
      markPresenceDirty();
    }
    draggedPoint = null;
    syncPreview();
  };
  // 三个事件都绑同一个收尾函数：pointercancel（系统手势打断）与
  // lostpointercapture（别处夺走捕获）也必须复位 draggedPoint，否则会残留"粘住"的点。
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    routeSvgElement.addEventListener(eventName, handlePointerEnd);
  }
  // SVG 尺寸变化会改变 CTM，圆点半径与标注偏移都要重算，所以直接重绘。
  const routeResizeObserver = new ResizeObserver(renderRoutePlan);
  routeResizeObserver.observe(routeSvgElement);
  // Esc 关闭：拦住 <dialog> 的原生 cancel，走自己的 closeEditor 以释放资源。
  dialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    closeEditor();
  });
  /**
   * 角色预览的渲染循环：按需重建模型 + 推进行走动画。
   */
  function animateCharacterPreview(timestamp) {
    // 页面隐藏时不再排下一帧（handleVisibilityChange 会在恢复时重启循环）。
    if (!isClosed && !editorDocument.hidden) {
      if (characterPreview && selectedSensor) {
        // 只有角色方案或颜色变化才重建模型，避免每帧创建几何体。
        const previewKey = selectedSensor.character + ":" + selectedSensor.color;
        if (previewSignature !== previewKey) {
          disposeWalker(characterPreview.root);
          characterPreview.root = createWalker(
            characterPreview.THREE,
            // 直接写字面量而不是读主题色：orange → 0xEAA044(15376452)、cyan → 0x52B8B1(5421233)，
            // 与 presence-scene.js 的取色表逐位一致，避免两处不一致导致预览和舞台不同色。
            selectedSensor.color === "orange" ? 15376452 : 5421233,
            selectedSensor.character
          );
          characterPreview.scene.add(characterPreview.root);
          previewSignature = previewKey;
        }
        // 帧间隔上限 0.1s：标签页切回来或断帧时避免动画瞬移一大段距离。
        const frameDeltaSeconds = lastFrameTimeMs
          ? Math.min(0.1, (timestamp - lastFrameTimeMs) / 1000)
          : 0;
        lastFrameTimeMs = timestamp;
        elapsedSeconds += frameDeltaSeconds;
        // 预览里的走路位移乘了 12 倍：这是 240×160 的小窗口，按真实速度会看不出在走。
        walkDistance += frameDeltaSeconds * selectedSensor.speed * 12;
        // 第三个参数固定 walkAmount=1：预览始终展示"行走中"的姿态。
        animateWalker(characterPreview.root, walkDistance, 1, elapsedSeconds);
        characterPreview.renderer.render(characterPreview.scene, characterPreview.camera);
      }
      animationFrameId = requestAnimationFrame(animateCharacterPreview);
    }
  }
  /**
   * 页面可见性变化：隐藏时停掉渲染循环，恢复时重启（并把时间基准清零防止跳帧）。
   */
  function handleVisibilityChange() {
    cancelAnimationFrame(animationFrameId);
    // 清零 lastFrameTimeMs，恢复后第一帧 delta 为 0，不会补跳一大段动画。
    lastFrameTimeMs = 0;
    if (!editorDocument.hidden && !isClosed) {
      animationFrameId = requestAnimationFrame(animateCharacterPreview);
    }
  }
  editorDocument.addEventListener("visibilitychange", handleVisibilityChange);
  dialogElement.showModal();
  renderControls();
  try {
    // three 走动态 import：只在真正打开编辑器时才下载（约 600KB），
    // 下载失败只影响小预览，不影响路线编辑，所以整个初始化包在 try 里。
    const threeModule = await import("/static/vendor/three/0.186.0/three.module.min.js");
    if (isClosed) {
      return;
    }
    const previewRenderer = new threeModule.WebGLRenderer({
      // alpha：预览背景透出面板底色，避免与对话框视觉割裂。
      alpha: true,
      antialias: true
    });
    // 上限 2 倍：高分屏上 3 倍会明显增加小窗口的 GPU 开销，收益却看不出来。
    previewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    // 固定 240×160（3:2）：与 CSS 里的预览框尺寸对应，避免拉伸。
    previewRenderer.setSize(240, 160);
    const previewScene = new threeModule.Scene();
    // 32° 视场角 + 1.5 宽高比（=240/160），远平面 20 米足够包住宅内一层。
    const previewCamera = new threeModule.PerspectiveCamera(32, 1.5, 0.1, 20);
    // 相机位于 (2, 1.7, 3)：1.7 是近似人眼高度（米），看向 (0, 0.7, 0) 即角色胸口位置。
    previewCamera.position.set(2, 1.7, 3);
    previewCamera.lookAt(0, 0.7, 0);
    previewScene.add(new threeModule.HemisphereLight(16777215, 7831948, 2.5));
    // 半球光：天空 0xFFFFFF / 地面 0x77818C（冷灰蓝），强度 2.5。
    // three r155+ 采用物理光照单位，室内补光强度需给到 2 以上才接近旧版观感；
    // 地面色偏冷是室内暗环境的常见反弹色，让角色下半身不至于死黑。
    const keyLight = new threeModule.DirectionalLight(16772824, 3);
    // 主光 0xFFEED8（暖白，模拟室内暖色顶灯），强度 3，从左上前方 45° 打下来。
    keyLight.position.set(3, 5, 3);
    previewScene.add(keyLight);
    // 不带参数：用 createWalker 的默认配色与默认方案，随界面再重建（见 animateCharacterPreview）。
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
    // 用 handleVisibilityChange 而不是直接 requestAnimationFrame：
    // 它会先判断文档是否可见，隐藏状态下不会白排一帧。
    handleVisibilityChange();
    // 静默失败：three 未加载 / WebGL 不可用时，预览区域留空即可，路线编辑照常可用。
  } catch {
    // 见上：预览是可选装饰，失败不阻塞编辑器打开。这里刻意不上报 —— 缺 three 是
    // 已知的降级路径，把它打成错误日志只会淹没真正的问题。
  }
  return {
    close: closeEditor
  };
}
