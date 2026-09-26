/**
 * 模块页签的清单与「模块 / 品类 → 所属页签」的归一：这两件事的唯一出处。
 *
 * 为什么必须收在一处：页签清单（哪些模块有独立页签）与归一表（某个模块的选中态该落在哪个
 * 页签上）原先分写在 stage.js 与 stage/host-messages.js 里。0.6.5 新增「温湿度计」页签时
 * 只补了 host-messages 那份，stage.js 那份仍停在五个键 —— 症状是点「温湿度计」时页面切了
 * 过去、但高亮滑块与 aria-pressed 都落在「环境」上（看着像没点中），浏览器零报错。同理
 * nas / 电视 / 通用设备品类（冰箱 / 绿植…）在 stage.js 那份里也一直被误归到「环境」。
 */

// 展示态下没有单独的品类页签：冰箱 / 绿植都归「设备」这一类，与上游 0.6.5 的同一映射
// 一致（["nas","television",...GENERIC_DEVICE_KINDS] → "devices"）。
import { GENERIC_DEVICE_KINDS } from "../../device/device-profiles.js?v=2609262312";

/**
 * 页签的唯一清单：顺序即轨道上从左到右的顺序。
 *
 * 键必须同时是 `configuredModuleKinds()`（stage.js）可能产出的取值，否则该页签永远不显示，
 * 或者永远点不动 —— 两处一旦漂移，都不会报错。
 */
export const MODULE_TABS = [
  // 总览 是聚合页：展示当前楼层上每个已配置模块的标记，因此哪怕只配了一个模块它也有意义。
  ["overview", "总览"],
  ["light", "灯光"],
  ["environment", "环境"],
  ["temperature-humidity", "温湿度"],
  ["devices", "设备"],
  ["vacuum", "扫地机"],
  ["security", "安防"]
];

const MODULE_TAB_KEYS = new Set(MODULE_TABS.map(([moduleKey]) => moduleKey));
//: 没有独立页签、但归「设备」页的模块（NAS / 电视 / 通用设备品类）。
const DEVICE_PAGE_MODULES = new Set(["nas", "television", ...GENERIC_DEVICE_KINDS]);

/**
 * 某个模块 / 品类的选中态该落在哪个页签上。
 *
 * 页签自身的键直接命中；NAS / 电视 / 通用设备品类归「设备」；其余子模块（空调 / 窗帘 /
 * 净化器…）归「环境」—— 它们都住在这两个页签下，没有自己的页签。
 */
export function moduleTabOf(moduleKey) {
  if (MODULE_TAB_KEYS.has(moduleKey)) {
    return moduleKey;
  }
  return DEVICE_PAGE_MODULES.has(moduleKey) ? "devices" : "environment";
}
