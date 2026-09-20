/**
 * 交互页面的可选项：`overview` 即 ALL（全部楼层），元素为 `[页面值, 显示名]`。
 *
 * 这份清单必须始终一致 —— 下拉里选得到的页面正是判定要认的页面，少一项会出现「选了却不生效」且不报错。
 * 收成一份：`/static/` 树的编辑侧直接 import；运行时侧不能写裸 `/static/...` 静态 import（舞台页能以
 * `file:` 打开），经 `modules/runtime/core/static-helpers.js` 那座桥取用，那里保留导出名 `PRESENCE_PAGES`。
 *
 * 数组顺序就是下拉顺序；页面值同时参与文档里的 `displayPages` 判定，改动它等于改数据格式，不要顺手重命名。
 */
export const INTERACTION_PAGE_OPTIONS = [
  ["overview", "ALL（全部楼层）"],
  ["light", "灯光"],
  ["environment", "环境"],
  ["devices", "设备"],
  ["vacuum", "扫地机"],
  ["security", "安防"]
];
