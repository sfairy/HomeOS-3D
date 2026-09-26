/**
 * 空调控制面板（3D 详情弹窗 / 配置预览共用）。
 *
 * 把 climateState 归一化后的状态渲染成一张控制卡（开关、设定温度、运行模式、风速、摆风），
 * 用户操作交给 onControl 发送。对外提供 createClimatePanel。面板不直接访问后端，所有命令
 * 通过 onControl(command) 发出，命令结构由 climate-state.js 统一构造。
 *
 * 同一张面板也服务空气净化器（HA 的 fan 域）：预设模式并入「运行模式」组、风速（滑杆或
 * 离散档位）、方向、摆动这几组只在对应 supported_features 位为真时渲染，命令一律走
 * purifierControl（domain=fan），与空调的 climate 命令分开构造。
 */
import {
  climateState,
  climateControl,
  climatePowerControl,
  climateModeLabel,
  climateSwingModeLabel,
  createClimateModeHistory,
  purifierControl
} from "./climate-state.js?v=2609262312";
// DOM 工厂（元素 / 按钮 / replaceChildren 兜底）的唯一实现；运行侧不能写裸 `/static/...` 的
// 静态 import，故经 static-helpers 桥取用。
import { createDomFactory } from "../core/static-helpers.js?v=2609262312";
// 「附加功能」卡片网格：与通用设备弹窗（device/device-panel.js）共用同一份渲染器。
// 净化器与那 5 类通用设备只是宿主面板不同，卡片的行为（开关 / 选项 / 数值 / 按钮 / 状态显示）
// 必须只有一份实现，否则同一张卡在两处会长出两种交互。
import { createPurifierExtras } from "./purifier-extras.js?v=2609262312";
/**
 * HA 的 fan_mode 取值 → 中文文案。
 * 各厂商写法不一（medium/middle 都是中风），故常见写法都列上；未收录的原样显示。
 */
const FAN_MODE_LABELS = {
  auto: "自动",
  low: "低风",
  medium: "中风",
  high: "高风",
  middle: "中风",
  quiet: "静音",
  silent: "静音",
  turbo: "强劲",
  diffuse: "柔风",
  focus: "集中"
};
/**
 * 净化器 preset_mode 取值 → 中文文案。与 2D 能力详情面板（panel-renderer/device-controls/
 * capability.js）同一张表，避免同一台净化器在 2D 与 3D 里显示成两个名字；未收录的原样显示。
 */
const PURIFIER_PRESET_LABELS = {
  auto: "自动",
  sleep: "睡眠",
  favorite: "最爱",
  favorite_level: "最爱",
  none: "标准",
  normal: "标准",
  manual: "手动",
  low: "低",
  medium: "中",
  middle: "中",
  high: "高",
  strong: "强劲",
  turbo: "强劲",
  silent: "静音",
  quiet: "静音"
};
/**
 * 分组标题前的小图标。
 *
 * 面板里原本是四五组清一色的文字按钮，扫一眼分不出哪组是哪组；给每组配一个几何符号，
 * 视觉上先把「组」分出来。刻意用几何字符而不是 emoji / 图标字体：
 *   · emoji 在 Windows / Android 上会被彩色字体接管，跟面板的描边风格不搭；
 *   · 图标字体要额外引资源，而这个符号集在系统字体里覆盖率足够。
 * 用 CSS `content: attr(data-glyph)` 渲染，所以它不进无障碍树 —— 分组名本身已经是 h4。
 */
const GROUP_GLYPHS = {
  运行模式: "◉",
  风速: "≈",
  摆风: "↕",
  摆动: "↻",
  方向: "⇄"
};
/**
 * 风速档位按钮占几列。
 *
 * 档位名是成组的（7 档 = 自动 / 微风 / 超低 / 低风 / 中风 / 高风 / 超高），排成一列换行时
 * 交给 flex / grid 的 auto-fit 会自动「按最小宽度尽量多塞」，7 档就成了「第一行 6 个、
 * 第二行孤零零 1 个」，而且那一个还会被 flex 拉满整行宽 —— 看着像破版。所以列数显式算：
 *
 *   · 上限 6 列：面板内容区固定 320px，两字档位名 + 内边距算下来一行最多塞 6 个；
 *   · 下限 ceil(档数 / 2)：保证不会退化成「一列 N 行」这种极端排法；
 *   · 在区间里挑「末行填充率最高」的列数（末行越满越不像破版），同分取列数大的（行更少、面板更矮）。
 *
 * 3 / 4 / 5 / 6 档与改动前完全一致（都是一行铺满），只有 7 档及以上才真正改变排布。
 */
function speedLevelColumnCount(levelCount) {
  const maxColumns = Math.min(levelCount, 6);
  const minColumns = Math.max(1, Math.ceil(levelCount / 2));
  let bestColumns = maxColumns;
  let bestFill = -1;
  for (let columns = maxColumns; columns >= minColumns; columns--) {
    const lastRowCount = levelCount % columns === 0 ? columns : levelCount % columns;
    const fill = lastRowCount / columns;
    if (fill > bestFill) {
      bestFill = fill;
      bestColumns = columns;
    }
  }
  return bestColumns;
}
/**
 * 创建空调面板。
 */
