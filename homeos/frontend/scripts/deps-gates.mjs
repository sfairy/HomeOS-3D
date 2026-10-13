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
  { name: '令牌映射契约（棘轮）', cmd: ['node', '../../ops/tokens/check-token-map.mjs'] },
]
