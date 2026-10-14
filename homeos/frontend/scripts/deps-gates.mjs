/**
 * `check:deps` 链的步骤清单（homeos/frontend）。
 *
 * 由 `ops/lib/run-chain.mjs` **并发**执行（有界并发，本机/CI 均默认 min(4, CPU)）；
 * 打印顺序就是本数组顺序，退出码取「有任一步非 0 则为 1」。
 *
 * 每一步都能单独跑（`node scripts/gates/<x>.mjs`）—— 注入式自检就是这么调真脚本的。
 * 加步/删步只改这里，别再回去写 `&&` 长链：长链的关键路径是各步之和。
 */
export default [
  { name: '分层依赖方向（main app）', cmd: ['node', 'scripts/gates/check-frontend-deps.mjs'] },
  { name: '分层依赖方向（studio 旧运行时）', cmd: ['node', 'scripts/gates/check-studio-deps.mjs'] },
  { name: '引用可解析性（import / 注释 / CSS）', cmd: ['node', 'scripts/gates/check-import-refs.mjs'] },
  { name: '引用可解析性自检（含真实树副本）', cmd: ['node', 'scripts/gates/_import_refs_selftest.mjs'] },
  { name: 'vite 分包组一致性', cmd: ['node', 'scripts/gates/check-vite-chunk-groups.mjs'] },
  { name: 'vite 分包组自检', cmd: ['node', 'scripts/gates/_vite_chunk_groups_selftest.mjs'] },
  { name: '宿主绑定契约', cmd: ['node', 'scripts/gates/check-host-bindings.mjs'] },
  { name: '宿主绑定自检', cmd: ['node', 'scripts/gates/_host_bindings_selftest.mjs'] },
  { name: '依赖袋懒加载', cmd: ['node', 'scripts/gates/check-deps-bag-lazy.mjs'] },
  { name: '依赖袋懒加载自检', cmd: ['node', 'scripts/gates/_deps_bag_lazy_selftest.mjs'] },
  { name: '死 CSS 类名', cmd: ['node', 'scripts/gates/check-css-classes.mjs'] },
  { name: '死 CSS 类名自检', cmd: ['node', 'scripts/gates/_css_classes_selftest.mjs'] },
  { name: '令牌契约（var() 可解析）', cmd: ['node', '../../ops/tokens/check-token-contract.mjs'] },
  // 自检证明三条判据真会红（选择器 var() / 毛玻璃两份清单 / 容忍档棘轮），并断言真实基线形状正确 ——
  // 这条此前只存在于仓库里、没人跑：判据写法一变就静默变瞎，正是自检要拦的失效方式。
  { name: '令牌契约自检（选择器 var() / 毛玻璃清单 / 容忍档棘轮）', cmd: ['node', '../../ops/tokens/_token_contract_selftest.mjs'] },
  { name: '令牌映射契约（棘轮）', cmd: ['node', '../../ops/tokens/check-token-map.mjs'] },
  // 切片工具链自检：这两条是「解析型工具」的护栏，必须在链上，否则工具一改就静默变瞎。
  { name: '切片区间自检（--range 边界对账）', cmd: ['node', 'scripts/gates/_studio_slice_range_selftest.mjs'] },
  { name: '切片包装自检（attach 工厂契约）', cmd: ['node', 'scripts/gates/_studio_slice_wrap_selftest.mjs'] },
  // 模板切片自检：id 丢失 / 段落改序 / 多加包裹元素都不让 tsc 变红，只能靠注入式对账兜住。
  { name: '模板切片自检（id 不丢不重 / 不新增包裹 / 幂等保护）', cmd: ['node', 'scripts/gates/_studio_template_seam_selftest.mjs'] },
  // 类型/吞错债（棘轮）：`as any` 与空 catch 恰恰是「让类型系统闭嘴」的手段，tsc/eslint 都看不见，
  // 而拆分宿主时它们会被顺手重新生产出来 —— 这条是 P2 拆分过程的护栏，不是事后体检。
  { name: 'studio 类型/吞错债（棘轮 + 开放袋子硬零）', cmd: ['node', 'scripts/gates/check-studio-type-debt.mjs'] },
  { name: '类型/吞错债门禁自检（基线保护 / 注释豁免 / 每文件口径）', cmd: ['node', 'scripts/gates/_studio_type_debt_selftest.mjs'] },
  // 同名导出：口径分叉后的两份 helper 都「能跑」也不会让 tsc 变红，只能靠这条固定「一名一实现」。
  { name: '同名导出全仓唯一（值导出，含对象常量）', cmd: ['node', 'scripts/gates/check-unique-exports.mjs'] },
  { name: '同名导出门禁自检（重载 / barrel / 类型豁免）', cmd: ['node', 'scripts/gates/_unique_exports_selftest.mjs'] },
]
