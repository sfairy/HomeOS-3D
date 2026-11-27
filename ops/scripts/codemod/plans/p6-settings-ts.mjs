// P6：settings 各组内的 .ts 簇合并为该组的一个实现文件（.vue 视图保持一节一个）。
const S = 'homeos/frontend/src/features/settings'
export default {
  merges: [
    {
      into: `${S}/groups/system/diagnostics.ts`,
      from: [
        `${S}/groups/system/diagnostics/constants.ts`,
        `${S}/groups/system/diagnostics/types.ts`,
        `${S}/groups/system/diagnostics/use-diagnostics-section.ts`,
        `${S}/groups/system/diagnostics/internals.ts`,
        `${S}/groups/system/diagnostics/use-diagnostics-summary.ts`,
        `${S}/groups/system/diagnostics/use-diagnostics-perf.ts`,
        `${S}/groups/system/diagnostics/use-diagnostics-export.ts`,
        `${S}/groups/system/diagnostics/use-runtime-logs.ts`,
      ],
      header: '/**\n * 运维诊断面板的共享契约与组合逻辑：注入键、类型、摘要统计、性能指标、导出与运行时日志。\n *\n * 曾按 hooks 习惯拆成 8 个文件（含 1 行的常量与 17 行的注入键），\n * 但它们服务同一个面板、且互相引用同一套类型 —— 一个职责一个文件。\n */',
    },
  ],
}
