/**
 * 材质槽位「角色」词表。
 *
 * 角色是「这一块网格在实物上究竟是什么」的语义标签：柜体 / 柜面 / 台面 / 拉手 / 软包 / 杯脚……
 * 它会被写进 GLB 的材质名（`material-<槽位>-<角色>`），运行侧据此按「档位即组合」给这一块
 * 取**它自己的**颜色与质感，而不是像以前那样整件共用一个标量 —— 那正是「整件一个颜色、
 * 一种材质」的根因（亚麻灰会把木脚也刷成深灰、布纹会套到木脚上）。
 *
 * 为什么角色要自成一份词表、还要校验：
 *   1. 规格里写错一个字母（`leg` 写成 `legg`）不会报错，只会静默退回基础色 —— 与
 *      「整件单色」的旧行为长得一模一样，肉眼几乎无法判定是没生效还是本来就长这样；
 *   2. 风格档位必须为**该类型用到的每个角色**都给出配方，缺一个就退回基础色，
 *      同样不报错。所以词表是护栏比对两端的共同基准。
 *
 * **硬约束：角色名不得以 `-soft` / `-dark` / `-light` 结尾。**
 * 这三个后缀是既有资产的亮度分档约定，studio-external-models.js 的 applyFurniturePalette
 * 会按后缀取色卡槽（`furnitureSoft` / `furnitureDark` / `furnitureLight`）。角色名撞上
 * 就会被当成亮度分档、拿错颜色，而且只在选中风格时才看得出。见 MODEL_SLOT_ROLE_SUFFIX_RE。
 */

/**
 * 角色词表。分四组是为了写规格时好找，顺序与语义无关。
 * 新增角色时必须同时确认：它不以 -soft / -dark / -light 结尾，且每个用到它的类型、
 * 每个风格档位都补上了对应配方（护栏「角色覆盖」那条会挡）。
 */
export const MODEL_SLOT_ROLES = Object.freeze([
  // 结构与承重
  "frame", // 框架 / 骨架 / 立柱
  "leg", // 腿 / 脚（桌椅、沙发、柜脚）
  "base", // 底座 / 踢脚 / 垫底
  // 软体与织物
  "upholstery", // 软包主体（坐垫 / 靠背 / 扶手一体）
  "cushion", // 抱枕 / 可分离坐垫 / 软垫
  "accent", // 点缀对比件（抱枕、镶边、撞色面）
  "fabric", // 布面（窗帘 / 地毯 / 床品）
  // 箱体与柜面
  "body", // 箱体 / 机身 / 桶身
  "door", // 门板 / 门面
  "drawer", // 抽屉面
  "shelf", // 层板 / 隔板
  "interior", // 柜内衬（背板 / 中立板 / 内衬面）—— 带玻璃门的柜子靠它决定「透不透」
  "top", // 台面 / 顶面
  // 五金与构件
  "handle", // 拉手 / 把手 / 旋钮
  "key", // 琴键 / 按键（白键那一批）—— 撞色键（黑键）走 accent
  "metal", // 五金件 / 金属构件 / 支脚
  "trim", // 边饰 / 回边 / 装饰线 / 封边
  // 厨卫的「功能面」：与 metal 分开是因为它们在实物上是**两种料**
  // （不锈钢水槽 / 银黑灶面 vs 柜门的五金拉手），而三者旧资产里共用同一个槽位号，
  // 于是暖色主题只能整槽刷成一个颜色 —— 拉手跟着水槽一起变钢、或者水槽被刷成木色。
  "sink", // 水槽盆体（不锈钢 / 石英石）
  "cooktop", // 灶面与炉架（玻璃 / 不锈钢面板 + 火盖）
  // 设备与界面
  "panel", // 面板 / 控制面板 / 装饰板
  "screen", // 显示屏 / 玻璃视窗
  "grating", // 格栅 / 风口 / 滤网
  "glass", // 玻璃（透明件：玻璃门 / 玻璃隔断 / 缸壁）
  "mirror", // 镜面（与 glass 分开：镜面是**不透明**的镀银面，运行侧对 glass 强制 0.28 不透明度，
  //           给它就会把镜子渲染成一块能看穿的茶色玻璃板）
  "lit", // 发光件（灯罩、灯箱、屏幕背光）
  // 软装
  "pot", // 花器 / 盆 / 瓶
  "foliage", // 植叶
  "book", // 书脊 / 书封（书柜里那一排排的书）
  // 敞开格里的**内容物**：鞋柜那一双双鞋、玄关柜里的杂物筐。与 book 同一个理由单独成角色 ——
  // 它是「实物内容物」而不是柜子的一部分，跟着柜体木色走会读成一堆木方块。
  "stash"
]);

const MODEL_SLOT_ROLE_SET = new Set(MODEL_SLOT_ROLES);

/** 角色名后缀的禁用形状：撞上会被运行侧当成亮度分档（见模块头）。 */
export const MODEL_SLOT_ROLE_SUFFIX_RE = /-(soft|dark|light)$/;

/** 角色名是否合法（在词表内且不撞亮度分档后缀）。 */
export function isValidSlotRole(role) {
  return typeof role === "string" && MODEL_SLOT_ROLE_SET.has(role) && !MODEL_SLOT_ROLE_SUFFIX_RE.test(role);
}

/**
 * 把「槽位号 + 可选角色」拼成 GLB 里的材质名。
 *
 * 不写角色时退化成 `material-<槽位号>`，与既有约定逐字节一致 —— 这是尚未补角色的规格
 * （以及全部既有资产）能继续工作的原因。
 */
export function materialNameForSlot(slot, role) {
  return isValidSlotRole(role) ? `material-${slot}-${role}` : `material-${slot}`;
}
