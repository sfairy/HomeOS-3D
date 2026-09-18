/**
 * 扫地机底图对齐编辑器（模态弹窗，纯手写 SVG）。
 *
 * 用途：让用户把设备上报的底图摆到户型平面图的正确位置上，最终产出
 * `{ x, y, width, depth, rotation, opacity, visible }` 这份地图配置交回面板保存。
 *
 * 坐标系与单位（本文件最关键的部分）：
 *   - 户型平面数据（walls / items）与 SVG 的 viewBox 都以「米」为单位，
 *     所以 SVG 用户单位 == 平面米 == 世界米，几何量之间不需要额外换算。
 *   - 底图由中心点 (x, y) + width/depth + rotation（度）描述，四角交给 mapCorners 算；
 *     与 3D 舞台共用同一个 mapCorners，保证「编辑器里看到的摆位」等于「舞台上渲染的摆位」。
 *   - 屏幕 CSS 像素与 SVG 用户单位之间用 getScreenCTM().a（当前缩放系数）换算：
 *     手柄半径、标签字号都按 unitsPerPixel 反算，因此缩放视图时手柄的视觉大小恒定。
 *
 * 交互约定：
 *   - 空白处拖动 = 平移视图（改 viewBox）；地图多边形上拖动 = 移动地图；四角圆点 = 缩放；
 *     绿色圆点 = 旋转；按住 Shift 拖角点 = 等比缩放。
 *   - 滚轮：指针落在地图（含手柄）上时缩放地图本身（1.08 步进），否则缩放视图（1.12 步进）。
 *     两个步进值不同是刻意的——地图缩放改的是「对齐尺寸」，视图缩放改的是「看远看近」。
 *   - 双指捏合（同时按下两个 pointerId）缩放地图，与单指拖动互斥。
 *
 * 重绘策略：这里没有脏标记与 requestAnimationFrame，所有改动都直接同步调用 renderEditor()。
 * 理由是节点数量极少（若干 SVG 图元 + 一个 image），而用户交互本身就是低频事件，
 * 引入异步批处理只会增加状态不一致的风险。
 *
 * 对外导出：planFurniture（可被其他平面渲染复用）、openVacuumMapEditor。
 */
import { mapCorners, mapSource } from "./vacuum-map.js?v=20260918175732";
/**
 * 从户型平面数据里挑出可当参照物的家具，并把尺寸换算到像素尺度。
 *
 * 过滤规则：灯具、摄像头、人体存在传感器、地面开洞、文字标签一律排除——它们要么
 * 不在落地层，要么只是标注，画出来只会干扰对齐；缺少合法坐标或宽高非正的条目也丢掉。
 * 尺寸乘以 plan.pixelsPerMeter：户型数据以米存储，pixelsPerMeter 非法时退化为 1，
 * 避免整块平面被乘成 0 而看不见。
 *
 * @param {object} [plan] 户型平面数据，含 items 与 pixelsPerMeter。
 * @returns {Array<object>} 家具副本列表，width/depth 已换算成像素，rotation 已归一成数字。
 */
export function planFurniture(plan = {}) {
  // pixelsPerMeter 缺失或非正时退化为 1：宁可比例不准，也不能让整张平面缩成 0。
  const pixelsPerMeter = Number(plan.pixelsPerMeter) > 0 ? Number(plan.pixelsPerMeter) : 1;
  // 这些类型不落地或本身就是开洞/标注，不能当参照物。
  const excludedFurnitureTypes = new Set([
    "downlight",
    "ceilinglight",
    "striplight",
    "camera",
    "presence",
    "flooropening",
    "label"
  ]);
  return (plan.items || [])
    // 坐标与尺寸必须都是有限数且为正，否则这个条目画出来只剩一条线。
    .filter(
      planItem =>
        !excludedFurnitureTypes.has(planItem.type) &&
        [planItem.x, planItem.y, planItem.width, planItem.depth].every(Number.isFinite) &&
        planItem.width > 0 &&
        planItem.depth > 0
    )
    .map(furniture => ({
      ...furniture,
      // 尺寸换到像素尺度；rotation 归一成数字，避免字符串参与后面的三角函数运算。
      width: furniture.width * pixelsPerMeter,
      depth: furniture.depth * pixelsPerMeter,
      rotation: Number(furniture.rotation) || 0
    }));
}
/**
 * 打开「底图对齐」弹窗。
 *
 * 弹窗内部维护一份 draftState.map 草稿：拖动、滚轮、输入框改的都是草稿，
 * 只有点「保存」才通过 onSave 交给面板（面板再写回配置并落库），
 * 因此「关闭」按钮天然等于放弃本次修改。
 *
 * @param {object} options 打开参数。
 * @param {object} options.item 面板条目，需带 map 配置（可为空配置）。
 * @param {object} options.floor 当前楼层，需带 name 与 plan（walls / items / pixelsPerMeter）。
 * @param {Function} options.onSave 保存回调，收到草稿 map 的深拷贝。
 * @returns {{close: Function}} 控制器，暴露 close 供外部主动关闭。
 */
