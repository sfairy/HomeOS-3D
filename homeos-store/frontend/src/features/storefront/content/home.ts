/**
 * 商店首页的全部静态文案。
 *
 * 唯一真源：组件只渲染，`useHomeView` 只负责把接口数据拼进来。商品名、价格、包含
 * 哪些模块、哪些模块在售 —— 这些**一律不写在这里**，它们来自 `catalog` / `features`
 * / `site` 三个接口。这里只保留那些接口不会告诉你的东西：能力怎么分组、模块怎么
 * 讲人话、部署怎么拆步、FAQ 怎么答。
 *
 * v3 起首页按**购买决策**排序（价格 → 能力 → 模块 → 部署 → 保障），不再按功能目录
 * 排列；因此每个能力域多了一个 `summary`，供左侧索引在一行内讲完这一域。
 */

/** 语义色档位，与 `theme.css` 的 `[data-tone]` 一一对应。 */
export type Tone = "accent" | "lumen" | "aura" | "eco" | "heat" | "cool" | "sensor";

export const HERO = {
  eyebrow: "本机自托管 · 直连 Home Assistant",
  titleLead: "把整个家，收进一块",
  titleAccent: "3D 中控",
  lead:
    "户型、灯光、空调、安防与能耗都在同一块屏里完成；家庭数据只留在自己的机器上，授权一次买断。",
  /** 起价后面那串口径，首屏与收尾 CTA 共用，避免两处文案漂移。 */
  priceNote: "起 · 买断永久 · 支付确认后自动发码",
  primaryCta: "选购授权",
  secondaryCta: "部署方式",
};

export interface CapabilityCard {
  title: string;
  description: string;
  tone: Tone;
  icon: string;
  /** 需要的增量模块码；留空表示基础授权即可使用。 */
  feature?: string;
}

export interface CapabilityDomain {
  id: string;
  kicker: string;
  label: string;
  /** 左侧索引里的一行概述，20 字以内。 */
  summary: string;
  blurb: string;
  tone: Tone;
  icon: string;
  cards: CapabilityCard[];
}

