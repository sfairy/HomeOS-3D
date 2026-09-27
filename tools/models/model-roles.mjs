/**
 * 材质槽位「角色」词表。
 */

/**
 * 角色词表。分四组是为了写规格时好找，顺序与语义无关。
 */
export const MODEL_SLOT_ROLES = Object.freeze([
  // 结构与承重
  "frame",
  "leg",
  "base", // 底座 / 踢脚 / 垫底
  // 软体与织物
  "upholstery",
  "cushion",
  "accent",
  "fabric", // 布面（窗帘 / 地毯 / 床品）
  // 箱体与柜面
  "body",
  "door",
  "drawer",
  "shelf",
  "interior",
  "top", // 台面 / 顶面
  // 五金与构件
  "handle",
  "key",
  "metal",
  "trim", // 边饰 / 回边 / 装饰线 / 封边
  // 厨卫的「功能面」：与 metal 分开是因为它们在实物上是**两种料**
  // （不锈钢水槽 / 银黑灶面 vs 柜门的五金拉手），而三者旧资产里共用同一个槽位号，
  // 于是暖色主题只能整槽刷成一个颜色 —— 拉手跟着水槽一起变钢、或者水槽被刷成木色。
  "sink",
  "cooktop", // 灶面与炉架（玻璃 / 不锈钢面板 + 火盖）
  // 设备与界面
  "panel",
  "screen",
  "grating",
  "glass",
  "mirror", // 镜面（与 glass 分开：镜面是**不透明**的镀银面，运行侧对 glass 强制 0.28 不透明度，
  //           给它就会把镜子渲染成一块能看穿的茶色玻璃板）
  "lit", // 发光件（灯罩、灯箱、屏幕背光）
  // 软装
  "pot",
  "foliage",
  "book", // 书脊 / 书封（书柜里那一排排的书）
  // 敞开格里的**内容物**：鞋柜那一双双鞋、玄关柜里的杂物筐。与 book 同一个理由单独成角色 ——
  // 它是「实物内容物」而不是柜子的一部分，跟着柜体木色走会读成一堆木方块。
  "stash"
]);

const MODEL_SLOT_ROLE_SET = new Set(MODEL_SLOT_ROLES);

/** 角色名后缀的禁用形状：撞上会被运行侧当成亮度分档（见模块头）。 */
export const MODEL_SLOT_ROLE_SUFFIX_RE = /-(soft|dark|light)$/;

