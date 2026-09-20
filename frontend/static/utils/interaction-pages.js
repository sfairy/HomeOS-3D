/**
 * 交互页面的可选项：`overview` 即 ALL（全部楼层）。
 *
 * 这份清单原先有**三份**字面量：编辑器里的「行为页」与「压暗页」两个下拉（同一文件内
 * 各写一遍），以及运行时树 `modules/runtime/presence-motion.js` 的 `PRESENCE_PAGES`
 * （人体存在的显示页判定）。它们必须始终一致 —— 下拉里选得到的页面正是判定要认的页面，
 * 少一项就会出现「选了却不生效」，而两份不同步时**不会报错**，只在某一页上表现不对。
 *
 * 于是收成一份：`/static/` 树里的编辑侧直接 import；运行时侧不能写裸 `/static/...` 的
 * 静态 import（舞台页能以 `file:` 打开），经 `modules/runtime/static-helpers.js`
 * 那座桥取用，并在那里保留它原来的导出名 `PRESENCE_PAGES`。
 *
 * 每个元素是 `[页面值, 显示名]`，**数组顺序就是下拉顺序**；页面值同时参与文档里的
 * `displayPages` 判定，改动它等于改数据格式，不要顺手重命名。
 */
export const INTERACTION_PAGE_OPTIONS = [
  ["overview", "ALL（全部楼层）"],
  ["light", "灯光"],
  ["environment", "环境"],
  ["devices", "设备"],
  ["vacuum", "扫地机"],
  ["security", "安防"]
];
