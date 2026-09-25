/**
 * 3D 工作室素材库的卡片清单：一张数据表 + 一次渲染。
 *
 * 为什么放在 JS 而不是 HTML：一百多张卡片的标记结构逐字相同，只有 5 个字段不同，
 * 原样写在 3d-studio.html 里就是约 560 行同构标记，占了整份文档的四分之一。
 *
 * 改动前先读这三条硬约束：
 * 1. **必须早于 studio-app.js 的 DOM 缓存**。studio-app.js 用
 *    document.querySelectorAll("[data-item-type]") 一次性抓走全部卡片再绑事件，
 *    渲染晚于那一刻，卡片就会「看得见、点不动」。
 * 2. **渲染结果必须与拆分前的 HTML 逐字一致**，缩进、属性顺序、i/span/small 的顺序
 *    都算数 —— studio.css 的 .asset-card 规则与相邻兄弟选择器都建立在这个结构上。
 *    改完请逐字比对结构与字段。
 * 3. data-item-type 是脚本查表键、data-asset-subcategory 决定分组显隐
 *    （与顶部页签的 data-asset-category 一一对应），两者都不能随手改。
 */

/**
 * 卡片字段：type 查表键 / sub 分组子类 / icon 图标字符 / name 名称 /
 * size 模型真实占地（米，与实际不符会让用户误判可摆放空间）。
 * @type {{ category: string, label: string, note: string, items: { type: string, sub: string, icon: string, name: string, size: string }[] }[]}
 */
// 转义实现只有一份，见 utils/html-escape.js 的模块头；本文件此前带着一份私有副本。
import { escapeHtml } from "../../utils/html-escape.js?v=2609251801";