/** 六个能力域。顺序即首页索引顺序：从「怎么用」到「怎么维护」。 */
export const CAPABILITY_DOMAINS: CapabilityDomain[] = [
  {
    id: "control",
    kicker: "Control",
    label: "中控与编辑",
    summary: "户型、编辑与墙屏",
    blurb: "从户型图到每一盏灯：编辑、展示、交互三层共用一套页面与登录会话。",
    tone: "accent",
    icon: "fa-cube",
    cards: [
      {
        title: "3D 户型工作室",
        description:
          "自建或导入户型，按楼层自动导图并回写仪表盘；墙体、材质与灯光属性可批量套用，房间自动归类。",
        tone: "accent",
        icon: "fa-cube",
      },
      {
        title: "可视化编辑器",
        description: "页面、控件、实体绑定、弹窗与主题全部可拖拽配置，改完即生效，不需要碰代码。",
        tone: "sensor",
        icon: "fa-table-columns",
      },
      {
        title: "全屏中控展示",
        description:
          "为墙面平板与常亮屏准备的只读展示页，与编辑器共用登录会话，登录即可使用，不再需要配对码。",
        tone: "cool",
        icon: "fa-tv",
      },
      {
        title: "3D 交互舞台",
        description:
          "把控件嵌进户型：在三维视图里直接开关灯、窗帘、空调、电视与扫地机，状态实时回流。",
        tone: "aura",
        icon: "fa-hand-pointer",
        feature: "module.3d_interaction",
      },
    ],
  },
  {
    id: "connect",
    kicker: "Connect",
    label: "连接与设备",
    summary: "实体、房间与数据",
    blurb: "已有 HA 环境直接接管：实体、房间、素材与外部数据在同一份快照里对齐。",
    tone: "lumen",
    icon: "fa-house-signal",
    cards: [
      {
        title: "Home Assistant 直连",
        description:
          "填写地址与长期令牌即可同步实体与实时状态，控制指令走同一条连接，断线可自动重连。",
        tone: "lumen",
        icon: "fa-plug",
      },
      {
        title: "设备库与健康",
        description: "设备列表、详情、属性、引用与批量操作；健康分标出久未上报与僵尸绑定，一键清理。",
        tone: "eco",
        icon: "fa-microchip",
      },
      {
        title: "房间与素材",
        description: "房间目录、区域归属与内置素材库统一管理；上传图片可直接用于控件背景与展示页。",
        tone: "cool",
        icon: "fa-images",
      },
      {
        title: "内嵌网页与影音",
        description: "把外部页面嵌入仪表盘，MoviePilot 影视库可浏览与播放控制，媒体进度回流中控。",
        tone: "heat",
        icon: "fa-photo-film",
        feature: "module.media",
      },
    ],
  },
  {
    id: "security",
    kicker: "Security",
    label: "安防与感知",
    summary: "布防、监控与门铃",
    blurb: "布防、摄像头、门铃与离家模拟共享一套分区与审计口径。",
    tone: "eco",
    icon: "fa-shield-halved",
    cards: [
      {
        title: "分区布防与紧急求助",
        description:
          "按区域独立布防撤防，面板与中控同步状态；紧急求助按钮触发后进入告警流程并留痕。",
        tone: "eco",
        icon: "fa-shield-halved",
        feature: "module.security",
      },
      {
        title: "摄像头与门铃",
        description: "摄像头实时画面与门铃事件统一代理，Frigate AI 检测结果直接进入事件流。",
        tone: "cool",
        icon: "fa-video",
        feature: "module.security",
      },
      {
        title: "离家和日历联动",
        description:
          "全员离家自动布防，回家自动撤防；离家模拟按时间段随机开关灯，制造有人居住的痕迹。",
        tone: "aura",
        icon: "fa-person-walking-arrow-right",
        feature: "module.security",
      },
      {
        title: "存在感知与演习",
        description:
          "毫米波存在检测接入为占位传感器，安全演习可定时走一遍告警链路，验证配置是否真的会响。",
        tone: "sensor",
        icon: "fa-wave-square",
        feature: "module.security",
      },
    ],
  },
  {
    id: "automation",
    kicker: "Automation",
    label: "场景与提醒",
    summary: "场景、通知与预警",
    blurb: "把「什么时候该发生什么」写清楚：场景、通知、免打扰与预警各管一段。",
    tone: "aura",
    icon: "fa-bell",
    cards: [
      {
        title: "家庭模式与动作序列",
        description: "回家 / 离家 / 就寝等模式可编排动作序列，一键切换并记录触发日志，便于回查。",
        tone: "aura",
        icon: "fa-house-signal",
        feature: "module.home_mode",
      },
      {
        title: "通知中心与渠道",
        description:
          "站内通知、邮件、WebPush 与企业微信统一投递；告警规则可按设备、区域与等级配置。",
        tone: "lumen",
        icon: "fa-bell",
        feature: "module.notifications",
      },
      {
        title: "地震预警",
        description:
          "接入 EEW 实时预警与 CENC 速报，倒计时与避险提示直接推到中控；历史事件可回看分析。",
        tone: "heat",
        icon: "fa-house-crack",
        feature: "module.earthquake",
      },
      {
        title: "语音播报与气象提醒",
        description: "TTS 把预警与通知念出来，气象预警与日历事件按重要级决定是否打断当前内容。",
        tone: "cool",
        icon: "fa-volume-high",
        feature: "module.notifications",
      },
    ],
  },
  {
    id: "energy",
    kicker: "Energy & AI",
    label: "能源与智能",
    summary: "用电、费用与语音",
    blurb: "看清用电、算清费用，再让语音与智能体把重复操作收成一句话。",
    tone: "heat",
    icon: "fa-bolt",
    cards: [
      {
        title: "能耗统计与生活账户",
        description:
          "电表读数与能源统计成图，电 / 气 / 水与运营商账户分开记账，费用视图按周期结算。",
        tone: "heat",
        icon: "fa-bolt",
        feature: "module.energy",
      },
      {
        title: "智能充放电",
        description: "按峰谷电价安排充电窗口，逆变器与电池状态进中控，异常时回落到手动模式。",
        tone: "lumen",
        icon: "fa-battery-three-quarters",
        feature: "module.energy",
      },
      {
        title: "语音助手",
        description: "语音唤醒、识别与命令映射：常用控制不必进页面，说一句就走完同一条控制链。",
        tone: "sensor",
        icon: "fa-microphone",
        feature: "module.voice",
      },
      {
        title: "AI 智能管家",
        description:
          "多轮对话理解「把客厅调暗一点」这类含糊指令，结合当前场景拆成可执行动作再下发。",
        tone: "accent",
        icon: "fa-robot",
        feature: "module.agent",
      },
    ],
  },
  {
    id: "system",
    kicker: "System",
    label: "系统与运维",
    summary: "备份、保留与诊断",
    blurb: "长期跑在家里，稳定性靠的是备份、保留策略与可查的访问记录。",
    tone: "cool",
    icon: "fa-database",
    cards: [
      {
        title: "定时与加密备份",
        description: "业务数据按计划打包备份，支持加密与异机保存；恢复前先校验包完整性。",
        tone: "cool",
        icon: "fa-database",
      },
      {
        title: "数据保留与清理",
        description: "通知、事件、日志按保留策略自动修剪，避免长期运行后库无限增长。",
        tone: "eco",
        icon: "fa-broom",
      },
      {
        title: "访问 PIN 与家庭状态",
        description: "敏感操作可用访问 PIN 二次确认，家庭状态与儿童模式决定哪些控件可见。",
        tone: "aura",
        icon: "fa-lock",
      },
      {
        title: "外部 API 与诊断",
        description: "开放外部 API 供自建脚本调用，系统面板给出设备健康、僵尸绑定与访问日志。",
        tone: "sensor",
        icon: "fa-code",
      },
    ],
  },
];

