/**
 * 模块页签的清单与「模块 / 品类 → 所属页签」的归一：这两件事的唯一出处。
 */

// 展示态下没有单独的品类页签：冰箱 / 绿植都归「设备」这一类，与上游 0.6.5 的同一映射
import { GENERIC_DEVICE_KINDS } from "../../device/device-profiles.js?v=2609271226";

/**
 * 页签的唯一清单：顺序即轨道上从左到右的顺序。
 */
export const MODULE_TABS = [
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
 */
export function moduleTabOf(moduleKey) {
  if (MODULE_TAB_KEYS.has(moduleKey)) {
    return moduleKey;
  }
  return DEVICE_PAGE_MODULES.has(moduleKey) ? "devices" : "environment";
}