export const STUDIO_ASSET_PALETTE = [
  {
    category: "home",
    label: "客厅常用",
    note: "家居页签第 1 组：沙发、茶几、电视柜等客厅常用家具。",
    items: [
      { type: "sofa", sub: "living", icon: "▰", name: "沙发", size: "2.20 × 0.90m" },
      { type: "coffeetable", sub: "living", icon: "▭", name: "组合茶几", size: "1.90 × 1.05m" },
      { type: "squarecoffeetable", sub: "living", icon: "▦", name: "方茶几", size: "1.40 × 0.70m" },
      { type: "tvstand", sub: "living", icon: "▬", name: "电视柜", size: "1.80 × 0.42m" },
      { type: "rug", sub: "living", icon: "▨", name: "地毯", size: "2.00 × 1.40m" },
      { type: "plant", sub: "living", icon: "✦", name: "绿植", size: "0.75 × 0.75m" },
      { type: "aquarium", sub: "living", icon: "▣", name: "鱼缸", size: "1.50 × 0.55m" },
      { type: "mural", sub: "living", icon: "❐", name: "壁画", size: "1.20 × 0.80m" },
      { type: "featurewall", sub: "living", icon: "❏", name: "背景墙", size: "3.00 × 2.40m" },
      { type: "piano", sub: "living", icon: "▰", name: "钢琴", size: "1.50 × 1.50m" },
      { type: "armchair", sub: "living", icon: "▮", name: "单人沙发椅", size: "0.85 × 0.80m" },
      { type: "loungechair", sub: "living", icon: "▬", name: "休闲躺椅", size: "0.70 × 1.60m" },
      { type: "ottoman", sub: "living", icon: "◾", name: "脚凳", size: "0.60 × 0.45m" },
      { type: "bench", sub: "living", icon: "▭", name: "长凳", size: "1.40 × 0.42m" },
      { type: "sidetable", sub: "living", icon: "▪", name: "边几", size: "0.45 × 0.45m" },
      { type: "console", sub: "living", icon: "▤", name: "玄关台", size: "1.20 × 0.35m" },
      { type: "chaise", sub: "living", icon: "▤", name: "贵妃榻", size: "0.75 × 1.65m" },
      { type: "nestingtable", sub: "living", icon: "▦", name: "套几", size: "0.55 × 0.55m" },
      { type: "roundcoffeetable", sub: "living", icon: "◉", name: "圆茶几", size: "0.9 × 0.9m" },
      { type: "screenspan", sub: "living", icon: "▥", name: "屏风", size: "1.6 × 0.35m" },
      { type: "coatrail", sub: "living", icon: "✚", name: "衣帽架", size: "0.45 × 0.45m" },
      { type: "stool", sub: "living", icon: "◌", name: "圆凳", size: "0.36 × 0.36m" },
    ]
  },
  {
    category: "home",
    label: "卧室与书房",
    note: "卧室与书房类家具（床、书桌、衣柜等）。",
    items: [
      { type: "bed", sub: "bedroom", icon: "▤", name: "双人床", size: "1.80 × 2.00m" },
      { type: "nightstand", sub: "bedroom", icon: "▣", name: "床头柜", size: "0.50 × 0.42m" },
      { type: "curtain", sub: "bedroom", icon: "▥", name: "窗帘", size: "1.80 × 0.18m" },
      { type: "vanity", sub: "bedroom", icon: "◫", name: "梳妆台", size: "1.20 × 0.50m" },
      { type: "desk", sub: "bedroom", icon: "▱", name: "桌子", size: "1.40 × 0.65m" },
      { type: "bookcase", sub: "bedroom", icon: "▥", name: "书架", size: "1.20 × 0.32m" },
      { type: "bunkbed", sub: "bedroom", icon: "▤", name: "上下床", size: "1.00 × 1.95m" },
      { type: "kidsbed", sub: "bedroom", icon: "▤", name: "儿童床", size: "0.95 × 1.60m" },
      { type: "daybed", sub: "bedroom", icon: "▤", name: "榻榻米床", size: "1.2 × 2m" },
      { type: "cot", sub: "bedroom", icon: "▤", name: "婴儿床", size: "0.7 × 1.35m" },
      { type: "computertable", sub: "bedroom", icon: "▤", name: "电脑桌", size: "1.2 × 0.6m" },
      { type: "officestool", sub: "bedroom", icon: "◍", name: "办公椅", size: "0.6 × 0.6m" },
      { type: "filecabinet", sub: "bedroom", icon: "▥", name: "文件柜", size: "0.8 × 0.45m" },
      { type: "booktower", sub: "bedroom", icon: "▤", name: "简易书架", size: "0.5 × 0.3m" },
    ]
  },
  {
    category: "home",
    label: "餐厅与收纳",
    note: "餐厅与收纳：餐桌椅、餐边柜、置物架等。",
    items: [
      { type: "table", sub: "dining", icon: "▦", name: "餐桌组合", size: "2.40 × 1.80m" },
      { type: "rounddiningtable", sub: "dining", icon: "◉", name: "圆形餐桌", size: "2.20 × 2.20m" },
      { type: "chair", sub: "dining", icon: "◇", name: "椅子", size: "0.50 × 0.50m" },
      { type: "bar", sub: "dining", icon: "▰", name: "吧台", size: "2.20 × 0.65m" },
      { type: "sideboard", sub: "dining", icon: "▤", name: "餐边柜", size: "1.60 × 0.45m" },
      { type: "shoecabinet", sub: "dining", icon: "▥", name: "鞋柜", size: "1.80 × 0.42m" },
      { type: "cabinet", sub: "dining", icon: "▥", name: "储物柜", size: "1.60 × 0.45m" },
      { type: "glasscabinet", sub: "dining", icon: "▧", name: "玻璃柜", size: "1.20 × 0.40m" },
      { type: "shelf", sub: "dining", icon: "▤", name: "货架", size: "1.20 × 0.45m" },
      { type: "wallcabinet", sub: "dining", icon: "▧", name: "吊柜", size: "1.50 × 0.35m" },
      { type: "barstool", sub: "dining", icon: "◍", name: "吧凳", size: "0.42 × 0.42m" },
      { type: "chestdrawer", sub: "dining", icon: "▥", name: "斗柜", size: "1.00 × 0.45m" },
      { type: "entrycabinet", sub: "dining", icon: "▦", name: "玄关柜", size: "1.00 × 0.38m" },
      { type: "displaycabinet", sub: "dining", icon: "▧", name: "展示柜", size: "0.90 × 0.40m" },
      { type: "locker", sub: "dining", icon: "▦", name: "储物柜", size: "0.9 × 0.4m" },
      { type: "laundrycabinet", sub: "dining", icon: "▥", name: "洗衣柜", size: "0.65 × 0.6m" },
      { type: "balconycabinet", sub: "dining", icon: "▥", name: "阳台柜", size: "0.8 × 0.4m" },
      { type: "winecabinet", sub: "dining", icon: "▧", name: "酒柜", size: "0.6 × 0.45m" },
      { type: "pantry", sub: "dining", icon: "▥", name: "餐边高柜", size: "0.9 × 0.42m" },
    ]
  },
  {
    category: "home",
    label: "厨房固定家具",
    note: "厨房固定家具：橱柜、灶台、水槽等随户型固定的件，通常沿墙摆放。",
    items: [
      { type: "kitchenbase", sub: "kitchen-bath", icon: "▤", name: "厨房地柜", size: "2.40 × 0.60m" },
      { type: "kitchensink", sub: "kitchen-bath", icon: "▣", name: "地柜带水盆", size: "1.20 × 0.60m" },
      { type: "kitchencooktop", sub: "kitchen-bath", icon: "▦", name: "地柜带燃气灶", size: "1.20 × 0.60m" },
      { type: "kitchenisland", sub: "kitchen-bath", icon: "▭", name: "岛台", size: "1.6 × 0.8m" },
    ]
  },
  {
    category: "home",
    label: "卫浴",
    note: "卫浴洁具：马桶、淋浴、洗手台等。",
    items: [
      { type: "basin", sub: "kitchen-bath", icon: "◉", name: "台盆", size: "0.90 × 0.50m" },
      { type: "toilet", sub: "kitchen-bath", icon: "◒", name: "马桶", size: "0.42 × 0.70m" },
      { type: "squattoilet", sub: "kitchen-bath", icon: "▱", name: "蹲便", size: "0.45 × 0.65m" },
      { type: "urinal", sub: "kitchen-bath", icon: "◖", name: "小便斗", size: "0.38 × 0.34m" },
      { type: "shower", sub: "kitchen-bath", icon: "♨", name: "花洒", size: "0.90 × 0.90m" },
      { type: "bathtub", sub: "kitchen-bath", icon: "▱", name: "浴缸", size: "1.70 × 0.78m" },
      { type: "glasspartition", sub: "kitchen-bath", icon: "▥", name: "玻璃隔断", size: "1.20 × 0.08m" },
    ]
  },
  {
    category: "home",
    label: "结构与特殊物件",
    note: "结构与特殊物件：楼梯、电梯、栏杆等非家具构件；这类件尺寸大且常跨楼层，\n                 放置后容易压到墙线，删改前先用工具面板的「楼板洞口」与墙体工具核对。",
    items: [
      { type: "stairs", sub: "structure", icon: "⇧", name: "楼梯", size: "1.00 × 2.80m" },
      { type: "steelstairs", sub: "structure", icon: "⇧", name: "钢楼梯", size: "1.86 × 2.93m" },
      { type: "glassstairs", sub: "structure", icon: "⇧", name: "玻璃楼梯", size: "2.51 × 2.84m" },
      { type: "pillar", sub: "structure", icon: "▣", name: "柱子", size: "0.45 × 0.45m" },
      { type: "smallcar", sub: "structure", icon: "◆", name: "小汽车", size: "2.19 × 5.01m" },
      { type: "elevator", sub: "structure", icon: "⇧", name: "电梯", size: "1.40 × 1.52m" },
    ]
  },
  {
    category: "appliance",
    label: "客厅与环境",
    note: "电器页签第 1 组：影音设备（电视等）+ 环境设备（出风口等）。",
    items: [
      { type: "tv", sub: "media", icon: "▭", name: "电视", size: "1.50 × 0.18m" },
      { type: "camera", sub: "media", icon: "◉", name: "摄像头", size: "0.12 × 0.12m" },
      { type: "presence", sub: "media", icon: "◌", name: "人体传感器", size: "0.065 × 0.065m" },
      { type: "wallac", sub: "environment", icon: "▬", name: "挂机空调", size: "0.90 × 0.22m" },
      { type: "floorac", sub: "environment", icon: "◉", name: "柜机空调", size: "0.42 × 0.42m" },
      { type: "airpurifier", sub: "environment", icon: "◌", name: "空气净化器", size: "0.34 × 0.34m" },
      { type: "robotvacuum", sub: "environment", icon: "◎", name: "扫地机器人", size: "0.55 × 0.50m" },
      { type: "floorlamp", sub: "environment", icon: "⌁", name: "落地灯", size: "1.35 × 0.50m" },
      { type: "walllamp", sub: "environment", icon: "◒", name: "壁灯", size: "0.30 × 0.22m" },
      { type: "airoutlet", sub: "environment", icon: "▥", name: "出风口", size: "0.19 × 2.00m" },
      { type: "soundbar", sub: "environment", icon: "▬", name: "回音壁", size: "0.95 × 0.12m" },
      { type: "speaker", sub: "environment", icon: "◉", name: "落地音箱", size: "0.28 × 0.28m" },
      { type: "projector", sub: "environment", icon: "▭", name: "投影仪", size: "0.30 × 0.24m" },
      { type: "fan", sub: "environment", icon: "✦", name: "落地风扇", size: "0.40 × 0.40m" },
      { type: "humidifier", sub: "environment", icon: "◌", name: "加湿器", size: "0.30 × 0.30m" },
      { type: "dehumidifier", sub: "environment", icon: "▯", name: "除湿机", size: "0.35 × 0.28m" },
      { type: "freshair", sub: "environment", icon: "▥", name: "新风机", size: "0.60 × 0.30m" },
      { type: "gameconsole", sub: "media", icon: "▬", name: "游戏主机", size: "0.3 × 0.24m" },
      { type: "avreceiver", sub: "media", icon: "▬", name: "功放", size: "0.44 × 0.35m" },
      { type: "screenpanel", sub: "media", icon: "▭", name: "投影幕", size: "2.2 × 0.08m" },
      { type: "ceilingfan", sub: "environment", icon: "✦", name: "吊扇", size: "1.1 × 1.1m" },
      { type: "heater", sub: "environment", icon: "▯", name: "取暖器", size: "0.6 × 0.25m" },
      { type: "ceilingac", sub: "environment", icon: "▣", name: "嵌入式空调", size: "0.9 × 0.9m" },
      { type: "vacuumcleaner", sub: "environment", icon: "▮", name: "吸尘器", size: "0.28 × 0.3m" },
      { type: "floorwasher", sub: "environment", icon: "▮", name: "洗地机", size: "0.3 × 0.3m" },
      { type: "dryingrack", sub: "environment", icon: "▬", name: "电动晾衣架", size: "1.8 × 0.35m" },
    ]
  },
  {
    category: "appliance",
    label: "厨房电器",
    note: "厨房电器：冰箱、洗碗机、电饭煲等（与上面「厨房固定家具」分开，这类是可挪动的电器）。",
    items: [
      { type: "fridge", sub: "kitchen", icon: "▯", name: "冰箱", size: "0.75 × 0.72m" },
      { type: "rangehood", sub: "kitchen", icon: "◢", name: "油烟机", size: "0.90 × 0.45m" },
      { type: "dishwasher", sub: "kitchen", icon: "▤", name: "洗碗机", size: "0.60 × 0.60m" },
      { type: "steamoven", sub: "kitchen", icon: "▣", name: "蒸烤箱", size: "0.60 × 0.55m" },
      { type: "microwave", sub: "kitchen", icon: "▭", name: "微波炉", size: "0.52 × 0.42m" },
      { type: "ricecooker", sub: "kitchen", icon: "◉", name: "电饭煲", size: "0.28 × 0.32m" },
      { type: "integratedstove", sub: "kitchen", icon: "▣", name: "集成灶", size: "0.9 × 0.6m" },
      { type: "sterilizer", sub: "kitchen", icon: "▥", name: "消毒柜", size: "0.6 × 0.5m" },
      { type: "oven", sub: "kitchen", icon: "▥", name: "嵌入式烤箱", size: "0.6 × 0.55m" },
      { type: "coffeemaker", sub: "kitchen", icon: "▯", name: "咖啡机", size: "0.28 × 0.35m" },
      { type: "kettle", sub: "kitchen", icon: "◌", name: "电水壶", size: "0.2 × 0.2m" },
      { type: "airfryer", sub: "kitchen", icon: "◫", name: "空气炸锅", size: "0.3 × 0.34m" },
      { type: "blender", sub: "kitchen", icon: "◫", name: "破壁机", size: "0.22 × 0.24m" },
    ]
  },
  {
    category: "appliance",
    label: "洗护",
    note: "洗护：洗衣机、烘干机。",
    items: [
      { type: "washer", sub: "laundry", icon: "◉", name: "洗衣机", size: "0.60 × 0.65m" },
      { type: "dryer", sub: "laundry", icon: "◎", name: "烘干机", size: "0.60 × 0.65m" },
      { type: "garmentcare", sub: "laundry", icon: "▥", name: "衣物护理机", size: "0.6 × 0.6m" },
      { type: "airer", sub: "laundry", icon: "▬", name: "晾衣杆", size: "1.2 × 0.3m" },
    ]
  },
  {
    category: "appliance",
    label: "热水与饮水",
    note: "热水与饮水：储水式/即热式热水器、饮水机、茶吧机。",
    items: [
      { type: "storagewaterheater", sub: "water", icon: "◉", name: "储水式热水器", size: "0.86 × 0.46m" },
      { type: "gaswaterheater", sub: "water", icon: "▯", name: "燃气热水器", size: "0.42 × 0.22m" },
      { type: "pipelinewaterpurifier", sub: "water", icon: "▥", name: "管线机", size: "0.48 × 0.24m" },
      { type: "tea_bar_machine", sub: "water", icon: "▤", name: "茶吧机", size: "0.62 × 0.48m" },
      { type: "waterpurifier", sub: "water", icon: "▮", name: "净水器", size: "0.3 × 0.3m" },
    ]
  },
  {
    category: "appliance",
    label: "办公与设备",
    note: "办公与设备：台式机、打印机等办公设备。",
    items: [
      { type: "desktop", sub: "office", icon: "▣", name: "台式电脑", size: "0.72 × 0.32m" },
      { type: "laptop", sub: "office", icon: "⌨", name: "笔记本电脑", size: "0.36 × 0.28m" },
      { type: "nas", sub: "office", icon: "▦", name: "NAS", size: "0.28 × 0.24m" },
      { type: "router", sub: "office", icon: "◈", name: "路由器", size: "0.22 × 0.16m" },
      { type: "printer", sub: "office", icon: "▭", name: "打印机", size: "0.4 × 0.35m" },
    ]
  },
  {
    category: "appliance",
    label: "智能家居",
    note: "智能家居：面板、门锁、网关等小件设备，多数贴墙贴门安装、带离地高度。",
    items: [
      { type: "thermostat", sub: "smart", icon: "▫", name: "温控面板", size: "0.10 × 0.02m" },
      { type: "smartpanel", sub: "smart", icon: "▪", name: "智能面板", size: "0.12 × 0.02m" },
      { type: "smartlock", sub: "smart", icon: "▮", name: "智能门锁", size: "0.08 × 0.05m" },
      { type: "doorbell", sub: "smart", icon: "▫", name: "可视门铃", size: "0.06 × 0.03m" },
      { type: "gateway", sub: "smart", icon: "◈", name: "智能网关", size: "0.12 × 0.12m" },
      { type: "smartspeaker", sub: "smart", icon: "◉", name: "智能音箱", size: "0.12 × 0.12m" },
      { type: "trashbin", sub: "smart", icon: "◌", name: "智能垃圾桶", size: "0.28 × 0.28m" },
    ]
  }
];


