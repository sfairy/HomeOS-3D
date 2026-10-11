// 编辑器**选中态**的显式 state 袋（P4 studio 拆分：单例显式化）。
//
// 为什么是「袋」而不是把变量搬进来
// ------------------------------
// `home.ts` 里这一族名字（`selectedComponentId` / `selectedComponentIdsSet` /
// `selectionAnchorComponentId` / `activeGroupId` / `lastComponentClick`）被几百处**直接读写**：
// 选中态渗透在渲染、事件、文档变更判定里。把它们搬进模块意味着改写宿主全部引用点 ——
// 几百处风险，而收益（少一层转发）在 `any` 语境下接近零。
//
// 所以宿主保留原变量（**0 处改写**），另建一个门面对象：字段是 get/set 访问器对，读穿透、
// 写回灌，语义与直接读写原变量逐字等价。切片出去的小模块只收这一个引用：
//
//   selectedComponentId（读） → deps.selection.componentId
//   selectedComponentId（写） → deps.selection.componentId = v
//
// 字段名即语义面（`componentId` 而不是 `selectedComponentId`），形状在这里**单点声明**，
// 切片模块 `import type { EditorSelection }` 回来 —— 拼错字段名 tsc 直接报，而不是在
// `any` 里静默拿到 `undefined`。工具支持见 `ops/studio_slice_wrap.mjs --tables`，
// 名字映射见 `ops/studio_slice_tables_home.json`。

/** 一次点击的登记（用于「双击 / 连点」判定，阈值见宿主里的 600ms） */
export interface EditorSelectionClick {
  componentId: any;
  at: number;
}

/** 编辑器选中态：宿主 `home.ts` 里那族高频可变捕获的显式面。 */
export interface EditorSelection {
  /** 当前选中组件 id（单选面；多选时是其中一个） */
  componentId: any;
  /** 多选集合（与 `componentId` 同步维护，是同一个选中态的两个面） */
  ids: Set<string>;
  /** `shift` 连选的锚点：普通选中后等于 `componentId`，进入设备组后等于该组 id */
  anchorId: any;
  /** 已进入的设备组 id（进组即切换选中作用域；`null` = 顶层） */
  groupId: any;
  /** 最近一次点击登记 */
  lastClick: EditorSelectionClick;
}