/** 增量模块的营销元数据。label / description 一律以 `/store/v1/features` 为准。 */
export interface ModuleMeta {
  code: string;
  tone: Tone;
  icon: string;
}

export const MODULE_META: Record<string, ModuleMeta> = {
  "module.3d_interaction": { code: "module.3d_interaction", tone: "accent", icon: "fa-hand-pointer" },
  "module.security": { code: "module.security", tone: "eco", icon: "fa-shield-halved" },
  "module.notifications": { code: "module.notifications", tone: "aura", icon: "fa-bell" },
  "module.earthquake": { code: "module.earthquake", tone: "heat", icon: "fa-house-crack" },
  "module.energy": { code: "module.energy", tone: "lumen", icon: "fa-bolt" },
  "module.home_mode": { code: "module.home_mode", tone: "cool", icon: "fa-house-signal" },
  "module.voice": { code: "module.voice", tone: "sensor", icon: "fa-microphone" },
  "module.agent": { code: "module.agent", tone: "accent", icon: "fa-robot" },
  "module.media": { code: "module.media", tone: "heat", icon: "fa-photo-film" },
};

/** 与主项目 3D 舞台模块页签一致：overview / light / environment / devices / vacuum / security。 */
type StageModuleId = "overview" | "light" | "environment" | "devices" | "vacuum" | "security";

interface StageControl {
  label: string;
  value: string;
}

interface StageModuleFrame {
  id: StageModuleId;
  label: string;
  tone: Tone;
  /** 在户型里点中之后，控制条说明正在操作什么。 */
  focus: string;
  controls: [StageControl, StageControl, StageControl];
}

interface StageAnchor {
  id: string;
  module: Exclude<StageModuleId, "overview">;
  label: string;
  /** 户型底图上的百分比坐标。 */
  x: number;
  y: number;
  /** 贴着底边的设备把标签放上方，避免超出户型图。 */
  labelPlacement?: "top" | "bottom";
}

/**
 * 首屏那张中控画面。对照主项目展示页的 3D 交互：同一层户型上按模块点选设备，
 * 点中后才出现控制条。这里只轮播这一组画面，不提供可点控件。
 */
export const STAGE = {
  title: "一层",
  chip: "3D 交互",
  clock: "20:41",
  modules: [
    {
      id: "overview",
      label: "3D",
      tone: "accent",
      focus: "自由视角",
      controls: [
        { label: "楼层", value: "一层" },
        { label: "视角", value: "环视" },
        { label: "操作", value: "恢复视角" },
      ],
    },
    {
      id: "light",
      label: "灯光",
      tone: "lumen",
      focus: "客厅主灯",
      controls: [
        { label: "主灯", value: "开" },
        { label: "亮度", value: "72%" },
        { label: "色温", value: "暖白" },
      ],
    },
    {
      id: "environment",
      label: "环境",
      tone: "cool",
      focus: "客厅空调",
      controls: [
        { label: "空调", value: "制冷" },
        { label: "设定", value: "22.4°" },
        { label: "窗帘", value: "半开" },
      ],
    },
    {
      id: "devices",
      label: "设备",
      tone: "heat",
      focus: "客厅电视",
      controls: [
        { label: "电视", value: "开" },
        { label: "输入", value: "HDMI" },
        { label: "音箱", value: "播放" },
      ],
    },
    {
      id: "vacuum",
      label: "扫地机",
      tone: "sensor",
      focus: "扫地机",
      controls: [
        { label: "状态", value: "清扫" },
        { label: "电量", value: "64%" },
        { label: "区域", value: "客厅" },
      ],
    },
    {
      id: "security",
      label: "安防",
      tone: "eco",
      focus: "入户门锁",
      controls: [
        { label: "门锁", value: "已锁" },
        { label: "摄像头", value: "在线" },
        { label: "布防", value: "在家" },
      ],
    },
  ] satisfies StageModuleFrame[],
  planImage: "/store-static/media/stage-plan.svg",
  /** 坐标由 tools/stage-plan.mjs 从同一份平面数据算出，改户型时重新跑一遍即可。 */
  anchors: [
    { id: "light", module: "light", label: "主灯", x: 35.7, y: 46.35 },
    { id: "climate", module: "environment", label: "空调", x: 43.92, y: 77.79 },
    { id: "screen", module: "devices", label: "电视", x: 13.09, y: 35.29, labelPlacement: "top" },
    { id: "vacuum", module: "vacuum", label: "扫地机", x: 30.78, y: 58.65 },
    { id: "lock", module: "security", label: "门锁", x: 35.74, y: 73.77, labelPlacement: "top" },
  ] satisfies StageAnchor[],
};