export function createClimatePanel({
  element: hostElement,
  onControl: onControl = async () => {},
  // 卡片网格排序 / 改尺寸后的布局回传（净化器才有卡片）。与 onControl 一样由舞台注入：
  // 舞台判断当前是不是编辑态、该把这份布局写到哪个绑定上，面板本身不碰配置。
  onLayout: onLayout = () => {},
  modeHistory: modeHistory = createClimateModeHistory()
} = {}) {
  // 刻意用宿主的 ownerDocument：面板被放进别的文档（弹窗、预览 iframe）时才不会造出属于外部
  // 文档的孤儿节点。工厂实现见 /static/shared/dom-factory.js。净化器滑杆的聚焦判断也要用它。
  const ownerDocument = hostElement?.ownerDocument || globalThis.document;
  const { el: createElement, replaceChildren } = createDomFactory(ownerDocument);
  const rootElement = hostElement || createElement("section", "");
  rootElement.classList.add("i3d-climate-panel");
  const headingElement = createElement("div", "i3d-climate-heading");
  const titleElement = createElement("h3", "", "空调");
  const statusElement = createElement("p", "", "尚未绑定设备");
  const powerButton = createElement("button", "i3d-climate-power");
  powerButton.type = "button";
  const headingTextElement = createElement("div", "i3d-climate-heading-text");
  headingTextElement.append(titleElement, statusElement);
  // 标题行保持原版两件套（文字 + 电源）。设备图形不放这里 —— 见下文的说明。
  headingElement.append(headingTextElement, powerButton);
  // 设备图形：结构照 2D 弹窗那两个组件，一比一移植：
  //   · 净化器 = .i3d-climate-purifier（对应 2D 的 .hb-air-purifier-visual）
  //     —— 落地光晕 + 出风弧 + 金属机身 + 顶部格栅 + 蜂窝出风口 + 显示屏；
  //   · 空调   = .i3d-climate-aircon（对应 2D 的 .hb-climate-visual）
  //     —— 挂壁机身 + 品牌字 + 温度数码 + 下沿导风格栅 + 下方气流。
  // 子部件名与 2D 一一对应（aura / airflow / body / top / vent / display / brand），
  // 改样式时能直接对着 renderer.css 找。
  //
  // 单独占一行、居中，**不塞进标题行**。塞进标题行的几版都否掉了：只有几十像素时
  // 既认不出设备，还把标题行撑得忽高忽低、动线断掉。现在它是面板里最大的一块视觉主体，
  // 标题行回到原版布局（文字 + 电源两件套，不用再特判间距与行高）。
  //
  // 尺寸按 2D 的 0.72 倍整体缩放（2D：机身 326×84 / 350×76），比例全部保留，
  // 所以看上去仍是同一台机器，只是比贴进标题行那版大得多。
  //
  // 纯粹是插画：aria-hidden，且不吃指针事件。面板里已经有明确可聚焦的电源与风速控件，
  // 图形再挂一套点击＝给同一个动作开第二条没有标签的路径。2D 里机器本身就是电源键，
  // 那是因为它没有别的电源控件（见 air-purifier.js 里 purifierPowerButton 的用法）。
  const purifierElement = createElement("div", "i3d-climate-purifier");
  purifierElement.setAttribute("aria-hidden", "true");
  const purifierAuraElement = createElement("i", "i3d-climate-purifier-aura");
  const purifierAirflowElement = createElement("span", "i3d-climate-purifier-airflow");
  for (let airflowIndex = 0; airflowIndex < 4; airflowIndex += 1) {
    purifierAirflowElement.append(createElement("i", ""));
  }
  const purifierBodyElement = createElement("span", "i3d-climate-purifier-body");
  const purifierTopElement = createElement("i", "i3d-climate-purifier-top");
  const purifierVentElement = createElement("i", "i3d-climate-purifier-vent");
  const purifierDisplayElement = createElement("span", "i3d-climate-purifier-display");
  const purifierDisplayTextElement = createElement("strong", "", "OFF");
  purifierDisplayElement.append(purifierDisplayTextElement);
  purifierBodyElement.append(purifierTopElement, purifierVentElement, purifierDisplayElement);
  purifierElement.append(purifierAuraElement, purifierAirflowElement, purifierBodyElement);
  const airconElement = createElement("div", "i3d-climate-aircon");
  airconElement.setAttribute("aria-hidden", "true");
  const airconUnitElement = createElement("span", "i3d-climate-aircon-unit");
  const airconBrandElement = createElement("span", "i3d-climate-aircon-brand", "SMART AIR");
  const airconDisplayElement = createElement("strong", "i3d-climate-aircon-display", "OFF");
  const airconVentElement = createElement("span", "i3d-climate-aircon-vent");
  for (let louverIndex = 0; louverIndex < 5; louverIndex += 1) {
    airconVentElement.append(createElement("i", ""));
  }
  airconUnitElement.append(airconBrandElement, airconDisplayElement, airconVentElement);
  const airconAirflowElement = createElement("span", "i3d-climate-aircon-airflow");
  for (let airconAirflowIndex = 0; airconAirflowIndex < 3; airconAirflowIndex += 1) {
    airconAirflowElement.append(createElement("i", ""));
  }
  airconElement.append(airconUnitElement, airconAirflowElement);
  // 温度控温区独立成 slot：设备不支持调温时整块隐藏，不用逐个控件隐藏。
  const thermostatSlotElement = createElement("div", "i3d-climate-thermostat-slot");
  const thermostatElement = createElement("section", "hb-climate-thermostat");
  const decreaseButton = createElement("button", "hb-climate-temperature-step", "−");
  const increaseButton = createElement("button", "hb-climate-temperature-step", "+");
  decreaseButton.type = increaseButton.type = "button";
  decreaseButton.setAttribute("aria-label", "降低设定温度");
  increaseButton.setAttribute("aria-label", "提高设定温度");
  const temperatureContentElement = createElement("div", "i3d-climate-temperature-content");
  const targetOutputElement = createElement("output", "i3d-climate-target");
  const currentTemperatureElement = createElement("span", "", "当前温度 --");
  // 表盘：环形进度 + 中心读数，同时它就是「设定温度」这个滑块本体。
  // 读数区整体 aria-hidden —— 里面的 <output> 对应 role=status，如果留给读屏会跟表盘的
  // aria-valuenow 重复播报两遍；语义统一由表盘这层的 aria-valuenow / aria-valuetext 承担，
  // 当前温度也顺带并进 valuetext（见 syncTemperature），信息不丢。
  const dialElement = createElement("div", "i3d-climate-dial");
  dialElement.setAttribute("role", "slider");
  dialElement.tabIndex = 0;
  dialElement.setAttribute("aria-label", "设定温度");
  temperatureContentElement.setAttribute("aria-hidden", "true");
  temperatureContentElement.append(
    createElement("small", "", "设定温度"),
    targetOutputElement,
    currentTemperatureElement
  );
  dialElement.append(temperatureContentElement);
  // −/+ 保留：拖动是「粗调」，键盘与读屏用户靠这两个按钮和方向键做「细调」，
  // 而且拖动手势本身没有可聚焦的等价物，去掉它们等于删掉一条完整的操作路径。
  thermostatElement.append(decreaseButton, dialElement, increaseButton);
  thermostatSlotElement.append(thermostatElement);
  const rangeHintElement = createElement("p", "i3d-climate-temperature-interval");
  const groupsElement = createElement("div", "i3d-climate-groups");
  // 附加功能卡片网格：与通用设备弹窗同属一套 `i3d-extra-*` 契约，所以同样挂
  // `i3d-climate-groups`（沿用列间距等排版变量）+ `i3d-extra-grid`（真正的 6 列网格，见
  // climate-panel.css）。刻意独立于 groupsElement：后者会被 buildChoiceGroups 整块
  // replaceChildren，卡片混在里面会随每次能力变化被推倒重建，输入焦点与下拉都会丢。
  const extraGridElement = createElement("div", "i3d-climate-groups i3d-extra-grid");
  // 先藏起来：构造时还没有任何绑定，首帧 update() 之前这块网格不该占位。
  // 之后每一次 update() 都由 extras.update() 按「是否净化器 + 是否配了卡片」重新决定。
  extraGridElement.hidden = true;
  const emptyElement = createElement("p", "i3d-climate-empty");
  const errorElement = createElement("p", "i3d-climate-error");
  // role=status：占位说明与错误提示变化时由读屏软件播报。
  emptyElement.setAttribute("role", "status");
  errorElement.setAttribute("role", "status");
  replaceChildren(
    rootElement,
    headingElement,
    purifierElement,
    airconElement,
    thermostatSlotElement,
    rangeHintElement,
    groupsElement,
    extraGridElement,
    emptyElement,
    errorElement
  );
  // 卡片渲染器只创建一次：createPurifierExtras.update() 自己按「设备 / 布局 / 编辑态」签名
  // 决定要不要重建 DOM，若换成每次 update 重建实例，正在输入的数值框与展开的下拉会被
  // 反复销毁，用户打一半的数字或刚点开的选项都会丢。
  //
  // onControl 追加 `deviceKind: "purifier-extra"`：extraCommand 虽然已经带了这个标记，但
  // 这里显式再写一遍是与 device-panel.js 同一份契约（通用设备是 `device-extra`），后端
  // /control 靠它分流到净化器附加实体的校验分支，不能省。
  const extras = createPurifierExtras({
    element: extraGridElement,
    // 布局回传直接转交给舞台：拖拽 / 改尺寸只在编辑预览态可用（见下面传来的 editing），
    // 所以这条链路只会在编辑器里跑，落到哪个绑定的 extraControls 由舞台决定。
    onLayout,
    onControl: extraControl => onControl({ ...extraControl, deviceKind: "purifier-extra" })
  });
  let viewModel = {};
  // 用一个空实体先跑一遍归一化，得到「全部字段都存在」的初始状态，
  // 这样 render 里可以放心地直接读 deviceState.xxx 而不必到处判空。
  let deviceState = climateState("", null);
  let isDisposed = false;
  let isSending = false;
  let errorMessage = "";
  // 每次绑定的实体变化就自增，用来丢弃属于上一个实体的异步回包。
  let instanceId = 0;
  // 本地乐观温度：用户按下 +/- 后立刻显示，等 HA 回传对齐后再丢弃。
  let draftTemperature = null;
  let temperatureTimeoutId = null;
  // 本地乐观风速：拖动净化器风速滑杆后立刻显示，等 HA 回传对齐后再丢弃（与温度草稿同一套机制）。
  let draftPercentage = null;
  let percentageTimeoutId = null;
  // 净化器控件的节点引用；每次重建选项组时重新赋值，当前面板不是净化器时为 null。
  // 风速组没有独立的 h4 —— 标题本身兼作状态读数（「风速 40%」「风速 · 中档」），与上游
  // 0.6.5 同版式，因此这里留的是标题节点的引用，渲染时按档位情况改写它的文案。
  let purifierSpeedTitle = null;
  // 风速读数（「中风 · 57%」）。刻意与标题分开：标题是固定的小标签，读数才是会变的那部分，
  // 两者字号 / 颜色不同（标题压成 h4 口径，读数用高亮 chip），挤在一个节点里就没法分别排版。
  let purifierSpeedValue = null;
  // 档位刻度条：滑杆下方的等分刻度，标记「每个档位落在滑轨的哪个位置」。纯装饰（aria-hidden），
  // 它的信息已经由档位按钮和 aria-valuetext 表达；加它是为了让滑杆一眼看出「有档」，而不是
  // 一根没有量程概念的进度条。
  let purifierSpeedTicksElement = null;
  let purifierSpeedInput = null;
  let purifierSpeedLevelsElement = null;
  // 档位按钮与它对应的档位数据：与 choiceButtons 分开维护 —— 档位的「选中」是
  // 「上报百分比落在这一档 ±1 之内」的区间判定，不是 choiceButtons 那种精确相等。
  let purifierSpeedLevelButtons = [];
  let purifierOscillateButton = null;
  // 选项组的结构签名，避免每次 render 都重建 DOM。
  let renderedGroupsSignature = "";
  let choiceButtons = [];
  /** 当前是否允许下发命令：未销毁、非编辑预览、非忙碌、并已拿到可用状态。 */
  const canControl = () =>
    !isDisposed && !viewModel.editing && !viewModel.busy && !isSending && deviceState.available;
  /** 取消本地温度草稿（含定时器）；不发命令，只清状态。 */
  const clearTemperatureDraft = () => {
    if (temperatureTimeoutId !== null) {
      clearTimeout(temperatureTimeoutId);
    }
    temperatureTimeoutId = null;
    draftTemperature = null;
  };
  /** 当前应显示的温度：优先本地草稿，其次设备上报值。 */
  function resolveTemperature() {
    return draftTemperature ?? deviceState.temperature;
  }
  /** 取消本地风速草稿（含定时器）；不发命令，只清状态。 */
  const clearPercentageDraft = () => {
    if (percentageTimeoutId !== null) {
      clearTimeout(percentageTimeoutId);
    }
    percentageTimeoutId = null;
    draftPercentage = null;
  };
  /** 当前应显示的风速百分比：优先本地草稿，其次设备上报值。 */
  function resolvePercentage() {
    return draftPercentage ?? deviceState.percentage;
  }
  /**
   * 当前风速落在第几档（-1 表示没落在任何一档）。
   *
   * ±1 是上游口径 —— 档位百分比是「均分后向下取整」的结果（3 档 → 33 / 66 / 100），
   * 而 HA 上真实的档位值是 33.33 / 66.67 这种小数，设备回传时还可能再抹一次零头，
   * 留 1 个百分点吸收这两处误差（倍率越高越贴，10 档时相邻档只差 10，绝不会串档）。
   * 抽成函数是因为档位按钮高亮、读数 chip、设备图形显示屏三处都要这份判定，
   * 散着写迟早会出现「按钮亮了、显示屏没亮」。
   */
  function activeSpeedLevelIndex(percentage) {
    if (!deviceState.on || percentage === null || percentage <= 0) {
      return -1;
    }
    return deviceState.speedLevels.findIndex(
      speedLevel => Math.abs(speedLevel.percentage - percentage) <= 1
    );
  }
  /**
   * 刷新温度区的显示与按钮可用性。
   */
  function syncTemperature(temperature = resolveTemperature()) {
    // output 同时写 value 与 textContent：前者给表单语义，后者保证老浏览器也显示文本。
    targetOutputElement.value = temperature === null ? "" : String(temperature);
    targetOutputElement.textContent = temperature === null ? "--" : temperature + "°C";
    currentTemperatureElement.textContent =
      deviceState.currentTemperature === null
        ? "当前温度 --"
        : "当前温度 " + deviceState.currentTemperature + "°C";
    // 到达上下限就禁用对应按钮，避免用户点了才被告知越界。
    decreaseButton.disabled =
      !canControl() || temperature === null || temperature <= deviceState.minimum;
    increaseButton.disabled =
      !canControl() || temperature === null || temperature >= deviceState.maximum;
    if (!deviceState.temperatureSupported) {
      return;
    }
    // 环形进度：设定值落在 [min, max] 的哪个位置。temperatureSupported 已保证 maximum > minimum，
    // 所以这里不必防除零。
    const range = deviceState.maximum - deviceState.minimum;
    const dialFraction =
      temperature === null
        ? 0
        : Math.min(1, Math.max(0, (temperature - deviceState.minimum) / range));
    dialElement.style.setProperty("--i3d-dial-progress", String(dialFraction));
    dialElement.setAttribute("aria-valuemin", String(deviceState.minimum));
    dialElement.setAttribute("aria-valuemax", String(deviceState.maximum));
    // 设定温度未知时按 ARIA 的「不确定滑块」处理：省略 aria-valuenow 才是正确表达，
    // 拿下限去顶替会让读屏报出一个设备其实没上报过的温度。
    if (temperature === null) {
      dialElement.removeAttribute("aria-valuenow");
    } else {
      dialElement.setAttribute("aria-valuenow", String(temperature));
    }
    // 中心读数是 aria-hidden 的，所以当前温度要并进 valuetext —— 否则隐藏读数的同时
    // 也把「当前室温」这条信息一起藏掉了。
    dialElement.setAttribute(
      "aria-valuetext",
      (temperature === null ? "尚未上报设定温度" : "设定 " + temperature + " 摄氏度") +
        (deviceState.currentTemperature === null
          ? ""
          : "，当前 " + deviceState.currentTemperature + " 摄氏度")
    );
    // 预览 / 不可控时表盘仍要能显示读数，只是不再响应拖动，故用 aria-disabled 而不是 disabled
    // —— 后者会让 role=slider 的元素从无障碍树里失去「可调节」语义，读屏就不再念它的值。
    dialElement.setAttribute("aria-disabled", String(!canControl()));
  }
  /**
   * 发送一条命令并维护发送中的界面状态。
   */
  async function sendControl(command) {
    if (!canControl()) {
      return;
    }
    const instanceAtSend = instanceId;
    isSending = true;
    errorMessage = "";
    if (command.service === "set_temperature") {
      // 调温做本地乐观：先清掉旧草稿，把新值直接标上，8 秒内没等到 HA 对齐就放弃。
      clearTemperatureDraft();
      draftTemperature = command.data.temperature;
      temperatureTimeoutId = setTimeout(() => {
        temperatureTimeoutId = null;
        draftTemperature = null;
        if (!isDisposed) {
          render();
        }
      }, 8000);
    } else if (command.service === "set_percentage") {
      // 调风速同理：乐观显示新百分比，8 秒内没等到 HA 对齐就退回设备上报值。
      clearPercentageDraft();
      draftPercentage = command.data.percentage;
      percentageTimeoutId = setTimeout(() => {
        percentageTimeoutId = null;
        draftPercentage = null;
        if (!isDisposed) {
          render();
        }
      }, 8000);
    }
    render();
    try {
      await onControl(command);
    } catch (error) {
      // 实体已经换人或面板已销毁时，这个错误不再展示（属于过期回包）。
      if (!isDisposed && instanceAtSend === instanceId) {
        errorMessage = error?.message || "空调控制失败，请重试。";
        clearTemperatureDraft();
      }
    } finally {
      if (!isDisposed && instanceAtSend === instanceId) {
        isSending = false;
        render();
      }
    }
  }
  /**
   * 先本地校验再发送控制命令；不可控时返回 undefined。
   */
  function requestControl(requestedService, value) {
    if (canControl()) {
      try {
        return sendControl(climateControl(deviceState, requestedService, value));
      } catch (controlError) {
        // climateControl 会在设备不支持该项时抛错，这里转成界面提示而不是弹出异常。
        errorMessage = controlError.message;
        render();
      }
    }
  }
  /**
   * 先本地校验再发送净化器控制命令；不可控时返回 undefined。
   * 与 requestControl 同形，只是命令交给 purifierControl（domain=fan）构造。
   */
  function requestPurifierControl(requestedService, value) {
    if (canControl()) {
      try {
        return sendControl(purifierControl(deviceState, requestedService, value));
      } catch (controlError) {
        errorMessage = controlError.message;
        render();
      }
    }
  }
  /**
   * 切换开关机。
   */
  function togglePower({ toggle: toggle = true } = {}) {
    // toggle=false 且设备已开时不重复下发，避免把「开机」按钮当成无操作。
    if (!canControl() || (!toggle && deviceState.on)) {
      return Promise.resolve(false);
    }
    if (deviceState.purifier) {
      // fan 域的开关机是无参数服务，没有「恢复上次模式」一说，直接按当前开关态反向下发。
      try {
        return sendControl(
          purifierControl(deviceState, deviceState.on ? "turn_off" : "turn_on")
        );
      } catch (powerError) {
        errorMessage = powerError.message;
        render();
        return Promise.resolve(false);
      }
    }
    try {
      return sendControl(
        // 开机时从模式历史里取「上次用的模式」交给命令构造器；
        // 面板不再自己维护这个状态，历史来源统一在 climate-state 里。
        climatePowerControl(
          deviceState,
          toggle ? !deviceState.on : true,
          modeHistory.get(deviceState.entityId)
        )
      );
    } catch (powerError) {
      errorMessage = powerError.message;
      render();
      return Promise.resolve(false);
    }
  }
  powerButton.addEventListener("click", () => togglePower());
  // 步进按设备声明的 step：没有读数时从下限起步，保证第一次点击落在合法区间内。
  decreaseButton.addEventListener("click", () =>
    requestControl(
      "set_temperature",
      (resolveTemperature() ?? deviceState.minimum) - deviceState.step
    )
  );
  increaseButton.addEventListener("click", () =>
    requestControl(
      "set_temperature",
      (resolveTemperature() ?? deviceState.minimum) + deviceState.step
    )
  );
  /**
   * 把任意温度夹进 [min, max] 并按 step 对齐到刻度。
   *
   * 对齐要按「第几格」来算而不是直接除：step 常见 0.5 / 0.1，浮点累积会给出
   * 26.000000000000004 这种值，发给 HA 既不合法也没必要。先按格数取整，再按 step 的
   * 小数位数收敛尾数（0.5 / 0.1 → 1 位，1 → 0 位）。
   */
  function snapTemperature(value) {
    const step = deviceState.step > 0 ? deviceState.step : 1;
    const stepped = deviceState.minimum + Math.round((value - deviceState.minimum) / step) * step;
    const clamped = Math.min(deviceState.maximum, Math.max(deviceState.minimum, stepped));
    return Number(clamped.toFixed((String(step).split(".")[1] || "").length));
  }
  /**
   * 由指针位置换出温度：把指针相对表盘圆心的方位角映射到 270° 的弧形量程上。
   *
   * 表盘正下方留了 90° 缺口（见 climate-panel.css 的 conic-gradient from 225deg），
   * 指针扫进缺口时不能按角度线性外推 —— 那会让数值在缺口两端来回跳。缺口里统一夹到
   * 最近的一个端点：过了弧中点（315°）就算到量程顶，否则算到底。
   */
  function temperatureFromPointer(event) {
    // 没有布局信息（离屏 / 假 DOM）时直接放弃：算不出圆心就没法算角度。
    const rect = dialElement.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) {
      return null;
    }
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    if (!dx && !dy) {
      return null;
    }
    // atan2 给的是「以右为 0、顺时针为正」，换算成「以正上方为 0、顺时针为正」的钟表角。
    const clockAngle = (((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360 + 360) % 360;
    let sweep = clockAngle - 225;
    if (sweep < 0) {
      sweep += 360;
    }
    if (sweep > 270) {
      sweep = sweep < 315 ? 270 : 0;
    }
    const range = deviceState.maximum - deviceState.minimum;
    return snapTemperature(deviceState.minimum + (sweep / 270) * range);
  }
  // 拖动期间只改本地显示、不发命令；松手才下发一条 set_temperature —— 与风速滑杆同一套节奏，
  // 否则绕表盘半圈会打出几十条 MQTT。
  let isDialDragging = false;
  dialElement.addEventListener("pointerdown", event => {
    if (!canControl()) {
      return;
    }
    // 捕获指针：手指拖出表盘范围后仍能收到 move / up，否则拖到边缘就断在半路。
    dialElement.setPointerCapture?.(event.pointerId);
    isDialDragging = true;
    const temperature = temperatureFromPointer(event);
    if (temperature !== null) {
      draftTemperature = temperature;
      syncTemperature(temperature);
    }
  });
  dialElement.addEventListener("pointermove", event => {
    if (!isDialDragging) {
      return;
    }
    const temperature = temperatureFromPointer(event);
    if (temperature !== null) {
      draftTemperature = temperature;
      syncTemperature(temperature);
    }
  });
  const endDialDrag = event => {
    if (!isDialDragging) {
      return;
    }
    isDialDragging = false;
    dialElement.releasePointerCapture?.(event.pointerId);
    const temperature = resolveTemperature();
    if (temperature === null || temperature === deviceState.temperature) {
      // 拖了一圈又回到原值：只清草稿，别白发一条命令。
      clearTemperatureDraft();
      render();
      return;
    }
    requestControl("set_temperature", temperature);
  };
  dialElement.addEventListener("pointerup", endDialDrag);
  // pointercancel（手势被系统接管、来电、切到别的应用）与 pointerup 语义不同：用户并没有
  // 表达「就这个值」，所以这里丢弃草稿、退回设备上报值，而不是把它当成一次确认提交。
  dialElement.addEventListener("pointercancel", event => {
    if (!isDialDragging) {
      return;
    }
    isDialDragging = false;
    dialElement.releasePointerCapture?.(event.pointerId);
    clearTemperatureDraft();
    render();
  });
  // 键盘等价操作：role=slider 必须能用方向键调节，否则读屏 / 纯键盘用户完全够不着温控。
  dialElement.addEventListener("keydown", event => {
    // 拖动中忽略键盘：两套输入同时在改写同一个草稿，谁后到谁说话，结果不可预期。
    if (isDialDragging) {
      return;
    }
    const base = resolveTemperature() ?? deviceState.minimum;
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      requestControl(
        "set_temperature",
        event.key === "Home" ? deviceState.minimum : deviceState.maximum
      );
      return;
    }
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? -1
          : 0;
    if (!direction) {
      return;
    }
    event.preventDefault();
    requestControl("set_temperature", snapTemperature(base + direction * deviceState.step));
  });
  /** 按设备能力重建「运行模式 / 风速 / 摆风 / 方向」几组选项按钮。 */
  function buildChoiceGroups() {
    replaceChildren(groupsElement);
    choiceButtons = [];
    // 净化器的这几组命令属于 fan 域，必须交给 purifierControl 构造（domain=fan）；
    // 空调的走 climate 域。两边服务名不通用，混了会把命令发到错误的域。
    const requestGroupControl = deviceState.purifier ? requestPurifierControl : requestControl;
    // 净化器的预设模式：上游把「能力位门槛」直接折进列表（位没置位就是空数组），本仓把门槛
    // 单独记在 presetModeSupported 上，这里按同一口径折算一次，供「运行模式」组取用。
    const purifierPresetModes = deviceState.presetModeSupported ? deviceState.presetModes : [];
    // 每行依次是：分组标题、可选值、状态对象上的字段名、要调用的服务、取值 → 文案映射。
    // 净化器（fan 域）复用同一张表：它的「运行模式」组装的其实是 preset_modes，字段 / 服务 /
    // 文案整套换成 fan 域那套 —— 与上游 0.6.5 一致，不另起一个「模式预设」组。
    for (const [groupLabel, optionValues, field, service, optionLabels] of [
      [
        "运行模式",
        // 模式组里排除 off：关机由面板右上角的开关按钮负责，避免两种入口语义重叠。
        deviceState.purifier
          ? purifierPresetModes
          : deviceState.modes.filter(mode => mode !== "off"),
        deviceState.purifier ? "presetMode" : "mode",
        deviceState.purifier ? "set_preset_mode" : "set_hvac_mode",
        // 净化器的预设名各厂商写法不一（大小写、前后空白），查表前先归一；未收录的原样显示。
        Object.fromEntries(
          (deviceState.purifier ? purifierPresetModes : deviceState.modes).map(modeValue => [
            modeValue,
            deviceState.purifier
              ? PURIFIER_PRESET_LABELS[String(modeValue).trim().toLowerCase()] || modeValue
              : climateModeLabel(modeValue)
          ])
        )
      ],
      ["风速", deviceState.fanModes, "fanMode", "set_fan_mode", FAN_MODE_LABELS],
      [
        "摆风",
        deviceState.swingModes,
        "swingMode",
        "set_swing_mode",
        Object.fromEntries(
          deviceState.swingModes.map(swingMode => [swingMode, climateSwingModeLabel(swingMode)])
        )
      ],
      // 方向（前后吹）只有净化器有：HA 的取值固定 forward / reverse，文案沿用 HA 中文翻译。
      [
        "方向",
        deviceState.purifier && deviceState.directionSupported ? ["forward", "reverse"] : [],
        "direction",
        "set_direction",
        { forward: "正向", reverse: "反向" }
      ]
    ]) {
      // 设备没提供该项能力就不渲染整组。
      if (!optionValues.length) {
        continue;
      }
      const groupElement = createElement("section", "i3d-climate-option-group");
      const groupHeadingElement = createElement("h4", "", groupLabel);
      if (GROUP_GLYPHS[groupLabel]) {
        groupHeadingElement.dataset.glyph = GROUP_GLYPHS[groupLabel];
      }
      groupElement.append(groupHeadingElement);
      const choicesElement = createElement("div", "i3d-climate-choices");
      // 用 group + aria-label 让读屏软件播报分组名，而不是只读出一串按钮。
      choicesElement.setAttribute("role", "group");
      choicesElement.setAttribute("aria-label", groupLabel);
      for (const optionValue of optionValues) {
        const choiceButton = createElement(
          "button",
          "i3d-climate-choice",
          optionLabels[optionValue] || optionValue
        );
        choiceButton.type = "button";
        choiceButton.addEventListener("click", () => requestGroupControl(service, optionValue));
        choiceButtons.push({
          element: choiceButton,
          field: field,
          value: optionValue
        });
        choicesElement.append(choiceButton);
      }
      groupElement.append(choicesElement);
      groupsElement.append(groupElement);
    }
    // ===== 净化器（fan 域）控件 =====
    // 只在对应 supported_features 位为真时渲染：后端拿同一张表复核（purifier.py 的 docstring
    // 写明「前端可以骗人，HA 不会」），所以设备不具备的能力应整组隐藏，而不是渲染出来再禁用。
    // 预设模式与方向两组已并入上面的通用循环（净化器走 fan 域那套字段 / 服务），这里只剩
    // 摆动开关与风速两组。
    if (deviceState.purifier) {
      // 摆动：单个开关式按钮，不成组 —— 结构照抄上游 0.6.5（section 下直接挂一个按钮，
      // 不再套 i3d-climate-choices），按下态用 aria-pressed 表达。
      if (deviceState.oscillatingSupported) {
        const oscillateGroupElement = createElement("section", "i3d-climate-option-group");
        oscillateGroupElement.append(createElement("h4", "", "摆动"));
        purifierOscillateButton = createElement(
          "button",
          "i3d-climate-choice",
          deviceState.oscillating ? "已开启" : "已关闭"
        );
        purifierOscillateButton.type = "button";
        purifierOscillateButton.addEventListener("click", () =>
          requestPurifierControl("oscillate", !deviceState.oscillating)
        );
        oscillateGroupElement.append(purifierOscillateButton);
        groupsElement.append(oscillateGroupElement);
      }
      // 风速：滑杆与离散档位**同时**显示 —— 档位按钮是「一步到位」的快捷选择，滑杆负责连续微调，
      // 两者读写同一个 percentage，拖动滑杆时档位高亮跟着走（上游 0.6.5 让两者互斥：步长能整除
      // 时只剩一排文字按钮，档位之间的值调不到；这里按产品要求放开为并存）。
      // 档位表见 climate-state.js 的 purifierSpeedLevels。
      if (deviceState.percentageSupported) {
        const speedGroupElement = createElement(
          "section",
          "i3d-climate-option-group i3d-climate-speed"
        );
        // 标题固定为「风速」，不再兼职读数：读数挪到右侧的高亮 chip（purifierSpeedValue），
        // 标题就能与旁边几组的 h4 保持同一字号层级 —— 否则又会回到上一个改动里
        // 「读数比分组标题还显眼」的老问题。
        purifierSpeedTitle = createElement("span", "i3d-climate-speed-title", "风速");
        // 这组刻意不挂 data-glyph：CSS 会给它画一片会转的扇叶（设备开着就转），
        // 比静态几何符号更贴「风速」这件事，所以不走上面那套通用分组图标。
        purifierSpeedValue = createElement("span", "i3d-climate-speed-value", "--");
        purifierSpeedInput = createElement("input", "i3d-climate-speed-range");
        purifierSpeedInput.type = "range";
        purifierSpeedInput.min = "0";
        purifierSpeedInput.max = "100";
        purifierSpeedInput.step = String(deviceState.percentageStep);
        purifierSpeedInput.setAttribute("aria-label", "净化器风速");
        // 拖动过程中只改读数、不发命令，松手（change）才下发：否则每挪一格就是一条 MQTT。
        purifierSpeedInput.addEventListener("input", () => {
          if (!purifierSpeedValue) {
            return;
          }
          const draggedPercentage = Number(purifierSpeedInput.value);
          // 读数按 render() 的口径取整：滑杆 step 是 HA 的原始小数（7 档 = 14.2857…），
          // 直接拼 value 会显示成 14.285714285714286%。
          purifierSpeedValue.textContent = Math.round(draggedPercentage) + "%";
          // 档位高亮同步跟手：档位与百分比是同一份状态的两种写法，拖动时亮错档比不亮更误导。
          // 复用 render() 的 activeSpeedLevelIndex（±1 容差）而不是本地精确相等 —— 档位百分比
          // 是「均分后向下取整」的整数（3 档 = 33 / 66 / 100），滑杆值却是 33.33 / 66.67 这样的
          // 小数，用 === 会让 3 / 7 档净化器在拖动时一档都亮不起来。
          // 这里改的就是 aria-pressed 本身，不另造 .is-active 类 —— 面板的选中态一律只认
          // aria-pressed（见 climate-panel.css 的约定），两套写法迟早会漂移。
          const activeIndex = activeSpeedLevelIndex(draggedPercentage);
          for (const [levelIndex, level] of purifierSpeedLevelButtons.entries()) {
            level.element.setAttribute("aria-pressed", String(levelIndex === activeIndex));
          }
        });
        purifierSpeedInput.addEventListener("change", () =>
          requestPurifierControl("set_percentage", Number(purifierSpeedInput.value))
        );
        // 档位按钮直接挂在这层 .i3d-climate-choices 上（沿用选项组的按钮外观，不额外造样式）；
        // 它与滑杆是兄弟节点。排布另给一个 .i3d-climate-speed-levels 覆盖成等宽网格，
        // 列数见 speedLevelColumnCount。
        purifierSpeedLevelsElement = createElement(
          "div",
          "i3d-climate-choices i3d-climate-speed-levels"
        );
        purifierSpeedLevelsElement.setAttribute("role", "group");
        purifierSpeedLevelsElement.setAttribute("aria-label", "净化器风速档位");
        purifierSpeedLevelsElement.style.gridTemplateColumns = `repeat(${speedLevelColumnCount(
          deviceState.speedLevels.length
        )}, minmax(0, 1fr))`;
        // 刻度条：按档位百分比绝对定位。容器左右各内缩「半个滑块宽」，这样 left: <百分比>%
        // 落点与原生滑杆的滑块中心一致（滑块圆心只能在 [半宽, 100% - 半宽] 之间移动），
        // 否则档位越高偏得越多。那个内缩量写死在 climate-panel.css 的 .i3d-climate-speed-ticks
        // 上（8px，对应原生滑块的半径）—— 改滑杆尺寸时要一并改它。
        purifierSpeedTicksElement = createElement("div", "i3d-climate-speed-ticks");
        purifierSpeedTicksElement.setAttribute("aria-hidden", "true");
        for (const speedLevel of deviceState.speedLevels) {
          const tickElement = createElement("span", "i3d-climate-speed-tick");
          tickElement.style.left = speedLevel.percentage + "%";
          purifierSpeedTicksElement.append(tickElement);
        }
        // 档位按钮一次成型：档位表只随 percentageStep / percentageSupported 变，两者都在
        // 结构签名里，变了就整组重建，这里不需要再做增量 diff。
        purifierSpeedLevelButtons = deviceState.speedLevels.map(speedLevel => {
          const levelButton = createElement("button", "i3d-climate-choice", speedLevel.label);
          levelButton.type = "button";
          // 这一档在色阶上的位置（0–1），整排按钮据此各自上色连成一条色阶。
          // 取该档自身的百分比，而不是「第几档 / 总档数」—— 后者与面板强调色（由百分比算出）
          // 对不上，会出现「点亮的是这一档、颜色却是旁边那一档」的错位。
          levelButton.style.setProperty("--i3d-level", String(speedLevel.percentage / 100));
          levelButton.addEventListener("click", () =>
            requestPurifierControl("set_percentage", speedLevel.percentage)
          );
          purifierSpeedLevelsElement.append(levelButton);
          return { element: levelButton, label: speedLevel.label, percentage: speedLevel.percentage };
        });
        speedGroupElement.append(
          purifierSpeedTitle,
          purifierSpeedValue,
          purifierSpeedInput,
          purifierSpeedTicksElement,
          purifierSpeedLevelsElement
        );
        groupsElement.append(speedGroupElement);
      }
    }
  }
  /** 按当前 viewModel 与 deviceState 重绘整块面板。 */
  function render() {
    if (isDisposed) {
      return;
    }
    const item = viewModel.item || {};
    const hasEntity = !!item.entityId;
    const isControllable = canControl();
    titleElement.textContent =
      item.label || deviceState.name || (deviceState.purifier ? "空气净化器" : "空调");
    titleElement.title = titleElement.textContent;
    // 状态文案的优先级：编辑预览 > 未绑定 > 不可用 > 开关态（空调显示模式名，净化器只说开 / 关）。
    statusElement.textContent = viewModel.editing
      ? "控制预览"
      : hasEntity
        ? deviceState.available
          ? deviceState.on
            ? deviceState.purifier
              ? "已开启"
              : climateModeLabel(deviceState.mode)
            : "已关闭"
          : "设备不可用"
        : "尚未绑定设备";
    // data-climate-mode 是 CSS 动画与配色的钩子（冷 / 热 / 净化 / 其它 / 关）。
    rootElement.dataset.climateMode = deviceState.available ? deviceState.visualMode : "off";
    // 净化器的强调色随风速渐变（见 climate-panel.css 的 [data-climate-mode="purify"]）。
    // 写入的是**当前应显示**的风速而不是设备上报值：拖动滑杆时要即时变色，否则调完档
    // 颜色还是旧的，看着像没生效。其它设备写 0，让它们不必关心中间那支变量。
    if (deviceState.purifier) {
      const levelPercentage = deviceState.percentageSupported ? resolvePercentage() : null;
      rootElement.style.setProperty(
        "--i3d-purifier-level",
        String(Math.min(1, Math.max(0, (levelPercentage ?? 0) / 100)))
      );
    } else {
      rootElement.style.removeProperty("--i3d-purifier-level");
    }
    // 设备图形：两台机型里显示了当前设备那一台（结构与比例不同，所以各建一棵，见上文）。
    // 开机的表现各自照 2D 那台来 —— 净化器转出风弧、点亮光晕、显示屏报档位；
    // 空调点亮导风格栅与数码屏、格里翻出来吹。
    purifierElement.hidden = !deviceState.purifier;
    airconElement.hidden = deviceState.purifier;
    if (deviceState.purifier) {
      const isDeviceUsable = deviceState.available && deviceState.on;
      purifierElement.classList.toggle("is-on", isDeviceUsable);
      purifierElement.classList.toggle("is-unavailable", !deviceState.available);
      // 显示屏优先报档位名（两字，正是实体机显示屏的尺寸）；没有档位表时退到百分比。
      // 都拿不到才显示 ON —— 与前两处的读数规则同源，不另立一套。
      const graphicPercentage = deviceState.percentageSupported ? resolvePercentage() : null;
      const graphicLevelIndex = activeSpeedLevelIndex(graphicPercentage);
      purifierDisplayTextElement.textContent = !isDeviceUsable
        ? "OFF"
        : graphicLevelIndex >= 0
          ? deviceState.speedLevels[graphicLevelIndex].label
          : graphicPercentage !== null
            ? graphicPercentage + "%"
            : "ON";
    } else {
      // 空调机上那台挂壁机：与 2D 同一套三态 —— 开机报目标温度（没有读数才退到模式名），
      // 关机 / 不可用报 OFF。温度优先是照搬 2D 的取法：实体机的数码屏就是用来显示温度的，
      // 模式靠遥控器面板上的图标看。
      const isAirconUsable = deviceState.available && deviceState.on;
      // is-running 与 is-on 分开：开机但 hvac_action 是 idle（压缩机没转）时格子不该翻出来吹。
      airconElement.classList.toggle("is-on", isAirconUsable);
      airconElement.classList.toggle(
        "is-running",
        isAirconUsable && deviceState.running
      );
      airconElement.classList.toggle("is-unavailable", !deviceState.available);
      const hasTemperatureReading =
        deviceState.temperatureSupported && deviceState.temperature !== null;
      airconDisplayElement.textContent = !isAirconUsable
        ? "OFF"
        : hasTemperatureReading
          ? deviceState.temperature + "°"
          : climateModeLabel(deviceState.mode);
    }
    // is-preview：编辑预览态。上游同口径 —— 预览里控件一律禁用（不发设备指令），
    // 但要用这条类把禁用态的降透明度压回去，看起来仍是一张正常的面板。
    rootElement.classList.toggle("is-preview", !!viewModel.editing);
    rootElement.classList.toggle("is-on", deviceState.available && deviceState.on);
    // is-running 与 is-on 不同：开机但处于待机（hvac_action 为 idle）时不应animate。
    rootElement.classList.toggle("is-running", deviceState.available && deviceState.running);
    // 电源按钮做成图标按钮：头部已经有设备名 + 状态两行文字，再来一个「关闭 / 开启」文字块
    // 只会让最上面更吵。图标由 climate-panel.css 用伪元素画（不依赖字体），这里清空文本，
    // 可读性交给 aria-label / title。
    powerButton.textContent = "";
    rootElement.setAttribute("aria-busy", String(isSending || !!viewModel.busy));
    // 开关按钮的禁用条件：不可控、设备既没有 turn_on 能力也没有可用模式（除 off 外），
    // 或设备已开却没有 off 模式（无法关机）。净化器走 fan 域的 turn_on / turn_off，
    // 后端不设任何能力位门槛，故只受「是否可控」约束，不能套用上面那套模式列表判断。
    powerButton.disabled =
      !isControllable ||
      (!deviceState.purifier &&
        ((!deviceState.turnOnSupported &&
          !deviceState.modes.some(modeId => modeId !== "off")) ||
          (deviceState.on && !deviceState.modes.includes("off"))));
    powerButton.setAttribute("aria-pressed", String(deviceState.on));
    // 文案里的「空调」是历史遗留的硬编码：净化器也走这条分支，读屏时会念成「空气净化器 1，关闭空调」。
    // 这里改成按设备状态取标签，读屏与悬停提示才对得上。
    powerButton.setAttribute(
      "aria-label",
      (titleElement.textContent || "设备") + "，" + (deviceState.on ? "关闭" : "开启")
    );
    powerButton.title = deviceState.on ? "关闭" : "开启";
    thermostatSlotElement.hidden = dialElement.hidden = !deviceState.temperatureSupported;
    syncTemperature();
    // 温区提示只在「支持温区但不支持单点调温」时出现，否则会与控温区重复。
    rangeHintElement.hidden = !deviceState.rangeSupported || deviceState.temperatureSupported;
    rangeHintElement.textContent =
      "设定温区 " +
      (deviceState.targetLow ?? "--") +
      "–" +
      (deviceState.targetHigh ?? "--") +
      "°C · 当前 " +
      (deviceState.currentTemperature ?? "--") +
      "°C";
    // 选项组只在实体或能力列表变化时重建；其余情况复用按钮、只改按下态。
    // 净化器的能力位 / 列表也在签名里：变了就要重建那几组控件；只变当前值（percentage /
    // oscillating / direction）不重建，交给下面的按下态与滑杆同步去改。
    const groupsSignature = JSON.stringify([
      deviceState.entityId,
      deviceState.modes,
      deviceState.fanModes,
      deviceState.swingModes,
      deviceState.purifier,
      deviceState.percentageSupported,
      deviceState.percentageStep,
      deviceState.oscillatingSupported,
      deviceState.directionSupported,
      deviceState.presetModeSupported,
      deviceState.presetModes
    ]);
    if (renderedGroupsSignature !== groupsSignature) {
      renderedGroupsSignature = groupsSignature;
      // 重建会丢掉旧的净化器节点引用，先清空再建，避免指向已移除的节点。
      purifierSpeedTitle = null;
      purifierSpeedValue = null;
      purifierSpeedTicksElement = null;
      purifierSpeedInput = null;
      purifierSpeedLevelsElement = null;
      purifierSpeedLevelButtons = [];
      purifierOscillateButton = null;
      buildChoiceGroups();
    }
    for (const choice of choiceButtons) {
      choice.element.disabled = !isControllable;
      choice.element.setAttribute(
        "aria-pressed",
        String(deviceState[choice.field] === choice.value)
      );
    }
    // 净化器控件：摆动的文案与按下态、风速滑杆 / 档位按钮的取值与可用性。
    if (purifierOscillateButton) {
      purifierOscillateButton.textContent = deviceState.oscillating ? "已开启" : "已关闭";
      purifierOscillateButton.setAttribute("aria-pressed", String(deviceState.oscillating));
      purifierOscillateButton.disabled = !isControllable;
    }
    if (purifierSpeedInput) {
      const displayedPercentage = resolvePercentage();
      purifierSpeedInput.disabled = !isControllable;
      // 正在拖动 / 聚焦的滑杆不要被状态回包拉回去，否则指针下的滑块会被「弹一下」。
      if (ownerDocument.activeElement !== purifierSpeedInput) {
        purifierSpeedInput.value = String(displayedPercentage ?? 0);
      }
      // 档位命中：开着且百分比为正时，落在哪一档的 ±1 之内就点亮那一档（口径见
      // activeSpeedLevelIndex）。
      const activeLevelIndex = activeSpeedLevelIndex(displayedPercentage);
      // 读数 chip：有档位时优先报档位名 + 百分比（档位名负责「感知」、百分比负责「精度」，
      // 两者一起给才不至于像纯文字按钮那样只有名字），其次说明百分比受预设模式托管，
      // 再退到原始百分比 / 已关机；无档位时只报百分比。
      const activeLabel =
        activeLevelIndex >= 0 ? purifierSpeedLevelButtons[activeLevelIndex].label : "";
      purifierSpeedValue.textContent =
        purifierSpeedLevelButtons.length === 0
          ? (displayedPercentage ?? "--") + "%"
          : activeLevelIndex >= 0
            ? activeLabel + " · " + displayedPercentage + "%"
            : deviceState.presetMode
              ? "由模式控制"
              : deviceState.on
                ? (displayedPercentage ?? "--") + "%"
                : "已关闭";
      // 档位标签同步进滑杆的无障碍名：滑杆现在是常显控件，读屏焦点落在它身上时只说
      // 「净化器风速」会丢掉当前档位，补上档位名再配合 aria-valuetext 才念得完整。
      purifierSpeedInput.setAttribute(
        "aria-valuetext",
        activeLabel ? activeLabel + "（" + displayedPercentage + "%）" : "未定档"
      );
      // 滑杆与档位按钮并存：档位负责「一步到位」，滑杆负责连续微调与当前值的可视化位置。
      // 滑杆本身不在这里切可见性 —— 只在构造时按能力决定（有 percentageSupported 就有它），
      // 建好后一直可见，所以也没有对应的 hidden 赋值可写。档位容器则要跟着档位表空/非空走。
      purifierSpeedLevelsElement.hidden = purifierSpeedLevelButtons.length === 0;
      for (const [levelIndex, speedLevel] of purifierSpeedLevelButtons.entries()) {
        speedLevel.element.disabled = !isControllable;
        speedLevel.element.setAttribute("aria-pressed", String(levelIndex === activeLevelIndex));
      }
      // 刻度是纯装饰（aria-hidden），没有 aria 状态可用，才需要 .is-active 这类视觉类。
      purifierSpeedTicksElement.hidden = purifierSpeedLevelButtons.length === 0;
      for (let tickIndex = 0; tickIndex < purifierSpeedTicksElement.children.length; tickIndex += 1) {
        purifierSpeedTicksElement.children[tickIndex].classList.toggle(
          "is-active",
          tickIndex === activeLevelIndex
        );
      }
    }
    // 有可用状态且（能调温，或设备本身是净化器，或至少有一组可选按钮）时无需占位说明。
    // 净化器那一项判的是「是不是净化器」而不是「有没有风速滑杆」：只有摆动 / 预设模式的
    // 净化器同样已经提供了控制能力，不该再显示「尚未提供控制能力」。
    emptyElement.hidden =
      deviceState.available &&
      (deviceState.temperatureSupported ||
        deviceState.purifier ||
        choiceButtons.length > 0);
    emptyElement.textContent = hasEntity
      ? deviceState.available
        ? "设备尚未提供控制能力，状态到达后会自动更新。"
        : "正在等待设备状态，连接恢复后会自动更新。"
      : "绑定空调实体后显示设备控制。";
    errorElement.textContent = viewModel.error || errorMessage;
    errorElement.hidden = !errorElement.textContent;
  }
  /**
   * 用新的视图模型刷新面板。
   */
  function update(nextViewModel = {}) {
    if (isDisposed) {
      return;
    }
    const nextEntityId = nextViewModel.item?.entityId || "";
    // 换了实体：作废在途命令的回包（instanceId 自增）并清空与旧实体相关的本地状态。
    if (nextEntityId !== deviceState.entityId) {
      instanceId++;
      isSending = false;
      errorMessage = "";
      clearTemperatureDraft();
      clearPercentageDraft();
    }
    viewModel = nextViewModel;
    // 上游可能已经传了归一化后的状态（例如同一份数据被多个面板共享），
    // 这里用「entityId 一致 + modes 是数组」两个特征识别，避免重复归一化。
    deviceState =
      nextViewModel.state?.entityId === nextEntityId && Array.isArray(nextViewModel.state?.modes)
        ? nextViewModel.state
        : climateState(nextEntityId, nextViewModel.state);
    // 面板每见到一份真实状态就把「上次用的模式」记下来；配置预览里的占位状态不算。
    if (!nextViewModel.editing) {
      modeHistory.observe(nextEntityId, deviceState.raw);
    }
    // 设备上报值已经追上本地草稿（误差在半步以内）就丢弃草稿，
    // 用真实状态渲染，避免长时间停留在乐观值上。
    if (
      draftTemperature !== null &&
      deviceState.temperature !== null &&
      Math.abs(deviceState.temperature - draftTemperature) < deviceState.step / 2 + 0.001
    ) {
      clearTemperatureDraft();
    }
    // 风速草稿同理：设备上报值追上（半步以内）就丢弃，用真实状态渲染。
    if (
      draftPercentage !== null &&
      deviceState.percentage !== null &&
      Math.abs(deviceState.percentage - draftPercentage) < deviceState.percentageStep / 2 + 0.001
    ) {
      clearPercentageDraft();
    }
    render();
    // 附加功能卡片续在主体渲染之后刷新：只有净化器才有资格把 extraControls 交给卡片渲染器。
    // 空调绑定即使因为配置串扰或手工改过 JSON 混进了 extraControls，也必须当成空——否则
    // 一台普通空调会冒出一片本不属于它的卡片，看起来像「配置串台」。非净化器同时清空 states，
    // 避免上一台净化器的实时值残留在隐藏的卡片里。
    //
    // editing / busy 必须原样带下去（上游传的是 `editing || busy`）：卡片网格靠它判断
    // 「编辑预览态」—— 那一态才渲染拖拽 / 改尺寸手柄、才允许拖拽回传布局，同时把卡片控件
    // 全部禁用。丢了它，编辑器里的实时预览弹窗既没有手柄、卡片又能点，点一下就真的给设备
    // 下命令了，而预览本就不该发指令。
    const cardEditing = !!(nextViewModel.editing || nextViewModel.busy);
    extras.update(
      deviceState.purifier
        ? {
            item: nextViewModel.item,
            states: nextViewModel.states || {},
            editing: cardEditing
          }
        : {
            item: { ...nextViewModel.item, extraControls: [] },
            states: {},
            editing: cardEditing
          }
    );
  }
  // 释放面板：置 isDisposed 并自增 instanceId，让所有在途异步回包失效，
  // 再清掉温度 / 风速草稿与 DOM，避免面板销毁后仍被旧设备的响应改写。
  function dispose() {
    if (!isDisposed) {
      isDisposed = true;
      // 自增后所有在途回包都不再触发渲染。
      instanceId++;
      clearTemperatureDraft();
      clearPercentageDraft();
      // 先让卡片渲染器摘掉它挂在 document 上的全局监听（pointerdown / scroll / keydown）
      // 与在途定时器，再清空面板 DOM。漏掉这一步会留下一批只增不减的监听器。
      extras.dispose();
      replaceChildren(rootElement);
    }
  }
  render();
  return {
    root: rootElement,
    update: update,
    power: togglePower,
    dispose: dispose
  };
}
