/**
 * 空调气流（airflow）三档颜色的唯一出处。
 *
 * 三档是「制冷 / 制热 / 其它」。前两档取**设备读色**（--hos-cool / --hos-heat），刻意不跟主控色走 ——
 * 主控色被改成极光紫那天，制冷气流不该跟着变紫。它们的取值仍在各自调用点上走
 * `paletteColor("--hos-cool", …)` / `paletteColor("--hos-heat", …)`，本模块不重复定义，
 * 免得把「兜底值必须等于令牌 canonical」这条交给审计脚本之外的地方管。
 *
 * 第三档「其它」是**无色相中性灰**，调色板里没有对应令牌。两个近邻都不能套：
 * 套 --hos-sensor（离线 / 未知）会把「其它模式」误读成「设备离线」；
 * 而它恰好与 --hos-tool-ink-dim 同值，套上去同样错 —— 那是工具面的弱文字色，不是设备状态色。
 * 这是「同值 ≠ 同角色」最典型的一处，所以宁可留一枚不对应任何令牌的字面量。
 *
 * 为什么单独一个叶子模块：这枚灰原先在**五处**各写一遍 ——
 *   组件出厂默认 component-templates.js、检查器默认 property-descriptors.js 与 editor/home.js、
 *   控件渲染兜底 renderer/core/registry/airflow.js、运行时气流 modules/runtime/environment/environment-airflow.js。
 * 其中四处写 #dce2e6，唯独渲染兜底那处写成 #ffffff —— 同一个角色两个颜色，
 * 而差异只在气流显示为「其它模式」时才会露出来。与 cover-features.js 同一处理：
 * 口径只有一份，编辑器侧与运行时侧都引它。零依赖，两侧都能直接用。
 */
export const AIRFLOW_OTHER_COLOR = "#dce2e6";