interface SetupStep {
  index: string;
  title: string;
  description: string;
  points: string[];
  tone: Tone;
}

/** 从授权到上墙的三步。合并了旧版的 workflow（编辑器示意）与 journey（两条路）。 */
export const SETUP: SetupStep[] = [
  {
    index: "01",
    title: "买授权",
    description: "选一档授权，支付确认后账号中心直接出激活码。",
    points: ["结算页扫码支付", "自动发码，不用等人工"],
    tone: "accent",
  },
  {
    index: "02",
    title: "起服务",
    description: "本机或 NAS 上一条 Compose 命令拉起服务，业务数据落本机。",
    points: ["Docker Compose", "SQLite 落盘"],
    tone: "lumen",
  },
  {
    index: "03",
    title: "接家上墙",
    description: "填 Home Assistant 地址与令牌，导入户型，墙屏登录同一账号即可用。",
    points: ["实体与房间自动同步", "与编辑器共用登录会话"],
    tone: "eco",
  },
];

interface AssuranceItem {
  title: string;
  description: string;
  icon: string;
  tone: Tone;
}

export const ASSURANCES: AssuranceItem[] = [
  {
    title: "数据留在本机",
    description: "家庭数据只存在你的机器上，授权校验才需要联网。",
    icon: "fa-database",
    tone: "accent",
  },
  {
    title: "支付确认即发码",
    description: "服务端确认到账后自动签发激活码，不等人工。",
    icon: "fa-bolt",
    tone: "eco",
  },
  {
    title: "设备可自助解绑",
    description: "换机在账号中心解绑，每份授权独立冷却。",
    icon: "fa-arrows-rotate",
    tone: "aura",
  },
  {
    title: "订单与授权可查",
    description: "订单、激活码、绑定设备与积分流水随时可查。",
    icon: "fa-receipt",
    tone: "lumen",
  },
];

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ: FaqEntry[] = [
  {
    question: "需要一台公网服务器吗？",
    answer:
      "不需要。HomeOS 默认跑在自己的电脑或 NAS 上，数据落在本机；授权校验是唯一需要联网的环节，客户端会定期心跳续租。",
  },
  {
    question: "已经装了 Home Assistant，还要重新配一遍吗？",
    answer:
      "不用。填入 HA 地址与长期令牌后，HomeOS 会通过 HTTP 与 WebSocket 把实体和状态同步过来，已有的自动化与设备保持原样。",
  },
  {
    question: "墙屏 / 平板还要单独配对吗？",
    answer:
      "不需要。中控展示页与编辑器共用同一登录会话，在展示设备上登录同一账号即可使用，已不再使用 6 位配对码。",
  },
  {
    question: "一台授权能绑几台设备？换设备怎么办？",
    answer:
      "每份授权对应一个激活码，按本机硬件指纹一对一绑定，设备会列在账号中心。换设备时可在线自助解绑；解绑后原设备下次心跳即转吊销，冷却期内不能重新绑定。",
  },
  {
    question: "买了基础版，之后想升级可以吗？",
    answer:
      "可以。增量包挂到已有的永久主授权上，不需要重新购买基础版，也不影响原授权的有效期。",
  },
  {
    question: "支付成功后没看到激活码？",
    answer:
      "先在账号中心的订单里确认状态：已完成的订单会直接展示激活码。若状态仍为待付款，可能是支付回调还没到，稍等刷新；超过一段时间仍未到账，请带上订单号联系客服。",
  },
  {
    question: "优惠码怎么用？",
    answer:
      "在结算页填写优惠码后点校验，折扣会立即体现在应付金额上；每个优惠码的适用范围和限用次数由运营配置，校验通过才计入订单。",
  },
  {
    question: "支持哪些支付方式？",
    answer:
      "当前支持微信支付与支付宝扫码。具体可用渠道以结算页展示为准；待支付订单可以回账号中心继续付款，不会重复下单。",
  },
];
