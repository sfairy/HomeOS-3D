/**
 * 窗帘「电机方向」这一份知识的唯一实现。
 *
 * 位置：`renderer/` 下的叶子模块，**不 import 任何东西** —— 这一点是刻意的，也是它存在的原因。
 *   `renderer/registry.js` 与 `renderer/cover-runtime.js` 都要用它，而 `cover-runtime.js` 已经
 *   import 了 `registry.js`（取 `coverComponentIsDream`），注册表再反向 import 回去就成环。
 *   原先的绕法是「各留一份本地实现」，代价是同一份知识有两个定义点（见下面）。
 *
 * 为什么要有这个文件：这一族在 P10 复核时是**「3 份定义 / 2 份知识 / 1 份死代码」**，
 *   而清单只记了「2 份 / 语义完全不同」——
 *
 *   | 位置 | 形态 | 结论 |
 *   | --- | --- | --- |
 *   | `cover-runtime.js` | `isCoverMotorReversed(实体索引, 状态索引, 实体ID)`：靠同设备的「电机反向」开关实体推导 | **死代码**：全仓库无调用点（`stateIsTruthy` 只被它调用） |
 *   | `registry.js` | 私有 `isCoverMotorReversed(控件)`：读控件属性 | 与下一行**逐字同义**，只是名字不同 |
 *   | `cover-runtime.js` | 导出 `coverMotorIsReversedForComponent(控件, 三个未使用形参)` | 与上一行同义 |
 *
 *   也就是说：真正需要消掉的是**同名不同物**那一对（一份是控件的配置、一份是设备上的开关实体），
 *   以及**同物不同名**那一对（`registry` 与 `cover-runtime` 各一份私有副本）。
 *   死的那份是前者的遗留物 —— 方向改由控件属性承载后，没有人再读那个开关实体了
 *   （3D 运行时树另有自己的实体推导，见 `modules/interaction3d/runtime.js`，那属于另一份知识）。
 *
 * 契约（探针 `cover-direction` 按这张表逐格断言）：
 *
 *   | `component.properties.coverMotorDirection` | `coverMotorIsReversedForComponent` |
 *   | --- | --- |
 *   | `"reversed"` | `true` |
 *   | `"normal"` | `false` |
 *   | 其它任何值 / 缺字段 / 非对象 | `false` |
 *
 *   判定是**严格相等**，不做大小写归一：值由编辑器写死为 `"normal"` / `"reversed"`
 *   （见 `home.js` 的 `["normal", "reversed"].includes(...)` 守卫），设备侧不会产生别的写法。
 *   写成宽松判定（例如 `!== "normal"` 就算反转）会把「字段缺失」也当成反转，
 *   而那正是**大多数**控件的状态 —— 一改就会让所有窗帘的开合图标反过来。
 */

/**
 * 取控件级的电机方向设置：是否反转。
 *
 * @param {object} directionComponent 控件对象。
 * @returns {boolean} 是否反转。
 */
export function coverMotorIsReversedForComponent(directionComponent) {
  return directionComponent?.properties?.coverMotorDirection === "reversed";
}

/**
 * 反转时把「展示状态」还原成「物理状态」：四态两两互换。
 *
 * 为什么单独一个名字：这条映射原先有两份 —— `cover-runtime.js` 的 `physicalCoverState`
 *   内部一份、`registry.js` 的 `isCoverActive` 里内联一份（两个文件之间不能 import，见模块头）。
 *
 * 契约（探针逐格断言）：
 *   - `open` / `closed` / `opening` / `closing` 两两互换；
 *   - **认不出的状态原样返回**（含空串、大写、中文、数字等），不做大小写归一、不抛错。
 *     末条是承重的：调用方传进来的可能是任何固件上报的怪值，这里一旦「顺手归一」，
 *     `physicalCoverState` 对非小写输入的行为就会跟着变（它直接转发本函数）。
 *
 * @param {string} stateName 展示状态名。
 * @returns {string} 物理状态名。
 */
export function coverPhysicalStateForReversedMotor(stateName) {
  const normalizedStateName = String(stateName ?? "");
  return (
    {
      open: "closed",
      closed: "open",
      opening: "closing",
      closing: "opening"
    }[normalizedStateName] || normalizedStateName
  );
}