export function openVacuumMapEditor({ item: vacuumItem, floor: floor, onSave: saveHandler }) {
  const documentRef = window.document;
  // 本弹窗的全部 SVG 都用手写 createElementNS 构建，不依赖模板或任何前端框架。
  const SVG_NAMESPACE_URI = "http://www.w3.org/2000/svg";
  /**
   * 创建 HTML 元素（可选带文本）。
   *
   * @param {string} tagName 标签名。
   * @param {string} [textContent] 文本内容，为空时不设置。
   * @returns {HTMLElement} 新建元素。
   */
  const createHtmlElement = (tagName, textContent) => {
    const createdElement = documentRef.createElement(tagName);
    if (textContent) {
      createdElement.textContent = textContent;
    }
    return createdElement;
  };
  /**
   * 创建 SVG 元素并批量设置属性。
   *
   * @param {string} svgTagName SVG 标签名。
   * @param {object} [svgAttributes] 属性名 → 属性值。
   * @returns {SVGElement} 新建的 SVG 元素。
   */
  const createSvgElement = (svgTagName, svgAttributes = {}) => {
    const createdSvgElement = documentRef.createElementNS(SVG_NAMESPACE_URI, svgTagName);
    for (const [attributeName, attributeValue] of Object.entries(svgAttributes)) {
      createdSvgElement.setAttribute(attributeName, attributeValue);
    }
    return createdSvgElement;
  };
  // 平面参照物：墙体线段 + 过滤后的家具（过滤规则见 planFurniture）。
  const walls = floor?.plan?.walls || [];
  const furnitureItems = planFurniture(floor?.plan);
  // 所有参照点（墙端点 + 家具四角），用来算户型包围盒，决定初始 viewBox 与缩放上限。
  const planPoints = [
    ...walls.flatMap(wall => [wall.start, wall.end]),
    ...furnitureItems.flatMap(mapCorners)
  ];
  const boundsMinX = planPoints.length ? Math.min(...planPoints.map(pointForX => pointForX.x)) : 0;
  const boundsMinY = planPoints.length ? Math.min(...planPoints.map(pointForY => pointForY.y)) : 0;
  // 包围盒宽高下限取 100：没有任何平面数据时给一块 1000×1000 的可用视图。
  const boundsWidth = Math.max(
    100,
    planPoints.length
      ? Math.max(...planPoints.map(pointForWidth => pointForWidth.x)) - boundsMinX
      : 1000
  );
  const boundsDepth = Math.max(
    100,
    planPoints.length
      ? Math.max(...planPoints.map(pointForDepth => pointForDepth.y)) - boundsMinY
      : 1000
  );
  // 默认摆位：铺满户型包围盒并居中，用户在此基础上微调。
  const defaultMapConfig = {
    x: boundsMinX + boundsWidth / 2,
    y: boundsMinY + boundsDepth / 2,
    width: boundsWidth,
    depth: boundsDepth,
    rotation: 0,
    opacity: 45,
    visible: true
  };
  // 草稿：以默认值打底再合并已保存配置；structuredClone 防止改草稿时污染入参对象。
  const draftState = {
    map: {
      ...defaultMapConfig,
      ...structuredClone(vacuumItem.map || {})
    }
  };
  // 用原生 <dialog> + showModal()：自带模态遮罩、Esc 关闭和无障碍语义，无需自造弹层。
  const dialogElement = createHtmlElement("dialog");
  dialogElement.className = "i3d-vacuum-map-editor";
  dialogElement.setAttribute("aria-label", "底图对齐");
  const headerElement = createHtmlElement("header");
  const titleElement = createHtmlElement("strong", (floor?.name || "当前楼层") + " · 底图对齐");
  const statusElement = createHtmlElement("span");
  statusElement.setAttribute("role", "status");
  // 关闭标记：ResizeObserver 回调靠它判断自己是否还在有效生命周期内。
  let isClosed = false;
  // 指针交互状态：同一时刻只可能是「拖动/平移」或「捏合」其中之一。
  let dragState = null;
  /**
   * 关闭并销毁弹窗。
   *
   * @returns {void} 无返回值；重复调用是安全的。
   */
  const closeEditor = () => {
    // 只关一次：断开观察器、关闭 dialog、移除节点，避免残留节点与观察者。
    if (!isClosed) {
      isClosed = true;
      resizeObserver.disconnect();
      dialogElement.close();
      dialogElement.remove();
    }
  };
  /**
   * 创建按钮。
   *
   * @param {string} buttonLabel 按钮文案。
   * @param {Function} onClick 点击回调。
   * @returns {HTMLButtonElement} 新建按钮元素。
   */
  const createButton = (buttonLabel, onClick) => {
    const buttonElement = createHtmlElement("button", buttonLabel);
    // 显式 type=button：防止将来被放进表单语义时退化成提交按钮。
    buttonElement.type = "button";
    buttonElement.addEventListener("click", onClick);
    return buttonElement;
  };
  // 保存深拷贝：调用方后续改动不会反向污染已经关闭的草稿。
  const saveButtonElement = createButton("保存", () => {
    saveHandler(structuredClone(draftState));
    statusElement.textContent = "已应用，最后保存扫地机配置";
  });
  saveButtonElement.className = "primary";
  const closeButtonElement = createButton("×", closeEditor);
  closeButtonElement.setAttribute("aria-label", "关闭底图对齐");
  headerElement.append(titleElement, statusElement, saveButtonElement, closeButtonElement);
  const bodyElement = createHtmlElement("div");
  bodyElement.className = "i3d-vacuum-map-body";
  const planElement = createHtmlElement("div");
  planElement.className = "i3d-vacuum-plan";
  // 初始视野四周留 12% 边距，让地图贴边时手柄也不会压到面板边缘。
  const planPadding = Math.max(boundsWidth, boundsDepth) * 0.12;
  // viewBox 直接使用平面坐标系（米），因此后续所有几何量都无需再做单位换算。
  const svgElement = createSvgElement("svg", {
    viewBox:
      boundsMinX -
      planPadding +
      " " +
      (boundsMinY - planPadding) +
      " " +
      (boundsWidth + planPadding * 2) +
      " " +
      (boundsDepth + planPadding * 2),
    role: "img",
    "aria-label": "户型平面与扫地机地图"
  });
  // viewBox 用结构化对象维护，平移/缩放改对象后再由 applyViewBox 落到属性上。
  let viewBox = {
    x: boundsMinX - planPadding,
    y: boundsMinY - planPadding,
    width: boundsWidth + planPadding * 2,
    height: boundsDepth + planPadding * 2
  };
  /**
   * 把当前 viewBox 写回 SVG 并重绘。
   *
   * @returns {void} 无返回值。
   */
  const applyViewBox = () => {
    svgElement.setAttribute(
      "viewBox",
      viewBox.x + " " + viewBox.y + " " + viewBox.width + " " + viewBox.height
    );
    // 重绘不能省：手柄半径与标签字号都按当前缩放系数反算，视图一变就得重算。
    renderEditor();
  };
  /**
   * 按比例缩放底图（改草稿里的 width/depth，不是视图）。
   *
   * 缩放系数按「最小边不小于 0.01、最大边不超过 1e6 个单位」夹取：
   * 既避免缩到 0 之后出现除零，也避免数值过大后浮点精度失控。
   *
   * @param {number} scaleFactor 缩放倍数（大于 1 放大，小于 1 缩小）。
   * @returns {void} 无返回值。
   */
  const scaleMap = scaleFactor => {
    const draftMap = draftState.map;
    // 两轴同步缩放，保持底图长宽比，避免地图被拉变形。
    const clampedScale = Math.max(
      0.01 / Math.min(draftMap.width, draftMap.depth),
      Math.min(1000000 / Math.max(draftMap.width, draftMap.depth), scaleFactor)
    );
    draftMap.width *= clampedScale;
    draftMap.depth *= clampedScale;
    renderEditor();
  };
  /**
   * 缩放视图（只改 viewBox，不动底图尺寸），并保持视图中心不变。
   *
   * 视图宽度夹在户型包围盒的 15%~1000%：再小看不清手柄，再大容易迷失方位。
   *
   * @param {number} zoomFactor 视图宽度倍数（大于 1 表示看得更远）。
   * @returns {void} 无返回值。
   */
  const zoomView = zoomFactor => {
    const nextViewWidth = Math.max(
      boundsWidth * 0.15,
      Math.min(boundsWidth * 10, viewBox.width * zoomFactor)
    );
    // 宽高按同一比例变化，缩放后视图中心落在原点不变（x/y 各补偿一半差值）。
    const viewScaleRatio = nextViewWidth / viewBox.width;
    viewBox = {
      x: viewBox.x + (viewBox.width - nextViewWidth) / 2,
      y: viewBox.y + (viewBox.height * (1 - viewScaleRatio)) / 2,
      width: nextViewWidth,
      height: viewBox.height * viewScaleRatio
    };
    applyViewBox();
  };
  // 底图本体：preserveAspectRatio=none，因为 width/depth 是用户分别设定的两轴尺寸。
  const mapImageElement = createSvgElement("image", {
    preserveAspectRatio: "none"
  });
  // 家具层整体不接收指针事件：地图多边形才是拖动目标，家具只作参照。
  const furnitureLayerElement = createSvgElement("g", {
    "pointer-events": "none",
    "data-layer": "furniture"
  });
  const wallsLayerElement = createSvgElement("g");
  const handlesLayerElement = createSvgElement("g");
  // 家具文字标签单独收集：缩放视图时要按 unitsPerPixel 重算字号与显隐。
  const furnitureLabels = [];
  for (const furnitureEntry of furnitureItems) {
    const furnitureWidth = furnitureEntry.width;
    const furnitureDepth = furnitureEntry.depth;
    // 每件家具一个 group，用 translate + rotate 承接位置与朝向，内部形状以自身中心为原点。
    const furnitureGroup = createSvgElement("g", {
      transform:
        "translate(" +
        furnitureEntry.x +
        " " +
        furnitureEntry.y +
        ") rotate(" +
        furnitureEntry.rotation +
        ")",
      "data-furniture-id": furnitureEntry.id,
      // 颜色字段必须是 6 位十六进制色值，否则退回默认灰蓝，防止注入非法属性。
      fill: /^#[0-9a-f]{6}$/i.test(furnitureEntry.color || "") ? furnitureEntry.color : "#91a4b5",
      "fill-opacity": 0.28,
      stroke: "#d0dae3",
      "stroke-width": 1,
      "stroke-opacity": 0.8
    });
    /**
     * 往当前家具 group 里追加一个形状。
     *
     * @param {string} shapeTagName SVG 形状标签名。
     * @param {object} shapeAttributes 形状属性。
     * @returns {void} 无返回值。
     */
    const appendFurnitureShape = (shapeTagName, shapeAttributes) =>
      furnitureGroup.append(
        createSvgElement(shapeTagName, {
          ...shapeAttributes,
          // 线宽固定为屏幕像素：缩放视图时家具轮廓不会跟着变粗变细。
          "vector-effect": "non-scaling-stroke"
        })
      );
    // 这几类在平面图上用椭圆表示更直观，其余用矩形。
    const isRoundFurniture = ["plant", "robotvacuum", "roundtable", "stool"].includes(
      furnitureEntry.type
    );
    // 形状一律以自身中心为原点：外层 group 已 translate 到家具中心，这里只给半宽半高。
    appendFurnitureShape(
      isRoundFurniture ? "ellipse" : "rect",
      isRoundFurniture
        ? {
            cx: 0,
            cy: 0,
            rx: furnitureWidth / 2,
            ry: furnitureDepth / 2
          }
        : {
            x: -furnitureWidth / 2,
            y: -furnitureDepth / 2,
            width: furnitureWidth,
            height: furnitureDepth,
            rx: Math.min(furnitureWidth, furnitureDepth) * 0.06
          }
    );
    // 床：两只枕头 + 一条床头横线；沙发：坐垫轮廓 + 靠背分缝线。
    // 这些都是纯装饰细节，用途是让用户一眼认出家具朝向，从而判断底图有没有转反。
    if (furnitureEntry.type === "bed") {
      appendFurnitureShape("rect", {
        x: -furnitureWidth * 0.42,
        y: -furnitureDepth * 0.43,
        width: furnitureWidth * 0.36,
        height: furnitureDepth * 0.2,
        rx: furnitureDepth * 0.03
      });
      appendFurnitureShape("rect", {
        x: furnitureWidth * 0.06,
        y: -furnitureDepth * 0.43,
        width: furnitureWidth * 0.36,
        height: furnitureDepth * 0.2,
        rx: furnitureDepth * 0.03
      });
      appendFurnitureShape("line", {
        x1: -furnitureWidth / 2,
        x2: furnitureWidth / 2,
        y1: -furnitureDepth * 0.12,
        y2: -furnitureDepth * 0.12
      });
    } else if (furnitureEntry.type === "sofa") {
      appendFurnitureShape("rect", {
        x: -furnitureWidth * 0.38,
        y: -furnitureDepth * 0.26,
        width: furnitureWidth * 0.76,
        height: furnitureDepth * 0.65,
        rx: furnitureDepth * 0.04
      });
      appendFurnitureShape("line", {
        x1: 0,
        x2: 0,
        y1: -furnitureDepth * 0.26,
        y2: furnitureDepth * 0.39
      });
    }
    furnitureLayerElement.append(furnitureGroup);
    // 有名字才画标签；描边 + paint-order 保证文字落在深色底图上依然能读清。
    if (furnitureEntry.name) {
      const furnitureLabelElement = createSvgElement("text", {
        x: furnitureEntry.x,
        y: furnitureEntry.y,
        fill: "#e0e7ed",
        "text-anchor": "middle",
        "dominant-baseline": "central",
        stroke: "#17212d",
        "stroke-width": 2.5,
        "paint-order": "stroke",
        "vector-effect": "non-scaling-stroke"
      });
      furnitureLabelElement.textContent = furnitureEntry.name;
      furnitureLayerElement.append(furnitureLabelElement);
      furnitureLabels.push({
        label: furnitureLabelElement,
        item: furnitureEntry
      });
    }
  }
  // 墙体单独一层并禁用指针事件：细线不应该抢走空白处的平移手势。
  for (const wallSegment of walls) {
    // 线宽取墙厚；缺省时按户型宽度的 0.6% 估一个可见的细线（下限 2 个单位）。
    wallsLayerElement.append(
      createSvgElement("line", {
        x1: wallSegment.start.x,
        y1: wallSegment.start.y,
        x2: wallSegment.end.x,
        y2: wallSegment.end.y,
        stroke: "#9fa9bc",
        "stroke-width": Math.max(2, wallSegment.thickness || boundsWidth * 0.006),
        "vector-effect": "non-scaling-stroke",
        "pointer-events": "none"
      })
    );
  }
  // 叠放顺序即绘制顺序：底图 → 家具参照 → 墙体 → 手柄；手柄必须最上层才拖得动。
  svgElement.append(mapImageElement, furnitureLayerElement, wallsLayerElement, handlesLayerElement);
  planElement.append(svgElement);
  const viewToolsElement = createHtmlElement("div");
  viewToolsElement.className = "i3d-vacuum-view-tools";
  // 「地图 ±」改底图尺寸（1.1 倍步进），「视图 ±」改 viewBox（1.2 倍步进），
  // 步进故意不同：对齐尺寸要精细，看远看近要快。
  viewToolsElement.append(
    createButton("地图 −", () => scaleMap(1 / 1.1)),
    createButton("地图 +", () => scaleMap(1.1)),
    createButton("视图 −", () => zoomView(1.2)),
    createButton("视图 +", () => zoomView(1 / 1.2)),
    createButton("显示全部", () => {
      // 把户型参照点与当前地图四角一起纳入视野，四周留 15% 边距。
      const visiblePoints = [...planPoints, ...mapCorners(draftState.map)];
      const viewPadding = Math.max(boundsWidth, boundsDepth) * 0.15;
      const viewMinX = Math.min(...visiblePoints.map(pointForViewMinX => pointForViewMinX.x));
      const viewMinY = Math.min(...visiblePoints.map(pointForViewMinY => pointForViewMinY.y));
      viewBox = {
        x: viewMinX - viewPadding,
        y: viewMinY - viewPadding,
        width:
          Math.max(...visiblePoints.map(pointForViewMaxX => pointForViewMaxX.x)) -
          viewMinX +
          viewPadding * 2,
        height:
          Math.max(...visiblePoints.map(pointForViewMaxY => pointForViewMaxY.y)) -
          viewMinY +
          viewPadding * 2
      };
      applyViewBox();
    })
  );
  planElement.append(viewToolsElement);
  // passive: false 才能 preventDefault，否则滚轮会带着外层页面一起滚。
  svgElement.addEventListener(
    "wheel",
    wheelEvent => {
      wheelEvent.preventDefault();
      // 指针落在地图或手柄上时缩放底图本身，落在空白处则缩放视图——两种意图彻底分开。
      if (wheelEvent.target.closest("[data-drag]")) {
        scaleMap(wheelEvent.deltaY > 0 ? 1 / 1.08 : 1.08);
      } else {
        zoomView(wheelEvent.deltaY > 0 ? 1.12 : 1 / 1.12);
      }
    },
    {
      passive: false
    }
  );
  const sidebarElement = createHtmlElement("aside");
  // 操作提示与上面的交互实现一一对应；改交互时必须同步改这里，否则用户会被误导。
  const hintElement = createHtmlElement(
    "p",
    "拖动地图移动，拖角点缩放，拖圆点旋转；Shift 等比缩放。地图上滚轮或双指缩放地图，空白处滚轮缩放视图。"
  );
  hintElement.className = "i3d-note";
  sidebarElement.append(hintElement);
  /**
   * 在侧栏创建一个数字输入框，并与草稿对象的某个键双向绑定。
   *
   * 输入非法或为空时回填旧值（绝不把 NaN 写进草稿）；合法值会先夹在
   * [minValue, maxValue] 之间再落盘并回显。step 只记录在 dataset 上供外部增减按钮读取，
   * 输入框本身用 step="any"，否则浏览器会按整数取整，旋转角这类小数步进就输不进去。
   *
   * @param {string} labelText 字段标签文案。
   * @param {object} boundObject 绑定对象（这里是 draftState.map）。
   * @param {string} boundKey 绑定键名。
   * @param {number} minValue 允许的最小值。
   * @param {number} maxValue 允许的最大值。
   * @param {number} [stepValue] 步进值，仅记录到 dataset。
   * @param {HTMLElement} [fieldContainer] 字段容器，默认放进侧栏。
   * @returns {HTMLInputElement} 创建好的输入框元素。
   */
  const createNumberField = (
    labelText,
    boundObject,
    boundKey,
    minValue,
    maxValue,
    stepValue = 1,
    fieldContainer = sidebarElement
  ) => {
    const fieldLabelElement = createHtmlElement("label");
    const labelTextElement = createHtmlElement("span", labelText);
    const inputElement = createHtmlElement("input");
    Object.assign(inputElement, {
      type: "number",
      min: minValue,
      max: maxValue,
      step: "any",
      value: boundObject[boundKey]
    });
    // 步进值只存进 dataset 供外部按钮读取；输入框本身用 any，避免被浏览器取整。
    inputElement.dataset.numberStep = String(stepValue);
    inputElement.setAttribute("aria-label", labelText);
    inputElement.addEventListener("change", () => {
      const inputValue = Number(inputElement.value);
      // 空串或非数字一律回填旧值，宁可「没改」也不能把 NaN 传染给草稿。
      if (!Number.isFinite(inputValue) || inputElement.value.trim() === "") {
        inputElement.value = boundObject[boundKey];
        return;
      }
      // 先夹取再回显：即使用户手输越界值，落到草稿里的也一定是合法值。
      boundObject[boundKey] = Math.max(minValue, Math.min(maxValue, inputValue));
      inputElement.value = boundObject[boundKey];
      renderEditor();
    });
    fieldLabelElement.append(labelTextElement, inputElement);
    fieldContainer.append(fieldLabelElement);
    return inputElement;
  };
  // 属性字段表：面板展示顺序即这里的数组顺序；每项为 [标签、绑定键、最小值、最大值]。
  const fieldsByProperty = new Map();
  // 旋转用 0.5° 步进便于微调，其余字段用 1；创建后按属性名登记，renderEditor 依此回写。
  for (const [fieldLabel, propertyKey, minValueLimit, maxValueLimit] of [
    ["位置 X", "x", -1000000, 1000000],
    ["位置 Y", "y", -1000000, 1000000],
    ["宽度", "width", 0.01, 1000000],
    ["高度", "depth", 0.01, 1000000],
    ["旋转角度", "rotation", -360, 360],
    ["地图显示强度（%）", "opacity", 0, 100]
  ]) {
    fieldsByProperty.set(
      propertyKey,
      createNumberField(
        fieldLabel,
        draftState.map,
        propertyKey,
        minValueLimit,
        maxValueLimit,
        propertyKey === "rotation" ? 0.5 : 1
      )
    );
  }
  // 「显示地图」开关：只改草稿里的 visible，实际显隐由 renderEditor 落实到 DOM。
  const visibilityToggleLabelElement = createHtmlElement("label");
  const visibilityToggleElement = createHtmlElement("input");
  visibilityToggleLabelElement.className = "i3d-setting-toggle";
  visibilityToggleElement.type = "checkbox";
  visibilityToggleElement.checked = draftState.map.visible;
  visibilityToggleElement.setAttribute("aria-label", "显示地图");
  visibilityToggleElement.addEventListener("change", () => {
    draftState.map.visible = visibilityToggleElement.checked;
    renderEditor();
  });
  visibilityToggleLabelElement.append(
    createHtmlElement("span", "显示地图"),
    visibilityToggleElement
  );
  sidebarElement.append(visibilityToggleLabelElement);
  // 「显示家具参照」只影响本弹窗的辅助图层：不进草稿、不参与保存。
  const furnitureToggleLabelElement = createHtmlElement("label");
  const furnitureToggleElement = createHtmlElement("input");
  furnitureToggleLabelElement.className = "i3d-setting-toggle";
  furnitureToggleElement.type = "checkbox";
  furnitureToggleElement.checked = true;
  furnitureToggleElement.setAttribute("aria-label", "显示家具参照");
  furnitureToggleElement.addEventListener("change", () => {
    furnitureLayerElement.style.display = furnitureToggleElement.checked ? "" : "none";
  });
  furnitureToggleLabelElement.append(
    createHtmlElement("span", "显示家具参照"),
    furnitureToggleElement
  );
  sidebarElement.append(furnitureToggleLabelElement);
  // 重置回默认摆位；同时把「显示地图」勾选状态一起复位，保持 UI 与草稿一致。
  sidebarElement.append(
    createButton("重置地图位置", () => {
      Object.assign(draftState.map, defaultMapConfig);
      visibilityToggleElement.checked = true;
      renderEditor();
    })
  );
  // 没选地图实体时给一句提示：此时对齐没有意义，但仍可继续放置房间快捷按钮。
  const mapNoteElement = createHtmlElement(
    "p",
    draftState.map.entityId ? "" : "尚未选择地图；仍可放置房间快捷按钮。"
  );
  mapNoteElement.className = "i3d-note";
  // 底图加载失败只提示、不清空已保存的位置，用户依然可以保存对齐结果。
  mapImageElement.addEventListener("error", () => {
    mapNoteElement.textContent = "地图暂时无法载入，请检查地图实体；已保存的位置会保留。";
  });
  // 有实体才设置 href：否则 <image> 会去请求空地址并触发一次无意义的 error。
  if (draftState.map.entityId) {
    mapImageElement.setAttribute("href", mapSource(draftState.map.entityId));
  }
  sidebarElement.append(mapNoteElement);
  // 上次字号换算所用的 unitsPerPixel；用来跳过「缩放没变」时的标签重算。
  let lastLabelScale = null;
  /**
   * 把草稿状态同步到整个弹窗 DOM（唯一的渲染入口）。
   *
   * 所有交互最终都会调用它：输入框回写、底图 image 几何、手柄重建、标签字号。
   *
   * @returns {void} 无返回值。
   */
  function renderEditor() {
    const currentMap = draftState.map;
    // unitsPerPixel：屏幕上 1 个 CSS 像素对应多少 SVG 用户单位（即多少米）。
    // 手柄半径、标签字号都拿它反算，这样缩放视图时手柄的视觉大小保持不变。
    const unitsPerPixel = 1 / Math.max(0.001, svgElement.getScreenCTM()?.a || 1);
    for (const [fieldPropertyKey, fieldInputElement] of fieldsByProperty) {
      // 正在编辑的输入框不回写：否则用户打字打到一半就会被草稿值覆盖，光标也会跳。
      if (documentRef.activeElement !== fieldInputElement) {
        // 保留两位小数，避免浮点误差显示成 12.000000000000002 这种噪声。
        fieldInputElement.value = Number(currentMap[fieldPropertyKey].toFixed(2));
      }
    }
    // 只有缩放系数变化才需要重算标签：拖动地图、平移视图都不影响字号。
    if (unitsPerPixel !== lastLabelScale) {
      lastLabelScale = unitsPerPixel;
      for (const { label: labelElement, item: labelItem } of furnitureLabels) {
        labelElement.setAttribute(
          "font-size",
          // 字号取「11 个屏幕像素」与「家具宽度的 85% 平摊到每个字」中的较小者，
          // 保证长名字也不会溢出家具轮廓。
          Math.min(
            unitsPerPixel * 11,
            (labelItem.width * 0.85) / Math.max(1, [...labelItem.name].length)
          )
        );
        // 家具在屏幕上的短边不足 25 像素时直接隐藏标签，否则会糊成一团。
        labelElement.style.display =
          Math.min(labelItem.width, labelItem.depth) / unitsPerPixel < 25 ? "none" : "";
      }
    }
    // 底图几何：以中心点 (x, y) 换算成 image 的左上角，再叠加绕中心的 rotate，
    // 与 3D 侧 mapCorners 的几何定义完全一致。
    for (const [imageAttributeName, imageAttributeValue] of Object.entries({
      x: currentMap.x - currentMap.width / 2,
      y: currentMap.y - currentMap.depth / 2,
      width: currentMap.width,
      height: currentMap.depth,
      opacity: currentMap.opacity / 100,
      transform: "rotate(" + currentMap.rotation + " " + currentMap.x + " " + currentMap.y + ")"
    })) {
      mapImageElement.setAttribute(imageAttributeName, imageAttributeValue);
    }
    mapImageElement.style.display = currentMap.visible === false ? "none" : "";
    // 手柄层整体重建：一共只有 4 个角点 + 1 个旋转点，重建比增量更新更简单也更不易出错。
    handlesLayerElement.replaceChildren();
    const mapCornerPoints = mapCorners(currentMap);
    // 多边形负责承接「拖动地图」的指针事件：填充透明但仍可命中，因此能当拖拽面用。
    handlesLayerElement.append(
      createSvgElement("polygon", {
        points: mapCornerPoints.map(cornerPoint => cornerPoint.x + "," + cornerPoint.y).join(" "),
        fill: "transparent",
        stroke: "#73b3ff",
        "stroke-width": 1.5,
        "vector-effect": "non-scaling-stroke",
        "data-drag": "map"
      })
    );
    mapCornerPoints.forEach((draggedCorner, cornerIndex) =>
      handlesLayerElement.append(
        createSvgElement("circle", {
          cx: draggedCorner.x,
          cy: draggedCorner.y,
          // 半径 = 8 个屏幕像素换算成用户单位；角点索引写进 data-drag 供拖动逻辑解析。
          r: unitsPerPixel * 8,
          fill: "#73b3ff",
          "data-drag": "corner:" + cornerIndex
        })
      )
    );
    // 旋转手柄悬在地图上边中点外侧；距离随户型尺寸缩放，避免大图上手柄离地图太远。
    const rotationRad = (currentMap.rotation * Math.PI) / 180;
    const rotateHandleDistance = currentMap.depth / 2 + Math.max(boundsWidth, boundsDepth) * 0.055;
    handlesLayerElement.append(
      createSvgElement("circle", {
        // 由地图中心沿「旋转后的上方向」外推：sin/cos 取负号即屏幕坐标下的上方向。
        cx: currentMap.x + Math.sin(rotationRad) * rotateHandleDistance,
        cy: currentMap.y - Math.cos(rotationRad) * rotateHandleDistance,
        r: unitsPerPixel * 10,
        fill: "#b8e77b",
        "data-drag": "rotate"
      })
    );
  }
  /**
   * 把指针事件的屏幕坐标换算成 SVG 用户坐标（即平面米）。
   *
   * 用 getScreenCTM().inverse() 反变换，自动吃掉 viewBox 平移缩放与元素自身的旋转，
   * 所以调用方拿到的点可以直接参与地图几何运算。
   *
   * @param {PointerEvent} pointerEvent 指针事件。
   * @returns {DOMPoint} SVG 用户坐标系下的点。
   */
  const toSvgPoint = pointerEvent => {
    const svgPoint = svgElement.createSVGPoint();
    svgPoint.x = pointerEvent.clientX;
    svgPoint.y = pointerEvent.clientY;
    return svgPoint.matrixTransform(svgElement.getScreenCTM().inverse());
  };
  // 多指支持：pointerId → 最新屏幕坐标；当同时按下两指时进入捏合缩放，并放弃拖动。
  const pointersById = new Map();
  let pinchState = null;
  svgElement.addEventListener("pointerdown", downEvent => {
    pointersById.set(downEvent.pointerId, {
      x: downEvent.clientX,
      y: downEvent.clientY
    });
    // 第二个指头落下即切换成捏合模式，同时把拖动状态清掉，避免两套手势互相打架。
    if (pointersById.size === 2) {
      downEvent.preventDefault();
      const [pinchPointerA, pinchPointerB] = [...pointersById.values()];
      pinchState = {
        // 记录初始指距（下限 1 防止除零）与初始地图尺寸；
        // 后续捏合都以「初始值 × 比例」计算，避免逐帧累乘带来的误差与抖动。
        distance: Math.max(
          1,
          Math.hypot(pinchPointerA.x - pinchPointerB.x, pinchPointerA.y - pinchPointerB.y)
        ),
        width: draftState.map.width,
        depth: draftState.map.depth
      };
      dragState = null;
      svgElement.setPointerCapture(downEvent.pointerId);
      return;
    }
    // data-drag 决定拖动语义：map / corner:<角点序号> / rotate，未命中则退化为平移视图。
    const dragKind = downEvent.target.closest("[data-drag]")?.getAttribute("data-drag");
    // 只响应左键：其他按键（如右键菜单）不进入拖动。
    if (downEvent.button === 0) {
      downEvent.preventDefault();
      // 起始快照：拖动全程都以「起始值 + 总位移」计算（绝对量），不做增量累加。
      dragState = {
        // data-drag 未命中时退化为平移视图（点空白处拖动即移动视野）。
        kind: dragKind || "pan",
        start: toSvgPoint(downEvent),
        viewBox: {
          ...viewBox
        },
        clientX: downEvent.clientX,
        clientY: downEvent.clientY,
        map: {
          ...draftState.map
        }
      };
      // 捕获指针：手指/鼠标移出 SVG 边界后仍能继续收到 move 事件，拖动不会中途断掉。
      svgElement.setPointerCapture(downEvent.pointerId);
    }
  });
  svgElement.addEventListener("pointermove", moveEvent => {
    // 无论当前是拖动还是捏合，都先把该指针的最新屏幕位置记下来。
    if (pointersById.has(moveEvent.pointerId)) {
      pointersById.set(moveEvent.pointerId, {
        x: moveEvent.clientX,
        y: moveEvent.clientY
      });
    }
    // 捏合优先于拖动：两指都在时只处理缩放底图，忽略单指拖动语义。
    if (pinchState && pointersById.size === 2) {
      const [activePointerA, activePointerB] = [...pointersById.values()];
      const pinchScale = Math.max(
        0.01 / Math.min(pinchState.width, pinchState.depth),
        Math.min(
          1000000 / Math.max(pinchState.width, pinchState.depth),
          Math.hypot(activePointerA.x - activePointerB.x, activePointerA.y - activePointerB.y) /
            pinchState.distance
        )
      );
      draftState.map.width = pinchState.width * pinchScale;
      draftState.map.depth = pinchState.depth * pinchScale;
      renderEditor();
      return;
    }
    if (!dragState) {
      return;
    }
    const pointerPoint = toSvgPoint(moveEvent);
    const dragDeltaX = pointerPoint.x - dragState.start.x;
    const dragDeltaY = pointerPoint.y - dragState.start.y;
    const dragMap = draftState.map;
    const dragStartMap = dragState.map;
    if (dragState.kind === "pan") {
      // 平移视图：屏幕位移要除以当前缩放系数才能换算成用户单位，否则缩小时会越拖越慢。
      const screenScale = svgElement.getScreenCTM().a;
      viewBox = {
        ...dragState.viewBox,
        x: dragState.viewBox.x - (moveEvent.clientX - dragState.clientX) / screenScale,
        y: dragState.viewBox.y - (moveEvent.clientY - dragState.clientY) / screenScale
      };
      applyViewBox();
      return;
    }
    if (dragState.kind === "map") {
      // 拖动地图：直接叠加位移，不做任何吸附，保持所见即所得。
      dragMap.x = dragStartMap.x + dragDeltaX;
      dragMap.y = dragStartMap.y + dragDeltaY;
    } else if (dragState.kind === "rotate") {
      // 旋转角：以地图中心为极点取 atan2，参数顺序让「上方向」对应 0°，顺时针为正。
      dragMap.rotation =
        (Math.atan2(pointerPoint.x - dragStartMap.x, dragStartMap.y - pointerPoint.y) * 180) /
        Math.PI;
    } else {
      // 角点缩放：角点序号编码在 kind 里（corner:0..3），符号对决定该角点朝哪个方向增长。
      const cornerHandleIndex = Number(dragState.kind.split(":")[1]);
      const cornerSigns = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1]
      ][cornerHandleIndex];
      // 起始朝向的三角函数值在整段拖动里保持不变：缩放只在「地图本地坐标轴」上进行。
      const dragRotationRad = (dragStartMap.rotation * Math.PI) / 180;
      const cosRotation = Math.cos(dragRotationRad);
      const sinRotation = Math.sin(dragRotationRad);
      // 把屏幕位移投影到地图自身的两条轴上（乘旋转矩阵），再按角点符号决定增减；
      // 下限 0.01 防止拖成 0 或负数。
      let nextWidth = Math.max(
        0.01,
        dragStartMap.width + (dragDeltaX * cosRotation + dragDeltaY * sinRotation) * cornerSigns[0]
      );
      let nextDepth = Math.max(
        0.01,
        dragStartMap.depth + (-dragDeltaX * sinRotation + dragDeltaY * cosRotation) * cornerSigns[1]
      );
      // 按住 Shift 等比缩放：取两轴比例中的较大者，保证两轴同步且不会出现负尺寸。
      if (moveEvent.shiftKey) {
        const uniformScale = Math.max(
          nextWidth / dragStartMap.width,
          nextDepth / dragStartMap.depth
        );
        nextWidth = dragStartMap.width * uniformScale;
        nextDepth = dragStartMap.depth * uniformScale;
      }
      dragMap.width = nextWidth;
      dragMap.depth = nextDepth;
      // 缩放时保持「对角点不动」：中心点要按旋转后的方向补偿半个宽高变化量。
      dragMap.x =
        dragStartMap.x +
        ((nextWidth - dragStartMap.width) * cornerSigns[0] * cosRotation -
          (nextDepth - dragStartMap.depth) * cornerSigns[1] * sinRotation) /
          2;
      dragMap.y =
        dragStartMap.y +
        ((nextWidth - dragStartMap.width) * cornerSigns[0] * sinRotation +
          (nextDepth - dragStartMap.depth) * cornerSigns[1] * cosRotation) /
          2;
    }
    renderEditor();
  });
  // 抬起与取消都要复位指针状态；否则残留的 pointerId 会把下一次单指拖动误判成捏合。
  for (const releaseEventName of ["pointerup", "pointercancel"]) {
    svgElement.addEventListener(releaseEventName, releaseEvent => {
      pointersById.delete(releaseEvent.pointerId);
      pinchState = null;
      dragState = null;
    });
  }
  // 面板尺寸变化会改变 getScreenCTM()，必须重绘才能让手柄与标签维持视觉大小。
  const resizeObserver = new ResizeObserver(() => {
    if (!isClosed) {
      renderEditor();
    }
  });
  bodyElement.append(planElement, sidebarElement);
  dialogElement.append(headerElement, bodyElement);
  documentRef.body.append(dialogElement);
  // Esc 触发 cancel：这里接管并走统一的关闭流程，保证观察器与节点都被清理。
  dialogElement.addEventListener("cancel", cancelEvent => {
    cancelEvent.preventDefault();
    closeEditor();
  });
  dialogElement.showModal();
  // 初始点击「显示全部」：首次打开就把户型与地图一起框进视野，避免用户看到空白。
  viewToolsElement.lastElementChild.click();
  resizeObserver.observe(svgElement);
  return {
    close: closeEditor
  };
}
