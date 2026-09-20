/**
 * 状态条目归一：把 HA 推送的「变更对象」与「状态对象」两种形态收成一种。
 *
 * 位置：`utils/` 下的纯函数工具，被渲染器（`renderer/registry.js`、`renderer/entity-power.js`、
 *   `renderer/vacuum-runtime.js`、`renderer/presence-runtime.js`、`renderer/light-statistics-runtime.js`）
 *   引用。不碰 DOM、不发请求。
 *
 * 为什么要有这个文件：这份知识原先在前端有 **5 份具名副本、3 个不同的函数名、2 种不同的契约** ——
 *
 *   | 副本 | 名字 | 契约差异 |
 *   | --- | --- | --- |
 *   | `renderer/entity-power.js` | `unwrapStateChange` | 缺失时给**占位状态对象** `{state:"",attributes:{}}` |
 *   | `renderer/vacuum-runtime.js` | `unwrapStateChange` | 缺失时给 `null` |
 *   | `renderer/presence-runtime.js` | `resolveEventState` | 缺失时给 `null`（换个名字，同一份知识） |
 *   | `renderer/registry.js` | `resolveStateEntry` | 缺失时给 `null`（同上，第三个名字） |
 *   | `renderer/light-statistics-runtime.js` | `unwrapStateChange` | **两个形参**（容器 + 键），且用 `hasOwnProperty` 判定 |
 *
 *   危害不在「代码多」，而在**同名不同签名**：`unwrapStateChange` 在一处是 `(状态)`、
 *   在另一处是 `(容器, 实体ID)`。照着名字把调用搬过来不会报错 —— 传进来的是个 Map 时
 *   `Map.newState` 是 `undefined`，函数会把整个 Map 原样返回，下游读 `.state` 得到 `undefined`，
 *   静默当成「未知状态」。`resolveEventState` / `resolveStateEntry` 那两个名字更隐蔽：
 *   它们是同一份知识，但谁也不知道另外两个名字存在，改口径时必然漏改。
 *
 * 契约（下表是唯一口径 —— 原探针 `state-entry` 已随测试清理删除，改动前后请手工逐格核对）：
 *
 *   | 输入 | `resolveStateEntry` 的结果 |
 *   | --- | --- |
 *   | `{newState: {state:"on"}}`（变更对象） | `{state:"on"}` |
 *   | `{newState: null}`（变更对象，被删除的实体） | 变更对象本身（见下面「为什么用真值判定」） |
 *   | `{state:"on"}`（状态对象） | 原样返回 |
 *   | `null` / `undefined` | 第 2 个参数（默认 `null`） |
 *
 * **为什么用真值判定（`?.newState || x`）而不是 `hasOwnProperty`**：本仓库里 `newState` 的
 *   生产者只有一处（`renderer/renderer.js` 的乐观更新，产出 `{...原变更对象, newState: 乐观状态}`），
 *   所以「一个对象同时带 `state` 与假值 `newState`」这种混合形态不存在。两种判定的分歧恰好只在
 *   这种形态上，而真值判定是 5 份副本里 4 份的口径，因此统一到它 —— 被合并掉的那份严格判定
 *   （`light-statistics-runtime`）的调用点也已逐处核对：它在 `.state`、`.attributes.friendly_name`
 *   与 `lightStatisticsEntityStateStatus` 三处消费，`null` 与「变更对象本身」在这三处的结果相同，
 *   因为变更对象既没有 `.state` 也没有 `.attributes`。
 *
 * **P12 状态条目内联收口**：这份知识原先除了上面那 5 份具名副本，还有 80 余处是**裸表达式**
 *   （`x?.newState || x`、`(x?.newState || x)?.attributes`，带 `|| {}` / `|| null` /
 *   `|| {占位状态对象}` 三种第三兜底）。`/static/` 树上那 47 处已逐点换成 `resolveStateEntry(...)`，
 *   判据只认两种无歧义形态：`newState || …` 与 `hasOwnProperty("newState")`，
 *   不要再以内联写法写回来。
 *
 *   换过去唯一的语义差别在「**基表达式本身为假值**」这一格：内联写法漏出那个假值
 *   （`undefined` / `""` / `0` / `false`），本函数归一成默认兜底 `null`。47 处的下游逐处核过，
 *   **不可观测**，因为消费方式只有三类：`?.` 取字段（`?.` 对 `null` 与 `undefined` 结果相同）、
 *   真值判定（`null` 与那个假值同为假）、自己再归一一次（`|| {}` / `String(x ?? "")`）。
 *   另外三处 `?.newState?.state ?? …` 是**另一份知识**（取状态文本，字段优先级相反：
 *   先看状态对象自己的 `.state`），本批点名不动，留在 `cover-runtime.js` / `registry.js`。
 *
 * **P12 收口（续）：3D 运行时树（`modules/runtime/`）里那 33 处内联剥壳也收了。**
 *   那棵树原先被记成「跨加载边界、闸刻意不伸进去」，复核后那条理由不成立 —— 真实的约束只是
 *   「运行侧的文件不能写裸 `/static/...` 的静态 import（舞台页能以 `file:` 打开）」，而树里
 *   早就有七处条件动态导入。于是这段导入收进纯转出口 `modules/runtime/core/static-helpers.js`
 *   （桥），其余 16 份文件写普通的静态 import —— 树按域细分后，`core/` 内的文件写
 *   `./static-helpers.js?v=20260920102755`，`core/` 以外的 15 处写 `../core/static-helpers.js?v=20260920102755`。
 *   那 33 处的下游逐处过目，结论与上面 47 处同一口径（`?.` 取字段 / 真值判定 / 自己再归一一次三类，均不可观测）。
 */

/**
 * 从 Map 或普通对象里取一项，取不到返回 `null`。
 *
 * 为什么要同时认两种容器：运行时状态是 `Map`（`states.get(entityId)`），而从文档 / 接口来的
 * 描述表常是普通对象（`descriptors[entityId]`）。混用一处会让「明明有数据却查不到」变成静默的
 * 空状态，所以取用方式收在这里一份。
 *
 * 注意：**取到的值是假值时也返回 `null`**（`""` / `0` / `false`）—— 调用方要的是「有没有这一条」，
 * 不是「值本身」。这也是下面 `resolveStateEntryIn` 能直接串起来的原因。
 */
export function readFromMapOrRecord(source, key) {
  if (typeof source?.get == "function") {
    return source.get(key) || null;
  } else {
    return (source && typeof source == "object" && source[key]) || null;
  }
}

/**
 * 剥掉变更对象的外壳，取出真正的状态对象。
 */
export function resolveStateEntry(stateOrChange, fallback = null) {
  return stateOrChange?.newState || stateOrChange || fallback;
}

/**
 * 从「实体 ID → 状态 / 变更」容器里取出并剥离成状态对象。
 *
 * 把两步（取容器里的一项 + 剥变更外壳）合成一个名字，是因为这两步总是连着出现：
 * 分开写时最容易漏掉第二步，而漏掉的表现是「状态里读不到东西」——不报错。
 */
export function resolveStateEntryIn(statesByEntityId, entityIdKey) {
  return resolveStateEntry(readFromMapOrRecord(statesByEntityId, entityIdKey));
}
