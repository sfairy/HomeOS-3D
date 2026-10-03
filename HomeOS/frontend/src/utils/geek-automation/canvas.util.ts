/**
 * 画布：flow nodes/edges ↔ GeekGraph 数组同步与自动布局。
 *
 * 原单一 1955 行文件已按职责拆分为独立模块，本文件仅作聚合出口，
 * 保持全部既有导入面不变：
 * - canvas-shared.util        节点类型 / 摘要 / 端口句柄 / 基础工具
 * - canvas-layout.util        自动布局（GeekGraph → 画布节点与边）
 * - canvas-topology.util      拓扑排序 / 可达动作链收集
 * - canvas-fold.util          choose / repeat / parallel 折叠与条件 fail → choose 合成
 * - canvas-groups.util        组删除重挂 / 组隶属同步 / 剪贴板
 * - canvas-connectivity.util  连线合法性（端口语义）与保存前校验
 * - canvas-sync.util          画布 → geekGraph 同步 / 根逻辑推导 / 节点创建 / 轨迹命中
 */
export * from './canvas-shared.util'
export * from './canvas-layout.util'
export * from './canvas-topology.util'
export * from './canvas-fold.util'
export * from './canvas-groups.util'
export * from './canvas-connectivity.util'
export * from './canvas-sync.util'