/** 单张卡片：属性各占一行，便于与拆分前的 HTML 逐字对照。 */
function assetCardHtml(item) {
  return [
    "            <button",
    '              class="asset-card"',
    '              type="button"',
    '              draggable="true"',
    `              data-item-type="${escapeHtml(item.type)}"`,
    `              data-asset-subcategory="${escapeHtml(item.sub)}"`,
    "            >",
    `              <i>${escapeHtml(item.icon)}</i><span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.size)}</small>`,
    "            </button>"
  ].join("\n");
}

/** 一组：说明注释 + 分组标题 + 该组全部卡片。 */
function assetGroupHtml(group) {
  return [
    `            <!-- ${group.note} -->`,
    `            <div class="asset-group-heading" data-asset-heading-category="${escapeHtml(group.category)}">${escapeHtml(group.label)}</div>`,
    ...group.items.map(assetCardHtml)
  ].join("\n");
}

/**
 * 把素材网格渲染进容器。整体赋值 innerHTML（而不是逐个 appendChild）：
 * 生成结果要与拆分前的标记逐字一致，包含分组之间的换行与缩进。
 *
 * 首尾那两个换行/缩进常量不是装饰：它们复刻的是拆分前容器自身的排版
 * （`<div id="asset-grid">` 后面换一行、`</div>` 前缩进 10 空格）。
 * 去掉也能正常显示，但逐字校验就会退化成「肉眼看着一样」，
 * 逐字校验与改前改后的 DOM diff 都依赖这个不变量。
 */
const GRID_LEAD = "\n";
const GRID_TAIL = "\n          ";

export function renderStudioAssetPalette(gridElement) {
  if (!gridElement) return;
  gridElement.innerHTML = GRID_LEAD + STUDIO_ASSET_PALETTE.map(assetGroupHtml).join("\n") + GRID_TAIL;
}
