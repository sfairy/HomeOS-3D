/**
 * 入户页步骤轨道的**一格**。
 *
 * 为什么单独定义在这里：两个前端各有一套步骤工具（主应用 `shared/utils/auth/auth-flow.util`、
 * 商店 `features/storefront/views/AuthView`），但它们产出的都是这五个字段 —— 结构兼容，
 * 可以直接传进 `EntryShell` 的 `steps` prop，不需要在共享层反向 import 任何应用代码
 * （`src/shared` 有 `no-restricted-imports`，共享包更不该知道应用在哪）。
 *
 * 字段顺序与语义：
 * - `key`：稳定标识，用于 `v-for` 的 key（内容不影响渲染）。
 * - `label`：这一步叫什么。
 * - `ordinal`：两位编号（`'01'`）。编号由产出方补零，避免这里再做一次格式化。
 * - `state`：该步在轨道上的状态，对应 `.is-done / .is-current / .is-blocked`。
 */
export interface EntryStep {
  key: string
  label: string
  ordinal: string
  state: 'done' | 'current' | 'todo' | 'blocked'
}
